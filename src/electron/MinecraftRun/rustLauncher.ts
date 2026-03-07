/**
 * ========================================
 * Rust-based Minecraft Launcher
 * ========================================
 *
 * ใช้ Rust native module สำหรับ launch Minecraft
 * - เร็วกว่า minecraft-java-core
 * - ไม่มีปัญหา PID polling
 * - รองรับ mod loaders
 */

import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { createRequire } from "module";
import { getMinecraftDir, getConfig } from "../config.js";
import { trackGameLaunch, trackGameClose } from "../telemetry.js";

const VERSION_MANIFEST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const JAVA_DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;
const JAVA_MAJOR_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_JAVA_PATH_CACHE = 32;
const MAX_JAVA_MAJOR_CACHE = 32;
const RESOURCES_URL = "https://resources.download.minecraft.net";

let nativeModuleCache: any | null = null;
let versionManifestCache: { manifest: any; cachedAt: number } | null = null;
let javaInstallationsCache: { installs: any[]; cachedAt: number } | null = null;

const javaPathSelectionCache = new Map<
  string,
  { path: string; cachedAt: number }
>();
const javaMajorVersionCache = new Map<
  string,
  { major: number; cachedAt: number }
>();

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

function getRequiredJavaVersion(mcVersion?: string): number {
  // Minecraft < 1.17 -> Java 8
  // Minecraft 1.17 - 1.20.4 -> Java 17
  // Minecraft 1.20.5+ -> Java 21
  let targetJavaVersion = 17;
  if (!mcVersion) return targetJavaVersion;

  const parts = mcVersion.split(".");
  if (parts.length < 2) return targetJavaVersion;

  const minor = Number.parseInt(parts[1] || "", 10);
  const patch = Number.parseInt(parts[2] || "0", 10);
  if (Number.isNaN(minor) || Number.isNaN(patch)) return targetJavaVersion;

  if (minor < 17) {
    targetJavaVersion = 8;
  } else if (minor > 20 || (minor === 20 && patch >= 5)) {
    targetJavaVersion = 21;
  }

  console.log(
    `[RustLauncher] Version Check: mcVersion=${mcVersion}, minor=${minor}, patch=${patch} -> targetJavaVersion=${targetJavaVersion}`,
  );
  return targetJavaVersion;
}

function addBoundedCacheEntry<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  maxEntries: number,
): void {
  map.set(key, value);
  if (map.size <= maxEntries) return;
  const oldestKey = map.keys().next().value as K | undefined;
  if (oldestKey !== undefined) map.delete(oldestKey);
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
    // Ignore disk cache read issues; fallback to network.
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

  // If this version doesn't need native jars, marker is enough.
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

async function getJavaMajorVersion(
  javaPath: string,
  fallbackMajor: number,
): Promise<number> {
  let statMtime = "na";
  try {
    statMtime = String(Math.floor(fs.statSync(javaPath).mtimeMs));
  } catch {
    // Ignore mtime read failures; cache will key only by path.
  }

  const cacheKey = `${javaPath}|${statMtime}`;
  const now = Date.now();
  const cached = javaMajorVersionCache.get(cacheKey);
  if (cached && now - cached.cachedAt < JAVA_MAJOR_CACHE_TTL_MS) {
    return cached.major;
  }

  const { exec } = await import("child_process");
  try {
    const javaVer = await new Promise<string>((resolve, reject) => {
      exec(
        `"${javaPath}" -version 2>&1`,
        { timeout: 5000 },
        (err, stdout, stderr) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(stdout || stderr || "");
        },
      );
    });

    const versionMatch = javaVer.match(/version "(.*?)"/);
    if (versionMatch) {
      const versionString = versionMatch[1] || "";
      const parts = versionString.split(".");
      const major =
        parts[0] === "1"
          ? Number.parseInt(parts[1] || "", 10)
          : Number.parseInt(parts[0] || "", 10);

      if (Number.isFinite(major) && major > 0) {
        addBoundedCacheEntry(
          javaMajorVersionCache,
          cacheKey,
          { major, cachedAt: now },
          MAX_JAVA_MAJOR_CACHE,
        );
        return major;
      }
    }
  } catch (error) {
    console.warn(
      `[RustLauncher] Failed to detect Java version, fallback to Java ${fallbackMajor}: ${error}`,
    );
  }

  addBoundedCacheEntry(
    javaMajorVersionCache,
    cacheKey,
    { major: fallbackMajor, cachedAt: now },
    MAX_JAVA_MAJOR_CACHE,
  );
  return fallbackMajor;
}

// Helper to locate a suitable Java executable (prefer Java 17)
// Helper to locate a suitable Java executable (Smart Version Selection)
async function getJavaPath(
  customJavaPath: string | undefined,
  configJavaPath: string | undefined,
  native: any,
  mcVersion?: string,
): Promise<string> {
  const targetJavaVersion = getRequiredJavaVersion(mcVersion);

  const isValidJavaPath = (p: string | undefined): p is string => {
    return !!p && p !== "/path/to/java" && fs.existsSync(p);
  };

  const config = getConfig();
  const javaPaths = config.javaPaths || {};
  const cacheKey = [
    targetJavaVersion,
    customJavaPath || "",
    configJavaPath || "",
    javaPaths.java8 || "",
    javaPaths.java17 || "",
    javaPaths.java21 || "",
    javaPaths.java25 || "",
  ].join("|");

  const cacheHit = javaPathSelectionCache.get(cacheKey);
  if (
    cacheHit &&
    Date.now() - cacheHit.cachedAt < JAVA_DISCOVERY_CACHE_TTL_MS &&
    isValidJavaPath(cacheHit.path)
  ) {
    return cacheHit.path;
  }

  // 1. Use explicit custom path if provided and exists
  let javaPath: string | undefined;
  if (isValidJavaPath(customJavaPath)) {
    javaPath = customJavaPath;
    console.log(`[RustLauncher] Using custom Java path: ${javaPath}`);
  }

  // 2. Check user-configured javaPaths from Settings
  if (!javaPath) {
    if (targetJavaVersion === 8 && isValidJavaPath(javaPaths.java8)) {
      javaPath = javaPaths.java8;
      console.log(`[RustLauncher] Using configured Java 8: ${javaPath}`);
    } else if (targetJavaVersion >= 21) {
      const candidates = [javaPaths.java21, javaPaths.java25];
      javaPath = candidates.find(isValidJavaPath);
      if (javaPath) {
        console.log(`[RustLauncher] Using configured Java (21+): ${javaPath}`);
      }
    } else if (targetJavaVersion >= 17) {
      const candidates = [javaPaths.java17, javaPaths.java21, javaPaths.java25];
      javaPath = candidates.find(isValidJavaPath);
      if (javaPath) {
        console.log(`[RustLauncher] Using configured Java (17+): ${javaPath}`);
      }
    }
  }

  // 3. If still not set or set to "auto", discover installations via native module
  if (!javaPath || javaPath === "auto") {
    const canProbe =
      native && typeof native.findJavaInstallations === "function";
    let javaInstalls: any[] = [];

    if (canProbe) {
      if (
        javaInstallationsCache &&
        Date.now() - javaInstallationsCache.cachedAt <
          JAVA_DISCOVERY_CACHE_TTL_MS
      ) {
        javaInstalls = javaInstallationsCache.installs;
      } else {
        javaInstalls = await native.findJavaInstallations();
        javaInstallationsCache = {
          installs: Array.isArray(javaInstalls) ? javaInstalls : [],
          cachedAt: Date.now(),
        };
      }
    }

    if (canProbe) {
      console.log(
        `[RustLauncher] Detected Java installations (Target: Java ${targetJavaVersion}):`,
        JSON.stringify(javaInstalls, null, 2),
      );
    } else {
      console.log(
        "[RustLauncher] Native java finder unavailable, skipping auto-detect",
      );
    }

    if (javaInstalls.length > 0) {
      const exactMatch = javaInstalls.find(
        (j: any) => j.majorVersion === targetJavaVersion,
      );
      const newerMatch =
        targetJavaVersion >= 17
          ? javaInstalls.find((j: any) => j.majorVersion >= targetJavaVersion)
          : undefined;

      javaPath = exactMatch?.path || newerMatch?.path || javaInstalls[0]?.path;
    }
  }

  // 4. Fallback to legacy single javaPath (only if file exists and we haven't found a better one)
  if (!javaPath && isValidJavaPath(configJavaPath)) {
    javaPath = configJavaPath;
    console.log(`[RustLauncher] Using legacy configured javaPath: ${javaPath}`);
  }

  if (!javaPath) {
    throw new Error(
      targetJavaVersion === 8
        ? "Java 8 not found. Please install Java 8 for older Minecraft versions."
        : `Java ${targetJavaVersion}+ not found. Please install Java ${targetJavaVersion} or newer.`,
    );
  }

  addBoundedCacheEntry(
    javaPathSelectionCache,
    cacheKey,
    { path: javaPath, cachedAt: Date.now() },
    MAX_JAVA_PATH_CACHE,
  );
  return javaPath;
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

// Get native module (CJS compatible - esbuild outputs CJS)
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
  nativeModuleCache = customRequire(nativePath);
  return nativeModuleCache;
}

async function ensureLibrariesDownloaded(
  versionJsonStr: string,
  minecraftDir: string,
): Promise<void> {
  const version = JSON.parse(versionJsonStr);
  const librariesDir = path.join(minecraftDir, "libraries");
  const libs: any[] = version.libraries || [];
  const missingLibraries: Array<{
    relPath: string;
    destPath: string;
    url: string;
    sha1?: string;
  }> = [];

  let scannedLibs = 0;
  for (const lib of libs) {
    scannedLibs += 1;
    if (scannedLibs % 120 === 0) {
      await yieldToEventLoop();
    }
    try {
      const artifact = lib.downloads?.artifact;
      let relPath: string | undefined = artifact?.path;

      if (!relPath) {
        const parts = (lib.name || "").split(":");
        if (parts.length >= 3) {
          const [group, name, ver, classifier] = parts;
          const groupPath = group.replace(/\./g, "/");
          const file = classifier
            ? `${name}-${ver}-${classifier}.jar`
            : `${name}-${ver}.jar`;
          relPath = `${groupPath}/${name}/${ver}/${file}`;
        }
      }

      if (!relPath) continue;

      const destPath = path.join(librariesDir, relPath);
      if (fs.existsSync(destPath)) continue;

      let baseUrl = artifact?.url || lib.url;
      if (!baseUrl) {
        const group = (lib.name || "").split(":")[0] || "";
        if (group.startsWith("net.minecraftforge")) {
          baseUrl = "https://maven.minecraftforge.net";
        } else if (group.startsWith("net.neoforged")) {
          baseUrl = "https://maven.neoforged.net/releases";
        } else {
          // Default Minecraft libs CDN
          baseUrl = "https://libraries.minecraft.net";
        }
      }

      const url = baseUrl.endsWith("/")
        ? `${baseUrl}${relPath}`
        : `${baseUrl}/${relPath}`;
      const sha1 = artifact?.sha1;
      missingLibraries.push({ relPath, destPath, url, sha1 });
    } catch (e) {
      console.warn("[ForgeFix] Failed to ensure library", e);
    }
  }

  if (missingLibraries.length === 0) {
    return;
  }

  const concurrency = Math.min(8, missingLibraries.length);
  const queue = [...missingLibraries];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) return;

      try {
        await fs.promises.mkdir(path.dirname(item.destPath), {
          recursive: true,
        });
        await downloadFileAtomic(
          item.url,
          item.destPath,
          item.sha1 ? { sha1: item.sha1 } : undefined,
        );
        console.log(`[ForgeFix] Downloaded missing library: ${item.relPath}`);
      } catch (e) {
        console.warn("[ForgeFix] Failed to ensure library", e);
      }
    }
  });

  await Promise.all(workers);
}

/**
 * Merge libraries from child and parent, prioritizing child versions.
 * Deduplicates based on group:artifact (and classifier if present).
 */
function mergeLibraries(childLibs: any[], parentLibs: any[]): any[] {
  const libMap = new Map<string, any>();

  const getLibKey = (lib: any) => {
    // name format: group:artifact:version[:classifier]
    const parts = (lib.name || "").split(":");
    if (parts.length < 2) return lib.name; // Fallback

    const group = parts[0];
    const artifact = parts[1];
    const classifier = parts[3];
    // Key includes classifier to allow natives + main jar
    return classifier
      ? `${group}:${artifact}:${classifier}`
      : `${group}:${artifact}`;
  };

  // 1. Add child libs (priority)
  for (const lib of childLibs) {
    const key = getLibKey(lib);
    // If child defines duplicate internally, valid logic would be keep first or last?
    // Usually assume unique in single profile.
    libMap.set(key, lib);
  }

  // 2. Add parent libs if not overridden
  for (const lib of parentLibs) {
    const key = getLibKey(lib);
    if (!libMap.has(key)) {
      libMap.set(key, lib);
    } else {
      // Optional: Log conflict resolution
      // const childLib = libMap.get(key);
      // console.log(`[RustLauncher] Resolving library conflict: ${childLib.name} (Child) overrides ${lib.name} (Parent)`);
    }
  }

  return Array.from(libMap.values());
}

/**
 * Filter certain arguments that might cause issues if their values are invalid or empty.
 * For example: --quickPlayPath . (directory) causes silent exit.
 * --clientId (empty) might be harmless but cleaner to remove.
 */
function filterGameArgs(args: any[]): any[] {
  const result: any[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg === "string") {
      if (arg === "--quickPlayPath") {
        // Skip this and the next argument (value)
        i++;
        continue;
      }
      if (arg === "--clientId") {
        // Skip this and the next argument (val)
        i++;
        continue;
      }
    }
    result.push(arg);
  }
  return result;
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

/**
 * Launch Minecraft using Rust backend
 */
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
  const minecraftRoot = getMinecraftDir(); // Shared assets/libraries location
  const assetsDir = path.join(minecraftRoot, "assets");
  const librariesDir = path.join(minecraftRoot, "libraries");
  const versionsDir = path.join(minecraftRoot, "versions");
  const nativesDir = path.join(gameDir, "natives", version);

  setActiveGameDirectory(instanceId, gameDir);

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
    // Step 1: Find Java
    sendProgress({ type: "prepare", task: "กำลังค้นหา Java..." });

    const javaResolveStartedAt = Date.now();
    let javaPath = await getJavaPath(
      customJavaPath,
      config.javaPath,
      native,
      version,
    );
    logPerfStep("resolve-java-path", javaResolveStartedAt);
    console.log(`[RustLauncher] Using Java: ${javaPath}`);

    // Step 2: Resolve version JSON (prefer local cache to avoid network on every launch)
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

    // Step 4: Handle mod loader (Fabric/Forge/etc)
    if (loader && loader.enable && loader.type !== "vanilla") {
      sendProgress({ type: "prepare", task: `กำลังเตรียม ${loader.type}...` });
      const applyLoaderStartedAt = Date.now();
      versionJson = await applyModLoader(
        versionJson,
        version,
        loader,
        gameDir,
        native,
      );
      logPerfStep(`apply-loader-${loader.type}`, applyLoaderStartedAt);
    }

    // Step 4.5: Handle inheritsFrom (merge with parent version)
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

      // Merge: child overrides parent, but libraries are combined
      mergedVersionData = {
        ...parentData,
        ...mergedVersionData,
        // Combine libraries (child first, then parent) with deduplication
        libraries: mergeLibraries(
          mergedVersionData.libraries || [],
          parentData.libraries || [],
        ),
        // Merge arguments
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

      // Remove inheritsFrom after merge
      delete mergedVersionData.inheritsFrom;

      console.log(
        `[RustLauncher] Merged ${mergedVersionData.id} with parent ${parentVersion}`,
      );
      versionJson = JSON.stringify(mergedVersionData);
    }

    // Step 5: Prepare launch
    sendProgress({ type: "prepare", task: "กำลังเตรียมไฟล์เกม..." });

    const versionJarPath = path.join(versionsDir, version, `${version}.jar`);

    // Handle UUID: if it's a valid Minecraft UUID, use it directly
    // If it starts with "catid-", generate an offline-style UUID from username
    // Uses Minecraft's actual offline UUID algorithm: UUID v3 from MD5("OfflinePlayer:" + name)
    let sanitizedUuid = uuid || "00000000-0000-0000-0000-000000000000";
    if (uuid?.startsWith("catid-")) {
      const crypto = await import("node:crypto");
      const md5 = crypto
        .createHash("md5")
        .update(`OfflinePlayer:${username}`)
        .digest();
      // Set version to 3 (name-based MD5) per UUID spec
      md5[6] = (md5[6] & 0x0f) | 0x30;
      // Set variant to IETF (10xx)
      md5[8] = (md5[8] & 0x3f) | 0x80;
      const hex = md5.toString("hex");
      sanitizedUuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
      console.log(
        `[RustLauncher] Generated offline UUID for CatID user "${username}": ${sanitizedUuid}`,
      );
    }

    // Get asset index from version JSON
    const versionData = JSON.parse(versionJson);
    const assetIndex =
      versionData.assetIndex?.id || versionData.assets || version;

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
      ramMinMb: Math.min(ramMB, 2048),
      ramMaxMb: ramMB,
      extraJvmArgs: [
        ...getOptimizedJvmArgs(),
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

    // Post-process args: fix unreplaced template variables
    const fixUnreplacedVars = (arg: string): string => {
      let res = arg
        .replace(/\$\{auth_xuid\}/g, "0")
        .replace(/\$\{clientid\}/g, "")
        .replace(/\$\{auth_session\}/g, accessToken || "token:0")
        .replace(/\$\{resolution_width\}/g, "854")
        .replace(/\$\{resolution_height\}/g, "480")
        .replace(/\$\{path_separator\}/g, path.delimiter)
        .replace(/\$\{primary_jar_name\}/g, `${version}.jar`);

      // Safety: if arg still contains ${...}, try to replace common ones or just warn
      // Not throwing error to allow game to attempt launch
      return res;
    };

    prepareResult.jvmArgs = prepareResult.jvmArgs.map(fixUnreplacedVars);
    prepareResult.gameArgs = prepareResult.gameArgs.map(fixUnreplacedVars);

    // Warn about any remaining unreplaced variables but don't spam
    const unreplacedPattern = /\$\{[^}]+\}/g;
    for (const arg of [...prepareResult.jvmArgs, ...prepareResult.gameArgs]) {
      const matches = arg.match(unreplacedPattern);
      if (matches) {
        // Ignore standard log4j config patterns etc if any
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

      // Use TypeScript-based atomic download instead of native
      // This fixes issues with Forge/NeoForge library corruption
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
              // Use SHA1 from download item if available
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

    // Step 7: Download assets (versionData already parsed above)
    if (versionData.assetIndex) {
      sendProgress({ type: "download", task: "กำลังตรวจสอบ assets..." });

      const assetIndexPath = path.join(
        assetsDir,
        "indexes",
        `${versionData.assetIndex.id}.json`,
      );

      if (!(await fileExists(assetIndexPath))) {
        // Download asset index
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
        // Use native batch scanner by default (faster on large asset sets).
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
    }

    // Step 8: Extract natives
    sendProgress({ type: "extract", task: "Extracting natives..." });

    const versionDataForNatives = JSON.parse(versionJson);
    const osKey =
      process.platform === "win32"
        ? "windows"
        : process.platform === "darwin"
          ? "osx"
          : "linux";
    const archBits =
      process.arch === "x64" || process.arch === "arm64" ? "64" : "32";
    const nativeFingerprint = computeNativeFingerprint(
      versionDataForNatives,
      librariesDir,
      osKey,
      archBits,
    );

    let nativesExtracted = 0;
    let reusedNatives = false;

    if (canReuseExtractedNatives(nativesDir, nativeFingerprint.fingerprint)) {
      reusedNatives = true;
      console.log(
        `[RustLauncher] Reusing extracted natives from cache (${nativesDir})`,
      );
    } else {
      if (fs.existsSync(nativesDir)) {
        fs.rmSync(nativesDir, { recursive: true, force: true });
      }
      fs.mkdirSync(nativesDir, { recursive: true });

      // Extract native libraries from classifier JARs to natives directory
      for (const lib of versionDataForNatives.libraries || []) {
        if (!lib.natives) continue;

        const classifierTemplate = lib.natives[osKey];
        if (!classifierTemplate) continue;

        const classifierKey = classifierTemplate.replace("${arch}", archBits);
        const classifier = lib.downloads?.classifiers?.[classifierKey];
        if (!classifier?.path) continue;

        const nativeJarPath = path.join(librariesDir, classifier.path);
        if (!fs.existsSync(nativeJarPath)) continue;

        try {
          native.extractZip(nativeJarPath, nativesDir);
          nativesExtracted++;
        } catch (e) {
          console.warn(
            `[RustLauncher] Failed to extract natives from ${path.basename(nativeJarPath)}:`,
            e,
          );
        }
      }

      // Clean up META-INF that may have been extracted
      const metaInfPath = path.join(nativesDir, "META-INF");
      if (fs.existsSync(metaInfPath)) {
        fs.rmSync(metaInfPath, { recursive: true, force: true });
      }

      if (nativeFingerprint.missingSourceCount === 0) {
        saveNativeExtractionMarker(
          nativesDir,
          nativeFingerprint.fingerprint,
          nativeFingerprint.nativeSourceCount,
        );
      } else {
        console.warn(
          "[RustLauncher] Skipping natives cache marker because some native source jars are missing",
        );
      }

      if (nativesExtracted > 0) {
        console.log(
          `[RustLauncher] Extracted natives from ${nativesExtracted} JARs to ${nativesDir}`,
        );
      }
    }

    // Step 9: Launch game
    sendProgress({ type: "launch", task: "กำลังเปิดเกม..." });

    if (isAborted(instanceId)) {
      throw new Error("การเปิดเกมถูกยกเลิก");
    }

    // Launch using Node.js spawn for live logging
    const { spawn } = await import("child_process");

    const allArgs = [
      ...prepareResult.jvmArgs,
      prepareResult.mainClass,
      ...prepareResult.gameArgs,
    ];

    const requiredJavaMajor = getRequiredJavaVersion(version);
    const javaMajorVersion = await getJavaMajorVersion(
      javaPath,
      requiredJavaMajor,
    );
    console.log(
      `[RustLauncher] Detected Java Major Version: ${javaMajorVersion}`,
    );

    // Keep this informational note for known Forge+Java combos.
    const isForge20 =
      version.includes("1.20.1") &&
      loader &&
      loader.type?.toLowerCase() === "forge";
    if (isForge20 && javaMajorVersion >= 21) {
      console.log(
        `[RustLauncher] Note: Using Java ${javaMajorVersion} for Forge 1.20.1. If crash occurs, try manually selecting Java 17.`,
      );
    }

    // Use Argument File for Java 9+ to fix ENAMETOOLONG
    let spawnArgs = allArgs;
    let argsFilePath: string | null = null;
    const safeInstanceId =
      instanceId.replace(/[^a-zA-Z0-9_-]/g, "_") || "default";
    if (javaMajorVersion >= 9) {
      try {
        const tempDir = path.join(gameDir, "temp");
        fs.mkdirSync(tempDir, { recursive: true });
        const argsFileName = `args_${safeInstanceId}.txt`;
        const argsFile = path.join(tempDir, argsFileName);
        argsFilePath = argsFile;

        // Write arguments to file, one per line
        // IMPORTANT: Java @argfile treats backslashes as escape characters!
        // We MUST escape backslashes on Windows paths (e.g. C:\Path -> C:\\Path)
        const fileContent = allArgs
          .map((arg) => {
            // 1. Escape backslashes first
            let escaped = arg.replace(/\\/g, "\\\\");

            // 2. Quote if contains spaces (and not already quoted)
            if (escaped.includes(" ") && !escaped.startsWith('"')) {
              escaped = `"${escaped}"`;
            }
            return escaped;
          })
          .join("\n");

        fs.writeFileSync(argsFile, fileContent);
        console.log(`[RustLauncher] Created argument file at ${argsFile}`);
        // IMPORTANT: Use a RELATIVE path for the @argfile argument.
        // If we use an absolute path that contains spaces (e.g. "C:\Users\User Name\..."),
        // Node.js will quote the argument as "@path with spaces" when spawning,
        // and Java will NOT recognize a quoted "@ argument as an @argfile - causing immediate crash.
        // Using a relative path avoids quoting since it has no spaces.
        // Java resolves relative @argfile paths against the process CWD (which is set to gameDir).
        spawnArgs = [`@temp/${argsFileName}`];
      } catch (e) {
        console.error(
          `[RustLauncher] Failed to create argument file, falling back to direct args`,
          e,
        );
      }
    }

    const child = spawn(javaPath, spawnArgs, {
      cwd: gameDir,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      // On Windows: keep attached for proper cleanup
      // On macOS/Linux: detach to prevent "not responding" issues
      detached: process.platform !== "win32",
      windowsHide: true,
    });

    // On non-Windows, unref the child so it doesn't block launcher exit
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

    // Save full launch command to crash log for debugging
    const crashLogPath = path.join(gameDir, "launch-debug.log");
    try {
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
        `Natives Extracted: ${reusedNatives ? `reused (${nativeFingerprint.nativeSourceCount} source jars)` : nativesExtracted}`,
        ``,
        `=== JVM Args (${prepareResult.jvmArgs.length}) ===`,
        ...prepareResult.jvmArgs.map((a, i) => `  [${i}] ${a}`),
        ``,
        `=== Game Args (${prepareResult.gameArgs.length}) ===`,
        ...prepareResult.gameArgs.map((a, i) => `  [${i}] ${a}`),
        ``,
        `=== Full Command ===`,
        `"${javaPath}" ${allArgs.join(" ")}`,
      ].join("\n");
      fs.writeFileSync(crashLogPath, debugInfo);
      console.log(`[RustLauncher] Debug log saved to ${crashLogPath}`);
    } catch (e) {
      console.warn(`[RustLauncher] Failed to save debug log:`, e);
    }

    // Setup live logging with throttling to prevent IPC flooding
    const gameLogCallback = getGameLogCallback();
    let stderrBuffer = ""; // Accumulate stderr for crash diagnostics (capped)
    const MAX_STDERR_BUFFER = 100_000; // Cap at ~100KB to prevent memory leak

    // Throttle mechanism: batch logs and send every 100ms
    let logQueue: Array<{ level: string; message: string }> = [];
    let logFlushTimer: NodeJS.Timeout | null = null;
    const LOG_FLUSH_INTERVAL = 100; // ms
    const MAX_QUEUE_SIZE = 50; // Force flush if queue gets too large

    const flushLogs = () => {
      if (logQueue.length > 0 && gameLogCallback) {
        // Send batched logs (just the last few to prevent overwhelming UI)
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

      // Force flush if queue is too large
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
            // Check for corruption errors (always process immediately)
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

            // Queue log with appropriate level
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
        // Accumulate for crash log, but cap size to prevent memory leak
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

    // Save running instance
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

    // Send game-started event to renderer
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send("game-started", { instanceId, pid: child.pid });
    }

    // Track launch time for crash detection
    const launchTimestamp = Date.now();
    const launchArgsFilePath = argsFilePath;

    // Handle process close
    child.on("close", (code: number | null) => {
      console.log(`[RustLauncher] Game process closed with code: ${code}`);
      if (telemetryInstanceId) {
        trackGameClose(telemetryInstanceId, telemetryUserId);
      }
      native.removeRunningInstance(instanceId);
      setGameProcess(instanceId, null as any);

      // Detect immediate crash (exit within 10 seconds)
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

          // Analyze crash log using Rust Regex
          let specificReasonFound = false;
          if (stderrBuffer) {
            try {
              const parsedReason = native.analyzeCrashLog(stderrBuffer) as
                | string
                | null;
              if (parsedReason) {
                // Return keys instead of full string from Rust, assume rust outputs prefix e.g. "OUT_OF_MEMORY: "
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

        // Append stderr output to crash debug log
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

      // Send IPC event to renderer
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        win.webContents.send("game-stopped", {
          instanceId,
          exitCode: code,
          runDuration,
        });
      }

      // Emit local event for main process listeners (instance handlers)
      ipcMain.emit("game-stopped", null, { instanceId });

      // Clean up argfile
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

/**
 * Apply mod loader to version JSON
 */
async function applyModLoader(
  versionJson: string,
  mcVersion: string,
  loader: { type: string; build?: string },
  gameDir: string,
  native: any,
): Promise<string> {
  const loaderType = loader.type.toLowerCase();

  if (loaderType === "fabric") {
    // Use native Rust Fabric installer
    console.log(`[Fabric] Using native Rust installer...`);
    const minecraftDir = getMinecraftDir();

    try {
      const loaderVersion =
        loader.build === "latest" ? undefined : loader.build;
      const result = await native.installFabric(
        mcVersion,
        loaderVersion,
        minecraftDir,
      );

      console.log(`[Fabric] Installed: ${result.versionId}`);

      // Read the generated version JSON
      const fabricVersionJson = fs.readFileSync(
        result.versionJsonPath,
        "utf-8",
      );
      const fabricProfile = JSON.parse(fabricVersionJson);

      // Merge with vanilla - IMPORTANT: must preserve loader arguments (JVM/game)
      // fabricProfile.arguments contains critical args like -DFabricMcEmu=net.minecraft.client.main.Main
      const vanilla = JSON.parse(versionJson);
      const mergedLibraries = mergeLibraries(
        fabricProfile.libraries || [],
        vanilla.libraries || [],
      );
      return JSON.stringify({
        ...vanilla,
        mainClass: fabricProfile.mainClass,
        // Keep loader libraries first and drop conflicting duplicates (e.g. ASM 9.9 vs 9.6)
        libraries: mergedLibraries,
        // Merge arguments: loader args first (JVM), then vanilla args
        arguments: {
          game: [
            ...(fabricProfile.arguments?.game || []),
            ...(vanilla.arguments?.game || []),
          ],
          jvm: [
            ...(fabricProfile.arguments?.jvm || []),
            ...(vanilla.arguments?.jvm || []),
          ],
        },
      });
    } catch (e: any) {
      console.error(`[Fabric] Native install failed:`, e);
      throw new Error(`Fabric install failed: ${e.message}`);
    }
  }

  if (loaderType === "forge" || loaderType === "neoforge") {
    const minecraftDir = getMinecraftDir();
    const librariesDir = path.join(minecraftDir, "libraries");
    const rustLoaderType = loaderType === "neoforge" ? "NeoForge" : "Forge";
    console.log(`[${loaderType}] Using native Rust installer...`);

    let vjson: string;

    try {
      const versionJsonPath = await native.installForge(
        mcVersion,
        rustLoaderType,
        loader.build,
        minecraftDir,
        undefined,
      );
      vjson = fs.readFileSync(versionJsonPath, "utf-8");
      await ensureLibrariesDownloaded(vjson, minecraftDir);
    } catch (e: any) {
      console.error(`Native Forge install failed:`, e);
      throw new Error(`Native Forge install failed: ${e.message}`);
    }

    // Parse version to extract forge version and MCP version
    const versionData = JSON.parse(vjson);
    const forgeVersionId = versionData.id || "";
    // Extract forge version like "47.4.0" from "1.20.1-forge-47.4.0" or "1.20.1-47.4.0"
    let forgeVersionMatch = forgeVersionId.match(/forge-(\d+\.\d+\.\d+)/);
    if (!forgeVersionMatch && loader.build) {
      // Try to extract from loader.build like "1.20.1-47.4.0" or just "47.4.0"
      const buildMatch = loader.build.match(/(\d+\.\d+\.\d+)$/);
      if (buildMatch) {
        forgeVersionMatch = buildMatch;
      }
    }
    const forgeVersion = forgeVersionMatch ? forgeVersionMatch[1] : "latest";
    console.log(
      `[${loaderType}] Extracted forge version: ${forgeVersion} from ID: ${forgeVersionId}, build: ${loader.build}`,
    );

    // Extract MCP/NeoForm version from arguments
    // Forge uses --fml.mcpVersion, NeoForge 1.21+ uses --fml.neoFormVersion
    let mcpVersion = "";
    const allGameArgs = versionData.arguments?.game || [];
    for (let i = 0; i < allGameArgs.length; i++) {
      const a = allGameArgs[i];
      if (typeof a === "string") {
        if (
          (a === "--fml.neoFormVersion" || a === "--fml.mcpVersion") &&
          typeof allGameArgs[i + 1] === "string"
        ) {
          mcpVersion = allGameArgs[i + 1];
          console.log(
            `[${loaderType}] Found MCP/NeoForm version: ${mcpVersion} from arg: ${a}`,
          );
          break;
        }
      }
    }
    if (!mcpVersion) {
      // Fallback default for Forge 1.20.1
      mcpVersion = loaderType === "neoforge" ? "" : "20230612.114412";
      console.log(
        `[${loaderType}] Using fallback MCP version: ${mcpVersion || "(none)"}`,
      );
    }

    // Check for processor-generated files directly by known paths
    // These files are NOT downloadable - they MUST be generated by Forge/NeoForge installer
    const processorFiles: string[] = [];
    if (loaderType === "neoforge") {
      // NeoForge client jar: net/neoforged/neoforge/VERSION/neoforge-VERSION-client.jar
      processorFiles.push(
        path.join(
          librariesDir,
          "net",
          "neoforged",
          "neoforge",
          forgeVersion,
          `neoforge-${forgeVersion}-client.jar`,
        ),
      );
      if (mcpVersion) {
        // NeoForm processor outputs (NeoForge 1.21+ uses "slim" instead of "srg")
        processorFiles.push(
          path.join(
            librariesDir,
            "net",
            "minecraft",
            "client",
            `${mcVersion}-${mcpVersion}`,
            `client-${mcVersion}-${mcpVersion}-slim.jar`,
          ),
        );
        processorFiles.push(
          path.join(
            librariesDir,
            "net",
            "minecraft",
            "client",
            `${mcVersion}-${mcpVersion}`,
            `client-${mcVersion}-${mcpVersion}-extra.jar`,
          ),
        );
      }
    } else {
      // Traditional Forge: net/minecraftforge/forge/MC-FORGE/forge-MC-FORGE-client.jar
      processorFiles.push(
        path.join(
          librariesDir,
          "net",
          "minecraftforge",
          "forge",
          `${mcVersion}-${forgeVersion}`,
          `forge-${mcVersion}-${forgeVersion}-client.jar`,
        ),
      );
      if (mcpVersion) {
        processorFiles.push(
          path.join(
            librariesDir,
            "net",
            "minecraft",
            "client",
            `${mcVersion}-${mcpVersion}`,
            `client-${mcVersion}-${mcpVersion}-srg.jar`,
          ),
        );
        processorFiles.push(
          path.join(
            librariesDir,
            "net",
            "minecraft",
            "client",
            `${mcVersion}-${mcpVersion}`,
            `client-${mcVersion}-${mcpVersion}-extra.jar`,
          ),
        );
      }
    }

    const missingProcessorFiles = processorFiles.filter(
      (f) => !fs.existsSync(f),
    );
    console.log(
      `[${loaderType}] Checking processor files:`,
      processorFiles.map(
        (f) =>
          `${path.basename(f)}: ${fs.existsSync(f) ? "EXISTS" : "MISSING"}`,
      ),
    );

    if (missingProcessorFiles.length > 0) {
      console.log(
        `[${loaderType}] Missing processor-generated files:`,
        missingProcessorFiles.map((f) => path.basename(f)),
      );
      console.log(
        `[${loaderType}] Running Forge installer with Java to generate them...`,
      );

      // Create dummy launcher_profiles.json (required by Forge installer)
      const launcherProfilesPath = path.join(
        minecraftDir,
        "launcher_profiles.json",
      );
      if (!fs.existsSync(launcherProfilesPath)) {
        const dummyProfile = {
          profiles: {},
          selectedProfile: "(Default)",
          clientToken: "00000000-0000-0000-0000-000000000000",
          authenticationDatabase: {},
          launcherVersion: {
            name: "RealityLauncher",
            format: 21,
            profilesFormat: 1,
          },
        };
        fs.writeFileSync(
          launcherProfilesPath,
          JSON.stringify(dummyProfile, null, 2),
        );
        console.log(`[${loaderType}] Created dummy launcher_profiles.json`);
      }

      // Download installer JAR
      const installerUrl =
        loaderType === "neoforge"
          ? `https://maven.neoforged.net/releases/net/neoforged/neoforge/${forgeVersion}/neoforge-${forgeVersion}-installer.jar`
          : `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeVersion}/forge-${mcVersion}-${forgeVersion}-installer.jar`;

      const installerPath = path.join(
        minecraftDir,
        "temp",
        `${loaderType}-installer-${mcVersion}-${forgeVersion}.jar`,
      );
      fs.mkdirSync(path.dirname(installerPath), { recursive: true });

      if (!fs.existsSync(installerPath)) {
        console.log(`[${loaderType}] Downloading installer: ${installerUrl}`);
        await downloadFileAtomic(installerUrl, installerPath);
      }

      // Find Java path for running installer
      let javaPath: string;
      try {
        // NeoForge 1.21+ installer may need Java 21
        // Forge 1.20.x installer works best with Java 17
        const mcMinor = parseInt(mcVersion.split(".")[1] || "0");
        const mcPatch = parseInt(mcVersion.split(".")[2] || "0");
        const needsJava21 =
          loaderType === "neoforge" &&
          (mcMinor > 20 || (mcMinor === 20 && mcPatch >= 5));
        const forceVersion = needsJava21 ? "1.21" : "1.18.2";
        javaPath = await getJavaPath(
          undefined,
          undefined,
          native,
          forceVersion,
        );
        console.log(
          `[${loaderType}] Selected Java ${needsJava21 ? "21+" : "17"} for installer: ${javaPath}`,
        );
      } catch {
        // Fallback to system Java
        javaPath = "java";
      }
      console.log(`[${loaderType}] Running installer with Java: ${javaPath}`);

      // Run Forge installer in headless mode (async to prevent UI freeze)
      try {
        if (typeof native.runForgeInstaller === "function") {
          console.log(
            `[${loaderType}] Native forge installer: "${javaPath}" -jar "${installerPath}" --installClient "${minecraftDir}"`,
          );
          const runResult = (await native.runForgeInstaller(
            javaPath,
            installerPath,
            minecraftDir,
            600000,
          )) as {
            success?: boolean;
            timeout?: boolean;
            exitCode?: number | null;
            error?: string | null;
          };

          if (!runResult?.success) {
            if (runResult?.timeout) {
              throw new Error("Installer timeout (10 minutes)");
            }
            throw new Error(
              runResult?.error ||
                `Installer exited with code ${runResult?.exitCode ?? "unknown"}`,
            );
          }
          console.log(`[${loaderType}] Installer completed successfully`);
        } else {
          const { spawn } = await import("child_process");
          console.log(
            `[${loaderType}] Install command: "${javaPath}" -jar "${installerPath}" --installClient "${minecraftDir}"`,
          );

          await new Promise<void>((resolve, reject) => {
            const installerProcess = spawn(
              javaPath,
              ["-jar", installerPath, "--installClient", minecraftDir],
              {
                cwd: minecraftDir,
                stdio: ["ignore", "pipe", "pipe"],
                windowsHide: true,
              },
            );

            let stdout = "";
            let stderr = "";

            installerProcess.stdout?.on("data", (data: Buffer) => {
              const text = data.toString();
              stdout += text;
              const lines = text.split("\n").filter((l: string) => l.trim());
              for (const line of lines) {
                console.log(`[${loaderType}] ${line.trim()}`);
              }
            });

            installerProcess.stderr?.on("data", (data: Buffer) => {
              stderr += data.toString();
            });

            installerProcess.on("close", (code) => {
              if (code === 0) {
                console.log(`[${loaderType}] Installer completed successfully`);
                resolve();
              } else {
                console.error(
                  `[${loaderType}] Installer Process Failed with code ${code}!`,
                );
                if (stdout) console.log(`[${loaderType}] stdout:\n${stdout}`);
                if (stderr) console.error(`[${loaderType}] stderr:\n${stderr}`);
                reject(new Error(`Installer exited with code ${code}`));
              }
            });

            installerProcess.on("error", (err) => {
              console.error(`[${loaderType}] Installer spawn error:`, err);
              reject(err);
            });

            setTimeout(() => {
              installerProcess.kill();
              reject(new Error("Installer timeout (10 minutes)"));
            }, 600000);
          });
        }
      } catch (installErr: any) {
        console.error(
          `[${loaderType}] Installer process encountered an error:`,
          installErr.message,
        );

        // Check if files were created despite error (sometimes installer exits with non-zero but does the job)
        const stillMissing = processorFiles.filter((f) => !fs.existsSync(f));
        if (stillMissing.length > 0) {
          const missingNames = stillMissing
            .map((f) => path.basename(f))
            .join(", ");
          throw new Error(`
                        Forge installer failed to generate required files: ${missingNames}.
                        
                        Troubleshooting:
                        1. Try changing Java version (Java 17 recommended for 1.18-1.20)
                        2. Check internet connection
                        3. Try "Verify Files" to reset libraries
                    `);
        } else {
          console.warn(
            `[${loaderType}] Installer reported error but required files exist. Proceeding...`,
          );
        }
      }

      // Cleanup installer
      try {
        fs.unlinkSync(installerPath);
      } catch {}
    }

    return vjson;
  } /* Legacy TS Implementation:

        if (!forgeFullVersion || forgeFullVersion === "latest") {
            try {
                if (loaderType === "neoforge") {
                    // NeoForge: Fetch from maven-metadata.xml
                    const metadataUrl = "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
                    const xmlText = await fetch(metadataUrl).then(r => r.text());

                    // Parse XML roughly with Regex
                    const versionMatch = xmlText.match(/<version>(.*?)<\/version>/g);
                    if (versionMatch) {
                        const versions = versionMatch.map(v => v.replace(/<\/?version>/g, ""));
                        // Filter by MC version - NeoForge uses simplified version like 20.1.x for MC 1.20.1
                        const validVersions = versions.filter(v => {
                            if (mcVersion === "1.20.1") return v.startsWith("47.1") || v.startsWith("20.1");
                            if (mcVersion === "1.21") return v.startsWith("21.");
                            if (mcVersion === "1.21.1") return v.startsWith("21.1");
                            const shortVer = mcVersion.split(".").slice(1).join(".");
                            return v.startsWith(shortVer);
                        }).reverse(); // Newest first

                        forgeFullVersion = validVersions[0];
                        console.log(`[NeoForge] Found versions for ${mcVersion}:`, validVersions.slice(0, 5));
                    }

                    if (!forgeFullVersion) {
                        console.error(`[NeoForge] No matching version found for MC ${mcVersion}`);
                    }
                } else {
                    // Forge: promotions_slim.json
                    const forgeListUrl = `https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json`;
                    const forgeListRes = await fetch(forgeListUrl);
                    const forgeList = await forgeListRes.json();

                    const recommendedKey = `${mcVersion}-recommended`;
                    const latestKey = `${mcVersion}-latest`;
                    forgeFullVersion = forgeList.promos?.[recommendedKey] || forgeList.promos?.[latestKey];
                    if (forgeFullVersion) {
                        forgeFullVersion = `${mcVersion}-${forgeFullVersion}`;
                    }
                }
            } catch (e) {
                console.error(`[${loaderType}] Failed to fetch version list:`, e);
            }
        }

        if (!forgeFullVersion) {
            throw new Error(`ไม่พบ ${loaderType === "neoforge" ? "NeoForge" : "Forge"} สำหรับ Minecraft ${mcVersion}`);
        }

        console.log(`[${loaderType}] Using version: ${forgeFullVersion}`);

        // Check if Forge version JSON already exists
        const forgeVersionId = loaderType === "neoforge"
            ? `neoforge-${forgeFullVersion}`
            : `${mcVersion}-forge-${forgeFullVersion.replace(mcVersion + "-", "")}`;
        const forgeVersionJsonPath = path.join(minecraftDir, "versions", forgeVersionId, `${forgeVersionId}.json`);

        if (fs.existsSync(forgeVersionJsonPath)) {
            console.log(`[${loaderType}] Using existing version JSON: ${forgeVersionJsonPath}`);
            return fs.readFileSync(forgeVersionJsonPath, "utf-8");
        }

        // Download Forge/NeoForge installer
        const installerUrl = loaderType === "neoforge"
            ? `https://maven.neoforged.net/releases/net/neoforged/neoforge/${forgeFullVersion}/neoforge-${forgeFullVersion}-installer.jar`
            : `https://maven.minecraftforge.net/net/minecraftforge/forge/${forgeFullVersion}/forge-${forgeFullVersion}-installer.jar`;

        const installerPath = path.join(minecraftDir, "temp", `${loaderType}-installer-${forgeFullVersion}.jar`);
        fs.mkdirSync(path.dirname(installerPath), { recursive: true });

        console.log(`[${loaderType}] Downloading installer from: ${installerUrl}`);

        // Download installer using atomic downloader
        await downloadFileAtomic(installerUrl, installerPath);


        // Manual extraction (Forge installer requires GUI mode, can't run headless)
        console.log(`[${loaderType}] Extracting from installer JAR...`);


        const AdmZip = (await import("adm-zip")).default;
        const zip = new AdmZip(installerPath);

        const installProfileEntry = zip.getEntry("install_profile.json");
        const versionJsonEntry = zip.getEntry("version.json");

        if (!installProfileEntry && !versionJsonEntry) {
            throw new Error(`ไม่พบ install profile ใน ${loaderType} installer`);
        }

        let forgeVersionJson: any;
        if (versionJsonEntry) {
            forgeVersionJson = JSON.parse(versionJsonEntry.getData().toString("utf-8"));
        } else if (installProfileEntry) {
            const installProfile = JSON.parse(installProfileEntry.getData().toString("utf-8"));
            forgeVersionJson = installProfile.versionInfo;
        }

        if (!forgeVersionJson) {
            throw new Error(`ไม่สามารถอ่าน version info จาก ${loaderType} installer`);
        }

        // Extract libraries from installer (maven/)
        const libEntries = zip.getEntries().filter(e =>
            e.entryName.startsWith("maven/") && !e.isDirectory
        );

        for (const libEntry of libEntries) {
            const targetPath = path.join(librariesDir, libEntry.entryName.replace("maven/", ""));
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            if (!fs.existsSync(targetPath)) {
                fs.writeFileSync(targetPath, libEntry.getData());
            }
        }


        // Fix for Modern Forge (1.17+): Extract data/ libraries
        // The installer contains files in data/ that need to be placed in libraries/
        // We parse install_profile.json to understand the mapping

        let installProfile: any = null;
        if (installProfileEntry) {
            installProfile = JSON.parse(installProfileEntry.getData().toString("utf-8"));
        }

        // Extract ALL data/*.jar files - we'll figure out mapping dynamically
        const dataJarEntries = zip.getEntries().filter(e =>
            e.entryName.startsWith("data/") && e.entryName.endsWith(".jar") && !e.isDirectory
        );

        console.log(`[${loaderType}] Found ${dataJarEntries.length} data JAR entries`);

        // The install_profile.json has a "data" section that maps keys to file references
        // e.g. "MAPPINGS": { "client": "[de.oceanlabs.mcp:mcp_config:1.20.1-20230612.114412@zip]" }
        // We need to extract these files to the correct library paths

        if (installProfile && installProfile.data) {
            console.log(`[${loaderType}] Processing install_profile.data keys:`, Object.keys(installProfile.data));

            for (const key of Object.keys(installProfile.data)) {
                const dataItem = installProfile.data[key];
                let clientValue = dataItem.client;

                if (!clientValue) continue;

                // If it's a reference like [xxx:yyy:zzz@ext], it's a Maven artifact
                // If it's a path like /data/client.jar, it's a local file in the installer
                if (clientValue.startsWith("/")) {
                    // Local file reference - strip leading /
                    const zipPath = clientValue.substring(1); // e.g., "data/client.jar"
                    const entry = zip.getEntry(zipPath);

                    if (entry) {
                        // For local files like /data/client.jar, we need to find which library needs it
                        // by checking version.json libraries that don't have downloads

                        // Common patterns:
                        // PATCHED -> net.minecraft:client:xxx:xxx-srg
                        // CLIENT_EXTRA -> net.minecraft:client:xxx-extra
                        // etc.

                        // For now, let's extract to a temp location and let Forge handle it
                        // OR, better: parse the forgeVersionJson.libraries to find matching entries

                        const libs = forgeVersionJson.libraries || [];
                        for (const lib of libs) {
                            // Check if this library has no download URL (meaning it should be provided by installer)
                            const hasDownload = lib.downloads?.artifact?.url || lib.url;
                            if (hasDownload) continue;

                            // Parse Maven coordinates: group:artifact:version[:classifier]
                            const parts = lib.name.split(":");
                            if (parts.length < 3) continue;

                            const group = parts[0].replace(/\./g, "/");
                            const artifact = parts[1];
                            const version = parts[2];
                            const classifier = parts[3] ? `-${parts[3]}` : "";

                            // Check if this key matches the library's classifier
                            // Common mappings:
                            // PATCHED -> srg (or just "client")
                            // CLIENT_EXTRA -> extra
                            const lowerKey = key.toLowerCase();
                            const lowerClassifier = classifier.toLowerCase();

                            let isMatch = false;
                            if (lowerKey === "patched" && (lowerClassifier.includes("srg") || artifact === "client")) isMatch = true;
                            if (lowerKey === "client_extra" && lowerClassifier.includes("extra")) isMatch = true;
                            if (lowerKey === "slim" && lowerClassifier.includes("slim")) isMatch = true;
                            if (lowerKey.includes(artifact.toLowerCase())) isMatch = true;

                            if (isMatch || (!hasDownload && lib.name.includes("client"))) {
                                const destPath = path.join(librariesDir, group, artifact, version, `${artifact}-${version}${classifier}.jar`);

                                if (!fs.existsSync(destPath)) {
                                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                                    fs.writeFileSync(destPath, entry.getData());
                                    console.log(`[${loaderType}] Extracted ${key} -> ${destPath}`);
                                }
                            }
                        }
                    }
                }
            }
        }

        // FALLBACK: Extract all data/*.jar entries that look like they should be libraries
        // This catches edge cases where the install_profile mapping is incomplete
        for (const entry of dataJarEntries) {
            const fileName = path.basename(entry.entryName);

            // Try to find a library in version.json that needs this file
            const libs = forgeVersionJson.libraries || [];
            for (const lib of libs) {
                const hasDownload = lib.downloads?.artifact?.url || lib.url;
                if (hasDownload) continue;

                // Check if library name matches file name pattern
                const parts = lib.name.split(":");
                if (parts.length < 3) continue;

                const artifact = parts[1];

                // If the data file contains the artifact name, it might be a match
                if (fileName.toLowerCase().includes(artifact.toLowerCase()) ||
                    (artifact === "client" && fileName === "client.jar")) {

                    const group = parts[0].replace(/\./g, "/");
                    const version = parts[2];
                    const classifier = parts[3] ? `-${parts[3]}` : "";
                    const destPath = path.join(librariesDir, group, artifact, version, `${artifact}-${version}${classifier}.jar`);

                    if (!fs.existsSync(destPath)) {
                        fs.mkdirSync(path.dirname(destPath), { recursive: true });
                        fs.writeFileSync(destPath, entry.getData());
                        console.log(`[${loaderType}] Fallback extracted ${entry.entryName} -> ${destPath}`);
                    }
                }
            }
        }

        // Save version JSON
        fs.mkdirSync(path.dirname(forgeVersionJsonPath), { recursive: true });
        fs.writeFileSync(forgeVersionJsonPath, JSON.stringify(forgeVersionJson, null, 2));

        // Cleanup installer
        try { fs.unlinkSync(installerPath); } catch { }

    */

  if (loaderType === "quilt") {
    // Use native Rust Quilt installer
    console.log(`[Quilt] Using native Rust installer...`);
    const minecraftDir = getMinecraftDir();

    try {
      const loaderVersion =
        loader.build === "latest" ? undefined : loader.build;
      const result = await native.installQuilt(
        mcVersion,
        loaderVersion,
        minecraftDir,
      );

      console.log(`[Quilt] Installed: ${result.versionId}`);

      // Read the generated version JSON
      const quiltVersionJson = fs.readFileSync(result.versionJsonPath, "utf-8");
      const quiltProfile = JSON.parse(quiltVersionJson);

      // Merge with vanilla - IMPORTANT: must preserve loader arguments (JVM/game)
      // quiltProfile.arguments contains critical args like -DQuiltMcEmu=net.minecraft.client.main.Main
      const vanilla = JSON.parse(versionJson);
      const mergedLibraries = mergeLibraries(
        quiltProfile.libraries || [],
        vanilla.libraries || [],
      );
      return JSON.stringify({
        ...vanilla,
        mainClass: quiltProfile.mainClass,
        // Keep loader libraries first and drop conflicting duplicates
        libraries: mergedLibraries,
        // Merge arguments: loader args first (JVM), then vanilla args
        arguments: {
          game: [
            ...(quiltProfile.arguments?.game || []),
            ...(vanilla.arguments?.game || []),
          ],
          jvm: [
            ...(quiltProfile.arguments?.jvm || []),
            ...(vanilla.arguments?.jvm || []),
          ],
        },
      });
    } catch (e: any) {
      console.error(`[Quilt] Native install failed:`, e);
      throw new Error(`Quilt install failed: ${e.message}`);
    }
  }

  // Fallback: Vanilla
  console.warn(
    `[Loader] Unknown loader type: ${loaderType}, falling back to vanilla`,
  );
  return versionJson;
}

/**
 * Get optimized JVM arguments
 */
function getOptimizedJvmArgs(): string[] {
  const cpuCores = os.cpus().length;
  const gcThreads = Math.max(2, Math.min(Math.floor(cpuCores / 2), 8));

  return [
    "-XX:+UseG1GC",
    "-XX:+ParallelRefProcEnabled",
    "-XX:MaxGCPauseMillis=50",
    "-XX:+UnlockExperimentalVMOptions",
    "-XX:+DisableExplicitGC",
    "-XX:G1NewSizePercent=30",
    "-XX:G1MaxNewSizePercent=40",
    "-XX:G1HeapRegionSize=16M",
    "-XX:G1ReservePercent=20",
    "-XX:InitiatingHeapOccupancyPercent=15",
    `-XX:ParallelGCThreads=${gcThreads}`,
    "-Dfile.encoding=UTF-8",
    // Force English locale to prevent log parsing issues with Buddhist year (2569)
    "-Duser.language=en",
    "-Duser.country=US",
  ];
}

export { launchGameRust as launchGame };
