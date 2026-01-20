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
    minecraftUuid?: string;  // Real Minecraft UUID (from Microsoft linking)
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    tokenExpiresAt?: number;
    createdAt?: number;
    skinUrl?: string;
    isAdmin?: boolean;
    apiToken?: string;
}

// Server Definition
export interface Server {
    id: string;
    name: string;
    version?: string;
    icon?: string;
    iconUrl?: string; // From API
    image?: string;
    bannerUrl?: string; // From API
    description?: string;
    playerCount?: number;
    maxPlayers?: number;
    address?: string;
    modpack?: string;
    status?: "online" | "offline";
    players?: { online: number; max: number };
    minecraftVersion?: string;
    loaderType?: string;
    loaderVersion?: string;
    storagePath?: string;
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

// Java Installation ที่ตรวจพบในระบบ
export interface JavaInstallation {
    path: string;           // เช่น C:\Program Files\Java\jdk-21\bin\java.exe
    version: string;        // เช่น "21.0.1", "17.0.2", "1.8.0_392"
    majorVersion: number;   // เช่น 21, 17, 8
    vendor?: string;        // เช่น "Eclipse Adoptium", "Oracle", "Microsoft"
    isValid: boolean;       // ผ่านการทดสอบแล้วหรือไม่
}

// Java Paths แยกตาม version
export interface JavaPaths {
    java8?: string;
    java17?: string;
    java21?: string;
    java25?: string;
}

// Launcher Configuration
export interface LauncherConfig {
    username: string;
    selectedVersion: string;
    ramMB: number;
    javaPath?: string;
    javaPaths?: JavaPaths;  // Java paths แยกตาม version
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
    autoUpdateEnabled: boolean;
    lastSeenVersion?: string; // Track last version user has seen for changelog modal
    // UI Effects
    clickSoundEnabled: boolean; // เสียงคลิกปุ่ม
    notificationSoundEnabled: boolean; // เสียงแจ้งเตือน
    rainbowMode: boolean; // Rainbow mode สำหรับ UI
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
    cloudId?: string;
    autoUpdate?: boolean;
    banner?: string;
    lockedMods?: string[];
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
    autoUpdate?: boolean;
}
