/**
 * ========================================
 * Config System - ระบบจัดการค่าตั้งค่า Launcher
 * ========================================
 * 
 * ไฟล์นี้จัดการการอ่าน/เขียน config ของ Launcher
 * 
 * คุณสมบัติ:
 * - บันทึกค่าลงไฟล์ JSON ใน appData
 * - Auto-load เมื่อ app เริ่มต้น
 * - ค่า default สำหรับ config ใหม่
 */

import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

// ========================================
// Types - ประเภทข้อมูล
// ========================================

/**
 * ColorTheme - ธีมสีที่รองรับ
 */
export type ColorTheme = "yellow" | "purple" | "blue" | "green" | "red" | "orange";

/**
 * LauncherConfig - โครงสร้างค่าตั้งค่าทั้งหมดของ Launcher
 */
export interface LauncherConfig {
    // === User Settings ===
    username: string;           // ชื่อผู้เล่น (offline mode)
    selectedVersion: string;    // เวอร์ชัน Minecraft ที่เลือก

    // === Game Settings ===
    ramMB: number;              // RAM ที่จัดสรร (MB)
    javaPath?: string;          // path ไปยัง Java (ถ้าไม่ระบุใช้ system)
    minecraftDir?: string;      // path โฟลเดอร์ .minecraft

    // === UI Settings ===
    theme: "dark" | "light";    // ธีม UI
    colorTheme: ColorTheme;     // ธีมสี (yellow, purple, etc.)
    customColor?: string;       // สี custom (hex)
    language: "th" | "en";      // ภาษา

    // === Window Settings ===
    windowWidth: number;        // ความกว้างหน้าต่าง
    windowHeight: number;       // ความสูงหน้าต่าง
    windowAuto: boolean;        // ใช้ขนาดหน้าต่างอัตโนมัติ

    // === Launcher Settings ===
    closeOnLaunch: boolean;     // ปิด launcher เมื่อเปิดเกม
    downloadSpeedLimit: number; // จำกัดความเร็วดาวน์โหลด (MB/s, 0 = ไม่จำกัด)

    // === Discord RPC ===
    discordRPCEnabled: boolean; // เปิด/ปิด Discord RPC
}

// ========================================
// Color Themes - ธีมสี
// ========================================

export const COLOR_THEMES: Record<ColorTheme, { primary: string; name: string }> = {
    yellow: { primary: "#ffde59", name: "Yellow" },
    purple: { primary: "#8b5cf6", name: "Purple" },
    blue: { primary: "#3b82f6", name: "Blue" },
    green: { primary: "#22c55e", name: "Green" },
    red: { primary: "#ef4444", name: "Red" },
    orange: { primary: "#f97316", name: "Orange" },
};

// ========================================
// Default Config - ค่าเริ่มต้น
// ========================================

export const DEFAULT_CONFIG: LauncherConfig = {
    username: "Player",
    selectedVersion: "1.20.1",
    ramMB: 2048,
    javaPath: undefined,
    minecraftDir: undefined,
    theme: "light",
    colorTheme: "yellow",
    customColor: undefined,
    language: "th",
    windowWidth: 1024,
    windowHeight: 700,
    windowAuto: true,
    closeOnLaunch: false,
    downloadSpeedLimit: 0, // 0 = ไม่จำกัด
    discordRPCEnabled: true,
};

// ========================================
// Paths - ที่อยู่ไฟล์
// ========================================

function getConfigPath(): string {
    const userDataPath = app.getPath("userData");
    return path.join(userDataPath, "config.json");
}

// ========================================
// Config Functions - ฟังก์ชันจัดการ config
// ========================================

export function getConfig(): LauncherConfig {
    const configPath = getConfigPath();

    try {
        if (!fs.existsSync(configPath)) {
            setConfig(DEFAULT_CONFIG);
            return { ...DEFAULT_CONFIG };
        }

        const rawData = fs.readFileSync(configPath, "utf-8");
        const savedConfig = JSON.parse(rawData) as Partial<LauncherConfig>;

        return {
            ...DEFAULT_CONFIG,
            ...savedConfig,
        };
    } catch (error) {
        console.error("[Config] Error reading config:", error);
        return { ...DEFAULT_CONFIG };
    }
}

export function setConfig(config: Partial<LauncherConfig>): LauncherConfig {
    const configPath = getConfigPath();
    const configDir = path.dirname(configPath);

    try {
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        let currentConfig = DEFAULT_CONFIG;
        if (fs.existsSync(configPath)) {
            try {
                const rawData = fs.readFileSync(configPath, "utf-8");
                currentConfig = { ...DEFAULT_CONFIG, ...JSON.parse(rawData) };
            } catch {
                // ignore parse error
            }
        }

        const newConfig: LauncherConfig = {
            ...currentConfig,
            ...config,
        };

        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), "utf-8");
        console.log("[Config] Saved config to:", configPath);
        return newConfig;
    } catch (error) {
        console.error("[Config] Error saving config:", error);
        throw error;
    }
}

export function resetConfig(): LauncherConfig {
    const configPath = getConfigPath();

    try {
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
    } catch (error) {
        console.error("[Config] Error deleting config:", error);
    }

    return setConfig(DEFAULT_CONFIG);
}

export function getMinecraftDir(): string {
    const config = getConfig();

    if (config.minecraftDir) {
        return config.minecraftDir;
    }

    const platform = process.platform;
    if (platform === "win32") {
        return path.join(app.getPath("appData"), ".minecraft");
    } else if (platform === "darwin") {
        return path.join(app.getPath("appData"), "minecraft");
    } else {
        return path.join(app.getPath("home"), ".minecraft");
    }
}

/**
 * getAppDataDir - หา path โฟลเดอร์ data ของ app
 */
export function getAppDataDir(): string {
    return app.getPath("userData");
}

/**
 * browseForJava - เปิด dialog เลือกไฟล์ Java
 * (ต้องเรียกจาก main process ผ่าน dialog module)
 */
export function validateJavaPath(javaPath: string): boolean {
    try {
        return fs.existsSync(javaPath);
    } catch {
        return false;
    }
}
