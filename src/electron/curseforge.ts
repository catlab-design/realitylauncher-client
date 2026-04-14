

import fs from "node:fs";
import path from "node:path";
import { createInstance, type GameInstance } from "./instances.js";
import {
  type InstallProgress,
  type InstallResult,
  deduplicateMods,
  moveResourcePacks,
} from "./modpack-installer.js";
import { getConfig } from "./config.js";
import { getNativeModule } from "./native.js";





interface CurseForgeManifest {
  minecraft: {
    version: string;
    modLoaders: {
      id: string; 
      primary: boolean;
    }[];
  };
  manifestType: string;
  manifestVersion: number;
  name: string;
  version: string;
  author: string;
  files: {
    projectId: number;
    fileId: number;
    required: boolean;
  }[];
  overrides: string;
}





const PROXY_API = "https://api.curseforge.com";

const MIN_CF_DOWNLOAD_CONCURRENCY = 3;
const MAX_CF_DOWNLOAD_CONCURRENCY = 10;
const DEFAULT_CF_DOWNLOAD_CONCURRENCY = 7;

function getConfiguredCurseforgeConcurrency(): number | null {
  try {
    const cfg = getConfig();
    const configured = Number(cfg.maxConcurrentDownloads || 0);
    if (!Number.isFinite(configured) || configured <= 0) {
      return null;
    }
    return Math.max(
      MIN_CF_DOWNLOAD_CONCURRENCY,
      Math.min(MAX_CF_DOWNLOAD_CONCURRENCY, Math.floor(configured)),
    );
  } catch {
    return null;
  }
}

function resolveCurseForgeDownloadConcurrency(totalFiles: number): number {
  const envValue = Number(process.env.ML_CURSEFORGE_DOWNLOAD_CONCURRENCY || "");
  if (Number.isFinite(envValue) && envValue > 0) {
    return Math.max(
      MIN_CF_DOWNLOAD_CONCURRENCY,
      Math.min(MAX_CF_DOWNLOAD_CONCURRENCY, Math.floor(envValue)),
    );
  }

  const configured = getConfiguredCurseforgeConcurrency();
  if (configured !== null) {
    if (totalFiles >= 180) {
      return Math.min(MAX_CF_DOWNLOAD_CONCURRENCY, configured + 1);
    }
    return configured;
  }

  if (totalFiles >= 240) return 9;
  if (totalFiles >= 120) return 8;
  return DEFAULT_CF_DOWNLOAD_CONCURRENCY;
}

async function resolveFileUrl(
  projectId: number,
  fileId: number,
): Promise<string | null> {
  try {
    const response = await fetch(
      `${PROXY_API}/mods/${projectId}/files/${fileId}`,
    );
    if (!response.ok) {
      console.warn(
        `[CurseForge] Failed to resolve file ${fileId} for project ${projectId}: ${response.status}`,
      );
      
      return constructFallbackUrl(fileId);
    }
    const json = await response.json();

    
    const fileData = json.data || json;
    let downloadUrl = fileData.downloadUrl;

    
    if (!downloadUrl) {
      console.warn(
        `[CurseForge] No downloadUrl for file ${fileId}, trying fallback...`,
      );

      
      if (fileData.fileName) {
        downloadUrl = constructCdnUrl(fileId, fileData.fileName);
        console.log(`[CurseForge] Using CDN URL for ${fileData.fileName}`);
      } else {
        downloadUrl = constructFallbackUrl(fileId);
      }
    }

    return downloadUrl || null;
  } catch (error) {
    console.error(`[CurseForge] Error resolving file ${fileId}:`, error);
    
    return constructFallbackUrl(fileId);
  }
}


function constructCdnUrl(fileId: number, fileName: string): string {
  const firstPart = Math.floor(fileId / 1000);
  const secondPart = fileId % 1000;
  return `https://edge.forgecdn.net/files/${firstPart}/${secondPart}/${fileName}`;
}


function constructFallbackUrl(fileId: number): string | null {
  
  
  return null;
}





export async function installCurseForgeModpack(
  zipPath: string,
  onProgress?: (progress: InstallProgress) => void,
  signal?: AbortSignal,
): Promise<InstallResult> {
  console.log("[CurseForge] Installing modpack:", zipPath);
  let createdInstance: GameInstance | null = null;

  try {
    if (signal?.aborted) throw new Error("Installation cancelled");

    const native = getNativeModule();
    const manifest = native.parseCurseforgeManifest(zipPath) as
      | CurseForgeManifest
      | null;
    if (!manifest) {
      throw new Error("Could not find manifest.json in modpack");
    }
    console.log(
      "[CurseForge] Parsed manifest:",
      manifest.name,
      manifest.version,
    );

    
    if (onProgress) {
      onProgress({
        stage: "creating",
        message: `Creating instance: ${manifest.name}`,
      });
    }

    
    const primaryLoader = manifest.minecraft.modLoaders.find((l) => l.primary);
    let loaderType: "forge" | "fabric" | "neoforge" | "quilt" | "vanilla" =
      "vanilla";
    let loaderVersion = undefined;

    if (primaryLoader) {
      const loaderId = primaryLoader.id.toLowerCase();
      if (loaderId.startsWith("forge")) {
        loaderType = "forge";
        const v = loaderId.replace("forge-", "");
        
        if (!v.startsWith(manifest.minecraft.version)) {
          loaderVersion = `${manifest.minecraft.version}-${v}`;
        } else {
          loaderVersion = v;
        }
      } else if (loaderId.startsWith("fabric")) {
        loaderType = "fabric";
        loaderVersion = loaderId.replace("fabric-", "");
      } else if (loaderId.startsWith("neoforge")) {
        loaderType = "neoforge";
        loaderVersion = loaderId.replace("neoforge-", "");
      } else if (loaderId.startsWith("quilt")) {
        loaderType = "quilt";
        loaderVersion = loaderId.replace("quilt-", "");
      }
    }

    const instance = await createInstance({
      name: manifest.name,
      minecraftVersion: manifest.minecraft.version,
      loader: loaderType,
      loaderVersion,
    });

    createdInstance = instance;
    console.log("[CurseForge] Created instance:", instance.id, instance.name);

    
    if (signal?.aborted) throw new Error("Installation cancelled");

    const files = manifest.files;
    let completed = 0;
    const total = files.length;

    const concurrency = resolveCurseForgeDownloadConcurrency(total);
    console.log(
      `[CurseForge] Download worker count: ${concurrency} (files=${total})`,
    );
    const queue = [...files];

    await Promise.all(
      Array(Math.min(concurrency, queue.length))
        .fill(null)
        .map(async () => {
          while (queue.length > 0) {
            if (signal?.aborted) throw new Error("Installation cancelled");
            const fileInfo = queue.shift();
            if (!fileInfo) break;

            let attempts = 0;
            const maxAttempts = 3;
            let downloadedFilename = `file-${fileInfo.fileId}.jar`;

            while (attempts < maxAttempts) {
              try {
                attempts++;

                const downloadUrl = await resolveFileUrl(
                  fileInfo.projectId,
                  fileInfo.fileId,
                );

                if (!downloadUrl) {
                  console.warn(
                    `[CurseForge] Skipping file ${fileInfo.fileId} (no URL found)`,
                  );
                  completed++;
                  break;
                }

                downloadedFilename = decodeURIComponent(
                  downloadUrl.split("/").pop() || downloadedFilename,
                );
                const destPath = path.join(
                  instance.gameDirectory,
                  "mods",
                  downloadedFilename,
                );

                await fs.promises.mkdir(path.dirname(destPath), {
                  recursive: true,
                });

                const result = (await native.downloadFile(
                  downloadUrl,
                  destPath,
                  undefined,
                  undefined,
                )) as { success: boolean; error?: string };
                if (!result?.success) {
                  throw new Error(
                    result?.error || `Failed to download ${downloadedFilename}`,
                  );
                }
                completed++;

                if (onProgress) {
                  onProgress({
                    stage: "downloading",
                    message: `Downloading: ${downloadedFilename}`,
                    current: completed,
                    total,
                    percent: Math.round((completed / total) * 100),
                  });
                }
                break;
              } catch (error) {
                const err = error;
                if (
                  err instanceof Error &&
                  (err.message === "Download cancelled" ||
                    err.message.includes("Cancelled") ||
                    signal?.aborted)
                ) {
                  throw err;
                }

                console.warn(
                  `[CurseForge] Failed to process file ${fileInfo.fileId} (Attempt ${attempts}/${maxAttempts}):`,
                  err,
                );

                if (attempts >= maxAttempts) {
                  console.error(
                    `[CurseForge] Gave up on file ${fileInfo.fileId} after ${maxAttempts} attempts.`,
                  );
                  completed++;
                  break;
                }

                const errorMessage = err instanceof Error ? err.message : String(err);
                const isRateLimited = /429|rate limit/i.test(errorMessage);
                const delay = isRateLimited
                  ? Math.random() * 1500 + attempts * 2500
                  : Math.random() * 1000 + attempts * 1000;
                await new Promise((r) => setTimeout(r, delay));
              }
            }
          }
        }),
    );

    
    const overridesDir = manifest.overrides || "overrides";
    const extractResult = native.extractModpackOverrides(
      zipPath,
      instance.gameDirectory,
      overridesDir,
    ) as { success: boolean; filesExtracted: number };

    if (extractResult?.success && onProgress) {
      onProgress({
        stage: "copying",
        message: `Copying overrides: ${extractResult.filesExtracted} files`,
        current: extractResult.filesExtracted,
        total: extractResult.filesExtracted,
        percent: 100,
      });
    }

    
    const modsDir = path.join(instance.gameDirectory, "mods");
    deduplicateMods(modsDir);

    
    moveResourcePacks(instance.gameDirectory);

    if (onProgress) {
      onProgress({
        stage: "creating",
        message: "Installation complete!",
        percent: 100,
      });
    }

    return {
      ok: true,
      instance,
    };
  } catch (error: any) {
    
    if (createdInstance) {
      console.log(
        "[CurseForge] Installation failed or cancelled, cleaning up instance:",
        createdInstance.id,
      );
      try {
        const { deleteInstance } = await import("./instances.js");
        await deleteInstance(createdInstance.id);
        console.log("[CurseForge] Cleanup complete");
      } catch (cleanupError) {
        console.error("[CurseForge] Failed to cleanup instance:", cleanupError);
      }
    }

    console.error("[CurseForge] Install error:", error);
    return {
      ok: false,
      error: error.message,
    };
  }
}

