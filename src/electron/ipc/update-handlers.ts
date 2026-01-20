/**
 * ========================================
 * Auto Update IPC Handlers
 * ========================================
 */

import { ipcMain, app } from "electron";
import { autoUpdater } from "electron-updater";

const isDev = !app.isPackaged;

export function registerUpdateHandlers(): void {
    /**
     * check-for-updates - ตรวจสอบ update ใหม่
     */
    ipcMain.handle("check-for-updates", async (): Promise<void> => {
        if (!isDev) {
            await autoUpdater.checkForUpdates();
        }
    });

    /**
     * download-update - ดาวน์โหลด update
     */
    ipcMain.handle("download-update", async (): Promise<void> => {
        if (!isDev) {
            await autoUpdater.downloadUpdate();
        }
    });

    /**
     * install-update - ติดตั้ง update และ restart app
     */
    ipcMain.handle("install-update", async (): Promise<void> => {
        if (!isDev) {
            autoUpdater.quitAndInstall();
        }
    });

    /**
     * get-app-version - ดึงเวอร์ชันของ app
     */
    ipcMain.handle("get-app-version", async (): Promise<string> => {
        return app.getVersion();
    });

    /**
     * is-dev-mode - ตรวจสอบว่ารันใน development mode หรือไม่
     */
    ipcMain.handle("is-dev-mode", async (): Promise<boolean> => {
        return isDev;
    });

    console.log("[IPC] Update handlers registered");
}
