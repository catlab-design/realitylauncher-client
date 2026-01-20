/**
 * ========================================
 * MinecraftRun Types
 * ========================================
 * 
 * Types and interfaces for Minecraft game launcher
 */

/**
 * Options for launching Minecraft
 */
export interface LaunchOptions {
    version: string;
    username: string;
    uuid: string;
    accessToken?: string;
    ramMB?: number;
    javaPath?: string;
    gameDirectory?: string;
    loader?: {
        type: "forge" | "fabric" | "neoforge" | "quilt" | "legacyfabric" | "vanilla";
        build?: string;
        enable: boolean;
    };
}

/**
 * Progress update during game launch
 */
export interface LaunchProgress {
    type: "download" | "extract" | "launch" | "prepare";
    task?: string;
    current?: number;
    total?: number;
    percent?: number;
    speed?: number; // kB/s
    estimated?: number; // seconds remaining
}

/**
 * Result of game launch attempt
 */
export interface LaunchResult {
    ok: boolean;
    message: string;
    pid?: number;
}

/**
 * Callback types
 */
export type OnGameCloseCallback = () => void;
export type GameLogCallback = (level: string, message: string) => void;
export type ProgressCallback = (progress: LaunchProgress) => void;
