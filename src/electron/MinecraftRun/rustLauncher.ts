import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import { createRequire } from "module";
import { getMinecraftDir, getConfig } from "../config.js";
import { trackGameLaunch, trackGameClose } from "../telemetry.js";
import {
  getRequiredJavaVersion,
  getJavaMajorVersion,
  getJavaPath,
} from "./javaRuntime.js";
import { loadVersionJson } from "./versionManifest.js";
import {
  computeNativeFingerprint,
  canReuseExtractedNatives,
  saveNativeExtractionMarker,
} from "./nativesCache.js";
import {
  getMissingAssetDownloadsFromIndex,
  type DownloadItem,
} from "./assetCheck.js";
import { fileExists, logPerfStep } from "./fsUtils.js";
import {
  redactLaunchArgs,
  fixUnreplacedVars,
  getOfflineUuid,
  escapeArgfileContent,
} from "./launchArgs.js";

let nativeModuleCache: any | null = null;

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
    throw new Error(
      `Native module failed to load for ${process.platform}-${process.arch}. ` +
        `This build is likely missing the native binary for your system. ` +
        `Original error: ${(err as Error).message}`,
    );
  }
  return nativeModuleCache;
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

interface VersionJsonResult {
  versionJson: string;
  mergedVersionData: any;
  manifest: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Helper Phase Functions
// ─────────────────────────────────────────────────────────────────────────────

async function loadAndPrepareVersionJson(
  version: string,
  versionsDir: string,
  minecraftRoot: string,
  native: any,
  loader: any,
  gameDir: string,
  sendProgress: (progress: Partial<LaunchProgress>) => void,
): Promise<VersionJsonResult> {
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

  return {
    versionJson,
    mergedVersionData,
    manifest,
  };
}

async function resolveJavaPath(
  version: string,
  mergedVersionData: any,
  customJavaPath: string | undefined,
  native: any,
  sendProgress: (progress: Partial<LaunchProgress>) => void,
): Promise<string> {
  sendProgress({ type: "prepare", task: "กำลังค้นหา Java..." });
  const javaResolveStartedAt = Date.now();
  const config = getConfig();
  const requiredJavaMajor = getRequiredJavaVersion(version, mergedVersionData);
  // Resolve Java after manifest merge
  const javaPath = await getJavaPath(
        customJavaPath,
        config.javaPath,
        native,
        version,
        requiredJavaMajor,
  );
  logPerfStep("resolve-java-path", javaResolveStartedAt);
  console.log(`[RustLauncher] Using Java: ${javaPath}`);
  return javaPath;
}

async function downloadMissingLibraries(
  downloads: DownloadItem[],
  sendProgress: (progress: Partial<LaunchProgress>) => void,
): Promise<void> {
  if (downloads.length === 0) return;

  sendProgress({
    type: "download",
    task: "กำลังดาวน์โหลดไฟล์เกม...",
    current: 0,
    total: downloads.length,
    percent: 0,
  });

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
          console.error(`[RustLauncher] Failed to download ${dl.path}:`, err);
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

async function verifyAndDownloadAssets(
  versionData: any,
  assetsDir: string,
  native: any,
  sendProgress: (progress: Partial<LaunchProgress>) => void,
): Promise<void> {
  if (!versionData.assetIndex) return;

  const assetIndexId = versionData.assetIndex.id;
  const assetIndexPath = path.join(assetsDir, "indexes", `${assetIndexId}.json`);
  const assetVerifiedMarkerPath = path.join(assetsDir, "indexes", `.${assetIndexId}.verified`);

  const assetsAlreadyVerified =
    (await fileExists(assetVerifiedMarkerPath)) &&
    (await fileExists(assetIndexPath));

  if (!assetsAlreadyVerified) {
    sendProgress({ type: "download", task: "กำลังตรวจสอบ assets..." });

    if (!(await fileExists(assetIndexPath))) {
      const assetIndexJson = await native.fetchVersionDetail(versionData.assetIndex.url);
      await fs.promises.mkdir(path.dirname(assetIndexPath), { recursive: true });
      await fs.promises.writeFile(assetIndexPath, assetIndexJson, "utf-8");
    }

    let assetDownloads: DownloadItem[] = [];
    try {
      assetDownloads = await native.getAssetDownloads(versionData.assetIndex.url, assetsDir);
    } catch (nativeAssetError) {
      console.warn(
        "[RustLauncher] Native asset scan failed, falling back to local scan",
        nativeAssetError,
      );
      const localAssetScanStartedAt = Date.now();
      assetDownloads = await getMissingAssetDownloadsFromIndex(assetIndexPath, assetsDir);
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

async function extractNatives(
  versionJson: string,
  librariesDir: string,
  nativesDir: string,
  native: any,
  sendProgress: (progress: Partial<LaunchProgress>) => void,
): Promise<boolean> {
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
  return reusedNatives;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Launch & Install Handlers
// ─────────────────────────────────────────────────────────────────────────────

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
    // Phase 1: Load and prepare version JSON
    const { versionJson, mergedVersionData } = await loadAndPrepareVersionJson(
      version,
      versionsDir,
      minecraftRoot,
      native,
      loader,
      gameDir,
      sendProgress,
    );

    const javaPath = await resolveJavaPath(
      version,
      mergedVersionData,
      customJavaPath,
      native,
      sendProgress,
    );

    const versionJarPath = path.join(versionsDir, version, `${version}.jar`);

    // Phase 3: Setup launch arguments & variables
    let sanitizedUuid = uuid || "00000000-0000-0000-0000-000000000000";
    if (uuid?.startsWith("catid-")) {
      sanitizedUuid = getOfflineUuid(username);
      console.log(
        `[RustLauncher] Generated offline UUID for CatID user "${username}": ${sanitizedUuid}`,
      );
    }

    const assetIndex =
      versionDataToIndexId(mergedVersionData, version);

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

    const fixVars = (arg: string) => fixUnreplacedVars(arg, accessToken, version);
    prepareResult.jvmArgs = prepareResult.jvmArgs.map(fixVars);
    prepareResult.gameArgs = prepareResult.gameArgs.map(fixVars);

    const unreplacedPattern = /\$\{[^}]+\}/g;
    for (const arg of [...prepareResult.jvmArgs, ...prepareResult.gameArgs]) {
      const matches = arg.match(unreplacedPattern);
      if (matches) {
        console.warn(
          `[RustLauncher] WARNING: Unreplaced template variables in arg: ${matches.join(", ")}`,
        );
      }
    }

    // Phase 4: Download missing libraries
    await downloadMissingLibraries(prepareResult.downloadsNeeded, sendProgress);

    // Phase 5: Verify and download assets
    const versionData = JSON.parse(versionJson);
    await verifyAndDownloadAssets(versionData, assetsDir, native, sendProgress);

    // Phase 6: Extract natives
    const reusedNatives = await extractNatives(
      versionJson,
      librariesDir,
      nativesDir,
      native,
      sendProgress,
    );

    // Phase 7: Spawn game process
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

    const requiredJavaMajor = getRequiredJavaVersion(version, mergedVersionData);
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

    if (javaMajorVersion >= 9) {
      try {
        let relPath: string | null = null;
        if (native.createLaunchArgfile) {
          relPath = native.createLaunchArgfile(allArgs, gameDir, instanceId);
        } else {
          const tempDir = path.join(gameDir, "temp");
          fs.mkdirSync(tempDir, { recursive: true });
          const argsFileName = `args_${safeInstanceId}.txt`;
          const argsFile = path.join(tempDir, argsFileName);
          argsFilePath = argsFile;
          const fileContent = escapeArgfileContent(allArgs);
          fs.writeFileSync(argsFile, fileContent);
          relPath = `temp/${argsFileName}`;
        }
        if (relPath) {
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

    const { versionJson, mergedVersionData } = await loadAndPrepareVersionJson(
      version,
      versionsDir,
      minecraftRoot,
      native,
      loader,
      gameDir,
      sendProgress,
    );

    try {
      javaPath = await resolveJavaPath(
        version,
        mergedVersionData,
        customJavaPath,
        native,
        sendProgress,
      );
    } catch {
      console.warn("[PreInstall] Java not found, continuing without it");
    }

    sendProgress({ type: "prepare", task: "กำลังตรวจสอบไฟล์เกม..." });

    const versionJarPath = path.join(versionsDir, version, `${version}.jar`);
    const assetIndex = versionDataToIndexId(mergedVersionData, version);

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

    // 3. Download missing libraries
    await downloadMissingLibraries(prepareResult.downloadsNeeded, sendProgress);

    // 4. Download missing assets
    await verifyAndDownloadAssets(mergedVersionData, assetsDir, native, sendProgress);

    await extractNatives(versionJson, librariesDir, nativesDir, native, sendProgress);

    sendProgress({ type: "launch", task: "เตรียมไฟล์เกมเสร็จสิ้น!", percent: 100 });

    console.log(`[PreInstall] Pre-install complete for instance: ${instanceId}`);
    return { ok: true, message: "เตรียมไฟล์เกมเสร็จสิ้น" };
  } catch (error: any) {
    console.error(`[PreInstall] Error:`, error);
    return { ok: false, message: error.message || "เกิดข้อผิดพลาดในการเตรียมไฟล์เกม" };
  }
}

function versionDataToIndexId(mergedVersionData: any, version: string): string {
  return mergedVersionData.assetIndex?.id || mergedVersionData.assets || version;
}
