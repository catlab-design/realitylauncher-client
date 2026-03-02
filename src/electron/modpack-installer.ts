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
import { installCurseForgeModpack } from "./curseforge.js";
import { getConfig } from "./config.js";
import { getNativeModule } from "./native.js";

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

async function verifyFileHashNative(
  filePath: string,
  hashes?: { sha1?: string; sha512?: string },
): Promise<boolean> {
  if (!hashes?.sha1) {
    return true;
  }
  const native = getNativeModule();
  return (await native.verifyFileHash(filePath, hashes.sha1, undefined)) as boolean;
}

export async function parseModpackIndex(
  mrpackPath: string,
): Promise<ModpackIndex> {
  console.log("[ModpackInstaller] Parsing:", mrpackPath);

  const native = getNativeModule();
  const manifest = native.parseModrinthManifest(mrpackPath) as
    | {
        formatVersion: number;
        game: string;
        versionId: string;
        name: string;
        summary?: string;
        files: Array<{
          path: string;
          downloads: string[];
          fileSize: number;
          hashes: { sha1: string; sha512?: string };
          env?: {
            client?: "required" | "optional" | "unsupported";
            server?: "required" | "optional" | "unsupported";
          };
        }>;
        minecraftVersion?: string;
        loader?: string;
        loaderVersion?: string;
      }
    | null;

  if (!manifest) {
    throw new Error("Could not find modrinth.index.json in modpack");
  }

  const dependencies: ModpackDependencies = {
    minecraft: manifest.minecraftVersion || "*",
  };

  if (manifest.loader && manifest.loaderVersion) {
    switch (manifest.loader) {
      case "fabric":
        dependencies["fabric-loader"] = manifest.loaderVersion;
        break;
      case "forge":
        dependencies.forge = manifest.loaderVersion;
        break;
      case "neoforge":
        dependencies.neoforge = manifest.loaderVersion;
        break;
      case "quilt":
        dependencies["quilt-loader"] = manifest.loaderVersion;
        break;
      default:
        break;
    }
  }

  const index: ModpackIndex = {
    formatVersion: manifest.formatVersion,
    game: manifest.game,
    versionId: manifest.versionId,
    name: manifest.name,
    summary: manifest.summary,
    files: Array.isArray(manifest.files)
      ? manifest.files.map((f) => ({
          path: f.path,
          downloads: Array.isArray(f.downloads) ? f.downloads : [],
          fileSize: Number(f.fileSize || 0),
          hashes: {
            sha1: f.hashes?.sha1,
            sha512: f.hashes?.sha512,
          },
          env: f.env,
        }))
      : [],
    dependencies,
  };

  console.log(
    "[ModpackInstaller] Parsed modpack:",
    index.name,
    "version:",
    index.versionId,
  );
  return index;
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
  const native = getNativeModule();
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
            const isHashValid = await verifyFileHashNative(
              destPath,
              file.hashes,
            );
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

        while (attempts < maxAttempts) {
          try {
            attempts++;
            const url = urls[(attempts - 1) % urls.length];
            const result = (await native.downloadFile(
              url,
              destPath,
              file.hashes?.sha1 || undefined,
              undefined,
            )) as { success: boolean; error?: string };
            if (!result?.success) {
              throw new Error(
                result?.error || `Failed to download ${path.basename(destPath)}`,
              );
            }
            completed++;
            break;
          } catch (error: any) {
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
): Promise<void> {
  console.log("[ModpackInstaller] Extracting overrides to:", destDir);
  const native = getNativeModule();

  if (onProgress) {
    onProgress({
      stage: "copying",
      message: "Copying override files...",
    });
  }

  try {
    const result = native.extractModpackOverrides(mrpackPath, destDir, "overrides");
    if (result?.success) {
      console.log(
        `[ModpackInstaller] Overrides extracted successfully (${result.filesExtracted} files)`,
      );
    }
  } catch (error) {
    console.log(
      "[ModpackInstaller] No overrides folder or extraction error:",
      error,
    );
  }

  try {
    const result = native.extractModpackOverrides(
      mrpackPath,
      destDir,
      "client-overrides",
    );
    if (result?.success) {
      console.log(
        `[ModpackInstaller] Client overrides extracted successfully (${result.filesExtracted} files)`,
      );
    }
  } catch {
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

    if (onProgress) {
      onProgress({
        stage: "extracting",
        message: "Reading modpack...",
      });
    }

    if (!fs.existsSync(mrpackPath)) {
      throw new Error("Modpack file not found");
    }

    const stats = fs.statSync(mrpackPath);
    const fileSizeMB = stats.size / (1024 * 1024);
    console.log(`[ModpackInstaller] File size: ${fileSizeMB.toFixed(2)} MB`);

    if (fileSizeMB > 500) {
      console.warn(
        "[ModpackInstaller] Large modpack file, this may take a while...",
      );
    }

    const native = getNativeModule();
    const isModrinth = !!native.parseModrinthManifest(mrpackPath);
    if (isModrinth) {
      return await installModrinthModpack(mrpackPath, onProgress, signal);
    }

    const isCurseForge = !!native.parseCurseforgeManifest(mrpackPath);
    if (isCurseForge) {
      return await installCurseForgeModpack(mrpackPath, onProgress, signal);
    }

    throw new Error(
      "Unknown modpack format (expected modrinth.index.json or manifest.json)",
    );
  } catch (error: any) {
    if (error.message === "Installation cancelled") {
      console.log("[ModpackInstaller] Installation cancelled by user");
      return { ok: false, error: "Installation cancelled" };
    }

    console.error("[ModpackInstaller] Installation failed:", error);
    return {
      ok: false,
      error: error.message || "Installation failed",
    };
  }
}

async function installModrinthModpack(
  mrpackPath: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<InstallResult> {
  let createdInstance: GameInstance | null = null;

  try {
    if (signal?.aborted) throw new Error("Installation cancelled");

    // Step 1: Parse modpack index
    if (onProgress) {
      onProgress({
        stage: "extracting",
        message: "Reading modpack metadata...",
      });
    }

    const index = await parseModpackIndex(mrpackPath);

    // Step 2: Create instance
    if (onProgress) {
      onProgress({
        stage: "creating",
        message: `Creating instance: ${index.name}`,
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
    );

    // Step 5-6: Post-install file cleanup (prefer Rust background worker)
    const modsDir = path.join(instance.gameDirectory, "mods");
    const postInstallNative = getNativeModule() as any;
    let postInstallHandledByNative = false;
    if (typeof postInstallNative.postInstallModpackFiles === "function") {
      try {
        await postInstallNative.postInstallModpackFiles(instance.gameDirectory);
        postInstallHandledByNative = true;
      } catch (nativeError) {
        console.warn(
          "[ModpackInstaller] Native post-install cleanup failed, fallback to JS:",
          nativeError,
        );
      }
    }

    if (!postInstallHandledByNative) {
      // Fallback JS path
      deduplicateMods(modsDir);
      moveResourcePacks(instance.gameDirectory);
    }

    if (onProgress) {
      onProgress({
        stage: "creating",
        message: "Installation complete!",
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
  const native = getNativeModule() as any;
  if (typeof native.detectModConflictsNative === "function") {
    try {
      const nativeConflicts = native.detectModConflictsNative(modsDir) as Array<{
        conflictType?: string;
        file1?: string;
        file2?: string | null;
        reason?: string;
      }>;
      if (Array.isArray(nativeConflicts)) {
        return nativeConflicts.map((item) => ({
          type:
            item.conflictType === "library_conflict"
              ? "library_conflict"
              : "duplicate_mod",
          file1: item.file1 || "",
          file2: item.file2 || undefined,
          reason: item.reason || "Unknown conflict",
        }));
      }
    } catch (nativeError) {
      console.warn(
        "[ModpackInstaller] Native conflict detection failed, fallback to JS:",
        nativeError,
      );
    }
  }

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
        reason: `Found multiple versions of "${name}": ${fileList.join(", ")}`,
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
        reason: `Found duplicate "${lib.name}" libraries that may conflict.`,
      });
    }
  }

  return conflicts;
}

