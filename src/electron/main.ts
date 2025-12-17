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
import { fileURLToPath } from "node:url";

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
  COLOR_THEMES,
  type LauncherConfig,
  type ColorTheme
} from "./config.js";

// Auth System - จัดการ login/logout
import {
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

// Version Manager - จัดการเวอร์ชันเกม
import {
  listInstalledVersions,
  getVersionManifest,
  getVersionInfo,
  getVersionsForDisplay,
  getRequiredJavaVersion,
  type InstalledVersion,
  type VersionManifest,
  type VersionDetails
} from "./version-manager.js";

// Java Manager - จัดการ Java
import {
  detectSystemJava,
  testJava,
  getRecommendedJavaVersion,
  selectBestJava,
  getJavaForVersion,
  type JavaInstallation,
  type JavaTestResult
} from "./java-manager.js";

// File Verifier - ตรวจสอบไฟล์
import {
  verifyGameFiles,
  quickVerify,
  type VerificationResult
} from "./file-verifier.js";

// Profile Manager - จัดการ Modpack Profiles
import {
  initProfileSystem,
  listProfiles,
  createProfile,
  getProfile,
  updateProfile,
  deleteProfile,
  duplicateProfile,
  getProfileStats,
  getProfilePath,
  getProfileGameDir,
  type Profile,
  type ProfileCreateOptions
} from "./profile-manager.js";

// Auto Updater - ระบบอัปเดตอัตโนมัติ
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater;

// ========================================
// Path Setup - ตั้งค่า path
// ========================================

// ESM ไม่มี __dirname โดย default ต้องสร้างเอง
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ตรวจสอบว่ารันใน development หรือ production
const isDev = !app.isPackaged;

// ========================================
// Window Management - จัดการหน้าต่าง
// ========================================

// ตัวแปรเก็บ reference ของหน้าต่างหลัก
let mainWindow: BrowserWindow | null = null;
// ตัวแปรเก็บ reference ของหน้าต่าง auth
let authWindow: BrowserWindow | null = null;

// URL สำหรับ auth (เปลี่ยนเป็น URL จริงใน changeme.md)
const AUTH_URL = "http://localhost:3001"; // TODO: Change to https://auth.catlab.net

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
    win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
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

  // Initialize Discord RPC
  const config = getConfig();
  if (config.discordRPCEnabled) {
    await initDiscordRPC();
  }

  // สร้างหน้าต่างหลัก
  mainWindow = createWindow();

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

/**
 * auth-login-offline - Login แบบ offline
 * 
 * @param username - ชื่อผู้เล่น
 * @returns AuthSession - session ที่สร้างขึ้น
 */
ipcMain.handle(
  "auth-login-offline",
  async (_event, username: string): Promise<AuthSession> => {
    return loginOffline(username);
  }
);

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
 * list-versions - ดึงรายการเวอร์ชัน Minecraft ที่ติดตั้ง (legacy)
 */
ipcMain.handle("list-versions", async (): Promise<string[]> => {
  const installed = await listInstalledVersions();
  return installed.map(v => v.id);
});

/**
 * list-installed-versions - ดึงรายการเวอร์ชันที่ติดตั้งพร้อมรายละเอียด
 */
ipcMain.handle("list-installed-versions", async (): Promise<InstalledVersion[]> => {
  return listInstalledVersions();
});

/**
 * get-version-manifest - ดึง version manifest จาก Mojang
 */
ipcMain.handle("get-version-manifest", async (): Promise<VersionManifest> => {
  return getVersionManifest();
});

/**
 * get-version-info - ดึงข้อมูลรายละเอียดเวอร์ชัน
 */
ipcMain.handle("get-version-info", async (_event, versionId: string): Promise<VersionDetails | null> => {
  return getVersionInfo(versionId);
});

/**
 * get-versions-for-display - ดึงเวอร์ชันสำหรับแสดงใน UI
 */
ipcMain.handle("get-versions-for-display", async () => {
  return getVersionsForDisplay();
});

/**
 * get-launcher-info - ดึงข้อมูล Launcher
 */
ipcMain.handle("get-launcher-info", async () => {
  const minecraftDir = getMinecraftDir();
  const config = getConfig();

  // ตรวจสอบ Java
  let javaOK = false;
  let javaVersion = null;

  if (config.autoJavaSelection) {
    const javaInfo = await getJavaForVersion(config.selectedVersion);
    javaOK = javaInfo.javaPath !== null;
    javaVersion = javaInfo.actualVersion;
  } else if (config.javaPath) {
    const result = await testJava(config.javaPath);
    javaOK = result.success;
    javaVersion = result.majorVersion || null;
  }

  return {
    javaOK,
    javaVersion,
    runtime: process.versions.node,
    minecraftDir: minecraftDir,
  };
});

// ----------------------------------------
// Java Handlers - จัดการ Java
// ----------------------------------------

/**
 * detect-java - ค้นหา Java ในระบบ
 */
ipcMain.handle("detect-java", async (): Promise<JavaInstallation[]> => {
  return detectSystemJava();
});

/**
 * test-java - ทดสอบ Java executable
 */
ipcMain.handle("test-java", async (_event, javaPath: string): Promise<JavaTestResult> => {
  return testJava(javaPath);
});

/**
 * get-recommended-java - ดึง Java version ที่แนะนำสำหรับ MC version
 */
ipcMain.handle("get-recommended-java", async (_event, mcVersion: string): Promise<number> => {
  return getRecommendedJavaVersion(mcVersion);
});

/**
 * select-best-java - เลือก Java ที่เหมาะสมที่สุด
 */
ipcMain.handle("select-best-java", async (_event, mcVersion: string): Promise<string | null> => {
  return selectBestJava(mcVersion);
});

/**
 * get-java-for-version - ดึง Java path พร้อมข้อมูลเพิ่มเติม
 */
ipcMain.handle("get-java-for-version", async (_event, mcVersion: string) => {
  return getJavaForVersion(mcVersion);
});

// ----------------------------------------
// File Verification Handlers - ตรวจสอบไฟล์
// ----------------------------------------

/**
 * verify-game-files - ตรวจสอบไฟล์เกมทั้งหมด
 */
ipcMain.handle("verify-game-files", async (_event, versionId: string): Promise<VerificationResult> => {
  return verifyGameFiles(versionId);
});

/**
 * quick-verify - ตรวจสอบไฟล์แบบรวดเร็ว
 */
ipcMain.handle("quick-verify", async (_event, versionId: string): Promise<boolean> => {
  return quickVerify(versionId);
});

/**
 * launch-game - เปิดเกม Minecraft
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

    const config = getConfig();

    // ตรวจสอบไฟล์ก่อน launch (ถ้าเปิดใช้งาน)
    if (config.verifyFilesBeforeLaunch) {
      console.log("[Launch] Verifying game files...");
      const canLaunch = await quickVerify(payload.version);
      if (!canLaunch) {
        return {
          ok: false,
          message: "ไฟล์เกมไม่สมบูรณ์ กรุณาดาวน์โหลดใหม่",
        };
      }
    }

    // เลือก Java
    let javaPath: string | null = null;
    if (config.autoJavaSelection) {
      javaPath = await selectBestJava(payload.version);
    } else {
      javaPath = config.javaPath || null;
    }

    if (!javaPath) {
      return {
        ok: false,
        message: "ไม่พบ Java ที่ติดตั้ง กรุณาติดตั้ง Java",
      };
    }

    console.log("[Launch] Starting game:", {
      version: payload.version,
      username: session.username,
      uuid: session.uuid,
      ramMB: payload.ramMB,
      javaPath,
    });

    // TODO: Implement actual game launching with minecraft-launcher-core
    // const launcher = require('minecraft-launcher-core');
    // launcher.launch({ ... })

    return {
      ok: true,
      message: `Launching ${payload.version} as ${session.username} (mock)`,
    };
  }
);

// ----------------------------------------
// Profile Handlers - จัดการ Modpack Profiles
// ----------------------------------------

/**
 * init-profiles - Initialize profile system
 */
ipcMain.handle("init-profiles", async (): Promise<void> => {
  initProfileSystem();
});

/**
 * list-profiles - ดึงรายการ profiles ทั้งหมด
 */
ipcMain.handle("list-profiles", async (): Promise<Profile[]> => {
  return listProfiles();
});

/**
 * create-profile - สร้าง profile ใหม่
 */
ipcMain.handle("create-profile", async (_event, options: ProfileCreateOptions): Promise<Profile> => {
  return createProfile(options);
});

/**
 * get-profile - ดึงข้อมูล profile ตาม ID
 */
ipcMain.handle("get-profile", async (_event, profileId: string): Promise<Profile | null> => {
  return getProfile(profileId);
});

/**
 * update-profile - อัปเดต profile
 */
ipcMain.handle("update-profile", async (_event, profileId: string, updates: Partial<Profile>): Promise<Profile | null> => {
  return updateProfile(profileId, updates);
});

/**
 * delete-profile - ลบ profile
 */
ipcMain.handle("delete-profile", async (_event, profileId: string): Promise<boolean> => {
  return deleteProfile(profileId);
});

/**
 * duplicate-profile - สำเนา profile
 */
ipcMain.handle("duplicate-profile", async (_event, profileId: string, newName: string): Promise<Profile | null> => {
  return duplicateProfile(profileId, newName);
});

/**
 * get-profile-stats - ดึงสถิติของ profile
 */
ipcMain.handle("get-profile-stats", async (_event, profileId: string) => {
  return getProfileStats(profileId);
});

/**
 * get-profile-path - ดึง path ของ profile
 */
ipcMain.handle("get-profile-path", async (_event, profileId: string): Promise<string> => {
  return getProfilePath(profileId);
});

/**
 * open-profile-folder - เปิดโฟลเดอร์ profile
 */
ipcMain.handle("open-profile-folder", async (_event, profileId: string): Promise<void> => {
  const profilePath = getProfilePath(profileId);
  await shell.openPath(profilePath);
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

// ----------------------------------------
// Dialog Handlers - เปิด dialog เลือกไฟล์/โฟลเดอร์
// ----------------------------------------

/**
 * browse-java - เปิด dialog เลือกไฟล์ Java
 */
ipcMain.handle("browse-java", async (): Promise<string | null> => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win!, {
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
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win!, {
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
  authWindow.webContents.on("will-redirect", (event, url) => {
    // ตรวจสอบ callback URL ที่มี token
    if (url.includes("callback") || url.includes("token=")) {
      const urlObj = new URL(url);
      const token = urlObj.searchParams.get("token");

      if (token && mainWindow) {
        // ส่ง token กลับไปที่ renderer
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
 */
ipcMain.handle("window-close", async (): Promise<void> => {
  if (mainWindow) mainWindow.close();
});

/**
 * window-is-maximized - ตรวจสอบว่าหน้าต่างขยายอยู่หรือไม่
 */
ipcMain.handle("window-is-maximized", async (): Promise<boolean> => {
  return mainWindow ? mainWindow.isMaximized() : false;
});
