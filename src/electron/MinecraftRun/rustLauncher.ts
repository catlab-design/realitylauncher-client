

import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createRequire } from "module";
import { getMinecraftDir, getConfig } from "../config.js";
import { trackGameLaunch, trackGameClose } from "../telemetry.js";
import {
  getRequiredJavaVersion,
  getJavaMajorVersion,
  getJavaPath,
} from "./javaRuntime.js";

const VERSION_MANIFEST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RESOURCES_URL = "https://resources.download.minecraft.net";

let nativeModuleCache: any | null = null;
let versionManifestCache: { manifest: any; cachedAt: number } | null = null;

interface NativeExtractionMeta {
  fingerprint: string;
  nativeSourceCount: number;
  platform: string;
  arch: string;
  extractedAt: string;
}

interface AssetIndexData {
  objects?: Record<string, { hash: string; size: number }>;
}

function logPerfStep(step: string, startedAt: number): void {
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs >= 200) {
    console.log(`[RustLauncher][Perf] ${step}: ${elapsedMs}ms`);
  }
}

function readJsonFileSafe<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function getManifestCachePath(minecraftRoot: string): string {
  return path.join(minecraftRoot, "cache", "version_manifest_v2.json");
}

async function getVersionManifestCached(
  native: any,
  minecraftRoot: string,
): Promise<any> {
  const now = Date.now();
  if (
    versionManifestCache &&
    now - versionManifestCache.cachedAt < VERSION_MANIFEST_CACHE_TTL_MS
  ) {
    return versionManifestCache.manifest;
  }

  const manifestCachePath = getManifestCachePath(minecraftRoot);
  try {
    if (fs.existsSync(manifestCachePath)) {
      const stats = fs.statSync(manifestCachePath);
      if (now - stats.mtimeMs < VERSION_MANIFEST_CACHE_TTL_MS) {
        const manifestFromDisk = readJsonFileSafe<any>(manifestCachePath);
        if (manifestFromDisk?.versions) {
          versionManifestCache = { manifest: manifestFromDisk, cachedAt: now };
          return manifestFromDisk;
        }
      }
    }
  } catch {
    
  }

  try {
    const manifest = await native.fetchVersionManifest();
    const cacheDir = path.dirname(manifestCachePath);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(manifestCachePath, JSON.stringify(manifest));
    versionManifestCache = { manifest, cachedAt: now };
    return manifest;
  } catch (error) {
    const staleManifest = readJsonFileSafe<any>(manifestCachePath);
    if (staleManifest?.versions) {
      console.warn(
        "[RustLauncher] Failed to refresh version manifest, using stale cache",
      );
      versionManifestCache = { manifest: staleManifest, cachedAt: now };
      return staleManifest;
    }
    throw error;
  }
}

async function loadVersionJson(
  versionId: string,
  versionsDir: string,
  minecraftRoot: string,
  native: any,
  manifest: any | null,
): Promise<{ versionJson: string; manifest: any | null }> {
  const versionJsonPath = path.join(
    versionsDir,
    versionId,
    `${versionId}.json`,
  );
  if (fs.existsSync(versionJsonPath)) {
    return { versionJson: fs.readFileSync(versionJsonPath, "utf-8"), manifest };
  }

  const resolvedManifest =
    manifest ?? (await getVersionManifestCached(native, minecraftRoot));
  const versionInfo = resolvedManifest.versions.find(
    (v: any) => v.id === versionId,
  );
  if (!versionInfo) {
    throw new Error(`ไม่พบเวอร์ชัน ${versionId}`);
  }

  const versionJson = await native.fetchVersionDetail(versionInfo.url);
  fs.mkdirSync(path.dirname(versionJsonPath), { recursive: true });
  fs.writeFileSync(versionJsonPath, versionJson);
  return { versionJson, manifest: resolvedManifest };
}

function computeNativeFingerprint(
  versionData: any,
  librariesDir: string,
  osKey: string,
  archBits: string,
): {
  fingerprint: string;
  nativeSourceCount: number;
  missingSourceCount: number;
} {
  const sourceEntries: string[] = [];
  let missingSourceCount = 0;
  for (const lib of versionData.libraries || []) {
    const classifierTemplate = lib.natives?.[osKey];
    if (!classifierTemplate) continue;
    const classifierKey = String(classifierTemplate).replace(
      "${arch}",
      archBits,
    );
    const classifier = lib.downloads?.classifiers?.[classifierKey];
    if (!classifier?.path) continue;

    const nativeJarPath = path.join(librariesDir, classifier.path);
    let descriptor = `${classifier.path}`;
    try {
      const stats = fs.statSync(nativeJarPath);
      descriptor += `|${stats.size}|${Math.floor(stats.mtimeMs)}`;
    } catch {
      descriptor += "|missing";
      missingSourceCount += 1;
    }
    sourceEntries.push(descriptor);
  }

  sourceEntries.sort((a, b) => a.localeCompare(b));
  const fingerprint = crypto
    .createHash("sha1")
    .update(
      [versionData.id || "", osKey, archBits, ...sourceEntries].join("\n"),
    )
    .digest("hex");

  return {
    fingerprint,
    nativeSourceCount: sourceEntries.length,
    missingSourceCount,
  };
}

function hasNativeBinary(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) return false;

  const stack = [dirPath];
  while (stack.length > 0) {
    const currentDir = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (
        entry.name.endsWith(".dll") ||
        entry.name.endsWith(".so") ||
        entry.name.endsWith(".dylib") ||
        entry.name.endsWith(".jnilib")
      ) {
        return true;
      }
    }
  }
  return false;
}

function canReuseExtractedNatives(
  nativesDir: string,
  expectedFingerprint: string,
): boolean {
  const markerPath = path.join(nativesDir, ".extract-meta.json");
  const marker = readJsonFileSafe<NativeExtractionMeta>(markerPath);
  if (!marker) return false;
  if (marker.fingerprint !== expectedFingerprint) return false;
  if (marker.platform !== process.platform || marker.arch !== process.arch)
    return false;

  
  if (marker.nativeSourceCount <= 0) return true;
  return hasNativeBinary(nativesDir);
}

function saveNativeExtractionMarker(
  nativesDir: string,
  fingerprint: string,
  nativeSourceCount: number,
): void {
  const markerPath = path.join(nativesDir, ".extract-meta.json");
  const marker: NativeExtractionMeta = {
    fingerprint,
    nativeSourceCount,
    platform: process.platform,
    arch: process.arch,
    extractedAt: new Date().toISOString(),
  };
  fs.writeFileSync(markerPath, JSON.stringify(marker));
}

async function getMissingAssetDownloadsFromIndex(
  assetIndexPath: string,
  assetsDir: string,
): Promise<DownloadItem[]> {
  const index = readJsonFileSafe<AssetIndexData>(assetIndexPath);
  if (!index?.objects) {
    throw new Error(`Invalid asset index: ${assetIndexPath}`);
  }

  const downloads: DownloadItem[] = [];
  const objects = Object.values(index.objects);
  let inspected = 0;
  for (const obj of objects) {
    inspected += 1;
    if (inspected % 300 === 0) {
      await yieldToEventLoop();
    }

    if (!obj?.hash || obj.hash.length < 2) continue;
    const hashPrefix = obj.hash.slice(0, 2);
    const destPath = path.join(assetsDir, "objects", hashPrefix, obj.hash);
    if (await fileExists(destPath)) continue;

    downloads.push({
      url: `${RESOURCES_URL}/${hashPrefix}/${obj.hash}`,
      path: destPath,
      sha1: obj.hash,
      size: obj.size,
    });
  }
  return downloads;
}

import type { LaunchOptions, LaunchResult, LaunchProgress } from "./types.js";
import {
  getProgressCallback,
  getGameLogCallback,
  getOnGameCloseCallback,
} from "./callbacks.js";
import {
  setGameProcess,
  setLaunching,
  setAborted,
  isAborted,
  setActiveGameDirectory,
} from "./gameProcess.js";
import { downloadFileAtomic } from "../modrinth.js";

import { applyModLoader, mergeLibraries } from "./modLoaders.js";
import {
  filterGameArgs,
  getOptimizedJvmArgs,
  computeSafeHeapMb,
  getPlatformJvmArgs,
  logResourcePacksState,
} from "./rustLauncherSupport.js";


const customRequire = createRequire(__filename);

function getNative() {
  if (nativeModuleCache) {
    return nativeModuleCache;
  }
  const nativePath = path.join(app.getAppPath(), "native", "index.cjs");
  if (!fs.existsSync(nativePath)) {
    throw new Error(
      `Critical Error: Native module not found at ${nativePath}. Please reinstall the application.`,
    );
  }
  try {
    nativeModuleCache = customRequire(nativePath);
  } catch (err) {
    // index.cjs is present but the platform-specific .node binary failed to load.
    // Usually means the build shipped without a binary for this OS/arch — e.g. an
    // Intel-mac (x64) build missing the darwin-x64 .node, or a Windows-only build
    // run on macOS. Surface a clear, actionable message instead of napi's cryptic
    // "Failed to load native binding".
    throw new Error(
      `Native module failed to load for ${process.platform}-${process.arch}. ` +
        `This build is likely missing the native binary for your system. ` +
        `Original error: ${(err as Error).message}`,
    );
  }
  return nativeModuleCache;
}

function redactLaunchArgs(args: string[], accessToken?: string): string[] {
  return args.map((arg, index) => {
    const previous = args[index - 1];
    if (previous === "--accessToken") {
      return "[redacted]";
    }
    if (arg.startsWith("--accessToken=")) {
      return "--accessToken=[redacted]";
    }
    if (accessToken && arg === accessToken) {
      return "[redacted]";
    }
    return arg;
  });
}


interface DownloadItem {
  url: string;
  path: string;
  sha1?: string;
  size?: number;
}

interface PrepareResult {
  success: boolean;
  downloadsNeeded: DownloadItem[];
  classpath: string[];
  mainClass: string;
  gameArgs: string[];
  jvmArgs: string[];
  error?: string;
}


export async function launchGameRust(
  options: LaunchOptions,
): Promise<LaunchResult> {
  const instanceId = options.instanceId || "default";
  const telemetryInstanceId = options.instanceId?.trim();
  const native = getNative();

  setLaunching(instanceId, true);
  setAborted(instanceId, false);

  const {
    version,
    username,
    uuid,
    telemetryUserId,
    accessToken,
    ramMB = 4096,
    javaPath: customJavaPath,
    loader,
  } = options;

  const config = getConfig();
  const gameDir = options.gameDirectory || getMinecraftDir();
  const minecraftRoot = getMinecraftDir(); 
  const assetsDir = path.join(minecraftRoot, "assets");
  const librariesDir = path.join(minecraftRoot, "libraries");
  const versionsDir = path.join(minecraftRoot, "versions");
  const nativesDir = path.join(gameDir, "natives", version);

  setActiveGameDirectory(instanceId, gameDir);
  logResourcePacksState("launch-start", gameDir);

  const progressCallback = getProgressCallback();
  let lastProgressSentAt = 0;
  let lastProgressKey = "";
  let lastProgressType = "";
  const sendProgress = (
    progress: Partial<LaunchProgress>,
    force = false,
  ) => {
    if (!progressCallback) return;
    const now = Date.now();
    const type = String(progress.type || "");
    const percent =
      typeof progress.percent === "number"
        ? Math.round(progress.percent)
        : undefined;
    const current =
      typeof progress.current === "number" ? progress.current : undefined;
    const total = typeof progress.total === "number" ? progress.total : undefined;
    const key = `${type}|${String(progress.task || "")}|${percent ?? ""}|${current ?? ""}|${total ?? ""}`;
    const phaseChanged = !lastProgressKey || type !== lastProgressType;
    const due = now - lastProgressSentAt >= 120;
    const milestone =
      percent === undefined ||
      percent === 0 ||
      percent === 100 ||
      percent % 5 === 0;

    if (force || phaseChanged || (milestone && due) || (due && key !== lastProgressKey)) {
      lastProgressSentAt = now;
      lastProgressKey = key;
      lastProgressType = type;
      progressCallback(progress as LaunchProgress);
    }
  };

  try {
    sendProgress({ type: "prepare", task: "Checking version data..." });
    let manifest: any | null = null;
    const versionLoadStartedAt = Date.now();
    const versionLoad = await loadVersionJson(
      version,
      versionsDir,
      minecraftRoot,
      native,
      manifest,
    );
    logPerfStep("load-version-json", versionLoadStartedAt);
    let versionJson = versionLoad.versionJson;
    manifest = versionLoad.manifest;

    
    if (loader && loader.enable && loader.type !== "vanilla") {
      sendProgress({ type: "prepare", task: `กำลังเตรียม ${loader.type}...` });
      const applyLoaderStartedAt = Date.now();
      versionJson = await applyModLoader(
        versionJson,
        version,
        loader,
        gameDir,
        native,
        getJavaPath,
      );
      logPerfStep(`apply-loader-${loader.type}`, applyLoaderStartedAt);
    }

    
    let mergedVersionData = JSON.parse(versionJson);
    if (mergedVersionData.inheritsFrom) {
      sendProgress({
        type: "prepare",
        task: "กำลัง merge version profiles...",
      });
      const parentVersion = mergedVersionData.inheritsFrom;
      const parentJsonPath = path.join(
        versionsDir,
        parentVersion,
        `${parentVersion}.json`,
      );

      let parentJson: string;
      if (fs.existsSync(parentJsonPath)) {
        parentJson = fs.readFileSync(parentJsonPath, "utf-8");
      } else {
        const parentLoad = await loadVersionJson(
          parentVersion,
          versionsDir,
          minecraftRoot,
          native,
          manifest,
        );
        parentJson = parentLoad.versionJson;
        manifest = parentLoad.manifest;
      }

      const parentData = JSON.parse(parentJson);

      
      mergedVersionData = {
        ...parentData,
        ...mergedVersionData,
        
        libraries: mergeLibraries(
          mergedVersionData.libraries || [],
          parentData.libraries || [],
        ),
        
        arguments: {
          game: filterGameArgs([
            ...(mergedVersionData.arguments?.game || []),
            ...(parentData.arguments?.game || []),
          ]),
          jvm: [
            ...(mergedVersionData.arguments?.jvm || []),
            ...(parentData.arguments?.jvm || []),
          ],
        },
      };

      
      delete mergedVersionData.inheritsFrom;

      console.log(
        `[RustLauncher] Merged ${mergedVersionData.id} with parent ${parentVersion}`,
      );
      versionJson = JSON.stringify(mergedVersionData);
    }

    sendProgress({ type: "prepare", task: "กำลังค้นหา Java..." });
    const javaResolveStartedAt = Date.now();
    const requiredJavaMajor = getRequiredJavaVersion(version, mergedVersionData);
    const javaPath = await getJavaPath(
      customJavaPath,
      config.javaPath,
      native,
      version,
      requiredJavaMajor,
    );
    logPerfStep("resolve-java-path", javaResolveStartedAt);
    console.log(`[RustLauncher] Using Java: ${javaPath}`);

    
    sendProgress({ type: "prepare", task: "กำลังเตรียมไฟล์เกม..." });

    const versionJarPath = path.join(versionsDir, version, `${version}.jar`);

    
    
    
    let sanitizedUuid = uuid || "00000000-0000-0000-0000-000000000000";
    if (uuid?.startsWith("catid-")) {
      const crypto = await import("node:crypto");
      const md5 = crypto
        .createHash("md5")
        .update(`OfflinePlayer:${username}`)
        .digest();
      
      md5[6] = (md5[6] & 0x0f) | 0x30;
      
      md5[8] = (md5[8] & 0x3f) | 0x80;
      const hex = md5.toString("hex");
      sanitizedUuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
      console.log(
        `[RustLauncher] Generated offline UUID for CatID user "${username}": ${sanitizedUuid}`,
      );
    }

    
    const versionData = JSON.parse(versionJson);
    const assetIndex =
      versionData.assetIndex?.id || versionData.assets || version;

    // Clamp heap to system RAM (avoids OOM on low-spec) — see rustLauncherSupport.ts
    const { minMb: safeMinMb, maxMb: safeMaxMb } = computeSafeHeapMb(ramMB);
    if (safeMaxMb < ramMB) {
      console.warn(
        `[RustLauncher] Requested ${ramMB}MB exceeds 70% of system RAM; clamping max heap to ${safeMaxMb}MB`,
      );
    }

    const launchOptions = {
      instanceId,
      versionId: version,
      javaPath,
      gameDir,
      assetsDir,
      librariesDir,
      nativesDir,
      versionJarPath,
      username,
      uuid: sanitizedUuid,
      accessToken: accessToken || "",
      userType: accessToken ? "msa" : "legacy",
      ramMinMb: safeMinMb,
      ramMaxMb: safeMaxMb,
      extraJvmArgs: [
        ...getPlatformJvmArgs(version),
        ...getOptimizedJvmArgs(safeMaxMb),
        "-DlauncherName=Reality Launcher",
        `-DlauncherVersion=${app.getVersion()}`,
        "-Dminecraft.launcher.brand=Reality Launcher",
        `-Dminecraft.launcher.version=${app.getVersion()}`,
        "-Dlauncher_name=Reality Launcher",
        "-Dclient.brand=Reality Launcher",
      ],
      extraGameArgs: [
        "--launcherName",
        "Reality Launcher",
        "-Dlauncher_name=Reality Launcher",
        "--launcherVersion",
        app.getVersion(),
      ],
      assetIndex,
    };

    const prepareLaunchStartedAt = Date.now();
    const prepareResult: PrepareResult = await native.prepareLaunch(
      versionJson,
      launchOptions,
    );
    logPerfStep("native-prepare-launch", prepareLaunchStartedAt);

    if (!prepareResult.success) {
      throw new Error(prepareResult.error || "Failed to prepare launch");
    }

    
    const fixUnreplacedVars = (arg: string): string => {
      let res = arg
        .replace(/\$\{auth_xuid\}/g, "0")
        .replace(/\$\{clientid\}/g, "")
        .replace(/\$\{auth_session\}/g, accessToken || "token:0")
        .replace(/\$\{resolution_width\}/g, "854")
        .replace(/\$\{resolution_height\}/g, "480")
        .replace(/\$\{path_separator\}/g, path.delimiter)
        .replace(/\$\{primary_jar_name\}/g, `${version}.jar`);

      
      
      return res;
    };

    prepareResult.jvmArgs = prepareResult.jvmArgs.map(fixUnreplacedVars);
    prepareResult.gameArgs = prepareResult.gameArgs.map(fixUnreplacedVars);

    
    const unreplacedPattern = /\$\{[^}]+\}/g;
    for (const arg of [...prepareResult.jvmArgs, ...prepareResult.gameArgs]) {
      const matches = arg.match(unreplacedPattern);
      if (matches) {
        
        console.warn(
          `[RustLauncher] WARNING: Unreplaced template variables in arg: ${matches.join(", ")}`,
        );
      }
    }

    if (prepareResult.downloadsNeeded.length > 0) {
      sendProgress({
        type: "download",
        task: "กำลังดาวน์โหลดไฟล์เกม...",
        current: 0,
        total: prepareResult.downloadsNeeded.length,
        percent: 0,
      });

      
      
      const downloads = prepareResult.downloadsNeeded;
      const concurrency = 10;
      const queue = [...downloads];
      let completed = 0;
      const total = downloads.length;

      const workers = Array(Math.min(concurrency, queue.length))
        .fill(null)
        .map(async () => {
          while (queue.length > 0) {
            const dl = queue.shift();
            if (!dl) break;

            try {
              
              const hash = dl.sha1;

              await downloadFileAtomic(
                dl.url,
                dl.path,
                hash ? { sha1: hash } : undefined,
              );

              completed++;
              sendProgress({
                type: "download",
                task: `กำลังดาวน์โหลด ${path.basename(dl.path)}`,
                current: completed,
                total: total,
                percent: Math.round((completed / total) * 100),
              });
            } catch (err: any) {
              console.error(
                `[RustLauncher] Failed to download ${dl.path}:`,
                err,
              );
              throw new Error(
                `Failed to download ${path.basename(dl.path)}: ${err.message}`,
              );
            }
          }
        });

      await Promise.all(workers).catch((err) => {
        console.error("[RustLauncher] Download errors:", err);
        throw new Error(`ดาวน์โหลดไฟล์ไม่สำเร็จ: ${err.message}`);
      });

      sendProgress({
        type: "download",
        task: "ดาวน์โหลดเสร็จสิ้น",
        percent: 100,
      });
    }

    
    if (versionData.assetIndex) {
      const assetIndexId = versionData.assetIndex.id;
      const assetIndexPath = path.join(
        assetsDir,
        "indexes",
        `${assetIndexId}.json`,
      );
      // Marker that this asset index was fully verified, so later launches can
      // skip stat-ing thousands of asset files.
      const assetVerifiedMarkerPath = path.join(
        assetsDir,
        "indexes",
        `.${assetIndexId}.verified`,
      );

      const assetsAlreadyVerified =
        (await fileExists(assetVerifiedMarkerPath)) &&
        (await fileExists(assetIndexPath));

      if (!assetsAlreadyVerified) {
        sendProgress({ type: "download", task: "กำลังตรวจสอบ assets..." });

        if (!(await fileExists(assetIndexPath))) {

          const assetIndexJson = await native.fetchVersionDetail(
            versionData.assetIndex.url,
          );
          await fs.promises.mkdir(path.dirname(assetIndexPath), {
            recursive: true,
          });
          await fs.promises.writeFile(assetIndexPath, assetIndexJson, "utf-8");
        }

        let assetDownloads: DownloadItem[] = [];
        try {

          assetDownloads = await native.getAssetDownloads(
            versionData.assetIndex.url,
            assetsDir,
          );
        } catch (nativeAssetError) {
          console.warn(
            "[RustLauncher] Native asset scan failed, falling back to local scan",
            nativeAssetError,
          );
          const localAssetScanStartedAt = Date.now();
          assetDownloads = await getMissingAssetDownloadsFromIndex(
            assetIndexPath,
            assetsDir,
          );
          logPerfStep("asset-index-local-scan", localAssetScanStartedAt);
        }

        if (assetDownloads.length > 0) {
          sendProgress({
            type: "download",
            task: `กำลังดาวน์โหลด assets (${assetDownloads.length} ไฟล์)...`,
            current: 0,
            total: assetDownloads.length,
          });

          const assetDownloadStartedAt = Date.now();
          await native.downloadFiles(assetDownloads, 20);
          logPerfStep("asset-download-batch", assetDownloadStartedAt);
        }

        // Verification (and any missing downloads) complete — write the marker to skip next time.
        try {
          await fs.promises.writeFile(
            assetVerifiedMarkerPath,
            JSON.stringify({ id: assetIndexId, verifiedAt: Date.now() }),
            "utf-8",
          );
        } catch {

        }
      }
    }

    // ── Natives extraction (Rust — fingerprint + extract in one call) ────────
    sendProgress({ type: "extract", task: "Extracting natives..." });

    const extractNativesStartedAt = Date.now();
    let reusedNatives = false;
    if (native.extractNativesIfNeeded) {
      const nativesResult = native.extractNativesIfNeeded(versionJson, librariesDir, nativesDir);
      reusedNatives = nativesResult.reusedCache;
      if (nativesResult.error) {
        console.warn(`[RustLauncher] extractNativesIfNeeded warning: ${nativesResult.error}`);
      }
      console.log(`[RustLauncher] Natives: ${reusedNatives ? "reused cache" : "extracted"}`);
    } else {
      // Fallback: legacy TS extraction
      const versionDataForNatives = JSON.parse(versionJson);
      const osKey = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "osx" : "linux";
      const archBits = process.arch === "x64" || process.arch === "arm64" ? "64" : "32";
      const nativeFingerprint = computeNativeFingerprint(versionDataForNatives, librariesDir, osKey, archBits);
      if (canReuseExtractedNatives(nativesDir, nativeFingerprint.fingerprint)) {
        reusedNatives = true;
      } else {
        if (fs.existsSync(nativesDir)) fs.rmSync(nativesDir, { recursive: true, force: true });
        fs.mkdirSync(nativesDir, { recursive: true });
        for (const lib of versionDataForNatives.libraries || []) {
          if (!lib.natives) continue;
          const classifierTemplate = lib.natives[osKey];
          if (!classifierTemplate) continue;
          const classifierKey = classifierTemplate.replace("${arch}", archBits);
          const classifier = lib.downloads?.classifiers?.[classifierKey];
          if (!classifier?.path) continue;
          const nativeJarPath = path.join(librariesDir, classifier.path);
          if (!fs.existsSync(nativeJarPath)) continue;
          try { native.extractZip(nativeJarPath, nativesDir); } catch {}
        }
        const metaInfPath = path.join(nativesDir, "META-INF");
        if (fs.existsSync(metaInfPath)) fs.rmSync(metaInfPath, { recursive: true, force: true });
        if (nativeFingerprint.missingSourceCount === 0) {
          saveNativeExtractionMarker(nativesDir, nativeFingerprint.fingerprint, nativeFingerprint.nativeSourceCount);
        }
      }
    }
    logPerfStep("extract-natives", extractNativesStartedAt);

    
    sendProgress({ type: "launch", task: "กำลังเปิดเกม..." });

    if (isAborted(instanceId)) {
      throw new Error("การเปิดเกมถูกยกเลิก");
    }

    
    const { spawn } = await import("child_process");

    const allArgs = [
      ...prepareResult.jvmArgs,
      prepareResult.mainClass,
      ...prepareResult.gameArgs,
    ];

    const javaMajorVersion = await getJavaMajorVersion(
      javaPath,
      requiredJavaMajor,
    );
    console.log(
      `[RustLauncher] Detected Java Major Version: ${javaMajorVersion}`,
    );

    
    const isForge20 =
      version.includes("1.20.1") &&
      loader &&
      loader.type?.toLowerCase() === "forge";
    if (isForge20 && javaMajorVersion >= 21) {
      console.log(
        `[RustLauncher] Note: Using Java ${javaMajorVersion} for Forge 1.20.1. If crash occurs, try manually selecting Java 17.`,
      );
    }

    
    let spawnArgs = allArgs;
    let argsFilePath: string | null = null;
    const safeInstanceId =
      instanceId.replace(/[^a-zA-Z0-9_-]/g, "_") || "default";
    // ── Argfile creation (Rust — avoids TS string escaping overhead) ─────────
    if (javaMajorVersion >= 9) {
      try {
        let relPath: string | null = null;
        if (native.createLaunchArgfile) {
          relPath = native.createLaunchArgfile(allArgs, gameDir, instanceId);
        } else {
          // Fallback: legacy TS argfile
          const tempDir = path.join(gameDir, "temp");
          fs.mkdirSync(tempDir, { recursive: true });
          const argsFileName = `args_${safeInstanceId}.txt`;
          const argsFile = path.join(tempDir, argsFileName);
          argsFilePath = argsFile;
          const fileContent = allArgs
            .map((arg) => {
              let escaped = arg.replace(/\\/g, "\\\\");
              if (escaped.includes(" ") && !escaped.startsWith('"')) escaped = `"${escaped}"`;
              return escaped;
            })
            .join("\n");
          fs.writeFileSync(argsFile, fileContent);
          relPath = `temp/${argsFileName}`;
        }
        if (relPath) {
          // Store absolute path for cleanup on game exit
          argsFilePath = path.join(gameDir, relPath);
          spawnArgs = [`@${relPath}`];
          console.log(`[RustLauncher] Created argument file: ${relPath}`);
        }
      } catch (e) {
        console.error(`[RustLauncher] Failed to create argument file, falling back to direct args`, e);
      }
    }

    logResourcePacksState("pre-spawn", gameDir);

    const child = spawn(javaPath, spawnArgs, {
      cwd: gameDir,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      
      
      detached: process.platform !== "win32",
      windowsHide: true,
    });

    
    if (process.platform !== "win32") {
      child.unref();
    }

    if (!child.pid) {
      throw new Error("Failed to start game process");
    }

    console.log(`[RustLauncher] Game started with PID: ${child.pid}`);
    console.log(
      `[RustLauncher] Launch Args (Head): ${allArgs.slice(0, 10).join(" ")}`,
    );
    console.log(
      `[RustLauncher] Launch Args (Tail): ${allArgs.slice(-5).join(" ")}`,
    );

    
    const crashLogPath = path.join(gameDir, "launch-debug.log");
    try {
      const debugJvmArgs = redactLaunchArgs(prepareResult.jvmArgs, accessToken);
      const debugGameArgs = redactLaunchArgs(prepareResult.gameArgs, accessToken);
      const debugAllArgs = redactLaunchArgs(allArgs, accessToken);
      const debugInfo = [
        `=== Reality Launcher Debug Log ===`,
        `Date: ${new Date().toISOString()}`,
        `Java: ${javaPath}`,
        `Java Version: ${javaMajorVersion}`,
        `MC Version: ${version}`,
        `Game Dir: ${gameDir}`,
        `Natives Dir: ${nativesDir}`,
        `Main Class: ${prepareResult.mainClass}`,
        `Using Argfile: ${javaMajorVersion >= 9 ? "yes" : "no"}`,
        `Natives Extracted: ${reusedNatives ? "reused (cache)" : "extracted"}`,
        ``,
        `=== JVM Args (${prepareResult.jvmArgs.length}) ===`,
        ...debugJvmArgs.map((a, i) => `  [${i}] ${a}`),
        ``,
        `=== Game Args (${prepareResult.gameArgs.length}) ===`,
        ...debugGameArgs.map((a, i) => `  [${i}] ${a}`),
        ``,
        `=== Full Command ===`,
        `"${javaPath}" ${debugAllArgs.join(" ")}`,
      ].join("\n");
      fs.writeFileSync(crashLogPath, debugInfo);
      console.log(`[RustLauncher] Debug log saved to ${crashLogPath}`);
    } catch (e) {
      console.warn(`[RustLauncher] Failed to save debug log:`, e);
    }

    
    const gameLogCallback = getGameLogCallback();
    let stderrBuffer = ""; 
    const MAX_STDERR_BUFFER = 100_000; 

    
    let logQueue: Array<{ level: string; message: string }> = [];
    let logFlushTimer: NodeJS.Timeout | null = null;
    const LOG_FLUSH_INTERVAL = 100; 
    const MAX_QUEUE_SIZE = 50; 

    const flushLogs = () => {
      if (logQueue.length > 0 && gameLogCallback) {
        
        const toSend = logQueue.slice(-20);
        for (const log of toSend) {
          gameLogCallback(log.level, log.message);
        }
        logQueue = [];
      }
      logFlushTimer = null;
    };

    const queueLog = (level: string, message: string) => {
      logQueue.push({ level, message });

      
      if (logQueue.length >= MAX_QUEUE_SIZE) {
        if (logFlushTimer) clearTimeout(logFlushTimer);
        flushLogs();
      } else if (!logFlushTimer) {
        logFlushTimer = setTimeout(flushLogs, LOG_FLUSH_INTERVAL);
      }
    };

    if (child.stdout) {
      child.stdout.on("data", (data: Buffer) => {
        const lines = data.toString().split("\n");
        for (const line of lines) {
          const lineStr = line.trim();
          if (lineStr) {
            
            if (
              lineStr.includes("java.util.zip.ZipException") ||
              lineStr.includes("zip END header not found")
            ) {
              console.error(
                "[RustLauncher] Detected zip corruption in game logs!",
              );
              if (gameLogCallback) {
                gameLogCallback(
                  "error",
                  "DETECTED_CORRUPTION: ตรวจพบไฟล์เกมเสียหาย (ZipException) กรุณากด Verify Files เพื่อซ่อมแซม",
                );
              }
            }

            
            let level = "info";
            if (lineStr.includes("/ERROR]") || lineStr.includes("/FATAL]"))
              level = "error";
            else if (lineStr.includes("/WARN]")) level = "warn";
            else if (lineStr.includes("/DEBUG]")) level = "debug";
            queueLog(level, lineStr);
          }
        }
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (data: Buffer) => {
        const text = data.toString();
        
        if (stderrBuffer.length < MAX_STDERR_BUFFER) {
          stderrBuffer += text.substring(
            0,
            MAX_STDERR_BUFFER - stderrBuffer.length,
          );
        }
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.trim()) {
            queueLog("error", line.trim());
          }
        }
      });
    }

    
    native.saveRunningInstance(instanceId, child.pid, gameDir);

    setGameProcess(instanceId, child as any);
    if (telemetryInstanceId) {
      trackGameLaunch(
        telemetryInstanceId,
        version,
        loader?.type,
        telemetryUserId,
      );
    }

    
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
        try {
          win.webContents.send("game-started", { instanceId, pid: child.pid });
        } catch (e) {
          console.warn("[RustLauncher] Failed to send game-started to window:", e);
        }
      }
    }

    
    const launchTimestamp = Date.now();
    const launchArgsFilePath = argsFilePath;

    
    child.on("close", (code: number | null) => {
      console.log(`[RustLauncher] Game process closed with code: ${code}`);
      if (telemetryInstanceId) {
        trackGameClose(telemetryInstanceId, telemetryUserId);
      }
      native.removeRunningInstance(instanceId);
      setGameProcess(instanceId, null as any);

      
      const runDuration = Date.now() - launchTimestamp;
      if (runDuration < 10000 && code !== 0) {
        console.error(
          `[RustLauncher] CRASH DETECTED: Game exited after ${runDuration}ms with code ${code}`,
        );
        const gameLogCb = getGameLogCallback();
        if (gameLogCb) {
          gameLogCb(
            "error",
            `t:crash_immediate^^${Math.round(runDuration / 1000)}^^${code}`,
          );

          
          let specificReasonFound = false;
          if (stderrBuffer) {
            try {
              const parsedReason = native.analyzeCrashLog(stderrBuffer) as
                | string
                | null;
              if (parsedReason) {
                
                let tKey = "crash_reason";
                if (parsedReason.includes("OUT_OF_MEMORY"))
                  tKey = "crash_out_of_memory";
                else if (parsedReason.includes("WRONG_JAVA_VERSION"))
                  tKey = "crash_wrong_java";
                else if (parsedReason.includes("DETECTED_CORRUPTION"))
                  tKey = "crash_corruption";
                else if (parsedReason.includes("MISSING_DEPENDENCY"))
                  tKey = "crash_missing_dependency";
                else if (parsedReason.includes("MIXIN_ERROR"))
                  tKey = "crash_mixin_error";
                else if (parsedReason.includes("MOD_LOADING_ERROR"))
                  tKey = "crash_mod_loading_error";

                if (tKey === "crash_reason") {
                  gameLogCb("error", `t:crash_reason^^${parsedReason}`);
                } else {
                  gameLogCb("error", `t:${tKey}`);
                }
                specificReasonFound = true;
              }
            } catch (e) {
              console.warn(
                "[RustLauncher] Failed to analyze crash log via native:",
                e,
              );
            }
          }

          if (!specificReasonFound) {
            gameLogCb("error", "t:crash_common_causes");
          }
        }

        
        try {
          const crashAppend = [
            ``,
            `=== CRASH DETECTED ===`,
            `Exit Code: ${code}`,
            `Run Duration: ${runDuration}ms`,
            ``,
            `=== STDERR Output ===`,
            stderrBuffer || "(no stderr captured)",
          ].join("\n");
          fs.appendFileSync(crashLogPath, crashAppend);
          console.log(`[RustLauncher] Crash stderr saved to ${crashLogPath}`);

          if (gameLogCb) {
            gameLogCb("error", `Crash log บันทึกที่: ${crashLogPath}`);
          }
        } catch {}
      }

      
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
          try {
            win.webContents.send("game-stopped", {
              instanceId,
              exitCode: code,
              runDuration,
            });
          } catch (e) {
            console.warn("[RustLauncher] Failed to send game-stopped to window:", e);
          }
        }
      }

      
      ipcMain.emit("game-stopped", null, { instanceId });

      
      if (launchArgsFilePath) {
        try {
          fs.unlinkSync(launchArgsFilePath);
        } catch {}
      }

      const onClose = getOnGameCloseCallback();
      if (onClose) onClose();
    });

    child.on("error", (err: Error) => {
      console.error(`[RustLauncher] Game process error:`, err);
    });

    setLaunching(instanceId, false);

    return {
      ok: true,
      message: `เปิดเกม ${version} สำเร็จ`,
      pid: child.pid,
    };
  } catch (error: any) {
    setLaunching(instanceId, false);
    console.error(`[RustLauncher] Error:`, error);

    return {
      ok: false,
      message: error.message || "เกิดข้อผิดพลาดในการเปิดเกม",
    };
  }
}

export { launchGameRust as launchGame };

// ─────────────────────────────────────────────────────────────────────────────
// preInstallInstance — download and stage all Minecraft files ahead of time
// (version JSON, libraries, assets, natives) without spawning the game process.
// Called after createInstance or installModpack so the instance is ready to play.
// ─────────────────────────────────────────────────────────────────────────────

export interface PreInstallOptions {
  version: string;
  loader?: { type: string; build: string; enable: boolean };
  gameDirectory: string;
  instanceId: string;
  javaPath?: string;
  onProgress?: (progress: Partial<LaunchProgress>) => void;
}

export async function preInstallInstance(
  options: PreInstallOptions,
): Promise<{ ok: boolean; message?: string }> {
  const {
    version,
    loader,
    gameDirectory: gameDir,
    instanceId,
    javaPath: customJavaPath,
    onProgress,
  } = options;

  const native = getNative();
  const config = getConfig();
  const minecraftRoot = getMinecraftDir();
  const assetsDir = path.join(minecraftRoot, "assets");
  const librariesDir = path.join(minecraftRoot, "libraries");
  const versionsDir = path.join(minecraftRoot, "versions");
  const nativesDir = path.join(gameDir, "natives", version);

  const sendProgress = (progress: Partial<LaunchProgress>) => {
    if (onProgress) onProgress(progress);
  };

  try {
    let javaPath: string | undefined;

    // ─── 1. Download version JSON if missing ────────────────────────────────
    sendProgress({ type: "prepare", task: "กำลังดาวน์โหลด version data..." });
    let manifest: any | null = null;
    const versionLoad = await loadVersionJson(version, versionsDir, minecraftRoot, native, manifest);
    let versionJson = versionLoad.versionJson;
    manifest = versionLoad.manifest;

    // ─── 2. Apply mod loader (installs fabric/forge/etc if needed) ───────────
    if (loader && loader.enable && loader.type !== "vanilla") {
      sendProgress({ type: "prepare", task: `กำลังติดตั้ง ${loader.type}...` });
      try {
        versionJson = await applyModLoader(
          versionJson,
          version,
          loader,
          gameDir,
          native,
          getJavaPath,
        );
      } catch (loaderErr: any) {
        // Loader install failure shouldn't block the rest of pre-install
        console.warn("[PreInstall] Loader apply failed:", loaderErr?.message);
      }
    }

    // ─── 3. Merge inherited version profiles ────────────────────────────────
    let mergedVersionData = JSON.parse(versionJson);
    if (mergedVersionData.inheritsFrom) {
      sendProgress({ type: "prepare", task: "กำลัง merge version profiles..." });
      const parentVersion = mergedVersionData.inheritsFrom;
      const parentJsonPath = path.join(versionsDir, parentVersion, `${parentVersion}.json`);

      let parentJson: string;
      if (fs.existsSync(parentJsonPath)) {
        parentJson = fs.readFileSync(parentJsonPath, "utf-8");
      } else {
        const parentLoad = await loadVersionJson(parentVersion, versionsDir, minecraftRoot, native, manifest);
        parentJson = parentLoad.versionJson;
        manifest = parentLoad.manifest;
      }

      const parentData = JSON.parse(parentJson);
      mergedVersionData = {
        ...parentData,
        ...mergedVersionData,
        libraries: mergeLibraries(mergedVersionData.libraries || [], parentData.libraries || []),
        arguments: {
          game: filterGameArgs([
            ...(mergedVersionData.arguments?.game || []),
            ...(parentData.arguments?.game || []),
          ]),
          jvm: [
            ...(mergedVersionData.arguments?.jvm || []),
            ...(parentData.arguments?.jvm || []),
          ],
        },
      };
      delete mergedVersionData.inheritsFrom;
      versionJson = JSON.stringify(mergedVersionData);
    }

    // ─── 4. Resolve Java after manifest merge so custom versions can request Java 25+.
    try {
      sendProgress({ type: "prepare", task: "กำลังค้นหา Java..." });
      const requiredJavaMajor = getRequiredJavaVersion(version, mergedVersionData);
      javaPath = await getJavaPath(
        customJavaPath,
        config.javaPath,
        native,
        version,
        requiredJavaMajor,
      );
    } catch {
      // Java not found — not fatal for vanilla/fabric preinstall; launch will prompt install.
      console.warn("[PreInstall] Java not found, continuing without it");
    }

    // ─── 5. prepareLaunch — find all missing library downloads ──────────────
    sendProgress({ type: "prepare", task: "กำลังตรวจสอบไฟล์เกม..." });

    const versionJarPath = path.join(versionsDir, version, `${version}.jar`);
    const assetIndex = mergedVersionData.assetIndex?.id || mergedVersionData.assets || version;

    const launchOptions = {
      instanceId,
      versionId: version,
      javaPath: javaPath || "",
      gameDir,
      assetsDir,
      librariesDir,
      nativesDir,
      versionJarPath,
      username: "preinstall",
      uuid: "00000000-0000-0000-0000-000000000000",
      accessToken: "",
      userType: "legacy",
      ramMinMb: 512,
      ramMaxMb: 1024,
      extraJvmArgs: [],
      extraGameArgs: [],
      assetIndex,
    };

    const prepareResult: PrepareResult = await native.prepareLaunch(versionJson, launchOptions);
    if (!prepareResult.success && prepareResult.downloadsNeeded.length === 0) {
      console.warn("[PreInstall] prepareLaunch returned failure but no downloads listed");
    }

    // ─── 6. Download missing libraries ──────────────────────────────────────
    if (prepareResult.downloadsNeeded.length > 0) {
      const downloads = prepareResult.downloadsNeeded;
      const total = downloads.length;
      let completed = 0;

      sendProgress({
        type: "download",
        task: `กำลังดาวน์โหลด libraries (${total} ไฟล์)...`,
        current: 0,
        total,
        percent: 0,
      });

      const concurrency = 10;
      const queue = [...downloads];
      const workers = Array(Math.min(concurrency, queue.length))
        .fill(null)
        .map(async () => {
          while (queue.length > 0) {
            const dl = queue.shift();
            if (!dl) break;
            try {
              await downloadFileAtomic(dl.url, dl.path, dl.sha1 ? { sha1: dl.sha1 } : undefined);
              completed++;
              if (completed % 5 === 0 || completed === total) {
                sendProgress({
                  type: "download",
                  task: `กำลังดาวน์โหลด libraries...`,
                  current: completed,
                  total,
                  percent: Math.round((completed / total) * 100),
                });
              }
            } catch (err: any) {
              console.error(`[PreInstall] Failed to download ${dl.path}:`, err);
            }
          }
        });
      await Promise.all(workers);
    }

    // ─── 7. Download missing assets ─────────────────────────────────────────
    if (mergedVersionData.assetIndex) {
      sendProgress({ type: "download", task: "กำลังตรวจสอบ assets..." });

      const assetIndexPath = path.join(assetsDir, "indexes", `${mergedVersionData.assetIndex.id}.json`);

      if (!(await fileExists(assetIndexPath))) {
        const assetIndexJson = await native.fetchVersionDetail(mergedVersionData.assetIndex.url);
        await fs.promises.mkdir(path.dirname(assetIndexPath), { recursive: true });
        await fs.promises.writeFile(assetIndexPath, assetIndexJson, "utf-8");
      }

      let assetDownloads: DownloadItem[] = [];
      try {
        assetDownloads = await native.getAssetDownloads(mergedVersionData.assetIndex.url, assetsDir);
      } catch {
        try {
          assetDownloads = await getMissingAssetDownloadsFromIndex(assetIndexPath, assetsDir);
        } catch (err) {
          console.warn("[PreInstall] Asset scan failed:", err);
        }
      }

      if (assetDownloads.length > 0) {
        sendProgress({
          type: "download",
          task: `กำลังดาวน์โหลด assets (${assetDownloads.length} ไฟล์)...`,
          current: 0,
          total: assetDownloads.length,
          percent: 0,
        });
        await native.downloadFiles(assetDownloads, 20);
      }
    }

    // ─── 8. Extract natives (Rust) ──────────────────────────────────────────
    sendProgress({ type: "extract", task: "กำลัง extract natives..." });

    if (native.extractNativesIfNeeded) {
      const nativesResult = native.extractNativesIfNeeded(versionJson, librariesDir, nativesDir);
      if (nativesResult.error) console.warn(`[PreInstall] extractNativesIfNeeded: ${nativesResult.error}`);
      console.log(`[PreInstall] Natives: ${nativesResult.reusedCache ? "reused cache" : "extracted"}`);
    } else {
      // Fallback: legacy TS extraction
      const versionDataForNatives = JSON.parse(versionJson);
      const osKey = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "osx" : "linux";
      const archBits = process.arch === "x64" || process.arch === "arm64" ? "64" : "32";
      const nativeFingerprint = computeNativeFingerprint(versionDataForNatives, librariesDir, osKey, archBits);
      if (!canReuseExtractedNatives(nativesDir, nativeFingerprint.fingerprint)) {
        if (fs.existsSync(nativesDir)) fs.rmSync(nativesDir, { recursive: true, force: true });
        fs.mkdirSync(nativesDir, { recursive: true });
        let nativesExtracted = 0;
        for (const lib of versionDataForNatives.libraries || []) {
          if (!lib.natives) continue;
          const classifierTemplate = lib.natives[osKey];
          if (!classifierTemplate) continue;
          const classifierKey = classifierTemplate.replace("${arch}", archBits);
          const classifier = lib.downloads?.classifiers?.[classifierKey];
          if (!classifier?.path) continue;
          const nativeJarPath = path.join(librariesDir, classifier.path);
          if (!fs.existsSync(nativeJarPath)) continue;
          try { native.extractZip(nativeJarPath, nativesDir); nativesExtracted++; } catch {}
        }
        const metaInfPath = path.join(nativesDir, "META-INF");
        if (fs.existsSync(metaInfPath)) fs.rmSync(metaInfPath, { recursive: true, force: true });
        if (nativeFingerprint.missingSourceCount === 0) {
          saveNativeExtractionMarker(nativesDir, nativeFingerprint.fingerprint, nativeFingerprint.nativeSourceCount);
        }
        if (nativesExtracted > 0) console.log(`[PreInstall] Extracted natives from ${nativesExtracted} JARs`);
      } else {
        console.log(`[PreInstall] Reusing cached natives`);
      }
    }

    sendProgress({ type: "launch", task: "เตรียมไฟล์เกมเสร็จสิ้น!", percent: 100 });

    console.log(`[PreInstall] Pre-install complete for instance: ${instanceId}`);
    return { ok: true, message: "เตรียมไฟล์เกมเสร็จสิ้น" };
  } catch (error: any) {
    console.error(`[PreInstall] Error:`, error);
    return { ok: false, message: error.message || "เกิดข้อผิดพลาดในการเตรียมไฟล์เกม" };
  }
}
