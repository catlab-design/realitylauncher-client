

import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { createLogger, sendErrorToRenderer } from "./lib/logger.js";
import {
  startTrace,
  endTrace,
  getPerformanceMetrics,
  getCompletedSpans,
} from "./lib/tracing.js";


const logger = createLogger("Main");

if (!app || typeof app.on !== "function") {
  throw new Error(
    "Electron app API is unavailable. This usually means ELECTRON_RUN_AS_NODE is set. Unset it before launching Reality Launcher.",
  );
}





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


const appTrace = startTrace("app:startup", { pid: process.pid });





process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception in main process", error);
  
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
  
  app.commandLine.appendSwitch("force_high_performance_gpu");
}

let mainWindow: BrowserWindow | null = null;


function createWindow(config: any): BrowserWindow {
  const customColor = config?.customColor;
  const colorTheme = config?.colorTheme || "yellow";
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

  
  const isDev = !app.isPackaged && process.env.ML_CLIENT_FORCE_PROD !== "1";
  const iconPath = isDev
    ? path.join(app.getAppPath(), "public", "r.png")
    : path.resolve(__dirname, "../dist/r.png");

  const win = new BrowserWindow({
    width: 360,
    height: 380,
    resizable: false,
    icon: iconPath,
    backgroundColor: '#09090b', 
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
  const isDev = !app.isPackaged && process.env.ML_CLIENT_FORCE_PROD !== "1";
  if (isDev) {
    await win.loadURL("http://localhost:4321/");
    
    return;
  }

  const indexPath = path.join(__dirname, "..", "dist", "index.html");
  await win.loadFile(indexPath);
}


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


app.whenReady().then(async () => {
  
  
  const { getConfig } = await import("./config.js");
  const config = getConfig();

  mainWindow = createWindow(config);
  monitorWaylandStartupWindow(mainWindow);
  const loadUIPromise = loadMainWindow(mainWindow);

  
  const { registerAllHandlers } = await import("./ipc/index.js");
  const registerHandlersPromise = registerAllHandlers(() => mainWindow);

  
  
  const backgroundTasks = (async () => {
    const [
      { initAuth, getSession, getApiToken },
      { resetLauncherState },
      { initTelemetry }
    ] = await Promise.all([
      import("./auth.js"),
      import("./launcher.js"),
      import("./telemetry.js")
    ]);

    initAuth();
    resetLauncherState();
    
    
    setTimeout(() => {
      initTelemetry();
      
      const rpcSession = getSession();
      if (rpcSession) {
        const apiToken = getApiToken();
        if (apiToken) {
          import("./cloud-instances.js").then(({ syncCloudInstances }) => {
            syncCloudInstances(apiToken)
              .then(() => mainWindow?.webContents.send("instances-updated"))
              .catch(err => logger.error("Cloud sync error", err));
          }).catch(err => logger.error("Cloud module load fail", err));
        }
      }
    }, 3000);
  })();

  
  await Promise.all([loadUIPromise, registerHandlersPromise]);

  
  setTimeout(async () => {
    
    if (config.discordRPCEnabled) {
      const { initDiscordRPC } = await import("./discord.js");
      initDiscordRPC().catch(err => logger.error("Discord RPC error", err));
    }

    
    if (app.isPackaged) {
      const { default: electronUpdater } = await import("electron-updater");
      const { autoUpdater } = electronUpdater;
      
      autoUpdater.logger = console;
      autoUpdater.autoDownload = false;
      autoUpdater.checkForUpdates();
    }

    
    try {
      const { createRequire } = await import("module");
      const customRequire = createRequire(__filename);
      const native = customRequire(path.join(app.getAppPath(), "native", "index.cjs"));
      
      await Promise.all([
        native.modrinthSearch({ projectType: "modpack", limit: 20, sortBy: "downloads" }),
        native.modrinthSearch({ projectType: "mod", limit: 20, sortBy: "downloads" })
      ]);
    } catch (e) {}
  }, 5000);

  
  endTrace(appTrace, "ok", { totalDuration: Date.now() - appTrace.startTime });
  logger.info(`App startup complete in ${Date.now() - appTrace.startTime}ms`);

  
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow(getConfig());
      loadMainWindow(mainWindow);
    }
  });
});


app.on("before-quit", async () => {
  const { destroyRPC } = await import("./discord.js");
  const { cleanupTelemetry } = await import("./telemetry.js");
  destroyRPC();
  cleanupTelemetry();
});


app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
