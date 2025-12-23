/**
 * Launcher Type Definitions
 */

// Color Theme Types
export type ColorTheme = "yellow" | "purple" | "blue" | "green" | "red" | "orange" | "custom";

// Auth Session
export interface AuthSession {
    type: "catid" | "microsoft" | "offline";
    username: string;
    uuid: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    skinUrl?: string;
}

// Server Definition
export interface Server {
    id: string;
    name: string;
    version: string;
    icon?: string;
    image?: string;
    description?: string;
    playerCount?: number;
    maxPlayers?: number;
    address?: string;
    modpack?: string;
    status?: "online" | "offline";
    players?: { online: number; max: number };
}

// News Item
export interface NewsItem {
    id: string;
    title: string;
    content: string;
    date: string;
    type?: "update" | "event" | "announcement";
    image?: string;
    author?: string;
    tags?: string[];
}

// Launcher Configuration
export interface LauncherConfig {
    username: string;
    selectedVersion: string;
    ramMB: number;
    javaPath?: string;
    minecraftDir?: string;
    theme: "dark" | "light" | "oled" | "auto";
    colorTheme: ColorTheme;
    customColor?: string;
    language: "th" | "en";
    windowWidth: number;
    windowHeight: number;
    windowAuto: boolean;
    closeOnLaunch: boolean;
    downloadSpeedLimit: number;
    discordRPCEnabled: boolean;
    // Additional settings
    fullscreen: boolean;
    javaArguments: string;
    maxConcurrentDownloads: number;
    telemetryEnabled: boolean;
}

// Launcher Info
export interface LauncherInfo {
    javaOK: boolean;
    runtime: string;
    minecraftDir: string;
}

// Launch Result
export interface LaunchResult {
    ok: boolean;
    message?: string;
}

// Color Theme Info
export interface ColorThemeInfo {
    primary: string;
    name: string;
}

// Game Instance Types
export type LoaderType = "vanilla" | "fabric" | "forge" | "neoforge" | "quilt";

export interface GameInstance {
    id: string;
    name: string;
    icon?: string;
    minecraftVersion: string;
    loader: LoaderType;
    loaderVersion?: string;
    createdAt: string;
    lastPlayedAt?: string;
    totalPlayTime: number;
    javaPath?: string;
    ramMB?: number;
    javaArguments?: string;
    gameDirectory: string;
    modpackId?: string;
    modpackVersionId?: string;
}

export interface CreateInstanceOptions {
    name: string;
    minecraftVersion: string;
    loader?: LoaderType;
    loaderVersion?: string;
    icon?: string;
    javaPath?: string;
    ramMB?: number;
}

export interface UpdateInstanceOptions {
    name?: string;
    icon?: string;
    loader?: LoaderType;
    loaderVersion?: string;
    javaPath?: string;
    ramMB?: number;
    javaArguments?: string;
}
