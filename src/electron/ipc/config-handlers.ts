/**
 * ========================================
 * Config IPC Handlers
 * ========================================
 */

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
    /**
     * get-config - ดึงค่า config ทั้งหมด
     */
    ipcMain.handle("get-config", async (): Promise<LauncherConfig> => {
        return getConfig();
    });

    /**
     * set-config - บันทึกค่า config
     */
    ipcMain.handle(
        "set-config",
        async (_event, config: Partial<LauncherConfig>): Promise<LauncherConfig> => {
            return setConfig(config);
        }
    );

    /**
     * reset-config - รีเซ็ต config เป็นค่าเริ่มต้น
     */
    ipcMain.handle("reset-config", async (): Promise<LauncherConfig> => {
        return resetConfig();
    });

    /**
     * get-minecraft-dir - ดึง path โฟลเดอร์ .minecraft
     */
    ipcMain.handle("get-minecraft-dir", async (): Promise<string> => {
        return getMinecraftDir();
    });

    /**
     * get-app-data-dir - ดึง path โฟลเดอร์ data ของ app
     */
    ipcMain.handle("get-app-data-dir", async (): Promise<string> => {
        return getAppDataDir();
    });

    /**
     * get-color-themes - ดึงรายการ color themes ที่รองรับ
     */
    ipcMain.handle("get-color-themes", async () => {
        return COLOR_THEMES;
    });

    /**
     * get-system-ram - ดึงจำนวน RAM ของระบบ (MB)
     */
    ipcMain.handle("get-system-ram", async (): Promise<number> => {
        return getSystemRamMB();
    });

    /**
     * get-max-ram - ดึงจำนวน RAM สูงสุดที่แนะนำให้ใช้กับ Minecraft (MB)
     */
    ipcMain.handle("get-max-ram", async (): Promise<number> => {
        return getMaxRamMB();
    });

    /**
     * validate-java-path - ตรวจสอบว่า Java path ถูกต้องหรือไม่
     */
    ipcMain.handle("validate-java-path", async (_event, javaPath: string): Promise<boolean> => {
        return validateJavaPath(javaPath);
    });

    console.log("[IPC] Config handlers registered");
}
