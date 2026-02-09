/**
 * ========================================
 * Config System - จัดการค่าตั้งค่า Launcher
 * ========================================
 */

import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// ========================================
// Types
// ========================================

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
  // Display
  theme: "light" | "dark" | "oled" | "auto";
  colorTheme: ColorTheme;
  customColor?: string;
  language: "th" | "en";

  // Game Settings
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

  // Download Settings
  maxConcurrentDownloads: number;
  downloadSpeedLimit: number; // 0 = unlimited, MB/s
  cacheDir?: string;

  // Window Settings
  windowAutoSize: boolean;
  windowWidth: number;
  windowHeight: number;

  // Discord
  discordRPCEnabled: boolean;

  // Telemetry
  telemetryEnabled: boolean;
  clientId?: string; // Anonymous unique ID for telemetry
  hasLaunchedBefore?: boolean; // Track first launch

  // Auto Update
  autoUpdateEnabled: boolean; // ผู้ใช้เปิด/ปิด auto update ได้

  // UI Effects
  clickSoundEnabled: boolean; // เสียงคลิกปุ่ม (default: true)
  notificationSoundEnabled: boolean; // เสียงแจ้งเตือน (default: true)
  rainbowMode: boolean; // Rainbow mode สำหรับ UI

  // Launcher Behavior
  // 'keep-open': ไม่ปิด Launcher
  // 'hide-reopen': ซ่อน Launcher เมื่อเกมเริ่ม, แสดงอีกครั้งเมื่อเกมปิด
  // 'close': ปิด Launcher ทันทีเมื่อเกมเริ่ม
  closeOnLaunch: LauncherCloseMode;

  // Hidden/Ignored Cloud Instances
  ignoredCloudIds?: string[];
}

// ========================================
// Constants
// ========================================

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
  maxConcurrentDownloads: 5,
  downloadSpeedLimit: 0,
  windowAutoSize: true,
  windowWidth: 1100,
  windowHeight: 680,
  discordRPCEnabled: true,
  telemetryEnabled: true,
  autoUpdateEnabled: true, // เปิด auto update เป็น default
  clickSoundEnabled: true, // เปิด click sound เป็น default
  notificationSoundEnabled: true, // เปิด notification sound เป็น default
  rainbowMode: false, // ปิด rainbow mode เป็น default
  closeOnLaunch: "keep-open", // ค่าเริ่มต้น: ไม่ปิด Launcher
};

// ========================================
// Config State
// ========================================

let currentConfig: LauncherConfig = { ...DEFAULT_CONFIG };
let configLoaded = false;

/**
 * Get the app data directory for storing config and instances
 * Uses AppData\Roaming\RealityLauncher on Windows
 */
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

/**
 * Get the path to the config file
 */
function getConfigPath(): string {
  return path.join(getAppDataDir(), "config.json");
}

/**
 * Get the Minecraft data directory (where instances live)
 * Defaults to RealityLauncher folder, can be customized
 */
export function getMinecraftDir(): string {
  if (currentConfig.customMinecraftDir) {
    return currentConfig.customMinecraftDir;
  }
  // Default to same as app data dir
  return getAppDataDir();
}

/**
 * Get total system RAM in MB
 */
export function getSystemRamMB(): number {
  const totalBytes = os.totalmem();
  return Math.floor(totalBytes / (1024 * 1024));
}

/**
 * Get recommended max RAM for Minecraft (leave 2GB for system)
 */
export function getMaxRamMB(): number {
  const total = getSystemRamMB();
  // Leave at least 2GB for system
  return Math.max(total - 2048, 4096);
}

/**
 * Load config from disk
 */
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

/**
 * Save config to disk
 */
function saveConfig(): void {
  try {
    const configPath = getConfigPath();
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2));
  } catch (error) {
    console.error("[Config] Failed to save config:", error);
  }
}

/**
 * Get current config
 */
export function getConfig(): LauncherConfig {
  if (!configLoaded) {
    loadConfig();
    configLoaded = true;
  }
  return { ...currentConfig };
}

/**
 * Set config values (partial update)
 */
export function setConfig(updates: Partial<LauncherConfig>): LauncherConfig {
  currentConfig = { ...currentConfig, ...updates };
  saveConfig();
  return { ...currentConfig };
}

/**
 * Reset config to defaults (preserves Java paths)
 */
export function resetConfig(): LauncherConfig {
  // Preserve Java paths during reset (avoid re-detection)
  const preservedJavaPath = currentConfig.javaPath;
  const preservedJavaPaths = currentConfig.javaPaths;

  currentConfig = { ...DEFAULT_CONFIG };

  // Restore preserved values
  if (preservedJavaPath) {
    currentConfig.javaPath = preservedJavaPath;
  }
  if (preservedJavaPaths) {
    currentConfig.javaPaths = preservedJavaPaths;
  }

  saveConfig();
  return { ...currentConfig };
}

/**
 * Validate Java path
 */
export function validateJavaPath(javaPath: string): boolean {
  if (!javaPath) return false;

  try {
    // Check if file exists
    if (!fs.existsSync(javaPath)) {
      return false;
    }

    // Check if it's a file (not directory)
    const stats = fs.statSync(javaPath);
    if (!stats.isFile()) {
      return false;
    }

    // Check if it looks like a java executable
    const basename = path.basename(javaPath).toLowerCase();
    return (
      basename === "java" || basename === "java.exe" || basename === "javaw.exe"
    );
  } catch {
    return false;
  }
}

// Initialize config on module load - REMOVED for performance
// loadConfig();
