

import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";





export type ColorTheme =
  | "yellow"
  | "purple"
  | "blue"
  | "green"
  | "red"
  | "orange"
  | "custom";
export type LauncherCloseMode = "keep-open" | "hide-reopen" | "close";

export interface LauncherConfig {
  
  theme: "light" | "dark" | "oled" | "auto";
  colorTheme: ColorTheme;
  customColor?: string;
  language: "th" | "en";

  
  selectedVersion: string;
  minRamMB: number;
  ramMB: number;
  javaPath: string;
  javaPaths?: {
    java25?: string;
    java21?: string;
    java17?: string;
    java8?: string;
  };
  javaArguments: string;
  customMinecraftDir?: string;

  
  maxConcurrentDownloads: number;
  downloadSpeedLimit: number; 
  cacheDir?: string;

  
  windowAutoSize: boolean;
  windowWidth: number;
  windowHeight: number;

  
  discordRPCEnabled: boolean;

  
  telemetryEnabled: boolean;
  clientId?: string; 
  hasLaunchedBefore?: boolean; 

  
  autoUpdateEnabled: boolean; 

  
  clickSoundEnabled: boolean; 
  notificationSoundEnabled: boolean; 
  rainbowMode: boolean; 

  
  
  
  
  closeOnLaunch: LauncherCloseMode;

  
  ignoredCloudIds?: string[];
}





export const COLOR_THEMES: ColorTheme[] = [
  "yellow",
  "purple",
  "blue",
  "green",
  "red",
  "orange",
  "custom",
];

const DEFAULT_CONFIG: LauncherConfig = {
  theme: "light",
  colorTheme: "yellow",
  language: "en",
  selectedVersion: "",
  minRamMB: 2048,
  ramMB: 4096,
  javaPath: "",
  javaArguments: "",
  maxConcurrentDownloads: 8,
  downloadSpeedLimit: 0,
  windowAutoSize: true,
  windowWidth: 1100,
  windowHeight: 680,
  discordRPCEnabled: true,
  telemetryEnabled: true,
  autoUpdateEnabled: true, 
  clickSoundEnabled: true, 
  notificationSoundEnabled: true, 
  rainbowMode: false, 
  closeOnLaunch: "keep-open", 
};





let currentConfig: LauncherConfig = { ...DEFAULT_CONFIG };
let configLoaded = false;
const CONFIG_SAVE_DEBOUNCE_MS = 150;
let saveConfigTimer: NodeJS.Timeout | null = null;
let pendingConfigSnapshot: LauncherConfig | null = null;


export function getAppDataDir(): string {
  const platform = process.platform;

  if (platform === "win32") {
    return path.join(app.getPath("appData"), "RealityLauncher");
  } else if (platform === "darwin") {
    return path.join(
      app.getPath("home"),
      "Library",
      "Application Support",
      "RealityLauncher",
    );
  } else {
    return path.join(app.getPath("home"), ".realitylauncher");
  }
}


function getConfigPath(): string {
  return path.join(getAppDataDir(), "config.json");
}


export function getMinecraftDir(): string {
  if (currentConfig.customMinecraftDir) {
    return currentConfig.customMinecraftDir;
  }
  
  return getAppDataDir();
}


export function getSystemRamMB(): number {
  const totalBytes = os.totalmem();
  return Math.floor(totalBytes / (1024 * 1024));
}


export function getMaxRamMB(): number {
  const total = getSystemRamMB();
  
  return Math.max(total - 2048, 4096);
}


function loadConfig(): LauncherConfig {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, "utf-8");
      const loaded = JSON.parse(data) as Partial<LauncherConfig>;
      currentConfig = { ...DEFAULT_CONFIG, ...loaded };
    }
  } catch (error) {
    console.error("[Config] Failed to load config:", error);
    currentConfig = { ...DEFAULT_CONFIG };
  }
  return currentConfig;
}


function saveConfig(): void {
  pendingConfigSnapshot = { ...currentConfig };

  if (saveConfigTimer) {
    clearTimeout(saveConfigTimer);
  }

  saveConfigTimer = setTimeout(() => {
    saveConfigTimer = null;
    const snapshot = pendingConfigSnapshot;
    pendingConfigSnapshot = null;
    if (!snapshot) return;

    const configPath = getConfigPath();
    const dir = path.dirname(configPath);
    void fs.promises
      .mkdir(dir, { recursive: true })
      .then(() =>
        fs.promises.writeFile(
          configPath,
          JSON.stringify(snapshot, null, 2),
          "utf-8",
        ),
      )
      .catch((error) => {
        console.error("[Config] Failed to save config:", error);
      });
  }, CONFIG_SAVE_DEBOUNCE_MS);
}


export function getConfig(): LauncherConfig {
  if (!configLoaded) {
    loadConfig();
    configLoaded = true;
  }
  return { ...currentConfig };
}


export function setConfig(updates: Partial<LauncherConfig>): LauncherConfig {
  currentConfig = { ...currentConfig, ...updates };
  saveConfig();
  return { ...currentConfig };
}


export function resetConfig(): LauncherConfig {
  
  const preservedJavaPath = currentConfig.javaPath;
  const preservedJavaPaths = currentConfig.javaPaths;

  currentConfig = { ...DEFAULT_CONFIG };

  
  if (preservedJavaPath) {
    currentConfig.javaPath = preservedJavaPath;
  }
  if (preservedJavaPaths) {
    currentConfig.javaPaths = preservedJavaPaths;
  }

  saveConfig();
  return { ...currentConfig };
}


export function validateJavaPath(javaPath: string): boolean {
  if (!javaPath) return false;

  try {
    
    if (!fs.existsSync(javaPath)) {
      return false;
    }

    
    const stats = fs.statSync(javaPath);
    if (!stats.isFile()) {
      return false;
    }

    
    const basename = path.basename(javaPath).toLowerCase();
    return (
      basename === "java" || basename === "java.exe" || basename === "javaw.exe"
    );
  } catch {
    return false;
  }
}



