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
  const win = new BrowserWindow({
    // ขนาดหน้าต่างเริ่มต้น
    width: 1100,
    height: 680,
    // ขนาดขั้นต่ำ (ป้องกันการย่อเล็กเกินไป)
    minWidth: 980,
    minHeight: 620,
    // สีพื้นหลัง (แสดงระหว่างโหลด)
    backgroundColor: "#0b0f19",
    // ซ่อน title bar (ใช้ custom titlebar ถ้าต้องการ)
    // frame: false,
    // Web Preferences - ความปลอดภัย
    webPreferences: {
      // preload script - ทำ bridge ระหว่าง main กับ renderer
      preload: path.join(__dirname, "preload.js"),
      // contextIsolation - แยก context ระหว่าง preload กับ renderer
      // ป้องกัน renderer เข้าถึง Node.js APIs โดยตรง
      contextIsolation: true,
      // ปิด nodeIntegration - ไม่ให้ renderer ใช้ require()
      nodeIntegration: false,
    },
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
 * list-versions - ดึงรายการเวอร์ชัน Minecraft ที่ติดตั้ง
 * 
 * @returns string[] - รายการเวอร์ชัน
 * 
 * TODO: อ่านจาก .minecraft/versions/ จริง
 */
ipcMain.handle("list-versions", async (): Promise<string[]> => {
  // TODO: อ่านจากโฟลเดอร์ .minecraft/versions/
  // ตอนนี้ return ค่า mock ก่อน
  return ["1.20.4", "1.20.1", "1.19.4", "1.18.2", "1.16.5"];
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
 * @returns object - ผลลัพธ์ (ok, message)
 * 
 * TODO: Implement จริง - spawn Java process
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

    // TODO: Implement game launching logic
    // 1. ตรวจสอบ Java
    // 2. ดาวน์โหลด assets ถ้าจำเป็น
    // 3. สร้าง command line arguments
    // 4. spawn Java process

    console.log("[Launch] Starting game:", {
      version: payload.version,
      username: session.username,
      uuid: session.uuid,
      ramMB: payload.ramMB,
    });

    return {
      ok: true,
      message: `Launching ${payload.version} as ${session.username} (mock)`,
    };
  }
);

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
