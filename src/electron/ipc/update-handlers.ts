

import { ipcMain, app } from "electron";
import { autoUpdater } from "electron-updater";

const isDev = !app.isPackaged;

export function registerUpdateHandlers(): void {
    
    ipcMain.handle("check-for-updates", async (): Promise<void> => {
        if (!isDev) {
            await autoUpdater.checkForUpdates();
        }
    });

    
    ipcMain.handle("download-update", async (): Promise<void> => {
        if (!isDev) {
            await autoUpdater.downloadUpdate();
        }
    });

    
    ipcMain.handle("install-update", async (): Promise<void> => {
        if (!isDev) {
            autoUpdater.quitAndInstall();
        }
    });

    
    ipcMain.handle("get-app-version", async (): Promise<string> => {
        return app.getVersion();
    });

    
    ipcMain.handle("is-dev-mode", async (): Promise<boolean> => {
        return isDev;
    });

    console.log("[IPC] Update handlers registered");
}
