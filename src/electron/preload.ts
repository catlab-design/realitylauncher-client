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

// Version types
interface InstalledVersion {
  id: string;
  type: "release" | "snapshot" | "old_beta" | "old_alpha" | "modded";
  releaseTime?: string;
  lastUsed?: string;
  hasJar: boolean;
  hasJson: boolean;
}

interface VersionManifestVersion {
  id: string;
  type: "release" | "snapshot" | "old_beta" | "old_alpha";
  url: string;
  time: string;
  releaseTime: string;
}

// Java types
interface JavaInstallation {
  path: string;
  version: string;
  majorVersion: number;
  vendor: string;
  is64Bit: boolean;
  isValid: boolean;
}

interface JavaTestResult {
  success: boolean;
  version?: string;
  majorVersion?: number;
  vendor?: string;
  is64Bit?: boolean;
  error?: string;
}

// Verification types
interface VerificationResult {
  success: boolean;
  totalFiles: number;
  verifiedFiles: number;
  missingFiles: string[];
  corruptedFiles: string[];
  errors: string[];
}

// Profile types
interface Profile {
  id: string;
  name: string;
  version: string;
  modLoader?: "forge" | "fabric" | "quilt" | "neoforge" | "vanilla";
  modLoaderVersion?: string;
  javaVersion?: 8 | 17 | 21;
  ramMB: number;
  javaArguments?: string;
  created: string;
  lastPlayed?: string;
  icon?: string;
  description?: string;
}

interface ProfileCreateOptions {
  name: string;
  version: string;
  modLoader?: Profile["modLoader"];
  modLoaderVersion?: string;
  ramMB?: number;
  description?: string;
  icon?: string;
}

interface ProfileStats {
  modsCount: number;
  savesCount: number;
  resourcePacksCount: number;
  shaderPacksCount: number;
  totalSize: number;
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

  listInstalledVersions: (): Promise<InstalledVersion[]> => {
    return ipcRenderer.invoke("list-installed-versions");
  },

  getVersionManifest: (): Promise<{ latest: { release: string; snapshot: string }; versions: VersionManifestVersion[] }> => {
    return ipcRenderer.invoke("get-version-manifest");
  },

  getVersionsForDisplay: (): Promise<{
    installed: InstalledVersion[];
    available: VersionManifestVersion[];
    latest: { release: string; snapshot: string };
  }> => {
    return ipcRenderer.invoke("get-versions-for-display");
  },

  getLauncherInfo: (): Promise<LauncherInfo & { javaVersion?: number | null }> => {
    return ipcRenderer.invoke("get-launcher-info");
  },

  launchGame: (payload: {
    version: string;
    username: string;
    ramMB: number;
  }): Promise<LaunchResult> => {
    return ipcRenderer.invoke("launch-game", payload);
  },

  // === Java APIs ===
  detectJava: (): Promise<JavaInstallation[]> => {
    return ipcRenderer.invoke("detect-java");
  },

  testJava: (javaPath: string): Promise<JavaTestResult> => {
    return ipcRenderer.invoke("test-java", javaPath);
  },

  getRecommendedJava: (mcVersion: string): Promise<number> => {
    return ipcRenderer.invoke("get-recommended-java", mcVersion);
  },

  selectBestJava: (mcVersion: string): Promise<string | null> => {
    return ipcRenderer.invoke("select-best-java", mcVersion);
  },

  getJavaForVersion: (mcVersion: string): Promise<{
    javaPath: string | null;
    recommendedVersion: number;
    actualVersion: number | null;
    isExactMatch: boolean;
  }> => {
    return ipcRenderer.invoke("get-java-for-version", mcVersion);
  },

  // === Verification APIs ===
  verifyGameFiles: (versionId: string): Promise<VerificationResult> => {
    return ipcRenderer.invoke("verify-game-files", versionId);
  },

  quickVerify: (versionId: string): Promise<boolean> => {
    return ipcRenderer.invoke("quick-verify", versionId);
  },

  // === Profile APIs ===
  initProfiles: (): Promise<void> => {
    return ipcRenderer.invoke("init-profiles");
  },

  listProfiles: (): Promise<Profile[]> => {
    return ipcRenderer.invoke("list-profiles");
  },

  createProfile: (options: ProfileCreateOptions): Promise<Profile> => {
    return ipcRenderer.invoke("create-profile", options);
  },

  getProfile: (profileId: string): Promise<Profile | null> => {
    return ipcRenderer.invoke("get-profile", profileId);
  },

  updateProfile: (profileId: string, updates: Partial<Profile>): Promise<Profile | null> => {
    return ipcRenderer.invoke("update-profile", profileId, updates);
  },

  deleteProfile: (profileId: string): Promise<boolean> => {
    return ipcRenderer.invoke("delete-profile", profileId);
  },

  duplicateProfile: (profileId: string, newName: string): Promise<Profile | null> => {
    return ipcRenderer.invoke("duplicate-profile", profileId, newName);
  },

  getProfileStats: (profileId: string): Promise<ProfileStats | null> => {
    return ipcRenderer.invoke("get-profile-stats", profileId);
  },

  getProfilePath: (profileId: string): Promise<string> => {
    return ipcRenderer.invoke("get-profile-path", profileId);
  },

  openProfileFolder: (profileId: string): Promise<void> => {
    return ipcRenderer.invoke("open-profile-folder", profileId);
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

  // === Auto Update APIs ===
  checkForUpdates: (): Promise<void> => {
    return ipcRenderer.invoke("check-for-updates");
  },

  downloadUpdate: (): Promise<void> => {
    return ipcRenderer.invoke("download-update");
  },

  installUpdate: (): Promise<void> => {
    return ipcRenderer.invoke("install-update");
  },

  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke("get-app-version");
  },

  // รับ events จาก auto-updater
  onUpdateAvailable: (callback: (info: { version: string; releaseDate: string }) => void): (() => void) => {
    const handler = (_event: any, info: { version: string; releaseDate: string }) => callback(info);
    ipcRenderer.on("update-available", handler);
    return () => ipcRenderer.removeListener("update-available", handler);
  },

  onUpdateProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void): (() => void) => {
    const handler = (_event: any, progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => callback(progress);
    ipcRenderer.on("update-progress", handler);
    return () => ipcRenderer.removeListener("update-progress", handler);
  },

  onUpdateDownloaded: (callback: (info: { version: string; releaseDate: string }) => void): (() => void) => {
    const handler = (_event: any, info: { version: string; releaseDate: string }) => callback(info);
    ipcRenderer.on("update-downloaded", handler);
    return () => ipcRenderer.removeListener("update-downloaded", handler);
  },

  // === Window Control APIs ===
  windowMinimize: (): Promise<void> => {
    return ipcRenderer.invoke("window-minimize");
  },

  windowMaximize: (): Promise<void> => {
    return ipcRenderer.invoke("window-maximize");
  },

  windowClose: (): Promise<void> => {
    return ipcRenderer.invoke("window-close");
  },

  windowIsMaximized: (): Promise<boolean> => {
    return ipcRenderer.invoke("window-is-maximized");
  },
};

// ========================================
// Expose API to Renderer
// ========================================

contextBridge.exposeInMainWorld("api", api);

// Export type for TypeScript
export type API = typeof api;
