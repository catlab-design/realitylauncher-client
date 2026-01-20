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

import { app, BrowserWindow } from "electron";
import path from "node:path";

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

  if (isDev) {
    win.loadURL("http://localhost:4321");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexPath = path.join(__dirname, "..", "dist", "index.html");
    console.log("[Main] Loading production index.html from:", indexPath);
    win.loadFile(indexPath);
  }

  return win;
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
      console.log("[Main] Session found, syncing cloud instances...");
      const apiToken = getApiToken();
      if (apiToken) {
        const { syncCloudInstances } = await import("./cloud-instances.js");
        syncCloudInstances(apiToken)
          .then(() => {
            console.log("[Main] Startup cloud sync complete, notifying UI...");
            mainWindow?.webContents.send("instances-updated");
          })
          .catch(err => console.error("[Main] Failed to sync cloud instances on startup:", err));
      } else {
        console.warn("[Main] Session exists but no API token found, skipping sync");
      }
    }
  } catch (error) {
    console.error("[Main] Error checking session for sync:", error);
  }

  // Initialize Discord RPC
  const config = getConfig();
  if (config.discordRPCEnabled) {
    await initDiscordRPC();
  }

  // Initialize Telemetry
  initTelemetry();

  // Register all IPC handlers from modules
  registerAllHandlers(() => mainWindow);

  // ========================================
  // Deep Link Protocol Registration
  // ========================================

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('reality', process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient('reality');
  }

  console.log('[Deep Link] Reality protocol registered');

  // สร้างหน้าต่างหลัก
  mainWindow = createWindow();

  // ========================================
  // Prefetch Content (Background)
  // ========================================
  // Warm cache for Modrinth/CurseForge content for faster Explore page loading
  setTimeout(async () => {
    console.log("[Main] Starting background content prefetch...");
    try {
      const pathModule = await import("path");
      const { createRequire } = await import("module");
      const nativePath = pathModule.join(app.getAppPath(), "native", "index.cjs");

      // Use createRequire with __filename for CJS compatibility (esbuild outputs CJS)
      const customRequire = createRequire(__filename);
      const native = customRequire(nativePath);

      // Prefetch popular modpacks
      await native.modrinthSearch({
        projectType: "modpack",
        limit: 20,
        sortBy: "downloads"
      });
      console.log("[Main] Modrinth modpacks prefetched");

      // Prefetch popular mods (most common search)
      await native.modrinthSearch({
        projectType: "mod",
        limit: 20,
        sortBy: "downloads"
      });
      console.log("[Main] Modrinth mods prefetched");
    } catch (error) {
      console.error("[Main] Prefetch error:", error);
    }
  }, 3000); // Delay 3 seconds after window creation

  // Quit app when game closes (if launcher is hidden)
  setOnGameCloseCallback(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log("[Window] Game closed while launcher was hidden, quitting app");
      app.quit();
    }
  });

  // ========================================
  // Auto Updater Setup
  // ========================================

  if (!isDev) {
    autoUpdater.logger = console;

    autoUpdater.setFeedURL({
      provider: "generic",
      url: "https://cdn.reality.catlabdesign.space/client",
    });

    if (config.autoUpdateEnabled) {
      console.log("[AutoUpdater] Auto-update enabled, checking for updates...");
      autoUpdater.checkForUpdatesAndNotify();
    } else {
      console.log("[AutoUpdater] Auto-update disabled by user");
    }

    autoUpdater.on("update-available", (info) => {
      console.log("[AutoUpdater] Update available:", info.version);
      mainWindow?.webContents.send("update-available", {
        version: info.version,
        releaseDate: info.releaseDate,
      });
    });

    autoUpdater.on("update-not-available", () => {
      console.log("[AutoUpdater] No update available");
      mainWindow?.webContents.send("update-not-available");
    });

    autoUpdater.on("download-progress", (progress) => {
      console.log(`[AutoUpdater] Download progress: ${progress.percent.toFixed(1)}%`);
      mainWindow?.webContents.send("update-progress", {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      console.log("[AutoUpdater] Update downloaded:", info.version);
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

  app.on('open-url', (event, url) => {
    event.preventDefault();

    console.log('[Deep Link] Received URL:', url);

    if (url.startsWith('reality://join/')) {
      const key = url.replace('reality://join/', '');
      console.log('[Deep Link] Join instance request with key:', key);

      if (mainWindow) {
        mainWindow.webContents.send('deep-link-join-instance', key);

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
