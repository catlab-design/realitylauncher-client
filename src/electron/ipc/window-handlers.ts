

import { ipcMain, app, BrowserWindow } from "electron";
import { isSessionGameRunning } from "../launcher.js";
import { getConfig } from "../config.js";
import {
    MAIN_WINDOW_BOUNDS,
    resolveMainWindowSize,
} from "../window-bounds.js";

export function registerWindowHandlers(getMainWindow: () => BrowserWindow | null): void {

    // กด X ตอนเกมกำลังรัน -> ซ่อนหน้าต่างไว้เบื้องหลัง แล้วค่อยปิด launcher จริง
    // เมื่อเกมปิด (deferred quit). เก็บเป็นค่าในโมดูลเพราะ handler ลงทะเบียนครั้งเดียว
    let quitAfterGameExit = false;

    // เมื่อเกมปิด ถ้าผู้ใช้เคยกด X ไว้ระหว่างเกมรัน และไม่มีเกมของ session นี้เหลือแล้ว -> ปิด launcher
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
                // ถ้าหน้าต่างถูกเรียกกลับมาแสดงอีกครั้ง (เช่น เปิดแอปซ้ำ) ให้ยกเลิกการปิดค้างไว้
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
