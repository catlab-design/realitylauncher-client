

import { ipcMain, app, BrowserWindow } from "electron";
import { isGameRunning } from "../launcher.js";

export function registerWindowHandlers(getMainWindow: () => BrowserWindow | null): void {
    
    ipcMain.handle("window-minimize", async (): Promise<void> => {
        const mainWindow = getMainWindow();
        if (mainWindow) mainWindow.minimize();
    });

    
    ipcMain.handle("window-maximize", async (): Promise<void> => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            } else {
                mainWindow.maximize();
            }
        }
    });

    
    ipcMain.handle("window-close", async (): Promise<void> => {
        const mainWindow = getMainWindow();
        if (isGameRunning()) {
            if (mainWindow) {
                mainWindow.hide();
                console.log("[Window] Game is running, hiding to background");
            }
        } else {
            app.quit();
        }
    });

    
    ipcMain.handle("window-is-maximized", async (): Promise<boolean> => {
        const mainWindow = getMainWindow();
        return mainWindow ? mainWindow.isMaximized() : false;
    });

    
    ipcMain.handle("window-set-main-mode", async (): Promise<void> => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
            mainWindow.setResizable(true);
            mainWindow.setMinimumSize(980, 620);
            mainWindow.setSize(1100, 680);
            mainWindow.center();
        }
    });

    console.log("[IPC] Window handlers registered");
}
