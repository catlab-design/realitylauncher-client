/**
 * ========================================
 * Content Download IPC Handlers
 * ========================================
 */

import { ipcMain, BrowserWindow } from "electron";
import {
    downloadContentToInstance,
    getCompatibleVersions,
    type ContentType,
} from "../content.js";

export function registerContentHandlers(getMainWindow: () => BrowserWindow | null): void {
    /**
     * content-download-to-instance - Download mod/shader/resourcepack to instance
     */
    ipcMain.handle(
        "content-download-to-instance",
        async (_event, options: {
            projectId: string;
            versionId: string;
            instanceId: string;
            contentType: string;
            contentSource?: "modrinth" | "curseforge";
        }) => {
            try {
                const mainWindow = getMainWindow();
                const result = await downloadContentToInstance(
                    {
                        projectId: options.projectId,
                        versionId: options.versionId,
                        instanceId: options.instanceId,
                        contentType: options.contentType as ContentType,
                        contentSource: options.contentSource,
                    },
                    (progress) => {
                        mainWindow?.webContents.send("content-download-progress", progress);
                    }
                );
                return result;
            } catch (error: any) {
                console.error("[Content] Download error:", error);
                return { ok: false, error: error.message };
            }
        }
    );

    /**
     * content-get-compatible-versions - Get versions compatible with instance
     */
    ipcMain.handle(
        "content-get-compatible-versions",
        async (_event, projectId: string, instanceId: string) => {
            return getCompatibleVersions(projectId, instanceId);
        }
    );

    console.log("[IPC] Content handlers registered");
}
