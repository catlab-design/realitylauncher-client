/**
 * ========================================
 * Window Control IPC Handlers
 * ========================================
 */

import { ipcMain, app, BrowserWindow } from "electron";
import { isGameRunning } from "../launcher.js";

export function registerWindowHandlers(getMainWindow: () => BrowserWindow | null): void {
    /**
     * window-minimize - ย่อหน้าต่าง
     */
    ipcMain.handle("window-minimize", async (): Promise<void> => {
        const mainWindow = getMainWindow();
        if (mainWindow) mainWindow.minimize();
    });

    /**
     * window-maximize - ขยายหน้าต่าง/คืนค่า
     */
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

    /**
     * window-close - ปิดหน้าต่าง
     * - ถ้าเกมยังรันอยู่ → ซ่อน Launcher ไว้เบื้องหลัง
     * - ถ้าไม่มีเกมรัน → ปิด Launcher จริง
     */
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

    /**
     * window-is-maximized - ตรวจสอบว่าหน้าต่างขยายอยู่หรือไม่
     */
    ipcMain.handle("window-is-maximized", async (): Promise<boolean> => {
        const mainWindow = getMainWindow();
        return mainWindow ? mainWindow.isMaximized() : false;
    });

    console.log("[IPC] Window handlers registered");
}
