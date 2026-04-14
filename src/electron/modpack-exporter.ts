import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import { dialog, BrowserWindow } from "electron";
import { getInstance, getInstanceDir } from "./instances.js";
import { getNativeModule } from "./native.js";


export interface ExportOptions {
  name: string;
  version: string;
  description?: string;
  includedPaths: string[]; 
  format: "zip" | "mrpack";
}

interface ExportProgress {
  transferred: number;
  total: number;
  percent: number;
}


const exportControllers = new Map<string, AbortController>();


function calculateTotalSize(baseDir: string, relativePaths: string[]): number {
  const native = getNativeModule();
  let total = 0;

  for (const relPath of relativePaths) {
    const fullPath = path.join(baseDir, relPath);
    try {
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          
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


export async function cancelExport(instanceId: string): Promise<void> {
  const controller = exportControllers.get(instanceId);
  if (controller) {
    console.log(`[Export] Cancelling export for instance ${instanceId}`);
    controller.abort();
    exportControllers.delete(instanceId);
  }
}


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

    
    const defaultName = `${options.name}-${options.version}`.replace(
      /[\/\\:*?"<>|]/g,
      "_",
    );
    const extension = options.format === "mrpack" ? "mrpack" : "zip";

    
    
    
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

    
    const controller = new AbortController();
    exportControllers.set(instanceId, controller);

    const signal = controller.signal;

    
    const totalBytes = calculateTotalSize(instanceDir, options.includedPaths);
    console.log(`[Export] Total size to export: ${totalBytes} bytes`);
    if (signal.aborted) {
      exportControllers.delete(instanceId);
      return { ok: false, error: "Export cancelled" };
    }

    const native = getNativeModule() as any;
    if (typeof native.exportModpackArchive === "function") {
      let cancelRequested = false;
      const onAbort = () => {
        cancelRequested = true;
      };
      signal.addEventListener("abort", onAbort);
      try {
        onProgress({
          transferred: 0,
          total: totalBytes,
          percent: 0,
        });

        const nativeResult = (await native.exportModpackArchive({
          instanceDir,
          outputPath: filePath,
          format: options.format,
          includedPaths: options.includedPaths,
          name: options.name,
          version: options.version,
          description: options.description ?? null,
          minecraftVersion: instance.minecraftVersion,
          loader: instance.loader || "vanilla",
          loaderVersion: instance.loaderVersion ?? null,
        })) as { success?: boolean; totalBytes?: number };

        if (cancelRequested || signal.aborted) {
          try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch {}
          exportControllers.delete(instanceId);
          return { ok: false, error: "Export cancelled" };
        }

        if (nativeResult?.success === false) {
          throw new Error("Native export returned unsuccessful result");
        }

        const writtenBytes =
          typeof nativeResult?.totalBytes === "number"
            ? nativeResult.totalBytes
            : totalBytes;
        onProgress({
          transferred: writtenBytes,
          total: totalBytes || writtenBytes,
          percent: 100,
        });

        exportControllers.delete(instanceId);
        return { ok: true, path: filePath };
      } catch (nativeError) {
        console.warn("[Export] Native export failed, falling back to archiver", {
          message: String((nativeError as Error)?.message || nativeError),
        });
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    }

    
    const output = fs.createWriteStream(filePath);
    const archive = archiver("zip", {
      zlib: { level: 9 }, 
    });

    return new Promise((resolve, reject) => {
      
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
          files: [], 
        };

        archive.append(JSON.stringify(indexJson, null, 2), {
          name: "modrinth.index.json",
        });
      }

      
      for (const relPath of options.includedPaths) {
        const fullPath = path.join(instanceDir, relPath);

        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);

          
          
          
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
