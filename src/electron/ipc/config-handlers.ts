

import { ipcMain } from "electron";
import {
    getConfig,
    setConfig,
    resetConfig,
    getMinecraftDir,
    getAppDataDir,
    validateJavaPath,
    getSystemRamMB,
    getMaxRamMB,
    COLOR_THEMES,
    type LauncherConfig,
} from "../config.js";

export function registerConfigHandlers(): void {
    
    ipcMain.handle("get-config", async (): Promise<LauncherConfig> => {
        return getConfig();
    });

    
    ipcMain.handle(
        "set-config",
        async (_event, config: Partial<LauncherConfig>): Promise<LauncherConfig> => {
            return setConfig(config);
        }
    );

    
    ipcMain.handle("reset-config", async (): Promise<LauncherConfig> => {
        return resetConfig();
    });

    
    ipcMain.handle("get-minecraft-dir", async (): Promise<string> => {
        return getMinecraftDir();
    });

    
    ipcMain.handle("get-app-data-dir", async (): Promise<string> => {
        return getAppDataDir();
    });

    
    ipcMain.handle("get-color-themes", async () => {
        return COLOR_THEMES;
    });

    
    ipcMain.handle("get-system-ram", async (): Promise<number> => {
        return getSystemRamMB();
    });

    
    ipcMain.handle("get-max-ram", async (): Promise<number> => {
        return getMaxRamMB();
    });

    
    ipcMain.handle("validate-java-path", async (_event, javaPath: string): Promise<boolean> => {
        return validateJavaPath(javaPath);
    });

    console.log("[IPC] Config handlers registered");
}
