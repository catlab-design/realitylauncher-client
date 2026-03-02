import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import { dialog, BrowserWindow } from "electron";
import { getInstance, getInstanceDir } from "./instances.js";
import { getNativeModule } from "./native.js";

// Options passed from frontend
export interface ExportOptions {
  name: string;
  version: string;
  description?: string;
  includedPaths: string[]; // List of relative paths (files or directories)
  format: "zip" | "mrpack";
}

interface ExportProgress {
  transferred: number;
  total: number;
  percent: number;
}

// Store abort controllers for active exports
const exportControllers = new Map<string, AbortController>();

/**
 * Calculate total size of files to be exported
 */
function calculateTotalSize(baseDir: string, relativePaths: string[]): number {
  const native = getNativeModule();
  let total = 0;

  for (const relPath of relativePaths) {
    const fullPath = path.join(baseDir, relPath);
    try {
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          // Native recursive walk is faster for large trees.
          const info = native.getDirectorySize(fullPath) as {
            totalBytes?: number;
          };
          total += Number(info?.totalBytes || 0);
        } else {
          total += stats.size;
        }
      }
    } catch (e) {
      console.warn(`[Export] Failed to stat ${relPath}:`, e);
    }
  }
  return total;
}

/**
 * Cancel an active export
 */
export async function cancelExport(instanceId: string): Promise<void> {
  const controller = exportControllers.get(instanceId);
  if (controller) {
    console.log(`[Export] Cancelling export for instance ${instanceId}`);
    controller.abort();
    exportControllers.delete(instanceId);
  }
}

/**
 * Export instance to Modpack (ZIP or MRPack)
 */
export async function exportModpack(
  instanceId: string,
  options: ExportOptions,
  onProgress: (progress: ExportProgress) => void,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const instance = getInstance(instanceId);
    if (!instance) {
      return { ok: false, error: "Instance not found" };
    }

    const instanceDir = getInstanceDir(instanceId);

    // 1. Prompt for save location
    const defaultName = `${options.name}-${options.version}`.replace(
      /[\/\\:*?"<>|]/g,
      "_",
    );
    const extension = options.format === "mrpack" ? "mrpack" : "zip";

    // We typically can't open dialog from IPC invoke handler if it blocks,
    // but in Electron it's usually fine if invoked from renderer.
    // However, strictly speaking we should use the BrowserWindow.
    const win = BrowserWindow.getFocusedWindow();

    const { filePath, canceled } = await dialog.showSaveDialog(win!, {
      title: "ส่งออก Modpack",
      defaultPath: `${defaultName}.${extension}`,
      filters: [
        {
          name:
            options.format === "mrpack" ? "Modrinth Modpack" : "Zip Archive",
          extensions: [extension],
        },
      ],
    });

    if (canceled || !filePath) {
      return { ok: false, error: "Cancelled" };
    }

    // 2. Setup AbortController
    const controller = new AbortController();
    exportControllers.set(instanceId, controller);

    const signal = controller.signal;

    // 3. Calculate Total Size for Progress
    const totalBytes = calculateTotalSize(instanceDir, options.includedPaths);
    console.log(`[Export] Total size to export: ${totalBytes} bytes`);

    // 4. Create Archive
    const output = fs.createWriteStream(filePath);
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Maximum compression
    });

    return new Promise((resolve, reject) => {
      // Handle abort
      signal.addEventListener("abort", () => {
        archive.abort();
        output.end();
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          console.error("[Export] Failed to cleanup cancelled file:", e);
        }
        resolve({ ok: false, error: "Export cancelled" });
      });

      output.on("close", () => {
        console.log(
          `[Export] Archive finalized. Total bytes: ${archive.pointer()}`,
        );
        exportControllers.delete(instanceId);
        resolve({ ok: true, path: filePath });
      });

      archive.on("error", (err) => {
        console.error("[Export] Archiver error:", err);
        exportControllers.delete(instanceId);
        reject({ ok: false, error: err.message });
      });

      // Track Progress
      archive.on("progress", (progress) => {
        if (signal.aborted) return;

        const transferred = progress.fs.processedBytes;
        const percent =
          totalBytes > 0 ? Math.round((transferred / totalBytes) * 100) : 0;

        onProgress({
          transferred,
          total: totalBytes,
          percent: Math.min(100, percent),
        });
      });

      archive.pipe(output);

      // 5. Add Files

      // If MRPack, add modrinth.index.json
      if (options.format === "mrpack") {
        const indexJson = {
          formatVersion: 1,
          game: "minecraft",
          versionId: options.version,
          name: options.name,
          summary: options.description,
          dependencies: {
            minecraft: instance.minecraftVersion,
            "fabric-loader":
              instance.loader === "fabric" ? instance.loaderVersion : undefined,
            "quilt-loader":
              instance.loader === "quilt" ? instance.loaderVersion : undefined,
            forge:
              instance.loader === "forge" ? instance.loaderVersion : undefined,
            neoforge:
              instance.loader === "neoforge"
                ? instance.loaderVersion
                : undefined,
          },
          files: [], // Hydrated pack (no external downloads)
        };

        archive.append(JSON.stringify(indexJson, null, 2), {
          name: "modrinth.index.json",
        });
      }

      // Add selected files
      for (const relPath of options.includedPaths) {
        const fullPath = path.join(instanceDir, relPath);

        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);

          // Determine destination path inside zip
          // For mrpack, everything goes into "overrides/" (except index.json)
          // For zip, everything goes into root
          const destPrefix = options.format === "mrpack" ? "overrides/" : "";
          const destPath = path.join(destPrefix, relPath).replace(/\\/g, "/");

          if (stats.isDirectory()) {
            archive.directory(fullPath, destPath);
          } else {
            archive.file(fullPath, { name: destPath });
          }
        } else {
          console.warn(`[Export] File not found: ${relPath}`);
        }
      }

      archive.finalize();
    });
  } catch (error: any) {
    console.error("[Export] Error:", error);
    exportControllers.delete(instanceId);
    return { ok: false, error: error.message };
  }
}
