

import { ipcMain } from "electron";
import { pingServer, isServerOnline, type ServerStatus } from "../server-status.js";

export function registerServerHandlers(): void {
    
    ipcMain.handle(
        "ping-server",
        async (_event, options: { host: string; port?: number; timeout?: number }): Promise<ServerStatus> => {
            return pingServer(options);
        }
    );

    
    ipcMain.handle(
        "is-server-online",
        async (_event, host: string, port?: number): Promise<boolean> => {
            return isServerOnline(host, port);
        }
    );

    console.log("[IPC] Server handlers registered");
}
