/**
 * ========================================
 * Launcher IPC Handlers
 * ========================================
 * 
 * Handles game launching and version management
 */

import { ipcMain, BrowserWindow } from "electron";
import { getConfig } from "../config.js";
import { getSession } from "../auth.js";
import { refreshMicrosoftTokenIfNeeded } from "../auth-refresh.js";
import {
    launchGame,
    getInstalledVersions,
    isGameRunning,
    killGame,
    setProgressCallback,
    setGameLogCallback,
} from "../launcher.js";

export function registerLauncherHandlers(getMainWindow: () => BrowserWindow | null): void {
    /**
     * list-versions - ดึงรายการเวอร์ชัน Minecraft ที่ติดตั้ง
     */
    ipcMain.handle("list-versions", async (): Promise<string[]> => {
        const versions = await getInstalledVersions();
        // Return actual installed versions (empty array if none installed)
        // Don't fake a hardcoded list — the UI should handle empty state
        return versions;
    });

    /**
     * get-launcher-info - ดึงข้อมูล Launcher
     */
    ipcMain.handle("get-launcher-info", async () => {
        const { getMinecraftDir, validateJavaPath } = await import("../config.js");
        const { execSync } = await import("node:child_process");
        const fs = await import("node:fs");
        const path = await import("node:path");

        const minecraftDir = getMinecraftDir();
        const config = getConfig();

        let javaPath = config.javaPath || null;
        let javaOK = false;

        if (javaPath) {
            javaOK = await validateJavaPath(javaPath);
        }

        if (!javaOK) {
            try {
                const result = execSync("where java", { encoding: "utf-8", timeout: 5000 });
                const lines = result.trim().split("\n");
                if (lines.length > 0 && lines[0]) {
                    const foundPath = lines[0].trim();
                    if (fs.existsSync(foundPath)) {
                        javaPath = foundPath;
                        javaOK = true;
                    }
                }
            } catch { }

            if (!javaOK) {
                const commonPaths = [
                    "C:\\Program Files\\Java",
                    "C:\\Program Files\\Eclipse Adoptium",
                    "C:\\Program Files\\Zulu",
                ];

                for (const basePath of commonPaths) {
                    if (!fs.existsSync(basePath)) continue;
                    try {
                        const entries = fs.readdirSync(basePath);
                        for (const entry of entries) {
                            const javaExe = path.join(basePath, entry, "bin", "java.exe");
                            if (fs.existsSync(javaExe)) {
                                javaPath = javaExe;
                                javaOK = true;
                                break;
                            }
                        }
                    } catch { }
                    if (javaOK) break;
                }
            }
        }

        return {
            javaOK,
            javaPath,
            runtime: process.versions.node,
            minecraftDir,
        };
    });

    /**
     * launch-game - เปิดเกม Minecraft
     */
    ipcMain.handle(
        "launch-game",
        async (_event, payload: { version: string; username: string; ramMB: number }) => {
            const mainWindow = getMainWindow();
            let session = getSession();

            if (!session) {
                return { ok: false, message: "Please login first" };
            }

            const refreshResult = await refreshMicrosoftTokenIfNeeded();
            if (!refreshResult.ok) {
                return {
                    ok: false,
                    message:
                        refreshResult.error ||
                        "Microsoft session refresh failed. Please login again.",
                };
            }
            session = refreshResult.session || session;

            if (isGameRunning()) {
                return { ok: false, message: "เกมกำลังรันอยู่แล้ว" };
            }

            setProgressCallback((progress) => {
                mainWindow?.webContents.send("launch-progress", progress);
            });

            setGameLogCallback((level, message) => {
                mainWindow?.webContents.send("game-log", { level, message });
            });

            // Use minecraftUuid if available (for CatID linked with Microsoft)
            // Otherwise fall back to session.uuid
            const gameUuid = session.minecraftUuid || session.uuid;

            const result = await launchGame({
                version: payload.version,
                username: session.username,
                uuid: gameUuid,
                accessToken: session.accessToken,
                ramMB: payload.ramMB,
            });

            setProgressCallback(null);

            // Close/Hide launcher on successful game start based on config
            if (result.ok) {
                const config = getConfig();
                if (config.closeOnLaunch === "hide-reopen" && mainWindow) {
                    mainWindow.hide();
                } else if (config.closeOnLaunch === "close" && mainWindow) {
                    mainWindow.close();
                }
                // 'keep-open': do nothing
            }

            return result;
        }
    );

    /**
     * is-game-running - ตรวจสอบว่าเกมกำลังรันอยู่หรือไม่
     */
    ipcMain.handle("is-game-running", async (_event, instanceId?: string): Promise<boolean> => {
        return isGameRunning(instanceId);
    });

    /**
     * kill-game - หยุดเกม
     */
    ipcMain.handle("kill-game", async (_event, instanceId?: string): Promise<{ ok: boolean; error?: string }> => {
        try {
            const targetId = instanceId || "default";
            await killGame(targetId);
            console.log(`[IPC] Game killed successfully for instance: ${targetId}`);
            return { ok: true };
        } catch (error: any) {
            console.error("[IPC] Failed to kill game:", error);
            return { ok: false, error: error?.message || "Failed to kill game" };
        }
    });

    console.log("[IPC] Launcher handlers registered");
}
