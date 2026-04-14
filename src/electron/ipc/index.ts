import { BrowserWindow } from "electron";

// Register all IPC handlers - critical handlers block startup, secondary load in background
export async function registerAllHandlers(
  getMainWindow: () => BrowserWindow | null,
): Promise<void> {
  console.log("[IPC] Registering all handlers...");

  // Critical handlers - must be available immediately for app to function
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

  // Secondary handlers - load in background to speed up startup
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

  console.log("[IPC] Critical handlers registered, secondary loading in background");
}
