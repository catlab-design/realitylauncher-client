/**
 * ========================================
 * Electron Preload Script
 * ========================================
 * 
 * Bridge ระหว่าง Main Process กับ Renderer Process
 */

import { contextBridge, ipcRenderer } from "electron";

// ========================================
// Types
// ========================================

type ColorTheme = "yellow" | "purple" | "blue" | "green" | "red" | "orange";

interface LauncherConfig {
  username: string;
  selectedVersion: string;
  ramMB: number;
  javaPath?: string;
  minecraftDir?: string;
  theme: "dark" | "light";
  colorTheme: ColorTheme;
  language: "th" | "en";
  windowWidth: number;
  windowHeight: number;
  closeOnLaunch: boolean;
  downloadSpeedLimit: number;
  discordRPCEnabled: boolean;
}

interface AuthSession {
  type: "offline" | "microsoft";
  username: string;
  uuid: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  skinUrl?: string;
}

interface LauncherInfo {
  javaOK: boolean;
  runtime: string;
  minecraftDir: string;
}

interface LaunchResult {
  ok: boolean;
  message?: string;
}

interface ColorThemeInfo {
  primary: string;
  name: string;
}

// ========================================
// API Definition
// ========================================

const api = {
  // === Config APIs ===
  getConfig: (): Promise<LauncherConfig> => {
    return ipcRenderer.invoke("get-config");
  },

  setConfig: (config: Partial<LauncherConfig>): Promise<LauncherConfig> => {
    return ipcRenderer.invoke("set-config", config);
  },

  resetConfig: (): Promise<LauncherConfig> => {
    return ipcRenderer.invoke("reset-config");
  },

  getColorThemes: (): Promise<Record<ColorTheme, ColorThemeInfo>> => {
    return ipcRenderer.invoke("get-color-themes");
  },

  // === Auth APIs ===
  loginOffline: (username: string): Promise<AuthSession> => {
    return ipcRenderer.invoke("auth-login-offline", username);
  },

  logout: (): Promise<void> => {
    return ipcRenderer.invoke("auth-logout");
  },

  getSession: (): Promise<AuthSession | null> => {
    return ipcRenderer.invoke("auth-get-session");
  },

  isLoggedIn: (): Promise<boolean> => {
    return ipcRenderer.invoke("auth-is-logged-in");
  },

  // === Launcher APIs ===
  listVersions: (): Promise<string[]> => {
    return ipcRenderer.invoke("list-versions");
  },

  getLauncherInfo: (): Promise<LauncherInfo> => {
    return ipcRenderer.invoke("get-launcher-info");
  },

  launchGame: (payload: {
    version: string;
    username: string;
    ramMB: number;
  }): Promise<LaunchResult> => {
    return ipcRenderer.invoke("launch-game", payload);
  },

  // === Utility APIs ===
  openExternal: (url: string): Promise<void> => {
    return ipcRenderer.invoke("open-external", url);
  },

  getMinecraftDir: (): Promise<string> => {
    return ipcRenderer.invoke("get-minecraft-dir");
  },

  getAppDataDir: (): Promise<string> => {
    return ipcRenderer.invoke("get-app-data-dir");
  },

  // === Dialog APIs ===
  browseJava: (): Promise<string | null> => {
    return ipcRenderer.invoke("browse-java");
  },

  browseDirectory: (title?: string): Promise<string | null> => {
    return ipcRenderer.invoke("browse-directory", title);
  },

  validateJavaPath: (javaPath: string): Promise<boolean> => {
    return ipcRenderer.invoke("validate-java-path", javaPath);
  },

  openFolder: (folderPath: string): Promise<void> => {
    return ipcRenderer.invoke("open-folder", folderPath);
  },

  // === Discord RPC APIs ===
  discordRPCSetEnabled: (enabled: boolean): Promise<void> => {
    return ipcRenderer.invoke("discord-rpc-set-enabled", enabled);
  },

  discordRPCUpdate: (status: "idle" | "playing" | "launching", serverName?: string): Promise<void> => {
    return ipcRenderer.invoke("discord-rpc-update", status, serverName);
  },

  discordRPCIsConnected: (): Promise<boolean> => {
    return ipcRenderer.invoke("discord-rpc-is-connected");
  },

  // === Auth Window APIs ===
  openAuthWindow: (): Promise<void> => {
    return ipcRenderer.invoke("open-auth-window");
  },

  closeAuthWindow: (): Promise<void> => {
    return ipcRenderer.invoke("close-auth-window");
  },

  // รับ callback จาก auth window
  onAuthCallback: (callback: (data: { token: string }) => void): (() => void) => {
    const handler = (_event: any, data: { token: string }) => callback(data);
    ipcRenderer.on("auth-callback", handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener("auth-callback", handler);
  },
};

// ========================================
// Expose API to Renderer
// ========================================

contextBridge.exposeInMainWorld("api", api);

// Export type for TypeScript
export type API = typeof api;
