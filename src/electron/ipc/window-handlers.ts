

import { ipcMain, app, BrowserWindow } from "electron";
import { isGameRunning } from "../launcher.js";
import { getConfig } from "../config.js";
import {
    MAIN_WINDOW_BOUNDS,
    resolveMainWindowSize,
} from "../window-bounds.js";

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
            const windowSize = resolveMainWindowSize(getConfig());
            mainWindow.setResizable(true);
            mainWindow.setMinimumSize(
                MAIN_WINDOW_BOUNDS.minWidth,
                MAIN_WINDOW_BOUNDS.minHeight,
            );
            mainWindow.setMaximumSize(
                MAIN_WINDOW_BOUNDS.maxWidth,
                MAIN_WINDOW_BOUNDS.maxHeight,
            );
            mainWindow.setSize(windowSize.width, windowSize.height);
            mainWindow.center();
        }
    });

    console.log("[IPC] Window handlers registered");
}
