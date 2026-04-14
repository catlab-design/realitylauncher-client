

import { ipcMain } from "electron";
import {
    initDiscordRPC,
    destroyRPC,
    updateRPC,
    isRPCConnected,
    type DiscordRPCStatus,
} from "../discord.js";

export function registerDiscordHandlers(): void {
    
    ipcMain.handle("discord-rpc-set-enabled", async (_event, enabled: boolean): Promise<void> => {
        if (enabled) {
            await initDiscordRPC();
        } else {
            await destroyRPC();
        }
    });

    
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

    
    ipcMain.handle("discord-rpc-is-connected", async (): Promise<boolean> => {
        return isRPCConnected();
    });

    console.log("[IPC] Discord handlers registered");
}
