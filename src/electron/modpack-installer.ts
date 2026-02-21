/**
 * ========================================
 * Modpack Installer Module
 * ========================================
 *
 * Install modpacks from .mrpack files:
 * - Parse modrinth.index.json
 * - Download all mods in parallel
 * - Extract overrides folder
 * - Create new instance with correct loader
 */

import fs from "node:fs";
import path from "node:path";
import {
  createInstance,
  type GameInstance,
  type LoaderType,
} from "./instances.js";
import {
  downloadFile,
  verifyFileHash,
} from "./modrinth.js";
import { installCurseForgeModpack } from "./curseforge.js";
import AdmZip from "adm-zip";
import { getConfig } from "./config.js";

// ========================================
// Types
// ========================================

export interface ModpackIndex {
  formatVersion: number;
  game: string;
  versionId: string;
  name: string;
  summary?: string;
  files: ModpackFile[];
  dependencies: ModpackDependencies;
}

export interface ModpackFile {
  path: string;
  downloads: string[];
  fileSize: number;
  hashes: {
    sha1?: string;
    sha512?: string;
  };
  env?: {
    client?: "required" | "optional" | "unsupported";
    server?: "required" | "optional" | "unsupported";
  };
}

export interface ModpackDependencies {
  minecraft: string;
  "fabric-loader"?: string;
  forge?: string;
  neoforge?: string;
  "quilt-loader"?: string;
}

export interface InstallProgress {
  stage: "extracting" | "downloading" | "copying" | "creating";
  message: string;
  current?: number;
  total?: number;
  percent?: number;
}

export interface ModConflict {
  type: "duplicate_mod" | "library_conflict";
  file1: string;
  file2?: string;
  reason: string;
}

export interface InstallResult {
  ok: boolean;
  instance?: GameInstance;
  error?: string;
}

// ========================================
// Progress Callback
// ========================================

type ProgressCallback = (progress: InstallProgress) => void;
type ZipSource = string | AdmZip;

const MIN_MODPACK_DOWNLOAD_CONCURRENCY = 3;
const MAX_MODPACK_DOWNLOAD_CONCURRENCY = 12;
const DEFAULT_MODPACK_DOWNLOAD_CONCURRENCY = 8;

const FAST_MIRROR_HINTS = [
  "cdn.modrinth.com",
  "github.com",
  "objects.githubusercontent.com",
  "edge.forgecdn.net",
];

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function getConfiguredDownloadConcurrency(): number | null {
  try {
    const cfg = getConfig();
    const configured = Number(cfg.maxConcurrentDownloads || 0);
    if (!Number.isFinite(configured) || configured <= 0) {
      return null;
    }
    return clampInt(
      configured,
      MIN_MODPACK_DOWNLOAD_CONCURRENCY,
      MAX_MODPACK_DOWNLOAD_CONCURRENCY,
    );
  } catch {
    return null;
  }
}

function resolveModpackDownloadConcurrency(totalFiles: number): number {
  const envValue = Number(process.env.ML_MODPACK_DOWNLOAD_CONCURRENCY || "");
  if (Number.isFinite(envValue) && envValue > 0) {
    return clampInt(
      envValue,
      MIN_MODPACK_DOWNLOAD_CONCURRENCY,
      MAX_MODPACK_DOWNLOAD_CONCURRENCY,
    );
  }

  const configured = getConfiguredDownloadConcurrency();
  if (configured !== null) {
    if (totalFiles >= 240) {
      return clampInt(
        configured + 2,
        MIN_MODPACK_DOWNLOAD_CONCURRENCY,
        MAX_MODPACK_DOWNLOAD_CONCURRENCY,
      );
    }
    if (totalFiles >= 120) {
      return clampInt(
        configured + 1,
        MIN_MODPACK_DOWNLOAD_CONCURRENCY,
        MAX_MODPACK_DOWNLOAD_CONCURRENCY,
      );
    }
    return configured;
  }

  if (totalFiles >= 300) return 10;
  if (totalFiles >= 180) return 9;
  if (totalFiles >= 90) return 8;
  return DEFAULT_MODPACK_DOWNLOAD_CONCURRENCY;
}

function sortDownloadUrlsByPriority(downloads: string[]): string[] {
  const unique = [...new Set(downloads.filter(Boolean))];

  const score = (url: string): number => {
    const lower = url.toLowerCase();
    const hintIndex = FAST_MIRROR_HINTS.findIndex((hint) =>
      lower.includes(hint),
    );
    if (hintIndex >= 0) {
      return 100 - hintIndex;
    }
    return 10;
  };

  return unique.sort((a, b) => score(b) - score(a));
}

async function loadZip(zipPath: string): Promise<AdmZip> {
  const buffer = await fs.promises.readFile(zipPath);
  return new AdmZip(buffer);
}

async function getZip(zipSource: ZipSource): Promise<AdmZip> {
  return typeof zipSource === "string" ? loadZip(zipSource) : zipSource;
}

// ========================================
// ZIP Extraction (using adm-zip)
// ========================================

/**
 * Extract a single entry from ZIP file (async version to prevent UI blocking)
 */
async function extractZipEntry(
  zipSource: ZipSource,
  entryPath: string,
): Promise<Buffer | null> {
  try {
    console.log(
      "[ModpackInstaller] Extracting entry:",
      entryPath,
      "from:",
      typeof zipSource === "string" ? zipSource : "(cached zip)",
    );

    const zip = await getZip(zipSource);
    const entry = zip.getEntry(entryPath);

    if (!entry) {
      console.error("[ModpackInstaller] Entry not found:", entryPath);
      // List available entries for debugging
      const entries = zip
        .getEntries()
        .map((e) => e.entryName)
        .slice(0, 10);
      console.log("[ModpackInstaller] Available entries (first 10):", entries);
      return null;
    }

    const content = entry.getData();
    console.log(
      "[ModpackInstaller] Extracted entry size:",
      content.length,
      "bytes",
    );
    return content;
  } catch (error) {
    console.error("[ModpackInstaller] Extract entry error:", error);
    return null;
  }
}

const PRESERVED_FILES = [
  "options.txt",
  "servers.dat",
  "optionsof.txt",
  "optionsshaders.txt",
  "usercache.json",
];

/**
 * Extract a subdirectory from ZIP to destination (async version)
 */
async function extractZipToDirectory(
  zipSource: ZipSource,
  destDir: string,
  subPath?: string,
  onProgress?: (progress: InstallProgress) => void,
): Promise<void> {
  try {
    console.log(
      "[ModpackInstaller] Extracting to directory:",
      destDir,
      "subPath:",
      subPath || "(none)",
    );

    const zip = await getZip(zipSource);

    if (subPath) {
      // Extract only entries under the subPath
      const normalizedSubPath = subPath.endsWith("/") ? subPath : subPath + "/";

      const entries = zip
        .getEntries()
        .filter(
          (entry) =>
            entry.entryName.startsWith(normalizedSubPath) && !entry.isDirectory,
        );

      const total = entries.length;
      let current = 0;

      for (const entry of entries) {
        const relativePath = entry.entryName.substring(
          normalizedSubPath.length,
        );
        if (relativePath) {
          // Check if file should be preserved
          const fileName = path.basename(relativePath);
          const destPath = path.join(destDir, relativePath);

          if (PRESERVED_FILES.includes(fileName) && fs.existsSync(destPath)) {
            console.log(
              `[ModpackInstaller] Skipping preserved file: ${relativePath}`,
            );
            current++;
            continue;
          }

          const destDirPath = path.dirname(destPath);

          if (!fs.existsSync(destDirPath)) {
            await fs.promises.mkdir(destDirPath, { recursive: true });
          }

          await fs.promises.writeFile(destPath, entry.getData());
          current++;

          if (onProgress) {
            onProgress({
              stage: "copying",
              message: `กำลังคัดลอก: ${fileName}`,
              current,
              total,
              percent: Math.round((current / total) * 100),
            });
          }
        }
      }
    } else {
      // Extract entire ZIP
      zip.extractAllTo(destDir, true);
    }

    console.log("[ModpackInstaller] Extraction complete");
  } catch (error) {
    console.error("[ModpackInstaller] Extract to directory error:", error);
    throw error;
  }
}

// ========================================
// Parse Modpack Index
// ========================================

export async function parseModpackIndex(
  mrpackPath: string,
  zipOverride?: AdmZip,
): Promise<ModpackIndex> {
  console.log("[ModpackInstaller] Parsing:", mrpackPath);

  const content = await extractZipEntry(
    zipOverride ?? mrpackPath,
    "modrinth.index.json",
  );

  if (!content) {
    throw new Error("Could not find modrinth.index.json in modpack");
  }

  // Clean the content - remove BOM and trim
  const cleanContent = content
    .toString("utf-8")
    .replace(/^\uFEFF/, "")
    .trim();

  try {
    const index = JSON.parse(cleanContent) as ModpackIndex;
    console.log(
      "[ModpackInstaller] Parsed modpack:",
      index.name,
      "version:",
      index.versionId,
    );
    return index;
  } catch (error) {
    console.error("[ModpackInstaller] JSON parse error:", error);
    throw new Error("Invalid modrinth.index.json format");
  }
}

// ========================================
// Determine Loader Type
// ========================================

function getLoaderFromDependencies(deps: ModpackDependencies): {
  type: LoaderType;
  version?: string;
} {
  if (deps["fabric-loader"]) {
    return { type: "fabric", version: deps["fabric-loader"] };
  }
  if (deps.forge) {
    return { type: "forge", version: deps.forge };
  }
  if (deps.neoforge) {
    return { type: "neoforge", version: deps.neoforge };
  }
  if (deps["quilt-loader"]) {
    return { type: "quilt", version: deps["quilt-loader"] };
  }
  return { type: "vanilla" };
}

// ========================================
// Download Modpack Files
// ========================================

// Local verifyFileHash removed, imported from modrinth.ts

async function downloadModpackFiles(
  files: ModpackFile[],
  destDir: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  const clientFiles = files.filter(
    (f) => !f.env || f.env.client !== "unsupported",
  );

  console.log(`[ModpackInstaller] Downloading ${clientFiles.length} files...`);

  let completed = 0;
  const total = clientFiles.length;
  const concurrency = resolveModpackDownloadConcurrency(total);
  console.log(
    `[ModpackInstaller] Download worker count: ${concurrency} (files=${total})`,
  );

  const queue = [...clientFiles];
  const activeWorkers = Array(Math.min(concurrency, queue.length))
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        if (signal?.aborted) throw new Error("Installation cancelled");

        const file = queue.shift();
        if (!file) break;

        const destPath = path.join(destDir, file.path);
        const destDirPath = path.dirname(destPath);
        const displayName = path
          .basename(file.path)
          .replace(/\u00A7[0-9a-fk-or]/g, "");

        const reportProgress = (message: string) => {
          if (!onProgress) return;
          onProgress({
            stage: "downloading",
            message,
            current: completed,
            total,
            percent: Math.round((completed / total) * 100),
          });
        };

        await fs.promises.mkdir(destDirPath, { recursive: true });

        let shouldDownload = true;
        let existingSize = 0;
        try {
          const stat = await fs.promises.stat(destPath);
          existingSize = stat.size;
        } catch {
          existingSize = 0;
        }

        if (existingSize > 0) {
          if (existingSize === file.fileSize) {
            const isHashValid = await verifyFileHash(destPath, file.hashes);
            if (isHashValid) {
              console.log(
                `[ModpackInstaller] Skipping (exists & valid): ${file.path}`,
              );
              completed++;
              shouldDownload = false;
              reportProgress(`Validated existing: ${displayName}`);
            } else {
              console.warn(
                `[ModpackInstaller] File exists but hash mismatch, re-downloading: ${file.path}`,
              );
              await fs.promises.rm(destPath, { force: true });
            }
          } else {
            console.warn(
              `[ModpackInstaller] File exists but size mismatch (${existingSize} vs ${file.fileSize}), re-downloading: ${file.path}`,
            );
            await fs.promises.rm(destPath, { force: true });
          }
        }

        if (!shouldDownload) {
          continue;
        }

        const urls = sortDownloadUrlsByPriority(file.downloads);
        if (urls.length === 0) {
          console.warn(`[ModpackInstaller] No download URL for: ${file.path}`);
          completed++;
          reportProgress(`Skipped (no URL): ${displayName}`);
          continue;
        }

        console.log(`[ModpackInstaller] Downloading: ${file.path}`);
        let attempts = 0;
        const maxAttempts = Math.max(3, urls.length);
        const tmpPath = `${destPath}.tmp`;

        while (attempts < maxAttempts) {
          try {
            attempts++;
            const url = urls[(attempts - 1) % urls.length];
            await downloadFile(url, tmpPath, undefined, signal);

            const isHashValid = await verifyFileHash(tmpPath, file.hashes);
            if (!isHashValid) {
              await fs.promises.rm(tmpPath, { force: true });
              throw new Error(`Hash verification failed for ${file.path}`);
            }

            await fs.promises.rm(destPath, { force: true });
            await fs.promises.rename(tmpPath, destPath);
            completed++;
            break;
          } catch (error: any) {
            try {
              await fs.promises.rm(tmpPath, { force: true });
            } catch {}

            if (
              error.message === "Download cancelled" ||
              error.message.includes("Cancelled") ||
              signal?.aborted
            ) {
              throw error;
            }

            console.warn(
              `[ModpackInstaller] Download failed for ${file.path} (Attempt ${attempts}/${maxAttempts}):`,
              error.message,
            );

            if (attempts >= maxAttempts) {
              console.error(
                `[ModpackInstaller] Gave up on ${file.path} after ${maxAttempts} attempts.`,
              );
              completed++;
              break;
            }

            const isRateLimited = /429|rate limit/i.test(
              String(error.message || ""),
            );
            const delay = isRateLimited
              ? Math.random() * 1500 + attempts * 2500
              : Math.random() * 1000 + attempts * 1000;
            await new Promise((r) => setTimeout(r, delay));
          }
        }

        reportProgress(`Downloading: ${displayName}`);
      }
    });

  await Promise.all(activeWorkers);

  console.log(
    `[ModpackInstaller] Download complete: ${completed}/${total} files`,
  );
}

// ========================================
// Move ResourcePacks from Mods folder
// ========================================

/**
 * Move .zip files from mods folder to resourcepacks folder.
 * .zip files in mods folder are typically resourcepacks or shaderpacks
 * that got mixed in from the overrides folder.
 */
export function moveResourcePacks(gameDir: string): void {
  const modsDir = path.join(gameDir, "mods");
  const resourcepacksDir = path.join(gameDir, "resourcepacks");

  if (!fs.existsSync(modsDir)) {
    return;
  }

  const zipFiles = fs.readdirSync(modsDir).filter((f) => f.endsWith(".zip"));

  if (zipFiles.length === 0) {
    return;
  }

  // Create resourcepacks folder if it doesn't exist
  if (!fs.existsSync(resourcepacksDir)) {
    fs.mkdirSync(resourcepacksDir, { recursive: true });
  }

  for (const file of zipFiles) {
    const srcPath = path.join(modsDir, file);
    const destPath = path.join(resourcepacksDir, file);

    try {
      // Move file to resourcepacks folder
      fs.renameSync(srcPath, destPath);
      console.log(
        `[ModpackInstaller] Moved resourcepack: ${file} -> resourcepacks/`,
      );
    } catch (err) {
      console.error(
        `[ModpackInstaller] Failed to move resourcepack: ${file}`,
        err,
      );
    }
  }
}

// ========================================
// Deduplicate Mods
// ========================================

/**
 * Remove duplicate mods from the mods folder.
 * Keeps the larger file when duplicates are found (usually newer version).
 * Duplicates are detected by extracting mod name from filename
 * (before version number like modname-1.0.0.jar)
 */
export function deduplicateMods(modsDir: string): void {
  if (!fs.existsSync(modsDir)) {
    return;
  }

  const files = fs.readdirSync(modsDir).filter((f) => f.endsWith(".jar"));

  // Map to track mods by normalized name
  // Key: normalized mod name, Value: { filename, size, path }
  const modMap = new Map<
    string,
    { filename: string; size: number; path: string }
  >();

  for (const file of files) {
    const filePath = path.join(modsDir, file);
    const stats = fs.statSync(filePath);

    // Extract mod name from filename
    // Patterns: modname-version.jar, modname_version.jar, modname-fabric-version.jar
    // Also handle patterns like: modname-fabric-mc1.20.1-version.jar
    let modName = file.toLowerCase();

    // Remove .jar extension
    modName = modName.replace(/\.jar$/, "");

    // Remove version patterns at the end
    // Match patterns like: -1.0.0, _1.0.0, -v1.0, +build123
    modName = modName.replace(
      /[-_+](\d+\.?\d*\.?\d*|v?\d+)([-_.+][a-z0-9]+)*$/i,
      "",
    );

    // Remove common suffixes that indicate MC version or loader
    modName = modName.replace(
      /[-_](fabric|forge|neoforge|quilt|mc\d+[\.\d]*|minecraft|universal|client|server)[-_]?/gi,
      "-",
    );

    // Normalize separators and clean up
    modName = modName.replace(/[-_]+/g, "-").replace(/^-|-$/g, "");

    const existing = modMap.get(modName);

    if (existing) {
      // Found duplicate - keep the larger file
      if (stats.size > existing.size) {
        // Delete existing, keep new
        console.log(
          `[ModpackInstaller] Removing duplicate mod: ${existing.filename} (keeping ${file})`,
        );
        try {
          fs.rmSync(existing.path, { force: true });
        } catch (err) {
          console.error(
            `[ModpackInstaller] Failed to delete duplicate: ${existing.filename}`,
            err,
          );
        }
        modMap.set(modName, {
          filename: file,
          size: stats.size,
          path: filePath,
        });
      } else {
        // Delete new, keep existing
        console.log(
          `[ModpackInstaller] Removing duplicate mod: ${file} (keeping ${existing.filename})`,
        );
        try {
          fs.rmSync(filePath, { force: true });
        } catch (err) {
          console.error(
            `[ModpackInstaller] Failed to delete duplicate: ${file}`,
            err,
          );
        }
      }
    } else {
      modMap.set(modName, { filename: file, size: stats.size, path: filePath });
    }
  }
}

// ========================================
// Extract Overrides
// ========================================

async function extractOverrides(
  mrpackPath: string,
  destDir: string,
  onProgress?: ProgressCallback,
  zipOverride?: AdmZip,
): Promise<void> {
  console.log("[ModpackInstaller] Extracting overrides to:", destDir);

  if (onProgress) {
    onProgress({
      stage: "copying",
      message: "กำลังคัดลอกไฟล์ config...",
    });
  }

  try {
    // Extract overrides folder
    await extractZipToDirectory(
      zipOverride ?? mrpackPath,
      destDir,
      "overrides",
      onProgress,
    );
    console.log("[ModpackInstaller] Overrides extracted successfully");
  } catch (error) {
    console.log(
      "[ModpackInstaller] No overrides folder or extraction error:",
      error,
    );
  }

  try {
    // Also check for client-overrides
    await extractZipToDirectory(
      zipOverride ?? mrpackPath,
      destDir,
      "client-overrides",
      onProgress,
    );
    console.log("[ModpackInstaller] Client overrides extracted successfully");
  } catch (error) {
    // client-overrides is optional
  }
}

export async function installModpack(
  mrpackPath: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<InstallResult> {
  console.log("[ModpackInstaller] Installing modpack:", mrpackPath);

  try {
    if (signal?.aborted) throw new Error("Installation cancelled");

    // Show progress while reading ZIP (can be slow for large files)
    if (onProgress) {
      onProgress({
        stage: "extracting",
        message: "กำลังอ่านไฟล์ modpack...",
      });
    }

    // Check file exists first
    if (!fs.existsSync(mrpackPath)) {
      throw new Error("ไม่พบไฟล์ modpack ที่ระบุ");
    }

    // Check file size to warn about large files
    const stats = fs.statSync(mrpackPath);
    const fileSizeMB = stats.size / (1024 * 1024);
    console.log(`[ModpackInstaller] File size: ${fileSizeMB.toFixed(2)} MB`);

    if (fileSizeMB > 500) {
      console.warn(
        "[ModpackInstaller] Large modpack file, this may take a while...",
      );
    }

    // Read ZIP asynchronously to prevent UI blocking
    const zipBuffer = await fs.promises.readFile(mrpackPath);

    if (signal?.aborted) throw new Error("Installation cancelled");

    // Parse ZIP in a try-catch to handle corrupt files
    let zip: AdmZip;
    try {
      zip = new AdmZip(zipBuffer);
    } catch (zipError: any) {
      console.error("[ModpackInstaller] Failed to parse ZIP:", zipError);
      throw new Error("ไฟล์ modpack เสียหายหรือไม่ใช่ไฟล์ ZIP ที่ถูกต้อง");
    }

    if (zip.getEntry("modrinth.index.json")) {
      // Modrinth Format
      return await installModrinthModpack(mrpackPath, onProgress, signal, zip);
    } else if (zip.getEntry("manifest.json")) {
      // CurseForge Format
      return await installCurseForgeModpack(mrpackPath, onProgress, signal);
    } else {
      throw new Error(
        "ไม่รู้จักรูปแบบไฟล์ Modpack (ต้องมี modrinth.index.json หรือ manifest.json)",
      );
    }
  } catch (error: any) {
    if (error.message === "Installation cancelled") {
      console.log("[ModpackInstaller] Installation cancelled by user");
      return { ok: false, error: "ยกเลิกการติดตั้งแล้ว" };
    }

    console.error("[ModpackInstaller] Installation failed:", error);
    return {
      ok: false,
      error: error.message || "การติดตั้งล้มเหลว",
    };
  }
}

async function installModrinthModpack(
  mrpackPath: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
  zipOverride?: AdmZip,
): Promise<InstallResult> {
  let createdInstance: GameInstance | null = null;

  try {
    if (signal?.aborted) throw new Error("Installation cancelled");

    // Step 1: Parse modpack index
    if (onProgress) {
      onProgress({
        stage: "extracting",
        message: "กำลังอ่านข้อมูล modpack...",
      });
    }

    const index = await parseModpackIndex(mrpackPath, zipOverride);

    // Step 2: Create instance
    if (onProgress) {
      onProgress({
        stage: "creating",
        message: `กำลังสร้าง instance: ${index.name}`,
      });
    }

    const loader = getLoaderFromDependencies(index.dependencies);

    const instance = await createInstance({
      name: index.name,
      minecraftVersion: index.dependencies.minecraft,
      loader: loader.type,
      loaderVersion: loader.version,
    });

    createdInstance = instance;
    console.log(
      "[ModpackInstaller] Created instance:",
      instance.id,
      instance.name,
    );

    // Step 3: Download all mods
    if (signal?.aborted) throw new Error("Installation cancelled");
    await downloadModpackFiles(
      index.files,
      instance.gameDirectory,
      onProgress,
      signal,
    );

    // Step 4: Extract overrides
    if (signal?.aborted) throw new Error("Installation cancelled");
    await extractOverrides(
      mrpackPath,
      instance.gameDirectory,
      onProgress,
      zipOverride,
    );

    // Step 5: Deduplicate mods (remove duplicates from downloaded + overrides)
    const modsDir = path.join(instance.gameDirectory, "mods");
    deduplicateMods(modsDir);

    // Step 6: Move .zip files from mods to resourcepacks folder
    moveResourcePacks(instance.gameDirectory);

    if (onProgress) {
      onProgress({
        stage: "creating",
        message: "ติดตั้งเสร็จสิ้น!",
        percent: 100,
      });
    }

    console.log("[ModpackInstaller] Installation complete:", instance.name);

    return {
      ok: true,
      instance,
    };
  } catch (error: any) {
    // Cleanup: Delete the instance if installation was cancelled or failed
    if (createdInstance) {
      console.log(
        "[ModpackInstaller] Installation failed or cancelled, cleaning up instance:",
        createdInstance.id,
      );
      try {
        const { deleteInstance } = await import("./instances.js");
        await deleteInstance(createdInstance.id);
        console.log("[ModpackInstaller] Cleanup complete");
      } catch (cleanupError) {
        console.error(
          "[ModpackInstaller] Failed to cleanup instance:",
          cleanupError,
        );
      }
    }
    throw error;
  }
}

// ========================================
// Mod Conflict Detection
// ========================================

export function detectModConflicts(modsDir: string): ModConflict[] {
  const conflicts: ModConflict[] = [];

  if (!fs.existsSync(modsDir)) {
    return conflicts;
  }

  const files = fs.readdirSync(modsDir).filter((f) => f.endsWith(".jar"));

  // Track mod names (simplified - just checks filename patterns)
  const modNames = new Map<string, string[]>();

  for (const file of files) {
    // Extract mod name from filename (before version number)
    // Pattern: modname-version.jar or modname_version.jar
    const match = file.match(/^(.+?)[-_]\d/);
    const modName = match ? match[1].toLowerCase() : file.toLowerCase();

    if (!modNames.has(modName)) {
      modNames.set(modName, []);
    }
    modNames.get(modName)!.push(file);
  }

  // Check for duplicates
  for (const [name, fileList] of modNames) {
    if (fileList.length > 1) {
      conflicts.push({
        type: "duplicate_mod",
        file1: fileList[0],
        file2: fileList[1],
        reason: `พบ mod "${name}" หลายเวอร์ชัน: ${fileList.join(", ")}`,
      });
    }
  }

  // Check for known conflicting libraries
  const conflictingLibs = [
    { pattern: /asm[-_]?\d/i, name: "ASM" },
    { pattern: /guava[-_]?\d/i, name: "Guava" },
    { pattern: /gson[-_]?\d/i, name: "Gson" },
  ];

  for (const lib of conflictingLibs) {
    const matches = files.filter((f) => lib.pattern.test(f));
    if (matches.length > 1) {
      conflicts.push({
        type: "library_conflict",
        file1: matches[0],
        file2: matches[1],
        reason: `พบ library "${lib.name}" ซ้ำกัน อาจทำให้เกมขัดข้อง`,
      });
    }
  }

  return conflicts;
}
