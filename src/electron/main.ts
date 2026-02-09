/**
 * ========================================
 * Electron Main Process - Main Entry Point
 * ========================================
 *
 * ไฟล์หลักของ Electron ที่รันใน Main Process
 *
 * หน้าที่:
 * - สร้างและจัดการ BrowserWindow
 * - App lifecycle management
 * - Auto-updater setup
 * - Deep link protocol handling
 *
 * IPC Handlers ทั้งหมดถูกแยกไปไว้ใน ./ipc/ directory
 * และถูก register ผ่าน registerAllHandlers()
 */

import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { createLogger, sendErrorToRenderer } from "./lib/logger.js";
import {
  startTrace,
  endTrace,
  getPerformanceMetrics,
  getCompletedSpans,
} from "./lib/tracing.js";

// Create main process logger
const logger = createLogger("Main");

// Start app trace
const appTrace = startTrace("app:startup", { pid: process.pid });

// ========================================
// Global Error Handlers
// ========================================

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception in main process", error);
  // Try to notify renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    sendErrorToRenderer(mainWindow.webContents, "critical", error.message, {
      name: error.name,
      stack: error.stack,
    });
  }
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason as Error);
});

// ปิด Hardware Acceleration เพื่อแก้ปัญหาเส้นประบน screen
app.disableHardwareAcceleration();

// ========================================
// Import Modules
// ========================================

// Config System
import { getConfig } from "./config.js";

// Auth System - for initialization
import { initAuth, getSession, getApiToken } from "./auth.js";

// Discord RPC
import { initDiscordRPC, destroyRPC } from "./discord.js";

// Game Launcher - for callbacks
import { resetLauncherState, setOnGameCloseCallback } from "./launcher.js";

// IPC Handlers - centralized registration
import { registerAllHandlers } from "./ipc/index.js";

// Auto Updater
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater;

// Telemetry
import { initTelemetry, cleanupTelemetry } from "./telemetry.js";

// ========================================
// Constants
// ========================================

const isDev = !app.isPackaged;

// ========================================
// Window Management
// ========================================

let mainWindow: BrowserWindow | null = null;

/**
 * createWindow - สร้างหน้าต่างหลักของ app
 */
function createWindow(): BrowserWindow {
  const config = getConfig();
  const isDarkTheme = config.theme === "dark";

  // ดึง color theme
  const colorTheme = config.colorTheme || "yellow";
  const customColor = config.customColor;
  const themeColors: Record<string, string> = {
    yellow: "#ffde59",
    purple: "#8b5cf6",
    blue: "#3b82f6",
    green: "#22c55e",
    red: "#ef4444",
    orange: "#f97316",
  };
  const accentColor = customColor || themeColors[colorTheme] || "#ffde59";

  const preloadPath = path.join(__dirname, "preload.js");

  // Icon path
  const iconPath = isDev
    ? path.join(app.getAppPath(), "public", "r.png")
    : path.resolve(__dirname, "../dist/r.png");

  const win = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 980,
    minHeight: 620,
    icon: iconPath,
    backgroundColor: accentColor,
    show: false,
    frame: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  return win;
}

async function loadMainWindow(win: BrowserWindow): Promise<void> {
  if (isDev) {
    await win.loadURL("http://localhost:4321");
    win.webContents.openDevTools({ mode: "detach" });
    return;
  }

  const indexPath = path.join(__dirname, "..", "dist", "index.html");
  console.log("[Main] Loading production index.html from:", indexPath);
  await win.loadFile(indexPath);
}

// ========================================
// App Lifecycle
// ========================================

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

/**
 * app.whenReady() - เมื่อ Electron พร้อมใช้งาน
 */
app.whenReady().then(async () => {
  // Initialize auth system
  initAuth();

  // Reset launcher state
  resetLauncherState();

  // Sync cloud instances on startup if logged in
  try {
    const session = getSession();
    if (session) {
      logger.info("Session found, syncing cloud instances...");
      const apiToken = getApiToken();
      if (apiToken) {
        const { syncCloudInstances } = await import("./cloud-instances.js");
        syncCloudInstances(apiToken)
          .then(() => {
            logger.info("Startup cloud sync complete, notifying UI...");
            mainWindow?.webContents.send("instances-updated");
          })
          .catch((err) =>
            logger.error("Failed to sync cloud instances on startup", err),
          );
      } else {
        logger.warn("Session exists but no API token found, skipping sync");
      }
    }
  } catch (error) {
    logger.error("Error checking session for sync", error);
  }

  // Initialize Discord RPC
  const config = getConfig();
  if (config.discordRPCEnabled) {
    await initDiscordRPC();
  }

  // Initialize Telemetry
  initTelemetry();

  // Create window shell first, but delay loading UI until IPC handlers are ready.
  mainWindow = createWindow();

  // Register all IPC handlers from modules before renderer starts invoking them.
  await registerAllHandlers(() => mainWindow); // Now async

  // Load renderer after handlers are ready to avoid missing IPC handlers.
  await loadMainWindow(mainWindow);

  // Register debug/tracing IPC handlers
  ipcMain.handle("debug:get-traces", () => {
    return getCompletedSpans(50);
  });

  ipcMain.handle("debug:get-metrics", () => {
    return getPerformanceMetrics();
  });

  // End app startup trace
  endTrace(appTrace, "ok", {
    startupDuration: Date.now() - appTrace.startTime,
  });
  logger.info("App startup complete", {
    duration: `${Date.now() - appTrace.startTime}ms`,
  });

  // ========================================
  // Deep Link Protocol Registration
  // ========================================

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("reality", process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient("reality");
  }

  console.log("[Deep Link] Reality protocol registered");

  // สร้างหน้าต่างหลัก - Moved up
  // mainWindow = createWindow();

  // ========================================
  // Prefetch Content (Background)
  // ========================================
  // Warm cache for Modrinth/CurseForge content for faster Explore page loading
  setTimeout(async () => {
    console.log("[Main] Starting background content prefetch...");
    try {
      const pathModule = await import("path");
      const { createRequire } = await import("module");
      const nativePath = pathModule.join(
        app.getAppPath(),
        "native",
        "index.cjs",
      );

      // Use createRequire with __filename for CJS compatibility (esbuild outputs CJS)
      const customRequire = createRequire(__filename);
      const native = customRequire(nativePath);

      // Prefetch popular modpacks
      await native.modrinthSearch({
        projectType: "modpack",
        limit: 20,
        sortBy: "downloads",
      });
      console.log("[Main] Modrinth modpacks prefetched");

      // Prefetch popular mods (most common search)
      await native.modrinthSearch({
        projectType: "mod",
        limit: 20,
        sortBy: "downloads",
      });
      console.log("[Main] Modrinth mods prefetched");
    } catch (error) {
      console.error("[Main] Prefetch error:", error);
    }
  }, 3000); // Delay 3 seconds after window creation

  // Quit app when game closes (if launcher is hidden)
  setOnGameCloseCallback(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log(
        "[Window] Game closed while launcher was hidden, quitting app",
      );
      app.quit();
    }
  });

  // ========================================
  // Auto Updater Setup
  // ========================================

  if (!isDev) {
    autoUpdater.logger = console;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.setFeedURL({
      provider: "generic",
      url: "https://cdn.reality.catlabdesign.space/client",
    });

    // Always check for updates on startup (regardless of autoUpdateEnabled)
    console.log("[AutoUpdater] Checking for updates...");
    autoUpdater.checkForUpdates();

    autoUpdater.on("update-available", (info) => {
      console.log("[AutoUpdater] Update available:", info.version);
      mainWindow?.webContents.send("update-available", {
        version: info.version,
        releaseDate: info.releaseDate,
      });

      // If auto-update enabled, silently download in background
      if (config.autoUpdateEnabled) {
        console.log("[AutoUpdater] Auto-downloading update...");
        autoUpdater.downloadUpdate();
      }
    });

    autoUpdater.on("update-not-available", () => {
      console.log("[AutoUpdater] No update available");
      mainWindow?.webContents.send("update-not-available");
    });

    autoUpdater.on("download-progress", (progress) => {
      console.log(
        `[AutoUpdater] Download progress: ${progress.percent.toFixed(1)}%`,
      );
      mainWindow?.webContents.send("update-progress", {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      console.log("[AutoUpdater] Update downloaded:", info.version);
      // Install automatically when user quits the app
      autoUpdater.autoInstallOnAppQuit = true;
      mainWindow?.webContents.send("update-downloaded", {
        version: info.version,
        releaseDate: info.releaseDate,
      });
    });

    autoUpdater.on("error", (err) => {
      console.error("[AutoUpdater] Error:", err);
      mainWindow?.webContents.send("update-error", { message: err.message });
    });
  }

  // macOS: สร้างหน้าต่างใหม่เมื่อกด icon
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // ========================================
  // Deep Link Handler
  // ========================================

  app.on("open-url", (event, url) => {
    event.preventDefault();

    console.log("[Deep Link] Received URL:", url);

    if (url.startsWith("reality://join/")) {
      const key = url.replace("reality://join/", "");
      console.log("[Deep Link] Join instance request with key:", key);

      if (mainWindow) {
        mainWindow.webContents.send("deep-link-join-instance", key);

        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    } else if (url.startsWith("reality://auth-callback")) {
      const urlObj = new URL(url);
      const token = urlObj.searchParams.get("token");

      if (token && mainWindow) {
        // Send to renderer which will use it to login
        mainWindow.webContents.send("deep-link-auth-callback", {
          token,
          username: urlObj.searchParams.get("username") || undefined,
        });

        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    }
  });
});

// Cleanup before quit
app.on("before-quit", () => {
  cleanupTelemetry();
  destroyRPC();
});

// Window all closed
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
