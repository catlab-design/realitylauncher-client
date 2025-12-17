/**
 * ========================================
 * Shared Types for Launcher App
 * ========================================
 */

export type ColorTheme = "yellow" | "purple" | "blue" | "green" | "red" | "orange";

export interface AuthSession {
    type: "offline" | "microsoft";
    username: string;
    uuid: string;
}

export interface Server {
    id: string;
    name: string;
    description: string;
    image: string;
    status: "online" | "offline" | "maintenance";
    version: string;
    players?: { online: number; max: number };
}

export interface NewsItem {
    id: string;
    title: string;
    content: string;
    date: string;
    type: "update" | "event" | "maintenance";
}

export interface LauncherConfig {
    username: string;
    selectedVersion: string;
    ramMB: number;
    javaPath?: string;
    minecraftDir?: string;
    theme: "dark" | "light";
    colorTheme: ColorTheme;
    customColor?: string;
    language: "th" | "en";
    windowWidth: number;
    windowHeight: number;
    windowAuto: boolean;
    closeOnLaunch: boolean;
    discordRPCEnabled: boolean;
    downloadSpeedLimit: number;
    // Game launch settings
    fullscreen: boolean;
    javaArguments: string;
    maxConcurrentDownloads: number;
    telemetryEnabled: boolean;
    // Java installations
    java8Path?: string;
    java17Path?: string;
    java21Path?: string;
    // Auto Java selection
    autoJavaSelection: boolean;
    selectedJavaVersion?: "8" | "17" | "21" | "custom";
    // File verification
    verifyFilesBeforeLaunch: boolean;
}

export interface Profile {
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

// Color theme definitions
export const COLOR_THEMES: Record<ColorTheme, { primary: string; name: string }> = {
    yellow: { primary: "#ffde59", name: "Yellow" },
    purple: { primary: "#8b5cf6", name: "Purple" },
    blue: { primary: "#3b82f6", name: "Blue" },
    green: { primary: "#22c55e", name: "Green" },
    red: { primary: "#ef4444", name: "Red" },
    orange: { primary: "#f97316", name: "Orange" },
};

// Colors based on theme
export interface ThemeColors {
    primary: string;
    onPrimary: string;
    primaryContainer: string;
    onPrimaryContainer: string;
    secondary: string;
    secondaryContainer: string;
    surface: string;
    surfaceContainer: string;
    surfaceContainerHigh: string;
    surfaceContainerHighest: string;
    onSurface: string;
    onSurfaceVariant: string;
    outline: string;
    outlineVariant: string;
}

export function getColors(colorTheme: ColorTheme, isDark: boolean, customColor?: string): ThemeColors {
    const themeColor = customColor || COLOR_THEMES[colorTheme].primary;

    if (isDark) {
        return {
            primary: themeColor,
            onPrimary: "#1a1a1a",
            primaryContainer: "#2a2a2a",
            onPrimaryContainer: "#ffffff",
            secondary: themeColor,
            secondaryContainer: themeColor,
            surface: "#1a1a1a",
            surfaceContainer: "#242424",
            surfaceContainerHigh: "#2e2e2e",
            surfaceContainerHighest: "#3a3a3a",
            onSurface: "#ffffff",
            onSurfaceVariant: "#b3b3b3",
            outline: "#4a4a4a",
            outlineVariant: "#3a3a3a",
        };
    } else {
        return {
            primary: "#1a1a1a",
            onPrimary: "#ffffff",
            primaryContainer: "#f5f5f5",
            onPrimaryContainer: "#1a1a1a",
            secondary: themeColor,
            secondaryContainer: themeColor,
            surface: "#ffffff",
            surfaceContainer: "#f8f8f8",
            surfaceContainerHigh: "#f0f0f0",
            surfaceContainerHighest: "#e8e8e8",
            onSurface: "#1a1a1a",
            onSurfaceVariant: "#666666",
            outline: "#cccccc",
            outlineVariant: "#e0e0e0",
        };
    }
}

// Utility function
export function cn(...xs: Array<string | false | null | undefined>) {
    return xs.filter(Boolean).join(" ");
}

export function getMCHeadURL(username: string, size: number = 64): string {
    return `https://crafthead.net/avatar/${username}/${size}`;
}
