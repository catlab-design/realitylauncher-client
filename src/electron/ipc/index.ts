/**
 * ========================================
 * IPC Handlers Registry
 * ========================================
 * 
 * Central registry for all IPC handlers
 * Import and register handlers from individual modules
 */

import { BrowserWindow } from "electron";

// Import handler registration functions
import { registerConfigHandlers } from "./config-handlers.js";
import { registerAuthHandlers } from "./auth-handlers.js";
import { registerLauncherHandlers } from "./launcher-handlers.js";
import { registerUtilityHandlers } from "./utility-handlers.js";
import { registerDiscordHandlers } from "./discord-handlers.js";
import { registerUpdateHandlers } from "./update-handlers.js";
import { registerWindowHandlers } from "./window-handlers.js";
import { registerModrinthHandlers } from "./modrinth-handlers.js";
import { registerCurseForgeHandlers } from "./curseforge-handlers.js";
import { registerInstanceHandlers } from "./instance-handlers.js";
import { registerModpackHandlers } from "./modpack-handlers.js";
import { registerNotificationHandlers } from "./notification-handlers.js";
import { registerServerHandlers } from "./server-handlers.js";
import { registerAdminHandlers } from "./admin-handlers.js";
import { registerContentHandlers } from "./content-handlers.js";

/**
 * Register all IPC handlers
 * 
 * @param getMainWindow - Function to get the main window reference
 */
export function registerAllHandlers(getMainWindow: () => BrowserWindow | null): void {
    console.log("[IPC] Registering all handlers...");

    registerConfigHandlers();
    registerAuthHandlers(getMainWindow);
    registerLauncherHandlers(getMainWindow);
    registerUtilityHandlers(getMainWindow);
    registerDiscordHandlers();
    registerUpdateHandlers();
    registerWindowHandlers(getMainWindow);
    registerModrinthHandlers(getMainWindow);
    registerCurseForgeHandlers();
    registerInstanceHandlers(getMainWindow);
    registerModpackHandlers(getMainWindow);
    registerContentHandlers(getMainWindow);
    registerNotificationHandlers();
    registerServerHandlers();
    registerAdminHandlers();

    console.log("[IPC] All handlers registered");
}
