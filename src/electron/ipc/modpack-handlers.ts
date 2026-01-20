/**
 * ========================================
 * Modpack Installer IPC Handlers
 * ========================================
 */

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
import { getInstance, getInstanceIconPath } from "../instances.js";
import { installCurseForgeModpack } from "../curseforge.js";
import { getCurseForgeFile, getCurseForgeProject } from "../curseforge-api.js";

// Store active installation controller
let activeInstallController: AbortController | null = null;

export function registerModpackHandlers(getMainWindow: () => BrowserWindow | null): void {
    /**
     * modpack-cancel-install - ยกเลิกการติดตั้งที่กำลังทำงานอยู่
     */
    ipcMain.handle("modpack-cancel-install", async () => {
        if (activeInstallController) {
            console.log("[Modpack] Cancelling installation...");
            activeInstallController.abort();
            activeInstallController = null;
            return true;
        }
        return false;
    });

    /**
     * modpack-install - ติดตั้ง modpack จากไฟล์ .mrpack
     */
    ipcMain.handle("modpack-install", async (_event, mrpackPath: string) => {
        try {
            const mainWindow = getMainWindow();
            activeInstallController = new AbortController();

            const result = await installModpack(mrpackPath, (progress) => {
                mainWindow?.webContents.send("modpack-install-progress", progress);
            }, activeInstallController.signal);

            activeInstallController = null;
            return result;
        } catch (error: any) {
            console.error("[Modpack] Install error:", error);
            return { ok: false, error: error.message };
        }
    });

    /**
     * modpack-install-from-modrinth - ดาวน์โหลดและติดตั้ง modpack จาก Modrinth
     */
    ipcMain.handle("modpack-install-from-modrinth", async (_event, versionId: string) => {
        const mainWindow = getMainWindow();
        console.log("[Modpack] Starting install from Modrinth:", versionId);

        try {
            activeInstallController = new AbortController();

            // Step 1: Validate and get version
            mainWindow?.webContents.send("modpack-install-progress", {
                stage: "downloading",
                message: "กำลังตรวจสอบเวอร์ชัน...",
            });

            if (activeInstallController.signal.aborted) throw new Error("Cancelled");

            let version;
            try {
                version = await getVersion(versionId);
            } catch (error: any) {
                console.error("[Modpack] Invalid version ID:", versionId, error.message);

                // If version ID is invalid, it might be a project ID
                // Try to get the project and use its latest version
                if (error.message.includes("404")) {
                    console.log("[Modpack] Version ID not found, checking if it's a project ID:", versionId);

                    if (activeInstallController.signal.aborted) throw new Error("Cancelled");

                    // Check if the ID looks like a numeric project ID (common pattern)
                    const isNumericId = /^\d+$/.test(versionId);
                    if (isNumericId) {
                        console.log("[Modpack] ID appears to be numeric project ID, attempting to get project versions");
                    }

                    try {
                        const project = await getProject(versionId);
                        if (project && project.versions && project.versions.length > 0) {
                            // Get the latest version
                            const latestVersionId = project.versions[0];
                            console.log("[Modpack] Found project, using latest version:", latestVersionId);
                            version = await getVersion(latestVersionId);
                        } else {
                            throw new Error("ไม่พบเวอร์ชันที่สามารถติดตั้งได้");
                        }
                    } catch (projectError: any) {
                        console.error("[Modpack] Failed to get project or versions:", projectError);
                        throw new Error(`ไม่พบ modpack หรือเวอร์ชันที่ระบุ (ID: ${versionId}). กรุณาเลือกเวอร์ชันที่ต้องการติดตั้งจากรายการ`);
                    }
                } else {
                    throw error;
                }
            }

            if (activeInstallController.signal.aborted) throw new Error("Cancelled");

            // Step 2: Download
            mainWindow?.webContents.send("modpack-install-progress", {
                stage: "downloading",
                message: "กำลังดาวน์โหลด modpack...",
            });

            const mrpackPath = await downloadModpack(version, (progress) => {
                mainWindow?.webContents.send("modpack-install-progress", {
                    stage: "downloading",
                    message: `กำลังดาวน์โหลด: ${progress.filename}`,
                    percent: progress.percent,
                });
            }, activeInstallController.signal);

            if (activeInstallController.signal.aborted) throw new Error("Cancelled");

            // Step 2: Install
            mainWindow?.webContents.send("modpack-install-progress", {
                stage: "extracting",
                message: "กำลังติดตั้ง modpack...",
            });

            const result = await installModpack(mrpackPath, (progress) => {
                mainWindow?.webContents.send("modpack-install-progress", progress);
            }, activeInstallController.signal);

            if (result.ok && result.instance) {
                // Step 3: Download icon
                try {
                    const projectId = version.project_id;
                    if (projectId && !activeInstallController.signal.aborted) {
                        const project = await getProject(projectId);
                        if (project.icon_url) {
                            const iconPath = getInstanceIconPath(result.instance.id);
                            await downloadFile(project.icon_url, iconPath, undefined, activeInstallController.signal);
                        }
                    }
                } catch { }

                // Step 4: Cleanup
                try {
                    const mrpackDir = path.dirname(mrpackPath);
                    if (fs.existsSync(mrpackPath)) fs.unlinkSync(mrpackPath);
                    if (fs.existsSync(mrpackDir) && fs.readdirSync(mrpackDir).length === 0) {
                        fs.rmdirSync(mrpackDir);
                    }
                } catch { }
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
    });

    /**
     * modpack-install-from-curseforge - ดาวน์โหลดและติดตั้ง modpack จาก CurseForge
     */
    ipcMain.handle("modpack-install-from-curseforge", async (_event, projectId: string, fileId: string) => {
        const mainWindow = getMainWindow();
        console.log("[Modpack] Starting install from CurseForge:", projectId, fileId);

        try {
            activeInstallController = new AbortController();

            // Step 1: Get file info
            mainWindow?.webContents.send("modpack-install-progress", {
                stage: "downloading",
                message: "กำลังดึงข้อมูลไฟล์...",
            });

            if (activeInstallController.signal.aborted) throw new Error("Cancelled");

            const fileResult = await getCurseForgeFile(projectId, fileId);
            const fileData = fileResult.data;

            if (!fileData.downloadUrl) {
                throw new Error("ไม่สามารถดาวน์โหลดไฟล์นี้ได้ (ผู้สร้างจำกัดการดาวน์โหลด)");
            }

            if (activeInstallController.signal.aborted) throw new Error("Cancelled");

            // Step 2: Download zip
            mainWindow?.webContents.send("modpack-install-progress", {
                stage: "downloading",
                message: `กำลังดาวน์โหลด: ${fileData.fileName}`,
            });

            const downloadDir = path.join(app.getPath("temp"), "curseforge-modpacks");
            if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir, { recursive: true });
            }

            const zipPath = path.join(downloadDir, fileData.fileName);
            await downloadFile(fileData.downloadUrl, zipPath, undefined, activeInstallController.signal);

            if (activeInstallController.signal.aborted) throw new Error("Cancelled");

            // Step 3: Install
            mainWindow?.webContents.send("modpack-install-progress", {
                stage: "extracting",
                message: "กำลังติดตั้ง modpack...",
            });

            const result = await installCurseForgeModpack(zipPath, (progress) => {
                mainWindow?.webContents.send("modpack-install-progress", progress);
            }, activeInstallController.signal); // Pass signal to installer

            if (result.ok && result.instance) {
                // Step 4: Download icon
                try {
                    const projectResult = await getCurseForgeProject(projectId);
                    if (projectResult.data?.logo?.url && !activeInstallController.signal.aborted) {
                        const iconPath = getInstanceIconPath(result.instance.id);
                        await downloadFile(projectResult.data.logo.url, iconPath, undefined, activeInstallController.signal);
                    }
                } catch { }

                // Step 5: Cleanup
                try {
                    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
                } catch { }
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
    });

    /**
     * modpack-check-conflicts - ตรวจสอบ mod ที่ขัดแย้งกันใน instance
     */
    ipcMain.handle("modpack-check-conflicts", async (_event, instanceId: string) => {
        const instance = getInstance(instanceId);
        if (!instance) return [];

        const modsDir = path.join(instance.gameDirectory, "mods");
        return detectModConflicts(modsDir);
    });

    /**
     * modpack-parse-info - อ่านข้อมูล modpack จากไฟล์ .mrpack
     */
    ipcMain.handle("modpack-parse-info", async (_event, mrpackPath: string) => {
        try {
            return await parseModpackIndex(mrpackPath);
        } catch (error: any) {
            console.error("[Modpack] Parse error:", error);
            return null;
        }
    });

    console.log("[IPC] Modpack handlers registered");
}
