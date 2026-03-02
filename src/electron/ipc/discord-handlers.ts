/**
 * ========================================
 * Discord RPC IPC Handlers
 * ========================================
 */

import { ipcMain } from "electron";
import {
    initDiscordRPC,
    destroyRPC,
    updateRPC,
    isRPCConnected,
    type DiscordRPCStatus,
} from "../discord.js";

export function registerDiscordHandlers(): void {
    /**
     * discord-rpc-set-enabled - เปิด/ปิด Discord RPC
     */
    ipcMain.handle("discord-rpc-set-enabled", async (_event, enabled: boolean): Promise<void> => {
        if (enabled) {
            await initDiscordRPC();
        } else {
            await destroyRPC();
        }
    });

    /**
     * discord-rpc-update - อัพเดทสถานะ Discord
     */
    ipcMain.handle(
        "discord-rpc-update",
        async (
            _event,
            status: DiscordRPCStatus,
            serverName?: string,
            serverIcon?: string
        ): Promise<void> => {
            await updateRPC(status, serverName, serverIcon);
        }
    );

    /**
     * discord-rpc-is-connected - ตรวจสอบว่าเชื่อมต่อ Discord อยู่หรือไม่
     */
    ipcMain.handle("discord-rpc-is-connected", async (): Promise<boolean> => {
        return isRPCConnected();
    });

    console.log("[IPC] Discord handlers registered");
}
