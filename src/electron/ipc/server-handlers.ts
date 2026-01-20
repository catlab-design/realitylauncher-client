/**
 * ========================================
 * Server Status IPC Handlers
 * ========================================
 */

import { ipcMain } from "electron";
import { pingServer, isServerOnline, type ServerStatus } from "../server-status.js";

export function registerServerHandlers(): void {
    /**
     * ping-server - ตรวจสอบสถานะของ Minecraft server
     */
    ipcMain.handle(
        "ping-server",
        async (_event, options: { host: string; port?: number; timeout?: number }): Promise<ServerStatus> => {
            return pingServer(options);
        }
    );

    /**
     * is-server-online - ตรวจสอบว่า server ออนไลน์หรือไม่ (เร็วกว่า ping-server)
     */
    ipcMain.handle(
        "is-server-online",
        async (_event, host: string, port?: number): Promise<boolean> => {
            return isServerOnline(host, port);
        }
    );

    console.log("[IPC] Server handlers registered");
}
