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

if (!app || typeof app.on !== "function") {
  throw new Error(
    "Electron app API is unavailable. This usually means ELECTRON_RUN_AS_NODE is set. Unset it before launching Reality Launcher.",
  );
}

// ========================================
// Linux Display Backend Bootstrap
// ========================================

const WAYLAND_X11_FALLBACK_ARG = "--reality-wayland-x11-fallback";
const WAYLAND_WINDOW_SHOW_TIMEOUT_MS = 30000;

const linuxDisplayBackendState = {
  isLinux: process.platform === "linux",
  isWaylandSession: false,
  usingWayland: false,
  requestedOzonePlatform: "",
};

function hasWaylandFallbackArg(): boolean {
  return process.argv.includes(WAYLAND_X11_FALLBACK_ARG);
}

function readCliSwitchValue(switchName: string): string {
  const normalized = switchName.startsWith("--")
    ? switchName
    : `--${switchName}`;

  for (let i = 1; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (!arg) continue;

    if (arg.startsWith(`${normalized}=`)) {
      return arg.slice(normalized.length + 1).trim().toLowerCase();
    }

    if (arg === normalized && i + 1 < process.argv.length) {
      return (process.argv[i + 1] || "").trim().toLowerCase();
    }
  }

  return "";
}

function buildX11FallbackArgs(): string[] {
  const baseArgs: string[] = [];

  for (let i = 1; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (!arg) continue;

    if (
      arg.startsWith("--ozone-platform=") ||
      arg.startsWith("--ozone-platform-hint=") ||
      arg === WAYLAND_X11_FALLBACK_ARG
    ) {
      continue;
    }

    if (arg === "--ozone-platform" || arg === "--ozone-platform-hint") {
      i += 1;
      continue;
    }

    baseArgs.push(arg);
  }

  baseArgs.push("--ozone-platform=x11", WAYLAND_X11_FALLBACK_ARG);
  return baseArgs;
}

function relaunchWithX11Fallback(reason: string): boolean {
  if (!linuxDisplayBackendState.isLinux) return false;

  if (hasWaylandFallbackArg()) {
    logger.warn("X11 fallback already attempted, skip relaunch", { reason });
    return false;
  }

  if (!process.env.DISPLAY) {
    logger.error("Cannot fallback to X11 because DISPLAY is missing", undefined, {
      reason,
    });
    return false;
  }

  const relaunchArgs = buildX11FallbackArgs();
  logger.warn("Relaunching with X11 fallback due to Wayland startup issue", {
    reason,
    args: relaunchArgs,
  });
  app.relaunch({ args: relaunchArgs });
  app.exit(0);
  return true;
}

function configureLinuxDisplayBackend(): void {
  if (!linuxDisplayBackendState.isLinux) return;

  const xdgSessionType = (process.env.XDG_SESSION_TYPE || "").toLowerCase();
  const isWaylandSession =
    Boolean(process.env.WAYLAND_DISPLAY) || xdgSessionType === "wayland";
  const cliRequestedOzonePlatform = readCliSwitchValue("ozone-platform");
  const envRequestedOzonePlatform = (
    process.env.ELECTRON_OZONE_PLATFORM ||
    process.env.OZONE_PLATFORM ||
    ""
  ).toLowerCase();
  const requestedOzonePlatform =
    cliRequestedOzonePlatform || envRequestedOzonePlatform;

  linuxDisplayBackendState.isWaylandSession = isWaylandSession;
  linuxDisplayBackendState.requestedOzonePlatform = requestedOzonePlatform;

  if (requestedOzonePlatform === "x11") {
    linuxDisplayBackendState.usingWayland = false;
    logger.info("Linux display backend explicitly set to X11", {
      sessionType: xdgSessionType || "unknown",
      waylandDetected: isWaylandSession,
      requestedOzonePlatform,
    });
    return;
  }

  if (!(isWaylandSession || requestedOzonePlatform === "wayland")) {
    linuxDisplayBackendState.usingWayland = false;
    logger.info("Linux display backend", {
      sessionType: xdgSessionType || "unknown",
      waylandDetected: false,
    });
    return;
  }

  linuxDisplayBackendState.usingWayland = true;

  app.commandLine.appendSwitch(
    "enable-features",
    "UseOzonePlatform,WaylandWindowDecorations",
  );
  app.commandLine.appendSwitch("ozone-platform-hint", "auto");
  app.commandLine.appendSwitch("ozone-platform", "wayland");

  // Improve stability on older iGPU/Nouveau stacks when running under Wayland.
  app.commandLine.appendSwitch("disable-gpu-compositing");

  logger.info("Wayland session detected, configured Ozone flags", {
    sessionType: xdgSessionType || "unknown",
    waylandDisplay: process.env.WAYLAND_DISPLAY || null,
    requestedOzonePlatform: requestedOzonePlatform || null,
    fallbackAttempted: hasWaylandFallbackArg(),
  });
}

configureLinuxDisplayBackend();

function monitorWaylandStartupWindow(win: BrowserWindow): void {
  if (!linuxDisplayBackendState.usingWayland) return;
  if (hasWaylandFallbackArg()) return;

  const timer = setTimeout(() => {
    if (win.isDestroyed() || win.isVisible()) return;
    logger.warn("Main window did not become visible on Wayland in time", {
      timeoutMs: WAYLAND_WINDOW_SHOW_TIMEOUT_MS,
    });
    relaunchWithX11Fallback("window-not-visible-timeout");
  }, WAYLAND_WINDOW_SHOW_TIMEOUT_MS);

  const clearTimer = () => clearTimeout(timer);
  win.once("show", clearTimer);
  win.once("closed", clearTimer);
}

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

app.on("child-process-gone", (_event, details) => {
  if (!linuxDisplayBackendState.usingWayland) return;
  if (hasWaylandFallbackArg()) return;

  if (details.type !== "GPU") return;
  if (mainWindow && mainWindow.isVisible()) return;

  logger.warn("GPU process exited during Wayland startup", {
    reason: details.reason,
    exitCode: details.exitCode,
  });
  relaunchWithX11Fallback(`gpu-process-gone:${details.reason}`);
});

// Hardware Acceleration - Enabled by default for performance (especially in fullscreen)
// If visual artifacts (dotted lines) occur, we handle them via CSS fixes (translateZ/backface-visibility)
// hardwareAccelerationFlag: 0 = Enable, 1 = Disable, default = Enable
const hardwareAccelerationFlag = process.env.ML_DISABLE_HARDWARE_ACCELERATION;
const shouldDisableHardwareAcceleration = hardwareAccelerationFlag === "1"; 

if (shouldDisableHardwareAcceleration) {
  app["disableHardwareAcceleration"]();
  logger.warn("Hardware acceleration disabled by environment flag", {
    flag: "ML_DISABLE_HARDWARE_ACCELERATION",
  });
} else {
  logger.info("Hardware acceleration enabled (default)", {
    platform: process.platform,
  });
  // Force use of discrete/dedicated GPU (e.g. NVIDIA) if available
  app.commandLine.appendSwitch("force_high_performance_gpu");
}

// ========================================
// Import Modules
// ========================================

// Config System
import { getConfig } from "./config.js";

// Auth System - for initialization
import { initAuth, getSession, getApiToken } from "./auth.js";

// Discord RPC
import { initDiscordRPC, destroyRPC, setPlayerInfo } from "./discord.js";

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

const isDev = !app.isPackaged && process.env.ML_CLIENT_FORCE_PROD !== "1";

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
    width: 360,
    height: 380,
    resizable: false,
    icon: iconPath,
    backgroundColor: '#09090b', // Zinc-950 dark background
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
  const startupStart = Date.now();
  const config = getConfig();

  // 1. CREATE WINDOW & START LOADING UI IMMEDIATELY
  // This is the highest priority - showing something to the user
  mainWindow = createWindow();
  monitorWaylandStartupWindow(mainWindow);
  
  // Start loading HTML early, but don't await yet if we want to run other tasks in parallel.
  // We'll await it later to ensure the process continues correctly.
  const loadUIPromise = loadMainWindow(mainWindow);

  // 2. RUN ESSENTIAL SYNC INITIALIZATIONS
  initAuth();
  resetLauncherState();
  initTelemetry();

  // 3. START BACKGROUND INITIALIZATIONS (NON-BLOCKING)
  
  // Sync cloud instances in background
  const rpcSession = getSession();
  if (rpcSession) {
    setPlayerInfo(rpcSession.minecraftUuid || rpcSession.uuid, rpcSession.username);
    const apiToken = getApiToken();
    if (apiToken) {
      import("./cloud-instances.js").then(({ syncCloudInstances }) => {
        syncCloudInstances(apiToken)
          .then(() => {
            mainWindow?.webContents.send("instances-updated");
          })
          .catch((err) => logger.error("Failed to sync cloud instances", err));
      }).catch(err => logger.error("Failed to load cloud-instances module", err));
    }
  }

  // 4. REGISTER HANDLERS & INITIALIZE DISCORD (IN PARALLEL)
  // We MUST ensure handlers are registered before we consider startup finished,
  // but we can do it while the window is already being created/loading.
  const registerHandlersPromise = registerAllHandlers(() => mainWindow);
  
  const discordPromise = config.discordRPCEnabled 
    ? initDiscordRPC().catch(err => logger.error("Discord RPC error", err))
    : Promise.resolve();

  // 5. WAIT FOR CRITICAL UI LOADING TO FINISH
  await Promise.all([loadUIPromise, registerHandlersPromise]);

  // Discord can finish whenever, we don't strictly need it for UI interaction
  discordPromise.then(() => {
    logger.info("Discord RPC initialized in background");
  });

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
