/**
 * ========================================
 * Electron Main Process - Main Entry Point
 * ========================================
 * 
 * ไฟล์หลักของ Electron ที่รันใน Main Process
 * 
 * หน้าที่:
 * - สร้างและจัดการ BrowserWindow
 * - รับ/ส่งข้อมูลผ่าน IPC (Inter-Process Communication)
 * - เข้าถึง Node.js APIs และ Filesystem
 * 
 * การสื่อสารกับ Renderer (UI):
 * - ใช้ ipcMain.handle() รับ request จาก renderer
 * - Renderer เรียกผ่าน window.api ที่ expose ใน preload.ts
 */

import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";

// ปิด Hardware Acceleration เพื่อแก้ปัญหาเส้นประบน screen
app.disableHardwareAcceleration();

// ========================================
// Import Modules - นำเข้าโมดูลภายใน
// ========================================

// Config System - จัดการค่าตั้งค่า
import {
  getConfig,
  setConfig,
  resetConfig,
  getMinecraftDir,
  getAppDataDir,
  validateJavaPath,
  getSystemRamMB,
  getMaxRamMB,
  COLOR_THEMES,
  type LauncherConfig,
  type ColorTheme
} from "./config.js";

// Auth System - จัดการ login/logout
import {
  loginCatID,
  loginOffline,
  logout,
  getSession,
  isLoggedIn,
  initAuth,
  type AuthSession
} from "./auth.js";

// Discord RPC - แสดงสถานะบน Discord
import {
  initDiscordRPC,
  updateRPC,
  destroyRPC,
  setRPCEnabled,
  isRPCConnected
} from "./discord.js";

// Game Launcher - เปิดเกม Minecraft
import {
  launchGame,
  getInstalledVersions,
  isGameRunning,
  killGame,
  setProgressCallback,
  resetLauncherState,
  setOnGameCloseCallback,
  setGameLogCallback,
} from "./launcher.js";

// Modrinth API - ค้นหาและดาวน์โหลด modpacks
import {
  searchModpacks,
  getProject,
  getProjectVersions,
  getVersion,
  downloadModpack,
  getPopularModpacks,
  getGameVersions,
  getLoaders,
  getInstalledModpacks,
  deleteInstalledModpack,
  type SearchFilters,
} from "./modrinth.js";

// Instance Management - จัดการ instances
import {
  getInstances,
  getInstance,
  createInstance,
  updateInstance,
  deleteInstance,
  duplicateInstance,
  getInstanceDir,
  type GameInstance,
  type CreateInstanceOptions,
  type UpdateInstanceOptions,
} from "./instances.js";

// Server Status - ตรวจสอบสถานะ Minecraft servers
import { pingServer, isServerOnline, type ServerStatus } from "./server-status.js";

// Content Download - ดาวน์โหลด mods/shaders/resourcepacks
import {
  downloadContentToInstance,
  getCompatibleVersions,
  type ContentType,
} from "./content.js";

// Modpack Installer - ติดตั้ง modpacks
import {
  installModpack,
  parseModpackIndex,
  detectModConflicts,
  type InstallProgress,
} from "./modpack-installer.js";

// Auto Updater - ระบบอัปเดตอัตโนมัติ
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater;

// ========================================
// Path Setup - ตั้งค่า path
// ========================================

// CommonJS format provides __dirname natively

// ตรวจสอบว่ารันใน development หรือ production
const isDev = !app.isPackaged;

// ========================================
// Window Management - จัดการหน้าต่าง
// ========================================

// ตัวแปรเก็บ reference ของหน้าต่างหลัก
let mainWindow: BrowserWindow | null = null;
// ตัวแปรเก็บ reference ของหน้าต่าง auth
let authWindow: BrowserWindow | null = null;

// URL สำหรับ auth - ใช้ environment variable หรือ localhost สำหรับ dev
const AUTH_URL = process.env.AUTH_URL || "http://localhost:3001";
if (AUTH_URL.includes("localhost") && !process.env.AUTH_URL) {
  console.warn("[Config] Using localhost AUTH_URL - set AUTH_URL env var for production");
}

/**
 * createWindow - สร้างหน้าต่างหลักของ app
 * 
 * @returns BrowserWindow - หน้าต่างที่สร้างขึ้น
 * 
 * ในโหมด dev: โหลด URL จาก localhost (Astro dev server)
 * ในโหมด prod: โหลดไฟล์ HTML จาก dist/
 */
function createWindow(): BrowserWindow {
  // ดึงค่า theme จาก config เพื่อใช้สีที่ถูกต้อง
  const config = getConfig();
  const isDarkTheme = config.theme === "dark";

  // สีพื้นหลังตาม theme
  const backgroundColor = isDarkTheme ? "#1a1a1a" : "#ffffff";

  // ดึง color theme สำหรับใช้กับ title bar
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

  // สีของ titleBarOverlay ใช้สี accent color เพื่อให้กลมกลืนกับหน้า Loading และ Sidebar
  const titleBarColor = accentColor;
  const titleBarSymbolColor = "#1a1a1a";

  const preloadPath = path.join(__dirname, "preload.js");

  // Icon path - ใช้ r.png จาก public folder
  const iconPath = isDev
    ? path.join(app.getAppPath(), "public", "r.png")
    : path.resolve(__dirname, "../dist/r.png");

  const win = new BrowserWindow({
    // ขนาดหน้าต่างเริ่มต้น
    width: 1100,
    height: 680,
    // ขนาดขั้นต่ำ (ป้องกันการย่อเล็กเกินไป)
    minWidth: 980,
    minHeight: 620,
    // ไอคอนสำหรับ taskbar
    icon: iconPath,
    // สีพื้นหลัง (แสดงระหว่างโหลด) - ใช้สี accent color
    backgroundColor: accentColor,
    // ซ่อนหน้าต่างก่อน จนกว่าจะโหลดเสร็จ (ป้องกันหน้าจอดำ)
    show: false,
    // ใช้ frameless window - ไม่มี title bar และปุ่มควบคุมของ OS
    frame: false,
    // Web Preferences - ความปลอดภัย
    webPreferences: {
      // preload script - ทำ bridge ระหว่าง main กับ renderer
      preload: preloadPath,
      // contextIsolation - แยก context ระหว่าง preload กับ renderer
      // ป้องกัน renderer เข้าถึง Node.js APIs โดยตรง
      contextIsolation: true,
      // ปิด nodeIntegration - ไม่ให้ renderer ใช้ require()\
      nodeIntegration: false,
    },
  });

  // แสดงหน้าต่างเมื่อพร้อม (หลีกเลี่ยงหน้าจอดำ/กระพริบ)
  win.once("ready-to-show", () => {
    win.show();
  });

  // โหลดหน้า UI
  if (isDev) {
    // Development - โหลดจาก Astro dev server
    win.loadURL("http://localhost:4321");
    // เปิด DevTools แยกหน้าต่าง
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    // Production - โหลดจากไฟล์ที่ build แล้ว
    // __dirname = dist-electron, so we need to go up one level then into dist
    const indexPath = path.join(__dirname, "..", "dist", "index.html");
    console.log("[Main] Loading production index.html from:", indexPath);
    win.loadFile(indexPath);
  }

  return win;
}

// ========================================
// App Lifecycle - วงจรชีวิต App
// ========================================

// Single instance lock - ป้องกันการเปิดหลาย instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // ถ้ามี instance อื่นเปิดอยู่แล้ว ให้ปิดตัวนี้
  app.quit();
} else {
  // เมื่อมีการพยายามเปิด instance ที่ 2 ให้ focus ไปที่หน้าต่างที่มีอยู่
  app.on("second-instance", () => {
    const win = mainWindow;
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

/**
 * app.whenReady() - เมื่อ Electron พร้อมใช้งาน
 * 
 * สร้างหน้าต่างหลักและ setup ต่างๆ
 */
app.whenReady().then(async () => {
  // Initialize auth system (load saved session)
  initAuth();

  // Reset launcher state to clear any stale game state from previous sessions
  resetLauncherState();

  // Initialize Discord RPC
  const config = getConfig();
  if (config.discordRPCEnabled) {
    await initDiscordRPC();
  }

  // สร้างหน้าต่างหลัก
  mainWindow = createWindow();

  // Set up callback to quit app when game closes (if launcher is hidden)
  setOnGameCloseCallback(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log("[Window] Game closed while launcher was hidden, quitting app");
      app.quit();
    }
  });

  // ========================================
  // Auto Updater Setup
  // ========================================

  // ตั้งค่า auto-updater (เฉพาะ production)
  if (!isDev) {
    // ตั้งค่า log level
    autoUpdater.logger = console;

    // ตรวจสอบ update เมื่อเปิด app
    autoUpdater.checkForUpdatesAndNotify();

    // Event: มี update ใหม่
    autoUpdater.on("update-available", (info) => {
      console.log("[AutoUpdater] Update available:", info.version);
      mainWindow?.webContents.send("update-available", {
        version: info.version,
        releaseDate: info.releaseDate,
      });
    });

    // Event: ไม่มี update
    autoUpdater.on("update-not-available", () => {
      console.log("[AutoUpdater] No update available");
    });

    // Event: กำลังดาวน์โหลด
    autoUpdater.on("download-progress", (progress) => {
      console.log(`[AutoUpdater] Download progress: ${progress.percent.toFixed(1)}%`);
      mainWindow?.webContents.send("update-progress", {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    // Event: ดาวน์โหลดเสร็จ
    autoUpdater.on("update-downloaded", (info) => {
      console.log("[AutoUpdater] Update downloaded:", info.version);
      mainWindow?.webContents.send("update-downloaded", {
        version: info.version,
        releaseDate: info.releaseDate,
      });
    });

    // Event: Error
    autoUpdater.on("error", (err) => {
      console.error("[AutoUpdater] Error:", err);
    });
  }

  // macOS: สร้างหน้าต่างใหม่เมื่อกด icon (ถ้าไม่มีหน้าต่างเปิดอยู่)
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Cleanup Discord RPC before quit
app.on("before-quit", () => {
  destroyRPC();
});

/**
 * window-all-closed - เมื่อปิดหน้าต่างทั้งหมด
 * 
 * Windows/Linux: ปิด app
 * macOS: ไม่ปิด (convention ของ macOS)
 */
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// ========================================
// IPC Handlers - รับ request จาก Renderer
// ========================================

// ----------------------------------------
// Config Handlers - จัดการ Config
// ----------------------------------------

/**
 * get-config - ดึงค่า config ทั้งหมด
 * 
 * @returns LauncherConfig
 */
ipcMain.handle("get-config", async (): Promise<LauncherConfig> => {
  return getConfig();
});

/**
 * set-config - บันทึกค่า config
 * 
 * @param config - ค่าที่ต้องการบันทึก (บางส่วนหรือทั้งหมด)
 * @returns LauncherConfig - ค่าที่บันทึกแล้ว
 */
ipcMain.handle(
  "set-config",
  async (_event, config: Partial<LauncherConfig>): Promise<LauncherConfig> => {
    return setConfig(config);
  }
);

/**
 * reset-config - รีเซ็ต config เป็นค่าเริ่มต้น
 * 
 * @returns LauncherConfig - ค่า default
 */
ipcMain.handle("reset-config", async (): Promise<LauncherConfig> => {
  return resetConfig();
});

// ----------------------------------------
// Auth Handlers - จัดการ Login/Logout
// ----------------------------------------

// Note: auth-login-offline was removed in favor of CatID authentication
// Use auth-catid-login instead

/**
 * auth-logout - Logout จาก session ปัจจุบัน
 */
ipcMain.handle("auth-logout", async (): Promise<void> => {
  logout();
});

/**
 * auth-get-session - ดึง session ปัจจุบัน
 * 
 * @returns AuthSession | null
 */
ipcMain.handle("auth-get-session", async (): Promise<AuthSession | null> => {
  return getSession();
});

/**
 * auth-is-logged-in - ตรวจสอบสถานะ login
 * 
 * @returns boolean
 */
ipcMain.handle("auth-is-logged-in", async (): Promise<boolean> => {
  return isLoggedIn();
});

// ----------------------------------------
// Launcher Handlers - จัดการ Launcher
// ----------------------------------------

/**
 * list-versions - ดึงรายการเวอร์ชัน Minecraft ที่ติดตั้ง
 * 
 * @returns string[] - รายการเวอร์ชัน (อ่านจาก .minecraft/versions/)
 */
ipcMain.handle("list-versions", async (): Promise<string[]> => {
  const versions = await getInstalledVersions();
  // ถ้าไม่มี versions ให้แสดงรายการ popular versions
  if (versions.length === 0) {
    return ["1.21.4", "1.21.3", "1.21.1", "1.20.4", "1.20.1", "1.19.4", "1.18.2", "1.16.5"];
  }
  return versions;
});

/**
 * get-launcher-info - ดึงข้อมูล Launcher
 * 
 * @returns object - ข้อมูล launcher (Java status, paths)
 */
ipcMain.handle("get-launcher-info", async () => {
  const minecraftDir = getMinecraftDir();

  // TODO: ตรวจสอบ Java จริง
  return {
    javaOK: true, // mock value
    runtime: process.versions.node,
    minecraftDir: minecraftDir,
  };
});

/**
 * launch-game - เปิดเกม Minecraft
 * 
 * @param payload - ข้อมูลสำหรับเปิดเกม
 * @returns object - ผลลัพธ์ (ok, message, pid)
 */
ipcMain.handle(
  "launch-game",
  async (
    _event,
    payload: { version: string; username: string; ramMB: number }
  ) => {
    // ตรวจสอบว่า login อยู่หรือไม่
    const session = getSession();
    if (!session) {
      return {
        ok: false,
        message: "Please login first / กรุณา login ก่อน",
      };
    }

    // ตรวจสอบว่าเกมกำลังรันอยู่หรือไม่
    if (isGameRunning()) {
      return {
        ok: false,
        message: "เกมกำลังรันอยู่แล้ว",
      };
    }

    console.log("[Launch] Starting game:", {
      version: payload.version,
      username: session.username,
      uuid: session.uuid,
      ramMB: payload.ramMB,
    });

    // Set up progress callback to send to renderer
    setProgressCallback((progress) => {
      if (mainWindow) {
        mainWindow.webContents.send("launch-progress", progress);
      }
    });

    // Set up game log callback to send logs to renderer
    setGameLogCallback((level, message) => {
      if (mainWindow) {
        mainWindow.webContents.send("game-log", { level, message });
      }
    });

    // Launch the game using MCLC
    const result = await launchGame({
      version: payload.version,
      username: session.username,
      uuid: session.uuid,
      accessToken: session.accessToken,
      ramMB: payload.ramMB,
    });

    // Clear progress callback after launch
    setProgressCallback(null);

    return result;
  }
);

/**
 * is-game-running - ตรวจสอบว่าเกมกำลังรันอยู่หรือไม่
 */
ipcMain.handle("is-game-running", async (): Promise<boolean> => {
  return isGameRunning();
});

/**
 * kill-game - หยุดเกม
 */
ipcMain.handle("kill-game", async (): Promise<boolean> => {
  return killGame();
});

// ----------------------------------------
// Utility Handlers - ฟังก์ชันอื่นๆ
// ----------------------------------------

/**
 * open-external - เปิด URL ในเบราว์เซอร์ภายนอก
 */
ipcMain.handle("open-external", async (_event, url: string): Promise<void> => {
  await shell.openExternal(url);
});

/**
 * open-microsoft-login - เปิดหน้า Microsoft login ในหน้าต่างใหม่ที่ล้าง session
 * ทำให้ผู้ใช้สามารถเลือกบัญชี Microsoft ได้
 */
ipcMain.handle("open-microsoft-login", async (_event, verificationUri: string, userCode: string): Promise<void> => {
  // สร้างหน้าต่างใหม่สำหรับ login
  const loginWindow = new BrowserWindow({
    width: 500,
    height: 700,
    title: "Microsoft Login",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // เปิดหน้าต่างในโหมด partition แยก (ไม่มี cookies เก่า)
      partition: "microsoft-login-" + Date.now(),
    },
    autoHideMenuBar: true,
    resizable: true,
    center: true,
  });

  // ล้าง cookies และ session ของ Microsoft ใน partition นี้
  await loginWindow.webContents.session.clearStorageData({
    storages: ["cookies", "localstorage"],
  });

  // เปิดหน้า devicelogin
  await loginWindow.loadURL(verificationUri);

  // เมื่อปิดหน้าต่าง ก็ไม่ต้องทำอะไร (polling จะจัดการเอง)
  loginWindow.on("closed", () => {
    console.log("[Auth] Microsoft login window closed");
  });

  // ถ้า login สำเร็จ Microsoft จะ redirect ไป confirmation page
  // ตรวจจับการ navigate และปิดหน้าต่างถ้า login สำเร็จ
  loginWindow.webContents.on("did-navigate", (_event, url) => {
    console.log("[Auth] Microsoft login navigated to:", url);
    // ถ้าไป page ที่บอกว่า login สำเร็จ ให้ปิดหน้าต่าง
    if (url.includes("nativeclient") || url.includes("success") || url.includes("close")) {
      loginWindow.close();
    }
  });
});

/**
 * get-minecraft-dir - ดึง path โฟลเดอร์ .minecraft
 */
ipcMain.handle("get-minecraft-dir", async (): Promise<string> => {
  return getMinecraftDir();
});

/**
 * get-app-data-dir - ดึง path โฟลเดอร์ data ของ app
 */
ipcMain.handle("get-app-data-dir", async (): Promise<string> => {
  return getAppDataDir();
});

/**
 * get-color-themes - ดึงรายการ color themes ที่รองรับ
 */
ipcMain.handle("get-color-themes", async () => {
  return COLOR_THEMES;
});

/**
 * get-system-ram - ดึงจำนวน RAM ของระบบ (MB)
 */
ipcMain.handle("get-system-ram", async (): Promise<number> => {
  return getSystemRamMB();
});

/**
 * get-max-ram - ดึงจำนวน RAM สูงสุดที่แนะนำให้ใช้กับ Minecraft (MB)
 */
ipcMain.handle("get-max-ram", async (): Promise<number> => {
  return getMaxRamMB();
});

/**
 * auto-detect-java - ค้นหา Java อัตโนมัติจาก PATH และตำแหน่งทั่วไป
 */
ipcMain.handle("auto-detect-java", async (): Promise<string | null> => {
  const { execSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const path = await import("node:path");

  // Try to find Java in PATH first
  try {
    const result = execSync("where java", { encoding: "utf-8", timeout: 5000 });
    const lines = result.trim().split("\n");
    if (lines.length > 0 && lines[0]) {
      const javaPath = lines[0].trim();
      if (fs.existsSync(javaPath)) {
        console.log("[Java] Found in PATH:", javaPath);
        return javaPath;
      }
    }
  } catch {
    // Not found in PATH
  }

  // Check common installation paths on Windows
  const commonPaths = [
    "C:\\Program Files\\Java",
    "C:\\Program Files (x86)\\Java",
    "C:\\Program Files\\Eclipse Adoptium",
    "C:\\Program Files\\Zulu",
    "C:\\Program Files\\Microsoft",
  ];

  for (const basePath of commonPaths) {
    if (!fs.existsSync(basePath)) continue;

    const entries = fs.readdirSync(basePath);
    for (const entry of entries) {
      const javaExe = path.join(basePath, entry, "bin", "java.exe");
      if (fs.existsSync(javaExe)) {
        console.log("[Java] Found:", javaExe);
        return javaExe;
      }
    }
  }

  console.log("[Java] Not found automatically");
  return null;
});

// ----------------------------------------
// Dialog Handlers - เปิด dialog เลือกไฟล์/โฟลเดอร์
// ----------------------------------------

/**
 * browse-java - เปิด dialog เลือกไฟล์ Java
 */
ipcMain.handle("browse-java", async (): Promise<string | null> => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win) {
    console.error("[Dialog] No window available for browse-java");
    return null;
  }
  const result = await dialog.showOpenDialog(win, {
    title: "เลือกไฟล์ Java (java.exe หรือ javaw.exe)",
    filters: [
      { name: "Java Executable", extensions: ["exe"] },
      { name: "All Files", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

/**
 * browse-directory - เปิด dialog เลือกโฟลเดอร์
 */
ipcMain.handle("browse-directory", async (_event, title: string): Promise<string | null> => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win) {
    console.error("[Dialog] No window available for browse-directory");
    return null;
  }
  const result = await dialog.showOpenDialog(win, {
    title: title || "เลือกโฟลเดอร์",
    properties: ["openDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

/**
 * validate-java-path - ตรวจสอบว่า Java path ถูกต้องหรือไม่
 */
ipcMain.handle("validate-java-path", async (_event, javaPath: string): Promise<boolean> => {
  return validateJavaPath(javaPath);
});

/**
 * open-folder - เปิดโฟลเดอร์ใน File Explorer
 */
ipcMain.handle("open-folder", async (_event, folderPath: string): Promise<void> => {
  await shell.openPath(folderPath);
});

/**
 * browse-modpack - เปิด dialog เลือกไฟล์ modpack (.mrpack หรือ .zip)
 */
ipcMain.handle("browse-modpack", async (): Promise<string | null> => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win) {
    console.error("[Dialog] No window available for browse-modpack");
    return null;
  }
  const result = await dialog.showOpenDialog(win, {
    title: "เลือกไฟล์ Modpack",
    filters: [
      { name: "Modpack Files", extensions: ["mrpack", "zip"] },
      { name: "Modrinth Pack", extensions: ["mrpack"] },
      { name: "CurseForge Pack", extensions: ["zip"] },
      { name: "All Files", extensions: ["*"] },
    ],
    properties: ["openFile"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

/**
 * import-modpack - นำเข้า modpack จากไฟล์
 */
ipcMain.handle("import-modpack", async (_event, filePath: string): Promise<{ success: boolean; name: string; error?: string }> => {
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");

    if (!fs.existsSync(filePath)) {
      return { success: false, name: "", error: "ไม่พบไฟล์" };
    }

    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const name = filename.replace(/\.(mrpack|zip)$/i, "");

    // Create instances directory
    const minecraftDir = getMinecraftDir();
    const instancesDir = path.join(minecraftDir, "instances");
    const modpackDir = path.join(instancesDir, name);

    if (!fs.existsSync(modpackDir)) {
      fs.mkdirSync(modpackDir, { recursive: true });
    }

    // Copy the modpack file
    const destPath = path.join(modpackDir, filename);
    fs.copyFileSync(filePath, destPath);

    console.log("[Import] Imported modpack:", destPath);

    return { success: true, name };
  } catch (error: any) {
    console.error("[Import] Error:", error);
    return { success: false, name: "", error: error.message };
  }
});

/**
 * detect-java-installations - ค้นหา Java installations ในระบบ
 */
ipcMain.handle("detect-java-installations", async (): Promise<string[]> => {
  const installations: string[] = [];
  const fs = await import("node:fs");
  const path = await import("node:path");

  try {
    // Common Java paths on Windows
    const possiblePaths = [
      process.env.JAVA_HOME,
      process.env.JRE_HOME,
      "C:\\Program Files\\Java",
      "C:\\Program Files\\Eclipse Adoptium",
      "C:\\Program Files\\Zulu",
      "C:\\Program Files\\Microsoft\\jdk",
      "C:\\Program Files\\AdoptOpenJDK",
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, ".minecraft", "runtime") : null,
    ].filter(Boolean) as string[];

    for (const basePath of possiblePaths) {
      if (!fs.existsSync(basePath)) continue;

      // Check if it's a direct Java home
      const javaBin = path.join(basePath, "bin", "java.exe");
      if (fs.existsSync(javaBin)) {
        installations.push(javaBin);
        continue;
      }

      // Search subdirectories
      try {
        const dirs = fs.readdirSync(basePath, { withFileTypes: true });
        for (const dir of dirs) {
          if (!dir.isDirectory()) continue;

          const javaPath = path.join(basePath, dir.name, "bin", "java.exe");
          if (fs.existsSync(javaPath)) {
            installations.push(javaPath);
          }
        }
      } catch {
        // Ignore permission errors
      }
    }
  } catch (error) {
    console.error("[Java] Detection error:", error);
  }

  // Remove duplicates
  return [...new Set(installations)];
});

// ----------------------------------------
// Discord RPC Handlers
// ----------------------------------------

/**
 * discord-rpc-set-enabled - เปิด/ปิด Discord RPC
 */
ipcMain.handle("discord-rpc-set-enabled", async (_event, enabled: boolean): Promise<void> => {
  setRPCEnabled(enabled);
});

/**
 * discord-rpc-update - อัปเดตสถานะ Discord
 */
ipcMain.handle(
  "discord-rpc-update",
  async (_event, status: "idle" | "playing" | "launching", serverName?: string): Promise<void> => {
    await updateRPC(status, serverName);
  }
);

/**
 * discord-rpc-is-connected - ตรวจสอบว่า Discord RPC เชื่อมต่ออยู่หรือไม่
 */
ipcMain.handle("discord-rpc-is-connected", async (): Promise<boolean> => {
  return isRPCConnected();
});

// ----------------------------------------
// Auth Window Handlers
// ----------------------------------------

/**
 * open-auth-window - เปิดหน้าต่าง auth ใหม่
 * 
 * เปิดหน้าต่างใหม่ไปที่ auth.catlab.net สำหรับ login
 * รองรับ callback ผ่าน deep link หรือ postMessage
 */
ipcMain.handle("open-auth-window", async (): Promise<void> => {
  console.log("[Auth] open-auth-window IPC called");

  // ถ้ามี auth window เปิดอยู่แล้ว ให้ focus
  if (authWindow && !authWindow.isDestroyed()) {
    console.log("[Auth] Auth window already exists, focusing");
    authWindow.focus();
    return;
  }

  console.log("[Auth] Creating new auth window, loading:", AUTH_URL);

  // สร้าง auth window ใหม่
  authWindow = new BrowserWindow({
    width: 500,
    height: 700,
    parent: mainWindow!,
    modal: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    title: "เข้าสู่ระบบ - Reality Launcher",
    backgroundColor: "#1a1a1a",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // โหลด URL auth
  authWindow.loadURL(AUTH_URL);

  // Cleanup เมื่อปิด window
  authWindow.on("closed", () => {
    authWindow = null;
  });

  // รับ callback จาก auth (ผ่าน URL scheme หรือ query params)
  authWindow.webContents.on("will-redirect", async (event, url) => {
    console.log("[Auth] Redirect detected:", url);

    // Check for auth callback with Minecraft session data
    if (url.includes("callback") || url.includes("access_token=") || url.includes("token=")) {
      const urlObj = new URL(url);

      // Handle error
      const error = urlObj.searchParams.get("error");
      if (error) {
        console.error("[Auth] Auth error:", error);
        if (mainWindow) {
          mainWindow.webContents.send("auth-callback", { error });
        }
        authWindow?.close();
        return;
      }

      // Handle Minecraft session (from Microsoft/Xbox auth)
      const accessToken = urlObj.searchParams.get("access_token");
      const uuid = urlObj.searchParams.get("uuid");
      const username = urlObj.searchParams.get("username");

      if (accessToken && uuid && username && mainWindow) {
        console.log("[Auth] Minecraft session received for:", username);

        // Save to auth system
        const { loginMicrosoft } = await import("./auth.js");
        loginMicrosoft(username, uuid, accessToken);

        mainWindow.webContents.send("auth-callback", {
          accessToken,
          uuid,
          username,
          type: "microsoft"
        });
        authWindow?.close();
        return;
      }

      // Handle CatID token (legacy)
      const token = urlObj.searchParams.get("token");
      if (token && mainWindow) {
        console.log("[Auth] CatID token received");
        mainWindow.webContents.send("auth-callback", { token });
        authWindow?.close();
      }
    }
  });
});

/**
 * close-auth-window - ปิดหน้าต่าง auth
 */
ipcMain.handle("close-auth-window", async (): Promise<void> => {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.close();
    authWindow = null;
  }
});

// ----------------------------------------
// Device Code Authentication Handlers
// ----------------------------------------

// Microsoft OAuth Client ID - for Device Code Auth
// CatID App - configured with native client redirect URI
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || "1d500075-0bac-43ba-a987-3e35771c7354";
if (!MICROSOFT_CLIENT_ID) {
  console.error("[Auth] MICROSOFT_CLIENT_ID not set! Device code auth will not work.");
}

/**
 * Device Code Response from Microsoft
 */
interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

/**
 * auth-device-code-start - Start Microsoft Device Code authentication flow
 * 
 * ขอ device code จาก Microsoft เพื่อให้ผู้ใช้ไปยืนยันที่ microsoft.com/devicelogin
 */
ipcMain.handle("auth-device-code-start", async (): Promise<{
  ok: boolean;
  deviceCode?: string;
  userCode?: string;
  verificationUri?: string;
  expiresIn?: number;
  interval?: number;
  message?: string;
  error?: string;
}> => {
  console.log("[Auth] Starting device code flow...");

  try {
    const response = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        scope: "XboxLive.signin offline_access",
      }),
    });

    const data = await response.json() as DeviceCodeResponse & { error?: string; error_description?: string };

    if (!response.ok || data.error) {
      console.error("[Auth] Device code request failed:", data);
      return {
        ok: false,
        error: data.error_description || data.error || "Failed to get device code",
      };
    }

    console.log("[Auth] Device code received:", data.user_code);

    return {
      ok: true,
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresIn: data.expires_in,
      interval: data.interval,
      message: data.message,
    };
  } catch (error: any) {
    console.error("[Auth] Device code error:", error);
    return {
      ok: false,
      error: error.message || "Network error",
    };
  }
});

/**
 * auth-device-code-poll - Poll for device code authentication completion
 * 
 * ตรวจสอบว่าผู้ใช้ยืนยัน device code สำเร็จหรือยัง
 * ถ้าสำเร็จจะดำเนินการ Xbox Live + XSTS + Minecraft auth ต่อ
 */
ipcMain.handle("auth-device-code-poll", async (_event, deviceCode: string): Promise<{
  status: "pending" | "success" | "error" | "expired";
  error?: string;
  session?: {
    username: string;
    uuid: string;
    accessToken: string;
  };
}> => {
  try {
    // Step 1: Poll for Microsoft token
    const tokenResponse = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: MICROSOFT_CLIENT_ID,
        device_code: deviceCode,
      }),
    });

    const tokenData = await tokenResponse.json() as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    // Handle pending/error states
    if (tokenData.error === "authorization_pending") {
      return { status: "pending" };
    }

    if (tokenData.error === "expired_token") {
      return { status: "expired", error: "รหัสหมดอายุ กรุณาลองใหม่" };
    }

    if (tokenData.error === "authorization_declined") {
      return { status: "error", error: "ผู้ใช้ปฏิเสธการเข้าสู่ระบบ" };
    }

    if (tokenData.error) {
      return { status: "error", error: tokenData.error_description || tokenData.error };
    }

    if (!tokenData.access_token) {
      return { status: "error", error: "No access token received" };
    }

    console.log("[Auth] Microsoft token received, authenticating with Xbox Live...");

    // Step 2: Authenticate with Xbox Live
    const xblResponse = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        Properties: {
          AuthMethod: "RPS",
          SiteName: "user.auth.xboxlive.com",
          RpsTicket: `d=${tokenData.access_token}`,
        },
        RelyingParty: "http://auth.xboxlive.com",
        TokenType: "JWT",
      }),
    });

    const xblData = await xblResponse.json() as {
      Token?: string;
      DisplayClaims?: { xui?: { uhs: string }[] };
      error?: string;
    };

    if (!xblResponse.ok || !xblData.Token) {
      return { status: "error", error: "Xbox Live authentication failed" };
    }

    const userHash = xblData.DisplayClaims?.xui?.[0]?.uhs;
    if (!userHash) {
      return { status: "error", error: "User hash not found in Xbox Live response" };
    }

    console.log("[Auth] Xbox Live authenticated, getting XSTS token...");

    // Step 3: Get XSTS token
    const xstsResponse = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        Properties: {
          SandboxId: "RETAIL",
          UserTokens: [xblData.Token],
        },
        RelyingParty: "rp://api.minecraftservices.com/",
        TokenType: "JWT",
      }),
    });

    const xstsData = await xstsResponse.json() as {
      Token?: string;
      XErr?: number;
      Message?: string;
    };

    if (!xstsResponse.ok || !xstsData.Token) {
      if (xstsData.XErr === 2148916233) {
        return { status: "error", error: "บัญชีนี้ไม่มี Xbox Live - กรุณาสร้าง Xbox profile ก่อน" };
      } else if (xstsData.XErr === 2148916238) {
        return { status: "error", error: "บัญชีนี้ต้องมีผู้ปกครองอนุมัติ (อายุต่ำกว่า 18)" };
      }
      return { status: "error", error: `XSTS authentication failed: ${xstsData.Message || xstsData.XErr}` };
    }

    console.log("[Auth] XSTS authenticated, authenticating with Minecraft...");

    // Step 4: Authenticate with Minecraft
    const mcResponse = await fetch("https://api.minecraftservices.com/authentication/login_with_xbox", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        identityToken: `XBL3.0 x=${userHash};${xstsData.Token}`,
      }),
    });

    const mcData = await mcResponse.json() as {
      access_token?: string;
      error?: string;
      errorMessage?: string;
    };

    console.log("[Auth] Minecraft response:", mcResponse.status, JSON.stringify(mcData));

    if (!mcResponse.ok || !mcData.access_token) {
      console.error("[Auth] Minecraft auth failed:", mcData);
      return { status: "error", error: `Minecraft authentication failed: ${mcData.error || mcData.errorMessage || mcResponse.status}` };
    }

    console.log("[Auth] Minecraft authenticated, checking ownership...");

    // Step 5: Check Minecraft ownership
    const entitlementResponse = await fetch("https://api.minecraftservices.com/entitlements/mcstore", {
      headers: { Authorization: `Bearer ${mcData.access_token}` },
    });

    const entitlementData = await entitlementResponse.json() as { items?: { name: string }[] };

    if (!entitlementData.items || entitlementData.items.length === 0) {
      return { status: "error", error: "บัญชีนี้ไม่มี Minecraft - กรุณาซื้อเกมก่อน" };
    }

    console.log("[Auth] Minecraft ownership verified, getting profile...");

    // Step 6: Get Minecraft profile
    const profileResponse = await fetch("https://api.minecraftservices.com/minecraft/profile", {
      headers: { Authorization: `Bearer ${mcData.access_token}` },
    });

    const profileData = await profileResponse.json() as {
      id?: string;
      name?: string;
      error?: string;
    };

    if (!profileResponse.ok || !profileData.id || !profileData.name) {
      return { status: "error", error: "Failed to get Minecraft profile" };
    }

    console.log("[Auth] Successfully authenticated:", profileData.name);

    // Step 7: Save session
    const { loginMicrosoft } = await import("./auth.js");
    loginMicrosoft(profileData.name, profileData.id, mcData.access_token);

    // Notify renderer
    if (mainWindow) {
      mainWindow.webContents.send("auth-callback", {
        accessToken: mcData.access_token,
        uuid: profileData.id,
        username: profileData.name,
        type: "microsoft",
      });
    }

    return {
      status: "success",
      session: {
        username: profileData.name,
        uuid: profileData.id,
        accessToken: mcData.access_token,
      },
    };
  } catch (error: any) {
    console.error("[Auth] Device code poll error:", error);
    return { status: "error", error: error.message || "Network error" };
  }
});

// ----------------------------------------
// CatID Authentication Handlers
// ----------------------------------------

// ml-api URL for CatID authentication
const ML_API_URL = process.env.ML_API_URL || "https://api.reality.notpumpkins.com";

/**
 * auth-catid-login - Login with CatID (username/password)
 */
ipcMain.handle("auth-catid-login", async (_event, username: string, password: string): Promise<{
  ok: boolean;
  session?: {
    username: string;
    uuid: string;
    token: string;
  };
  error?: string;
}> => {
  console.log("[Auth] CatID login attempt for:", username);

  try {
    const response = await fetch(`${ML_API_URL}/auth/catid/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json() as {
      token?: string;
      user?: {
        id: number;
        username: string;
        minecraftUsername?: string;
      };
      message?: string;
    };

    if (!response.ok || !data.token) {
      return {
        ok: false,
        error: data.message || "เข้าสู่ระบบไม่สำเร็จ",
      };
    }

    console.log("[Auth] CatID login successful:", data.user?.username);

    // Create session with CatID info
    // Use username as display name and generate a UUID for offline play
    const displayName = data.user?.minecraftUsername || data.user?.username || username;
    const uuid = `catid-${data.user?.id || Date.now()}`;

    // Save session using auth module
    const { loginMicrosoft } = await import("./auth.js");
    // Reuse loginMicrosoft but mark as CatID type in the session
    loginMicrosoft(displayName, uuid, data.token);

    // Notify renderer
    if (mainWindow) {
      mainWindow.webContents.send("auth-callback", {
        token: data.token,
        uuid,
        username: displayName,
        type: "catid",
      });
    }

    return {
      ok: true,
      session: {
        username: displayName,
        uuid,
        token: data.token,
      },
    };
  } catch (error: any) {
    console.error("[Auth] CatID login error:", error);
    return {
      ok: false,
      error: error.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ",
    };
  }
});

/**
 * auth-catid-register - Register new CatID account
 */
ipcMain.handle("auth-catid-register", async (_event, username: string, email: string, password: string): Promise<{
  ok: boolean;
  error?: string;
}> => {
  console.log("[Auth] CatID register attempt for:", username);

  try {
    const response = await fetch(`${ML_API_URL}/auth/catid/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await response.json() as {
      message?: string;
      userId?: number;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: data.message || "สมัครสมาชิกไม่สำเร็จ",
      };
    }

    console.log("[Auth] CatID register successful:", username);

    return { ok: true };
  } catch (error: any) {
    console.error("[Auth] CatID register error:", error);
    return {
      ok: false,
      error: error.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ",
    };
  }
});

/**
 * auth-offline-login - Login with offline account (username only)
 */
ipcMain.handle("auth-offline-login", async (_event, username: string): Promise<{
  ok: boolean;
  session?: { username: string; uuid: string };
  error?: string;
}> => {
  console.log("[Auth] Offline login attempt for:", username);

  if (!username || username.trim().length < 1) {
    return {
      ok: false,
      error: "กรุณาใส่ชื่อผู้ใช้",
    };
  }

  if (username.length > 16) {
    return {
      ok: false,
      error: "ชื่อผู้ใช้ต้องไม่เกิน 16 ตัวอักษร",
    };
  }

  try {
    const session = loginOffline(username.trim());
    console.log("[Auth] Offline login successful:", session.username);

    return {
      ok: true,
      session: {
        username: session.username,
        uuid: session.uuid,
      },
    };
  } catch (error: any) {
    console.error("[Auth] Offline login error:", error);
    return {
      ok: false,
      error: error.message || "เกิดข้อผิดพลาด",
    };
  }
});

// ----------------------------------------
// Auto Update Handlers
// ----------------------------------------

/**
 * check-for-updates - ตรวจสอบ update ใหม่
 */
ipcMain.handle("check-for-updates", async (): Promise<void> => {
  if (!isDev) {
    await autoUpdater.checkForUpdates();
  }
});

/**
 * download-update - ดาวน์โหลด update
 */
ipcMain.handle("download-update", async (): Promise<void> => {
  if (!isDev) {
    await autoUpdater.downloadUpdate();
  }
});

/**
 * install-update - ติดตั้ง update และ restart app
 */
ipcMain.handle("install-update", async (): Promise<void> => {
  if (!isDev) {
    autoUpdater.quitAndInstall();
  }
});

/**
 * get-app-version - ดึงเวอร์ชันของ app
 */
ipcMain.handle("get-app-version", async (): Promise<string> => {
  return app.getVersion();
});

// ----------------------------------------
// Window Control Handlers - ควบคุมหน้าต่าง
// ----------------------------------------

/**
 * window-minimize - ย่อหน้าต่าง
 */
ipcMain.handle("window-minimize", async (): Promise<void> => {
  if (mainWindow) mainWindow.minimize();
});

/**
 * window-maximize - ขยายหน้าต่าง/คืนค่า
 */
ipcMain.handle("window-maximize", async (): Promise<void> => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

/**
 * window-close - ปิดหน้าต่าง
 * - ถ้าเกมยังรันอยู่ → ซ่อน Launcher ไว้เบื้องหลัง
 * - ถ้าไม่มีเกมรัน → ปิด Launcher จริง
 */
ipcMain.handle("window-close", async (): Promise<void> => {
  if (isGameRunning()) {
    // Game is running - hide launcher to background
    if (mainWindow) {
      mainWindow.hide();
      console.log("[Window] Game is running, hiding to background");
    }
  } else {
    // No game running - quit launcher completely
    app.quit();
  }
});

/**
 * window-is-maximized - ตรวจสอบว่าหน้าต่างขยายอยู่หรือไม่
 */
ipcMain.handle("window-is-maximized", async (): Promise<boolean> => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// ----------------------------------------
// Modrinth Handlers - ค้นหาและดาวน์โหลด modpacks
// ----------------------------------------

/**
 * modrinth-search - ค้นหา modpacks
 */
ipcMain.handle("modrinth-search", async (_event, filters: SearchFilters) => {
  try {
    return await searchModpacks(filters);
  } catch (error: any) {
    console.error("[Modrinth] Search error:", error);
    throw error;
  }
});

/**
 * modrinth-get-project - ดึงรายละเอียด modpack
 */
ipcMain.handle("modrinth-get-project", async (_event, idOrSlug: string) => {
  try {
    return await getProject(idOrSlug);
  } catch (error: any) {
    console.error("[Modrinth] Get project error:", error);
    throw error;
  }
});

/**
 * modrinth-get-versions - ดึง versions ของ modpack
 */
ipcMain.handle("modrinth-get-versions", async (_event, idOrSlug: string) => {
  try {
    return await getProjectVersions(idOrSlug);
  } catch (error: any) {
    console.error("[Modrinth] Get versions error:", error);
    throw error;
  }
});

/**
 * modrinth-get-version - ดึง version เดียว
 */
ipcMain.handle("modrinth-get-version", async (_event, versionId: string) => {
  try {
    return await getVersion(versionId);
  } catch (error: any) {
    console.error("[Modrinth] Get version error:", error);
    throw error;
  }
});

/**
 * modrinth-download - ดาวน์โหลด modpack
 */
ipcMain.handle("modrinth-download", async (_event, versionId: string) => {
  try {
    const version = await getVersion(versionId);

    const result = await downloadModpack(version, (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send("modrinth-download-progress", progress);
      }
    });

    return { ok: true, path: result };
  } catch (error: any) {
    console.error("[Modrinth] Download error:", error);
    return { ok: false, error: error.message };
  }
});

/**
 * modrinth-get-popular - ดึง modpacks ยอดนิยม
 */
ipcMain.handle("modrinth-get-popular", async (_event, limit: number = 10) => {
  try {
    return await getPopularModpacks(limit);
  } catch (error: any) {
    console.error("[Modrinth] Get popular error:", error);
    throw error;
  }
});

/**
 * modrinth-get-game-versions - ดึง Minecraft versions
 */
ipcMain.handle("modrinth-get-game-versions", async () => {
  try {
    return await getGameVersions();
  } catch (error: any) {
    console.error("[Modrinth] Get game versions error:", error);
    throw error;
  }
});

/**
 * modrinth-get-loaders - ดึง loaders (Fabric, Forge, etc.)
 */
ipcMain.handle("modrinth-get-loaders", async () => {
  try {
    return await getLoaders();
  } catch (error: any) {
    console.error("[Modrinth] Get loaders error:", error);
    throw error;
  }
});

/**
 * modrinth-get-installed - ดึง modpacks ที่ติดตั้งแล้ว
 */
ipcMain.handle("modrinth-get-installed", async () => {
  try {
    return await getInstalledModpacks();
  } catch (error: any) {
    console.error("[Modrinth] Get installed error:", error);
    throw error;
  }
});

/**
 * modrinth-delete-modpack - ลบ modpack ที่ติดตั้ง
 */
ipcMain.handle("modrinth-delete-modpack", async (_event, modpackPath: string) => {
  try {
    return await deleteInstalledModpack(modpackPath);
  } catch (error: any) {
    console.error("[Modrinth] Delete modpack error:", error);
    return false;
  }
});

// ----------------------------------------
// Instance Management Handlers
// ----------------------------------------

/**
 * instances-list - ดึงรายการ instances ทั้งหมด
 * Also auto-downloads missing icons for modpack instances in background
 */
ipcMain.handle("instances-list", async (): Promise<GameInstance[]> => {
  return getInstances();
});

/**
 * instances-create - สร้าง instance ใหม่
 */
ipcMain.handle(
  "instances-create",
  async (_event, options: CreateInstanceOptions): Promise<GameInstance> => {
    return createInstance(options);
  }
);

/**
 * instances-get - ดึง instance เดียว
 */
ipcMain.handle(
  "instances-get",
  async (_event, id: string): Promise<GameInstance | null> => {
    return getInstance(id);
  }
);

/**
 * instances-update - อัพเดท instance
 */
ipcMain.handle(
  "instances-update",
  async (
    _event,
    id: string,
    updates: UpdateInstanceOptions
  ): Promise<GameInstance | null> => {
    return updateInstance(id, updates);
  }
);

/**
 * instances-delete - ลบ instance
 */
ipcMain.handle("instances-delete", async (_event, id: string): Promise<boolean> => {
  return deleteInstance(id);
});

/**
 * instances-duplicate - Clone instance
 */
ipcMain.handle(
  "instances-duplicate",
  async (_event, id: string): Promise<GameInstance | null> => {
    return duplicateInstance(id);
  }
);

/**
 * instances-open-folder - เปิดโฟลเดอร์ instance ใน File Explorer
 */
ipcMain.handle("instances-open-folder", async (_event, id: string): Promise<void> => {
  const dir = getInstanceDir(id);
  await shell.openPath(dir);
});

/**
 * instances-launch - Launch game from instance
 * 
 * @param id - Instance ID
 * @returns LaunchResult
 */
ipcMain.handle("instances-launch", async (_event, id: string) => {
  const instance = getInstance(id);
  if (!instance) {
    return { ok: false, message: "Instance ไม่พบ" };
  }

  const session = getSession();
  if (!session) {
    return { ok: false, message: "กรุณา login ก่อนเล่นเกม" };
  }

  if (isGameRunning()) {
    return { ok: false, message: "เกมกำลังรันอยู่แล้ว" };
  }

  const config = getConfig();
  const ramMB = instance.ramMB || config.ramMB || 4096;

  console.log("[Launch Instance] Starting:", {
    instance: instance.name,
    version: instance.minecraftVersion,
    username: session.username,
    ramMB,
    gameDir: instance.gameDirectory,
  });

  // Record start time for play time tracking
  const startTime = Date.now();

  // Update lastPlayedAt immediately
  updateInstance(id, { lastPlayedAt: new Date().toISOString() });

  // Set up progress callback
  setProgressCallback((progress) => {
    if (mainWindow) {
      mainWindow.webContents.send("launch-progress", progress);
    }
  });

  // Set up game log callback to send logs to renderer
  setGameLogCallback((level, message) => {
    if (mainWindow) {
      mainWindow.webContents.send("game-log", { level, message });
    }
  });

  // Launch the game
  const result = await launchGame({
    version: instance.minecraftVersion,
    username: session.username,
    uuid: session.uuid,
    accessToken: session.accessToken,
    ramMB,
    javaPath: instance.javaPath || config.javaPath,
    gameDirectory: instance.gameDirectory,
    loader: instance.loader !== "vanilla" ? {
      type: instance.loader,
      build: instance.loaderVersion || "latest",
      enable: true,
    } : undefined,
  });

  // Clear progress callback
  setProgressCallback(null);

  // If launch was successful, set up play time tracking on game exit
  if (result.ok) {
    // Max timeout: 24 hours - prevents infinite interval if game state gets stuck
    const MAX_PLAY_TIME_MS = 24 * 60 * 60 * 1000;
    let intervalCleared = false;

    const clearPlayTimeTracking = () => {
      if (!intervalCleared) {
        intervalCleared = true;
        clearInterval(checkInterval);
        clearTimeout(maxTimeout);
      }
    };

    // Safety timeout to prevent memory leak
    const maxTimeout = setTimeout(() => {
      if (!intervalCleared) {
        console.warn("[Launch Instance] Max play time reached, clearing interval");
        clearPlayTimeTracking();
      }
    }, MAX_PLAY_TIME_MS);

    // Listen for game exit to update play time
    const checkInterval = setInterval(() => {
      if (!isGameRunning()) {
        clearPlayTimeTracking();
        const playTimeMinutes = Math.round((Date.now() - startTime) / 60000);
        if (playTimeMinutes > 0) {
          const currentInstance = getInstance(id);
          if (currentInstance) {
            updateInstance(id, {
              totalPlayTime: currentInstance.totalPlayTime + playTimeMinutes,
            });
            console.log(`[Launch Instance] Play time recorded: ${playTimeMinutes} minutes`);
          }
        }
      }
    }, 5000); // Check every 5 seconds
  }

  return result;
});

// ----------------------------------------
// Content Download Handlers
// ----------------------------------------

/**
 * content-download-to-instance - Download mod/shader/resourcepack to instance
 */
ipcMain.handle(
  "content-download-to-instance",
  async (
    _event,
    options: { projectId: string; versionId: string; instanceId: string; contentType: string }
  ) => {
    try {
      const result = await downloadContentToInstance(
        {
          projectId: options.projectId,
          versionId: options.versionId,
          instanceId: options.instanceId,
          contentType: options.contentType as ContentType,
        },
        (progress) => {
          if (mainWindow) {
            mainWindow.webContents.send("content-download-progress", progress);
          }
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

// ----------------------------------------
// Server Status Handlers
// ----------------------------------------

// Note: import moved to top of file

/**
 * ping-server - ตรวจสอบสถานะของ Minecraft server
 */
ipcMain.handle(
  "ping-server",
  async (_event, options: { host: string; port?: number; timeout?: number }): Promise<ServerStatus> => {
    return pingServer(options);
  }
);

/**
 * is-server-online - ตรวจสอบว่า server ออนไลน์หรือไม่ (เร็วกว่า ping-server)
 */
ipcMain.handle(
  "is-server-online",
  async (_event, host: string, port?: number): Promise<boolean> => {
    return isServerOnline(host, port);
  }
);

// ----------------------------------------
// Modpack Installer Handlers
// ----------------------------------------

/**
 * modpack-install - ติดตั้ง modpack จากไฟล์ .mrpack
 */
ipcMain.handle("modpack-install", async (_event, mrpackPath: string) => {
  try {
    const result = await installModpack(mrpackPath, (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send("modpack-install-progress", progress);
      }
    });
    return result;
  } catch (error: any) {
    console.error("[Modpack] Install error:", error);
    return { ok: false, error: error.message };
  }
});

/**
 * modpack-install-from-modrinth - ดาวน์โหลดและติดตั้ง modpack จาก Modrinth
 */
ipcMain.handle("modpack-install-from-modrinth", async (_event, versionId: string) => {
  console.log("[Modpack] Starting install from Modrinth, versionId:", versionId);

  try {
    // Step 1: Download the modpack
    console.log("[Modpack] Step 1: Downloading modpack...");
    if (mainWindow) {
      mainWindow.webContents.send("modpack-install-progress", {
        stage: "downloading",
        message: "กำลังดาวน์โหลด modpack...",
      });
    }

    const version = await getVersion(versionId);
    console.log("[Modpack] Got version info:", version.name, version.version_number);

    const mrpackPath = await downloadModpack(version, (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send("modpack-install-progress", {
          stage: "downloading",
          message: `กำลังดาวน์โหลด: ${progress.filename}`,
          percent: progress.percent,
        });
      }
    });
    console.log("[Modpack] Download complete, mrpackPath:", mrpackPath);

    // Step 2: Install the modpack
    console.log("[Modpack] Step 2: Installing modpack...");
    if (mainWindow) {
      mainWindow.webContents.send("modpack-install-progress", {
        stage: "extracting",
        message: "กำลังติดตั้ง modpack...",
      });
    }

    const result = await installModpack(mrpackPath, (progress) => {
      console.log("[Modpack] Install progress:", progress);
      if (mainWindow) {
        mainWindow.webContents.send("modpack-install-progress", progress);
      }
    });

    console.log("[Modpack] Install result:", result);

    if (!result.ok) {
      console.error("[Modpack] Installation failed:", result.error);
    } else {
      console.log("[Modpack] Installation successful, instance:", result.instance?.name);

      // Step 3: Download icon from Modrinth project (if available)
      try {
        if (result.instance) {
          // Get project info to get icon URL
          const { getProject, downloadFile: dlFile } = await import("./modrinth.js");
          const { getInstanceIconPath } = await import("./instances.js");

          const projectId = version.project_id;
          if (projectId) {
            const project = await getProject(projectId);
            if (project.icon_url) {
              console.log("[Modpack] Downloading icon from:", project.icon_url);
              const iconPath = getInstanceIconPath(result.instance.id);
              await dlFile(project.icon_url, iconPath);
              console.log("[Modpack] Icon saved to:", iconPath);
            }
          }
        }
      } catch (iconError) {
        console.warn("[Modpack] Icon download warning:", iconError);
        // Non-fatal - installation was successful
      }

      // Step 4: Cleanup - delete the downloaded .mrpack file and temp folder
      try {
        const mrpackDir = path.dirname(mrpackPath);
        if (fs.existsSync(mrpackPath)) {
          fs.unlinkSync(mrpackPath);
          console.log("[Modpack] Deleted mrpack file:", mrpackPath);
        }
        // Delete the temp directory if it's empty or only contains this modpack's files
        if (fs.existsSync(mrpackDir)) {
          const remainingFiles = fs.readdirSync(mrpackDir);
          if (remainingFiles.length === 0) {
            fs.rmdirSync(mrpackDir);
            console.log("[Modpack] Deleted temp directory:", mrpackDir);
          }
        }
      } catch (cleanupError) {
        console.warn("[Modpack] Cleanup warning:", cleanupError);
        // Non-fatal - installation was successful
      }
    }

    return result;
  } catch (error: any) {
    console.error("[Modpack] Install from Modrinth error:", error);
    console.error("[Modpack] Error stack:", error.stack);
    return { ok: false, error: error.message || "Installation failed" };
  }
});

/**
 * modpack-check-conflicts - ตรวจสอบ mod ที่ขัดแย้งกันใน instance
 */
ipcMain.handle("modpack-check-conflicts", async (_event, instanceId: string) => {
  const instance = getInstance(instanceId);
  if (!instance) {
    return [];
  }

  const modsDir = path.join(instance.gameDirectory, "mods");
  return detectModConflicts(modsDir);
});

/**
 * modpack-parse-info - อ่านข้อมูล modpack จากไฟล์ .mrpack
 */
ipcMain.handle("modpack-parse-info", async (_event, mrpackPath: string) => {
  try {
    return await parseModpackIndex(mrpackPath);
  } catch (error: any) {
    console.error("[Modpack] Parse error:", error);
    return null;
  }
});

// ========================================
// Instance Content Management IPC Handlers
// ========================================

interface ModInfo {
  filename: string;
  name: string;
  displayName: string;
  author: string;
  description: string;
  icon: string | null; // Base64 data URL
  enabled: boolean;
  size: number;
  modifiedAt: string;
}

// Cache for mod metadata to avoid re-parsing JAR files
// Key: filepath + size + mtime, Value: extracted metadata
interface ModMetadataCache {
  displayName?: string;
  author?: string;
  description?: string;
  icon?: string;
}
const modMetadataCache = new Map<string, ModMetadataCache>();

// Generate cache key from file stats
function getModCacheKey(filepath: string, size: number, mtime: string): string {
  return `${filepath}|${size}|${mtime}`;
}

// Helper to extract mod info from JAR file (with caching)
async function extractModInfo(jarPath: string): Promise<{ displayName?: string; author?: string; description?: string; icon?: string }> {
  try {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(jarPath);

    // Try to read fabric.mod.json (Fabric/Quilt mods)
    const fabricEntry = zip.getEntry("fabric.mod.json");
    if (fabricEntry) {
      const content = fabricEntry.getData().toString("utf8");
      const json = JSON.parse(content);

      let icon: string | undefined;
      if (json.icon) {
        const iconEntry = zip.getEntry(json.icon);
        if (iconEntry) {
          const iconData = iconEntry.getData();
          const mimeType = json.icon.endsWith(".png") ? "image/png" : "image/jpeg";
          icon = `data:${mimeType};base64,${iconData.toString("base64")}`;
        }
      }

      return {
        displayName: json.name,
        author: Array.isArray(json.authors)
          ? json.authors.map((a: any) => typeof a === "string" ? a : a.name).join(", ")
          : json.authors,
        description: json.description,
        icon,
      };
    }

    // Try to read mods.toml (Forge/NeoForge mods)
    const forgeEntry = zip.getEntry("META-INF/mods.toml");
    if (forgeEntry) {
      const content = forgeEntry.getData().toString("utf8");
      // Simple TOML parsing for displayName and authors
      const displayNameMatch = content.match(/displayName\s*=\s*"([^"]+)"/);
      const authorsMatch = content.match(/authors\s*=\s*"([^"]+)"/);
      const descMatch = content.match(/description\s*=\s*'''([^']+)'''/s) || content.match(/description\s*=\s*"([^"]+)"/);

      // Try to find logo
      const logoMatch = content.match(/logoFile\s*=\s*"([^"]+)"/);
      let icon: string | undefined;
      if (logoMatch) {
        const iconEntry = zip.getEntry(logoMatch[1]);
        if (iconEntry) {
          const iconData = iconEntry.getData();
          icon = `data:image/png;base64,${iconData.toString("base64")}`;
        }
      }

      return {
        displayName: displayNameMatch?.[1],
        author: authorsMatch?.[1],
        description: descMatch?.[1]?.trim(),
        icon,
      };
    }

    return {};
  } catch (error) {
    // Silently fail and return empty - jar might be corrupted or encrypted
    return {};
  }
}

/**
 * instance-list-mods - List all mods in instance/mods folder
 */
ipcMain.handle("instance-list-mods", async (_event, instanceId: string) => {
  const instance = getInstance(instanceId);
  if (!instance) {
    return { ok: false, error: "Instance not found", mods: [] };
  }

  const modsDir = path.join(instance.gameDirectory, "mods");

  try {
    if (!fs.existsSync(modsDir)) {
      return { ok: true, mods: [] };
    }

    const files = fs.readdirSync(modsDir);

    // Filter jar files first
    const jarFiles = files.filter(file => file.endsWith(".jar") || file.endsWith(".jar.disabled"));

    // Collect uncached files for background loading
    const uncachedFiles: string[] = [];

    // Process all mods SYNCHRONOUSLY for instant display (cache only)
    const mods: ModInfo[] = jarFiles.map((file) => {
      const filePath = path.join(modsDir, file);
      const stats = fs.statSync(filePath);
      const mtime = stats.mtime.toISOString();

      // Get display name (remove .jar.disabled or .jar extension)
      let name = file;
      let enabled = true;

      if (file.endsWith(".jar.disabled")) {
        name = file.replace(".jar.disabled", "");
        enabled = false;
      } else if (file.endsWith(".jar")) {
        name = file.replace(".jar", "");
      }

      // Use cache ONLY - don't wait for JAR parsing
      const cacheKey = getModCacheKey(filePath, stats.size, mtime);
      const metadata = modMetadataCache.get(cacheKey);

      if (!metadata) {
        uncachedFiles.push(file);
      }

      return {
        filename: file,
        name,
        displayName: metadata?.displayName || name,
        author: metadata?.author || "",
        description: metadata?.description || "",
        icon: metadata?.icon || null,
        enabled,
        size: stats.size,
        modifiedAt: mtime,
      } as ModInfo;
    });

    // Start background loading of uncached mods (don't wait)
    if (uncachedFiles.length > 0) {
      Promise.all(uncachedFiles.map(async (file) => {
        const filePath = path.join(modsDir, file);
        const stats = fs.statSync(filePath);
        const cacheKey = getModCacheKey(filePath, stats.size, stats.mtime.toISOString());
        const metadata = await extractModInfo(filePath);
        modMetadataCache.set(cacheKey, metadata);
      })).catch(err => console.error("[Instance] Background mod loading error:", err));
    }

    // Sort by displayName
    mods.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return { ok: true, mods };
  } catch (error: any) {
    console.error("[Instance] List mods error:", error);
    return { ok: false, error: error.message, mods: [] };
  }
});
/**
 * instance-get-mod-metadata - Get metadata for a single mod (for lazy loading)
 */
ipcMain.handle("instance-get-mod-metadata", async (_event, instanceId: string, filename: string) => {
  const instance = getInstance(instanceId);
  if (!instance) {
    return { ok: false, error: "Instance not found" };
  }

  const modsDir = path.join(instance.gameDirectory, "mods");
  const filePath = path.join(modsDir, filename);

  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: "Mod file not found" };
    }

    const stats = fs.statSync(filePath);
    const mtime = stats.mtime.toISOString();
    const cacheKey = getModCacheKey(filePath, stats.size, mtime);

    // Check cache first
    let metadata = modMetadataCache.get(cacheKey);

    if (!metadata) {
      // Extract and cache
      metadata = await extractModInfo(filePath);
      modMetadataCache.set(cacheKey, metadata);
    }

    return {
      ok: true,
      metadata: {
        displayName: metadata.displayName || null,
        author: metadata.author || null,
        description: metadata.description || null,
        icon: metadata.icon || null,
      }
    };
  } catch (error: any) {
    console.error("[Instance] Get mod metadata error:", error);
    return { ok: false, error: error.message };
  }
});

/**
 * instance-toggle-mod - Enable/disable mod by renaming .jar <-> .jar.disabled
 */
ipcMain.handle("instance-toggle-mod", async (_event, instanceId: string, filename: string) => {
  const instance = getInstance(instanceId);
  if (!instance) {
    return { ok: false, error: "Instance not found" };
  }

  const modsDir = path.join(instance.gameDirectory, "mods");
  const filePath = path.join(modsDir, filename);

  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: "Mod file not found" };
    }

    let newFilename: string;
    let enabled: boolean;

    if (filename.endsWith(".jar.disabled")) {
      // Enable: remove .disabled
      newFilename = filename.replace(".jar.disabled", ".jar");
      enabled = true;
    } else if (filename.endsWith(".jar")) {
      // Disable: add .disabled
      newFilename = filename + ".disabled";
      enabled = false;
    } else {
      return { ok: false, error: "Invalid mod file" };
    }

    const newFilePath = path.join(modsDir, newFilename);
    fs.renameSync(filePath, newFilePath);

    console.log(`[Instance] Mod ${enabled ? "enabled" : "disabled"}: ${filename} -> ${newFilename}`);
    return { ok: true, newFilename, enabled };
  } catch (error: any) {
    console.error("[Instance] Toggle mod error:", error);
    return { ok: false, error: error.message };
  }
});

/**
 * instance-delete-mod - Delete mod file from instance
 */
ipcMain.handle("instance-delete-mod", async (_event, instanceId: string, filename: string) => {
  const instance = getInstance(instanceId);
  if (!instance) {
    return { ok: false, error: "Instance not found" };
  }

  const modsDir = path.join(instance.gameDirectory, "mods");
  const filePath = path.join(modsDir, filename);

  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: "Mod file not found" };
    }

    fs.unlinkSync(filePath);
    console.log(`[Instance] Mod deleted: ${filename}`);
    return { ok: true };
  } catch (error: any) {
    console.error("[Instance] Delete mod error:", error);
    return { ok: false, error: error.message };
  }
});

/**
 * browse-icon - Open file dialog to select instance icon image
 * Returns base64 data URL of selected image
 */
ipcMain.handle("browse-icon", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "ico"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  try {
    const filePath = result.filePaths[0];
    const fileData = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".ico": "image/x-icon"
    };

    const mimeType = mimeTypes[ext] || "image/png";
    const base64 = fileData.toString("base64");

    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error("[browse-icon] Error reading file:", error);
    return null;
  }
});

/**
 * instance-list-resourcepacks - List resource packs in instance with icons
 */
ipcMain.handle("instance-list-resourcepacks", async (_event, instanceId: string) => {
  const instance = getInstance(instanceId);
  if (!instance) {
    return { ok: false, error: "Instance not found" };
  }

  const resourcepacksDir = path.join(instance.gameDirectory, "resourcepacks");

  if (!fs.existsSync(resourcepacksDir)) {
    return { ok: true, items: [] };
  }

  try {
    const files = fs.readdirSync(resourcepacksDir);
    const items = [];

    for (const file of files) {
      // Support .zip, .zip.disabled, and directories
      if (!file.endsWith(".zip") && !file.endsWith(".zip.disabled") && !fs.statSync(path.join(resourcepacksDir, file)).isDirectory()) {
        continue;
      }

      const filePath = path.join(resourcepacksDir, file);
      const stats = fs.statSync(filePath);

      // Determine enabled state
      let enabled = true;
      let displayName = file;

      if (file.endsWith(".zip.disabled")) {
        enabled = false;
        displayName = file.replace(".zip.disabled", "");
      } else if (file.endsWith(".zip")) {
        displayName = file.replace(".zip", "");
      }

      // Try to extract pack.png icon
      let icon: string | null = null;

      if (file.endsWith(".zip") || file.endsWith(".zip.disabled")) {
        try {
          const AdmZip = require("adm-zip");
          const zip = new AdmZip(filePath);
          const packPng = zip.getEntry("pack.png");
          if (packPng) {
            const iconData = packPng.getData();
            icon = `data:image/png;base64,${iconData.toString("base64")}`;
          }
        } catch (e) {
          // Ignore zip errors
        }
      } else if (stats.isDirectory()) {
        // For directories, try to read pack.png directly
        const packPngPath = path.join(filePath, "pack.png");
        if (fs.existsSync(packPngPath)) {
          try {
            const iconData = fs.readFileSync(packPngPath);
            icon = `data:image/png;base64,${iconData.toString("base64")}`;
          } catch (e) {
            // Ignore read errors
          }
        }
      }

      items.push({
        filename: file,
        name: displayName,
        isDirectory: stats.isDirectory(),
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        enabled,
        icon
      });
    }

    return { ok: true, items };
  } catch (error: any) {
    console.error("[Instance] List resourcepacks error:", error);
    return { ok: false, error: error.message };
  }
});

/**
 * instance-list-shaders - List shader packs in instance with icons
 */
ipcMain.handle("instance-list-shaders", async (_event, instanceId: string) => {
  const instance = getInstance(instanceId);
  if (!instance) {
    return { ok: false, error: "Instance not found" };
  }

  const shadersDir = path.join(instance.gameDirectory, "shaderpacks");

  if (!fs.existsSync(shadersDir)) {
    return { ok: true, items: [] };
  }

  try {
    const files = fs.readdirSync(shadersDir);
    const items = [];

    for (const file of files) {
      // Support .zip, .zip.disabled, and directories
      if (!file.endsWith(".zip") && !file.endsWith(".zip.disabled") && !fs.statSync(path.join(shadersDir, file)).isDirectory()) {
        continue;
      }

      const filePath = path.join(shadersDir, file);
      const stats = fs.statSync(filePath);

      // Determine enabled state
      let enabled = true;
      let displayName = file;

      if (file.endsWith(".zip.disabled")) {
        enabled = false;
        displayName = file.replace(".zip.disabled", "");
      } else if (file.endsWith(".zip")) {
        displayName = file.replace(".zip", "");
      }

      // Try to extract shaders/logo.png or just use null
      let icon: string | null = null;

      if (file.endsWith(".zip") || file.endsWith(".zip.disabled")) {
        try {
          const AdmZip = require("adm-zip");
          const zip = new AdmZip(filePath);
          // Try common shader icon locations
          const possibleIcons = ["shaders/logo.png", "logo.png", "pack.png"];
          for (const iconPath of possibleIcons) {
            const iconEntry = zip.getEntry(iconPath);
            if (iconEntry) {
              const iconData = iconEntry.getData();
              icon = `data:image/png;base64,${iconData.toString("base64")}`;
              break;
            }
          }
        } catch (e) {
          // Ignore zip errors
        }
      } else if (stats.isDirectory()) {
        // For directories, try to read logo.png
        const possiblePaths = [
          path.join(filePath, "shaders", "logo.png"),
          path.join(filePath, "logo.png"),
          path.join(filePath, "pack.png")
        ];
        for (const iconPath of possiblePaths) {
          if (fs.existsSync(iconPath)) {
            try {
              const iconData = fs.readFileSync(iconPath);
              icon = `data:image/png;base64,${iconData.toString("base64")}`;
              break;
            } catch (e) {
              // Ignore read errors
            }
          }
        }
      }

      items.push({
        filename: file,
        name: displayName,
        isDirectory: stats.isDirectory(),
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        enabled,
        icon
      });
    }

    return { ok: true, items };
  } catch (error: any) {
    console.error("[Instance] List shaders error:", error);
    return { ok: false, error: error.message };
  }
});

/**
 * instance-list-datapacks - List datapacks from instance root and all worlds
 */
ipcMain.handle("instance-list-datapacks", async (_event, instanceId: string) => {
  const instance = getInstance(instanceId);
  if (!instance) {
    return { ok: false, error: "Instance not found" };
  }

  try {
    const items: any[] = [];

    // Helper function to process datapacks from a directory
    const processDatapacksDir = (datapacksDir: string, worldName: string) => {
      if (!fs.existsSync(datapacksDir)) return;

      const files = fs.readdirSync(datapacksDir);

      for (const file of files) {
        const filePath = path.join(datapacksDir, file);
        let isDir = false;

        try {
          isDir = fs.statSync(filePath).isDirectory();
        } catch {
          continue;
        }

        // Support .zip, .zip.disabled, .jar, .jar.disabled, and directories
        if (!file.endsWith(".zip") && !file.endsWith(".zip.disabled") &&
          !file.endsWith(".jar") && !file.endsWith(".jar.disabled") && !isDir) {
          continue;
        }

        const stats = fs.statSync(filePath);

        // Determine enabled state
        let enabled = true;
        let displayName = file;

        if (file.endsWith(".zip.disabled") || file.endsWith(".jar.disabled")) {
          enabled = false;
          displayName = file.replace(".zip.disabled", "").replace(".jar.disabled", "");
        } else if (file.endsWith(".zip")) {
          displayName = file.replace(".zip", "");
        } else if (file.endsWith(".jar")) {
          displayName = file.replace(".jar", "");
        }

        // Try to extract pack.png icon
        let icon: string | null = null;

        if (file.endsWith(".zip") || file.endsWith(".zip.disabled") ||
          file.endsWith(".jar") || file.endsWith(".jar.disabled")) {
          try {
            const AdmZip = require("adm-zip");
            const zip = new AdmZip(filePath);
            const packPng = zip.getEntry("pack.png");
            if (packPng) {
              const iconData = packPng.getData();
              icon = `data:image/png;base64,${iconData.toString("base64")}`;
            }
          } catch (e) {
            // Ignore zip errors
          }
        } else if (isDir) {
          const packPngPath = path.join(filePath, "pack.png");
          if (fs.existsSync(packPngPath)) {
            try {
              const iconData = fs.readFileSync(packPngPath);
              icon = `data:image/png;base64,${iconData.toString("base64")}`;
            } catch (e) {
              // Ignore read errors
            }
          }
        }

        items.push({
          filename: file,
          name: displayName,
          worldName,
          isDirectory: isDir,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
          enabled,
          icon
        });
      }
    };

    // 1. Check instance root datapacks folder
    const rootDatapacksDir = path.join(instance.gameDirectory, "datapacks");
    processDatapacksDir(rootDatapacksDir, "(Global)");

    // 2. Check per-world datapacks folders
    const savesDir = path.join(instance.gameDirectory, "saves");
    if (fs.existsSync(savesDir)) {
      const worlds = fs.readdirSync(savesDir);
      for (const worldName of worlds) {
        const worldPath = path.join(savesDir, worldName);
        try {
          if (!fs.statSync(worldPath).isDirectory()) continue;
          const datapacksDir = path.join(worldPath, "datapacks");
          processDatapacksDir(datapacksDir, worldName);
        } catch {
          continue;
        }
      }
    }

    return { ok: true, items };
  } catch (error: any) {
    console.error("[Instance] List datapacks error:", error);
    return { ok: false, error: error.message };
  }
});

/**
 * instance-toggle-datapack - Toggle datapack enabled/disabled
 */
ipcMain.handle("instance-toggle-datapack", async (_event, instanceId: string, worldName: string, filename: string) => {
  const instance = getInstance(instanceId);
  if (!instance) {
    return { ok: false, error: "Instance not found" };
  }

  // Determine path based on worldName
  let datapacksDir: string;
  if (worldName === "(Global)") {
    datapacksDir = path.join(instance.gameDirectory, "datapacks");
  } else {
    datapacksDir = path.join(instance.gameDirectory, "saves", worldName, "datapacks");
  }
  const filePath = path.join(datapacksDir, filename);

  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: "Datapack not found" };
    }

    let newFilename: string;
    let enabled: boolean;

    if (filename.endsWith(".zip.disabled")) {
      newFilename = filename.replace(".zip.disabled", ".zip");
      enabled = true;
    } else if (filename.endsWith(".jar.disabled")) {
      newFilename = filename.replace(".jar.disabled", ".jar");
      enabled = true;
    } else if (filename.endsWith(".zip")) {
      newFilename = filename + ".disabled";
      enabled = false;
    } else if (filename.endsWith(".jar")) {
      newFilename = filename + ".disabled";
      enabled = false;
    } else {
      return { ok: false, error: "Cannot toggle directories" };
    }

    const newPath = path.join(datapacksDir, newFilename);
    fs.renameSync(filePath, newPath);

    console.log(`[Instance] Datapack ${enabled ? "enabled" : "disabled"}: ${filename} -> ${newFilename}`);
    return { ok: true, newFilename, enabled };
  } catch (error: any) {
    console.error("[Instance] Toggle datapack error:", error);
    return { ok: false, error: error.message };
  }
});

/**
 * instance-delete-datapack - Delete datapack from world
 */
ipcMain.handle("instance-delete-datapack", async (_event, instanceId: string, worldName: string, filename: string) => {
  const instance = getInstance(instanceId);
  if (!instance) {
    return { ok: false, error: "Instance not found" };
  }

  // Determine path based on worldName
  let filePath: string;
  if (worldName === "(Global)") {
    filePath = path.join(instance.gameDirectory, "datapacks", filename);
  } else {
    filePath = path.join(instance.gameDirectory, "saves", worldName, "datapacks", filename);
  }

  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: "Datapack not found" };
    }

    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      fs.rmSync(filePath, { recursive: true });
    } else {
      fs.unlinkSync(filePath);
    }

    console.log(`[Instance] Datapack deleted: ${worldName}/${filename}`);
    return { ok: true };
  } catch (error: any) {
    console.error("[Instance] Delete datapack error:", error);
    return { ok: false, error: error.message };
  }
});

/**
 * instance-toggle-resourcepack - Toggle resource pack enabled/disabled
 */
ipcMain.handle("instance-toggle-resourcepack", async (_event, instanceId: string, filename: string) => {
  const instance = getInstance(instanceId);
  if (!instance) {
    return { ok: false, error: "Instance not found" };
  }

  const resourcepacksDir = path.join(instance.gameDirectory, "resourcepacks");
  const filePath = path.join(resourcepacksDir, filename);

  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: "Resource pack not found" };
    }

    let newFilename: string;
    let enabled: boolean;

    if (filename.endsWith(".zip.disabled")) {
      // Enable: remove .disabled
      newFilename = filename.replace(".zip.disabled", ".zip");
      enabled = true;
    } else if (filename.endsWith(".zip")) {
      // Disable: add .disabled
      newFilename = filename + ".disabled";
      enabled = false;
    } else {
      return { ok: false, error: "Cannot toggle directories" };
    }

    const newPath = path.join(resourcepacksDir, newFilename);
    fs.renameSync(filePath, newPath);

    console.log(`[Instance] Resource pack ${enabled ? "enabled" : "disabled"}: ${filename} -> ${newFilename}`);
    return { ok: true, newFilename, enabled };
  } catch (error: any) {
    console.error("[Instance] Toggle resourcepack error:", error);
    return { ok: false, error: error.message };
  }
});

/**
 * instance-toggle-shader - Toggle shader pack enabled/disabled
 */
ipcMain.handle("instance-toggle-shader", async (_event, instanceId: string, filename: string) => {
  const instance = getInstance(instanceId);
  if (!instance) {
    return { ok: false, error: "Instance not found" };
  }

  const shadersDir = path.join(instance.gameDirectory, "shaderpacks");
  const filePath = path.join(shadersDir, filename);

  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: "Shader pack not found" };
    }

    let newFilename: string;
    let enabled: boolean;

    if (filename.endsWith(".zip.disabled")) {
      // Enable: remove .disabled
      newFilename = filename.replace(".zip.disabled", ".zip");
      enabled = true;
    } else if (filename.endsWith(".zip")) {
      // Disable: add .disabled
      newFilename = filename + ".disabled";
      enabled = false;
    } else {
      return { ok: false, error: "Cannot toggle directories" };
    }

    const newPath = path.join(shadersDir, newFilename);
    fs.renameSync(filePath, newPath);

    console.log(`[Instance] Shader pack ${enabled ? "enabled" : "disabled"}: ${filename} -> ${newFilename}`);
    return { ok: true, newFilename, enabled };
  } catch (error: any) {
    console.error("[Instance] Toggle shader error:", error);
    return { ok: false, error: error.message };
  }
});

/**
 * instance-delete-resourcepack - Delete resource pack from instance
 */
ipcMain.handle("instance-delete-resourcepack", async (_event, instanceId: string, filename: string) => {
  const instance = getInstance(instanceId);
  if (!instance) {
    return { ok: false, error: "Instance not found" };
  }

  const filePath = path.join(instance.gameDirectory, "resourcepacks", filename);

  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: "Resource pack not found" };
    }

    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      fs.rmSync(filePath, { recursive: true });
    } else {
      fs.unlinkSync(filePath);
    }

    console.log(`[Instance] Resource pack deleted: ${filename}`);
    return { ok: true };
  } catch (error: any) {
    console.error("[Instance] Delete resourcepack error:", error);
    return { ok: false, error: error.message };
  }
});

/**
 * instance-delete-shader - Delete shader pack from instance
 */
ipcMain.handle("instance-delete-shader", async (_event, instanceId: string, filename: string) => {
  const instance = getInstance(instanceId);
  if (!instance) {
    return { ok: false, error: "Instance not found" };
  }

  const filePath = path.join(instance.gameDirectory, "shaderpacks", filename);

  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: "Shader pack not found" };
    }

    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      fs.rmSync(filePath, { recursive: true });
    } else {
      fs.unlinkSync(filePath);
    }

    console.log(`[Instance] Shader pack deleted: ${filename}`);
    return { ok: true };
  } catch (error: any) {
    console.error("[Instance] Delete shader error:", error);
    return { ok: false, error: error.message };
  }
});

/**
 * instance-read-latest-log - Read latest.log from instance
 */
ipcMain.handle("instance-read-latest-log", async (_event, instanceId: string) => {
  const instance = getInstance(instanceId);
  if (!instance) {
    return { ok: false, error: "Instance not found", content: "" };
  }

  const logPath = path.join(instance.gameDirectory, "logs", "latest.log");

  try {
    if (!fs.existsSync(logPath)) {
      return { ok: true, content: "", message: "No log file found" };
    }

    const content = fs.readFileSync(logPath, "utf-8");
    // Parse log and return last 500 lines
    const lines = content.split("\n").slice(-500);
    return { ok: true, content: lines.join("\n") };
  } catch (error: any) {
    console.error("[Instance] Read latest.log error:", error);
    return { ok: false, error: error.message, content: "" };
  }
});
