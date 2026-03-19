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
import { getNativeModule } from "../native.js";
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
        const { spawnSync } = await import("node:child_process");
        const fs = await import("node:fs");
        const path = await import("node:path");
        const native = (() => {
            try {
                return getNativeModule();
            } catch {
                return null;
            }
        })();

        const minecraftDir = getMinecraftDir();
        const config = getConfig();

        let javaPath = config.javaPath || null;
        let javaOK = false;

        if (javaPath) {
            if (native && typeof native.validateJavaPath === "function") {
                try {
                    javaOK = !!native.validateJavaPath(javaPath);
                } catch {
                    javaOK = validateJavaPath(javaPath);
                }
            } else {
                javaOK = validateJavaPath(javaPath);
            }
        }

        if (!javaOK) {
            if (native && typeof native.findJavaForMinecraft === "function") {
                try {
                    const selectedVersion = config.selectedVersion || "1.20.1";
                    const recommendedJava = native.findJavaForMinecraft(selectedVersion);
                    if (recommendedJava?.path && fs.existsSync(recommendedJava.path)) {
                        javaPath = recommendedJava.path;
                        javaOK =
                            typeof native.validateJavaPath === "function"
                                ? !!native.validateJavaPath(javaPath)
                                : true;
                    }
                } catch (error) {
                    console.warn("[Launcher] Native findJavaForMinecraft failed:", error);
                }
            }

            if (!javaOK && native && typeof native.detectJavaInstallations === "function") {
                try {
                    const detection = native.detectJavaInstallations();
                    const candidates = [
                        detection?.recommended?.path,
                        ...(Array.isArray(detection?.installations)
                            ? detection.installations.map((install: any) => install?.path)
                            : []),
                    ]
                        .filter((candidate: any): candidate is string => !!candidate)
                        .filter((candidate: string) => fs.existsSync(candidate));

                    for (const candidate of candidates) {
                        const isValid =
                            typeof native.validateJavaPath === "function"
                                ? !!native.validateJavaPath(candidate)
                                : validateJavaPath(candidate);
                        if (isValid) {
                            javaPath = candidate;
                            javaOK = true;
                            break;
                        }
                    }
                } catch (error) {
                    console.warn("[Launcher] Native detectJavaInstallations failed:", error);
                }
            }

            try {
                const command = process.platform === "win32" ? "where" : "which";
                const result = spawnSync(command, ["java"], {
                    encoding: "utf-8",
                    timeout: 5000,
                    windowsHide: true,
                });
                if (!result.error && result.status === 0) {
                    const lines = (result.stdout || "")
                        .trim()
                        .split(/\r?\n/)
                        .map((line) => line.trim())
                        .filter(Boolean);
                    if (lines.length > 0 && lines[0]) {
                        const foundPath = lines[0];
                        if (fs.existsSync(foundPath)) {
                            javaPath = foundPath;
                            javaOK = true;
                        }
                    }
                }
            } catch { }

            if (!javaOK && process.platform === "win32") {
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
