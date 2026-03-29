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

  // 1. CRITICAL HANDLERS - Load these first as they are needed for initial UI state/login
  const [
    { registerConfigHandlers },
    { registerAuthHandlers },
    { registerWindowHandlers },
    { registerUtilityHandlers },
  ] = await Promise.all([
    import("./config-handlers.js"),
    import("./auth-handlers.js"),
    import("./window-handlers.js"),
    import("./utility-handlers.js"),
  ]);

  registerConfigHandlers();
  registerAuthHandlers(getMainWindow);
  registerWindowHandlers(getMainWindow);
  registerUtilityHandlers(getMainWindow);
  
  console.log("[IPC] Critical handlers registered");

  // 2. SECONDARY HANDLERS - Start loading these immediately after critical ones
  // We don't necessarily need to block UI interaction for these if the user isn't clicking them yet
  const secondaryPromise = (async () => {
    const [
      { registerLauncherHandlers },
      { registerDiscordHandlers },
      { registerUpdateHandlers },
      { registerModrinthHandlers },
      { registerCurseForgeHandlers },
      { registerInstanceHandlers },
      { registerModpackHandlers },
      { registerNotificationHandlers },
      { registerServerHandlers },
      { registerAdminHandlers },
      { registerContentHandlers },
    ] = await Promise.all([
      import("./launcher-handlers.js"),
      import("./discord-handlers.js"),
      import("./update-handlers.js"),
      import("./modrinth-handlers.js"),
      import("./curseforge-handlers.js"),
      import("./instance-handlers.js"),
      import("./modpack-handlers.js"),
      import("./notification-handlers.js"),
      import("./server-handlers.js"),
      import("./admin-handlers.js"),
      import("./content-handlers.js"),
    ]);

    registerLauncherHandlers(getMainWindow);
    registerDiscordHandlers();
    registerUpdateHandlers();
    registerModrinthHandlers(getMainWindow);
    registerCurseForgeHandlers();
    registerInstanceHandlers(getMainWindow);
    registerModpackHandlers(getMainWindow);
    registerContentHandlers(getMainWindow);
    registerNotificationHandlers();
    registerServerHandlers();
    registerAdminHandlers();
    
    console.log("[IPC] Secondary handlers registered");
  })();

  // Resolve when critical handlers are ready. Secondary can continue in background.
  // Actually, to be safe, we might want to wait for everything if we aren't sure,
  // but splitting already helps by letting the critical ones finish faster.
  await secondaryPromise;

  console.log("[IPC] All handlers registration completed");
}
