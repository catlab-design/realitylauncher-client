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
// Imports removed in favor of dynamic imports in registerAllHandlers

/**
 * Register all IPC handlers
 *
 * @param getMainWindow - Function to get the main window reference
 */
export async function registerAllHandlers(
  getMainWindow: () => BrowserWindow | null,
): Promise<void> {
  console.log("[IPC] Registering all handlers...");

  // Lazy load handlers to improve startup time
  const [
    { registerConfigHandlers },
    { registerAuthHandlers },
    { registerLauncherHandlers },
    { registerUtilityHandlers },
    { registerDiscordHandlers },
    { registerUpdateHandlers },
    { registerWindowHandlers },
    { registerModrinthHandlers },
    { registerCurseForgeHandlers },
    { registerInstanceHandlers },
    { registerModpackHandlers },
    { registerNotificationHandlers },
    { registerServerHandlers },
    { registerAdminHandlers },
    { registerContentHandlers },
  ] = await Promise.all([
    import("./config-handlers.js"),
    import("./auth-handlers.js"),
    import("./launcher-handlers.js"),
    import("./utility-handlers.js"),
    import("./discord-handlers.js"),
    import("./update-handlers.js"),
    import("./window-handlers.js"),
    import("./modrinth-handlers.js"),
    import("./curseforge-handlers.js"),
    import("./instance-handlers.js"),
    import("./modpack-handlers.js"),
    import("./notification-handlers.js"),
    import("./server-handlers.js"),
    import("./admin-handlers.js"),
    import("./content-handlers.js"),
  ]);

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
