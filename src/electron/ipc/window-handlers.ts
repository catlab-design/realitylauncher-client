

import { ipcMain, app, BrowserWindow } from "electron";
import { isSessionGameRunning } from "../launcher.js";
import { getConfig } from "../config.js";
import {
    MAIN_WINDOW_BOUNDS,
    resolveMainWindowSize,
} from "../window-bounds.js";

export function registerWindowHandlers(getMainWindow: () => BrowserWindow | null): void {

    // Closing (X) while a game is running hides the window instead of quitting,
    // then quits for real once the game exits (deferred quit). Kept at module
    // scope because the handler is registered only once.
    let quitAfterGameExit = false;

    // On game exit, quit the launcher if the user requested close mid-game and no
    // game from this session is left.
    ipcMain.on("game-stopped", () => {
        if (quitAfterGameExit && !isSessionGameRunning()) {
            console.log("[Window] Game exited after a close request, quitting launcher");
            app.quit();
        }
    });

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
        if (isSessionGameRunning()) {
            if (mainWindow) {
                quitAfterGameExit = true;
                // If the window is shown again (e.g. relaunch), cancel the pending quit.
                mainWindow.once("show", () => { quitAfterGameExit = false; });
                mainWindow.hide();
                console.log("[Window] Game is running, hiding to background (will quit when game exits)");
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
