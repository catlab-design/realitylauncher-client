

import { ipcMain, BrowserWindow, app } from "electron";
import fs from "node:fs";
import path from "node:path";
import {
  installModpack,
  parseModpackIndex,
  detectModConflicts,
} from "../modpack-installer.js";
import {
  getVersion,
  downloadModpack,
  getProject,
  downloadFile,
} from "../modrinth.js";
import {
  getInstance,
  getInstanceIconPath,
  updateInstance,
  type GameInstance,
} from "../instances.js";
import { installCurseForgeModpack } from "../curseforge.js";
import { getCurseForgeFile, getCurseForgeProject } from "../curseforge-api.js";
import {
  exportModpack,
  cancelExport,
  type ExportOptions,
} from "../modpack-exporter.js";
import { preInstallInstance } from "../MinecraftRun/rustLauncher.js";
import { getConfig } from "../config.js";


let activeInstallController: AbortController | null = null;

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function getImageExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    return IMAGE_MIME_BY_EXT[ext] ? ext : ".png";
  } catch {
    return ".png";
  }
}

async function setInstalledModpackBannerFromUrl(
  instance: GameInstance,
  imageUrl: string | null | undefined,
  signal?: AbortSignal,
): Promise<GameInstance> {
  if (!imageUrl || signal?.aborted) return instance;

  const ext = getImageExtension(imageUrl);
  const tempPath = path.join(app.getPath("temp"), `ml-banner-${instance.id}${ext}`);

  try {
    await downloadFile(imageUrl, tempPath, undefined, signal);
    const imageBuffer = await fs.promises.readFile(tempPath);
    const mimeType = IMAGE_MIME_BY_EXT[ext] || "image/png";
    const banner = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
    const updatedInstance = await updateInstance(instance.id, { banner });
    return updatedInstance || instance;
  } catch (error) {
    console.warn("[Modpack] Failed to set installed modpack banner:", error);
    return instance;
  } finally {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {}
  }
}

function pickModrinthBannerUrl(project: Awaited<ReturnType<typeof getProject>>): string | null {
  const gallery = Array.isArray(project.gallery) ? project.gallery : [];
  return (
    gallery.find((item) => item.featured)?.raw_url ||
    gallery.find((item) => item.featured)?.url ||
    gallery[0]?.raw_url ||
    gallery[0]?.url ||
    project.icon_url ||
    null
  );
}

function pickCurseForgeBannerUrl(project: Awaited<ReturnType<typeof getCurseForgeProject>>["data"]): string | null {
  const screenshots = Array.isArray(project.screenshots) ? project.screenshots : [];
  return screenshots[0]?.url || screenshots[0]?.thumbnailUrl || project.logo?.url || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: run pre-install (download Minecraft core files) after a modpack is
// installed so the user can press Play immediately without waiting.
// Progress is sent via the same modpack-install-progress channel so the UI
// keeps showing the install modal seamlessly.
// ─────────────────────────────────────────────────────────────────────────────
async function runPreInstallAfterModpack(
  instanceId: string,
  mainWindow: BrowserWindow | null,
): Promise<void> {
  const instance = getInstance(instanceId);
  if (!instance) return;

  const config = getConfig();

  const sendModpackProgress = (data: {
    stage: string;
    message: string;
    current?: number;
    total?: number;
    percent?: number;
  }) => {
    mainWindow?.webContents.send("modpack-install-progress", data);
  };

  sendModpackProgress({
    stage: "downloading",
    message: "กำลังดาวน์โหลดไฟล์ Minecraft...",
    percent: 0,
  });

  try {
    await preInstallInstance({
      version: instance.minecraftVersion,
      loader:
        instance.loader !== "vanilla"
          ? {
              type: instance.loader,
              build: instance.loaderVersion || "latest",
              enable: true,
            }
          : undefined,
      gameDirectory: instance.gameDirectory,
      instanceId,
      javaPath: instance.javaPath || config.javaPath,
      onProgress: (progress) => {
        const pct = typeof progress.percent === "number" ? progress.percent : undefined;
        sendModpackProgress({
          stage: progress.type === "extract" ? "copying" : "downloading",
          message: progress.task || "กำลังเตรียมไฟล์เกม...",
          current: progress.current,
          total: progress.total,
          // keep progress within 0-90 so final "complete" bump to 100 is visible
          percent: pct !== undefined ? Math.round(pct * 0.9) : undefined,
        });
      },
    });
  } catch (err: any) {
    console.warn("[Modpack] Pre-install failed (non-fatal):", err?.message);
  }
}

export function registerModpackHandlers(
  getMainWindow: () => BrowserWindow | null,
): void {
  
  ipcMain.handle("modpack-cancel-install", async () => {
    if (activeInstallController) {
      console.log("[Modpack] Cancelling installation...");
      activeInstallController.abort();
      activeInstallController = null;
      return true;
    }
    return false;
  });

  
  ipcMain.handle("modpack-install", async (_event, mrpackPath: string) => {
    try {
      const mainWindow = getMainWindow();
      activeInstallController = new AbortController();

      const result = await installModpack(
        mrpackPath,
        (progress) => {
          mainWindow?.webContents.send("modpack-install-progress", progress);
        },
        activeInstallController.signal,
      );

      activeInstallController = null;

      // Pre-install Minecraft core files so user can play immediately
      if (result.ok && result.instance) {
        await runPreInstallAfterModpack(result.instance.id, getMainWindow());
      }

      return result;
    } catch (error: any) {
      console.error("[Modpack] Install error:", error);
      return { ok: false, error: error.message };
    }
  });

  
  ipcMain.handle(
    "modpack-install-from-modrinth",
    async (_event, versionId: string) => {
      const mainWindow = getMainWindow();
      console.log("[Modpack] Starting install from Modrinth:", versionId);

      try {
        activeInstallController = new AbortController();

        
        mainWindow?.webContents.send("modpack-install-progress", {
          stage: "downloading",
          message: "กำลังตรวจสอบเวอร์ชัน...",
        });

        if (activeInstallController.signal.aborted)
          throw new Error("Cancelled");

        let version;
        try {
          version = await getVersion(versionId);
        } catch (error: any) {
          console.error(
            "[Modpack] Invalid version ID:",
            versionId,
            error.message,
          );

          
          
          if (error.message.includes("404")) {
            console.log(
              "[Modpack] Version ID not found, checking if it's a project ID:",
              versionId,
            );

            if (activeInstallController.signal.aborted)
              throw new Error("Cancelled");

            
            const isNumericId = /^\d+$/.test(versionId);
            if (isNumericId) {
              console.log(
                "[Modpack] ID appears to be numeric project ID, attempting to get project versions",
              );
            }

            try {
              const project = await getProject(versionId);
              if (project && project.versions && project.versions.length > 0) {
                
                const latestVersionId = project.versions[0];
                console.log(
                  "[Modpack] Found project, using latest version:",
                  latestVersionId,
                );
                version = await getVersion(latestVersionId);
              } else {
                throw new Error("ไม่พบเวอร์ชันที่สามารถติดตั้งได้");
              }
            } catch (projectError: any) {
              console.error(
                "[Modpack] Failed to get project or versions:",
                projectError,
              );
              throw new Error(
                `ไม่พบ modpack หรือเวอร์ชันที่ระบุ (ID: ${versionId}). กรุณาเลือกเวอร์ชันที่ต้องการติดตั้งจากรายการ`,
              );
            }
          } else {
            throw error;
          }
        }

        if (activeInstallController.signal.aborted)
          throw new Error("Cancelled");

        
        mainWindow?.webContents.send("modpack-install-progress", {
          stage: "downloading",
          message: "กำลังดาวน์โหลด modpack...",
        });

        const mrpackPath = await downloadModpack(
          version,
          (progress) => {
            mainWindow?.webContents.send("modpack-install-progress", {
              stage: "downloading",
              message: `กำลังดาวน์โหลด: ${progress.filename}`,
              percent: progress.percent,
            });
          },
          activeInstallController.signal,
        );

        if (activeInstallController.signal.aborted)
          throw new Error("Cancelled");

        
        mainWindow?.webContents.send("modpack-install-progress", {
          stage: "extracting",
          message: "กำลังติดตั้ง modpack...",
        });

        const result = await installModpack(
          mrpackPath,
          (progress) => {
            mainWindow?.webContents.send("modpack-install-progress", progress);
          },
          activeInstallController.signal,
        );

        if (result.ok && result.instance) {
          
          try {
            const projectId = version.project_id;
            if (projectId && !activeInstallController.signal.aborted) {
              const project = await getProject(projectId);
              if (project.icon_url) {
                const iconPath = getInstanceIconPath(result.instance.id);
                await downloadFile(
                  project.icon_url,
                  iconPath,
                  undefined,
                  activeInstallController.signal,
                );
              }
              result.instance = await setInstalledModpackBannerFromUrl(
                result.instance,
                pickModrinthBannerUrl(project),
                activeInstallController.signal,
              );
            }
          } catch {}


          try {
            const mrpackDir = path.dirname(mrpackPath);
            if (fs.existsSync(mrpackPath)) fs.unlinkSync(mrpackPath);
            if (
              fs.existsSync(mrpackDir) &&
              fs.readdirSync(mrpackDir).length === 0
            ) {
              fs.rmdirSync(mrpackDir);
            }
          } catch {}

          // Pre-install Minecraft core files so user can play immediately
          await runPreInstallAfterModpack(result.instance.id, mainWindow);
        }

        return result;
      } catch (error: any) {
        console.error("[Modpack] Install from Modrinth error:", error);
        if (error.message === "Cancelled" || error.name === "AbortError") {
          return { ok: false, error: "Installation cancelled" };
        }
        return { ok: false, error: error.message || "Installation failed" };
      } finally {
        activeInstallController = null;
      }
    },
  );

  
  ipcMain.handle(
    "modpack-install-from-curseforge",
    async (_event, projectId: string, fileId: string) => {
      const mainWindow = getMainWindow();
      console.log(
        "[Modpack] Starting install from CurseForge:",
        projectId,
        fileId,
      );

      try {
        activeInstallController = new AbortController();

        
        mainWindow?.webContents.send("modpack-install-progress", {
          stage: "downloading",
          message: "กำลังดึงข้อมูลไฟล์...",
        });

        if (activeInstallController.signal.aborted)
          throw new Error("Cancelled");

        const fileResult = await getCurseForgeFile(projectId, fileId);
        const fileData = fileResult.data;

        if (!fileData.downloadUrl) {
          throw new Error(
            "ไม่สามารถดาวน์โหลดไฟล์นี้ได้ (ผู้สร้างจำกัดการดาวน์โหลด)",
          );
        }

        if (activeInstallController.signal.aborted)
          throw new Error("Cancelled");

        
        mainWindow?.webContents.send("modpack-install-progress", {
          stage: "downloading",
          message: `กำลังดาวน์โหลด: ${fileData.fileName}`,
        });

        const downloadDir = path.join(
          app.getPath("temp"),
          "curseforge-modpacks",
        );
        if (!fs.existsSync(downloadDir)) {
          fs.mkdirSync(downloadDir, { recursive: true });
        }

        const zipPath = path.join(downloadDir, fileData.fileName);
        await downloadFile(
          fileData.downloadUrl,
          zipPath,
          undefined,
          activeInstallController.signal,
        );

        if (activeInstallController.signal.aborted)
          throw new Error("Cancelled");

        
        mainWindow?.webContents.send("modpack-install-progress", {
          stage: "extracting",
          message: "กำลังติดตั้ง modpack...",
        });

        const result = await installCurseForgeModpack(
          zipPath,
          (progress) => {
            mainWindow?.webContents.send("modpack-install-progress", progress);
          },
          activeInstallController.signal,
        ); 

        if (result.ok && result.instance) {
          
          try {
            const projectResult = await getCurseForgeProject(projectId);
            if (
              projectResult.data?.logo?.url &&
              !activeInstallController.signal.aborted
            ) {
              const iconPath = getInstanceIconPath(result.instance.id);
              await downloadFile(
                projectResult.data.logo.url,
                iconPath,
                undefined,
                activeInstallController.signal,
              );
            }
            result.instance = await setInstalledModpackBannerFromUrl(
              result.instance,
              pickCurseForgeBannerUrl(projectResult.data),
              activeInstallController.signal,
            );
          } catch {}

          try {
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
          } catch {}

          // Pre-install Minecraft core files so user can play immediately
          await runPreInstallAfterModpack(result.instance.id, mainWindow);
        }

        return result;
      } catch (error: any) {
        console.error("[Modpack] Install from CurseForge error:", error);
        if (error.message === "Cancelled" || error.name === "AbortError") {
          return { ok: false, error: "Installation cancelled" };
        }
        return { ok: false, error: error.message || "Installation failed" };
      } finally {
        activeInstallController = null;
      }
    },
  );

  
  ipcMain.handle(
    "modpack-check-conflicts",
    async (_event, instanceId: string) => {
      const instance = getInstance(instanceId);
      if (!instance) return [];

      const modsDir = path.join(instance.gameDirectory, "mods");
      return detectModConflicts(modsDir);
    },
  );

  
  ipcMain.handle("modpack-parse-info", async (_event, mrpackPath: string) => {
    try {
      return await parseModpackIndex(mrpackPath);
    } catch (error: any) {
      console.error("[Modpack] Parse error:", error);
      return null;
    }
  });

  
  
  ipcMain.removeHandler("instances-export");
  ipcMain.removeHandler("instances-export-cancel");
  ipcMain.handle(
    "instances-export",
    async (_event, instanceId: string, options: ExportOptions) => {
      const mainWindow = getMainWindow();
      console.log("[Modpack] Exporting instance:", instanceId, options.format);

      try {
        const result = await exportModpack(instanceId, options, (progress) => {
          mainWindow?.webContents.send(
            "instance-export-progress",
            instanceId,
            progress,
          );
        });
        return result;
      } catch (error: any) {
        console.error("[Modpack] Export error:", error);
        return { ok: false, error: error.message };
      }
    },
  );

  
  ipcMain.handle(
    "instances-export-cancel",
    async (_event, instanceId: string) => {
      await cancelExport(instanceId);
      return true;
    },
  );

  console.log("[IPC] Modpack handlers registered");
}
