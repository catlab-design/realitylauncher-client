/// <reference types="astro/client" />

/**
 * Global Type Declarations for Reality Launcher
 */

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

declare global {
  interface Window {
    api?: {
      // Config
      getConfig: () => Promise<LauncherConfig>;
      setConfig: (config: Partial<LauncherConfig>) => Promise<LauncherConfig>;
      resetConfig: () => Promise<LauncherConfig>;
      getColorThemes: () => Promise<Record<ColorTheme, ColorThemeInfo>>;
      // Auth
      loginOffline: (username: string) => Promise<AuthSession>;
      logout: () => Promise<void>;
      getSession: () => Promise<AuthSession | null>;
      isLoggedIn: () => Promise<boolean>;
      // Launcher
      listVersions: () => Promise<string[]>;
      getLauncherInfo: () => Promise<LauncherInfo>;
      launchGame: (payload: { version: string; username: string; ramMB: number }) => Promise<LaunchResult>;
      // Utility
      openExternal: (url: string) => Promise<void>;
      getMinecraftDir: () => Promise<string>;
      getAppDataDir: () => Promise<string>;
      // Dialog
      browseJava: () => Promise<string | null>;
      browseDirectory: (title?: string) => Promise<string | null>;
      validateJavaPath: (javaPath: string) => Promise<boolean>;
      openFolder: (folderPath: string) => Promise<void>;
      // Discord RPC
      discordRPCSetEnabled: (enabled: boolean) => Promise<void>;
      discordRPCUpdate: (status: "idle" | "playing" | "launching", serverName?: string) => Promise<void>;
      discordRPCIsConnected: () => Promise<boolean>;
      // Auth Window
      openAuthWindow: () => Promise<void>;
      closeAuthWindow: () => Promise<void>;
      onAuthCallback: (callback: (data: { token: string }) => void) => () => void;
    };
  }
}

export { };
