/// <reference types="astro/client" />

/**
 * Global Type Declarations for Reality Launcher
 */

type ColorTheme = "yellow" | "purple" | "blue" | "green" | "red" | "orange" | "custom";

interface LauncherConfig {
  username: string;
  selectedVersion: string;
  ramMB: number;
  javaPath?: string;
  minecraftDir?: string;
  theme: "dark" | "light" | "oled" | "auto";
  colorTheme: ColorTheme;
  language: "th" | "en";
  windowWidth: number;
  windowHeight: number;
  closeOnLaunch: boolean;
  downloadSpeedLimit: number;
  discordRPCEnabled: boolean;
}

interface AuthSession {
  type: "catid" | "microsoft" | "offline";
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

interface GameInstance {
  id: string;
  name: string;
  icon?: string;
  minecraftVersion: string;
  loader: "vanilla" | "fabric" | "forge" | "neoforge" | "quilt";
  loaderVersion?: string;
  createdAt: string;
  lastPlayedAt?: string;
  totalPlayTime: number;
  gameDirectory: string;
}

interface CreateInstanceOptions {
  name: string;
  minecraftVersion: string;
  loader?: string;
  loaderVersion?: string;
  icon?: string;
  javaPath?: string;
  ramMB?: number;
}

interface UpdateInstanceOptions {
  name?: string;
  icon?: string;
  loader?: string;
  loaderVersion?: string;
  javaPath?: string;
  ramMB?: number;
  javaArguments?: string;
}

declare global {
  interface Window {
    api?: {
      // Config
      getConfig: () => Promise<LauncherConfig>;
      setConfig: (config: Partial<LauncherConfig>) => Promise<LauncherConfig>;
      resetConfig: () => Promise<LauncherConfig>;
      getColorThemes: () => Promise<Record<ColorTheme, ColorThemeInfo>>;
      // Auth (Note: loginOffline removed, use loginCatID instead)
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
      browseIcon: () => Promise<string | null>;
      validateJavaPath: (javaPath: string) => Promise<boolean>;
      openFolder: (folderPath: string) => Promise<void>;
      browseModpack: () => Promise<string | null>;
      importModpack: (filePath: string) => Promise<{ success: boolean; name: string; error?: string }>;
      detectJavaInstallations: () => Promise<string[]>;
      // Instance Content Management
      instanceListMods: (instanceId: string) => Promise<{ ok: boolean; mods: any[]; hasUncached?: boolean; error?: string }>;
      instanceToggleMod: (instanceId: string, filename: string) => Promise<{ ok: boolean; newFilename?: string; enabled?: boolean; error?: string }>;
      instanceDeleteMod: (instanceId: string, filename: string) => Promise<{ ok: boolean; error?: string }>;
      instanceGetModMetadata: (instanceId: string, filename: string) => Promise<{ ok: boolean; metadata?: { displayName?: string; author?: string; description?: string; icon?: string }; error?: string }>;
      instanceListResourcepacks: (instanceId: string) => Promise<{ ok: boolean; items: any[]; error?: string }>;
      instanceListShaders: (instanceId: string) => Promise<{ ok: boolean; items: any[]; error?: string }>;
      instanceListDatapacks: (instanceId: string) => Promise<{ ok: boolean; items: any[]; error?: string }>;
      instanceToggleResourcepack: (instanceId: string, filename: string) => Promise<{ ok: boolean; error?: string }>;
      instanceToggleShader: (instanceId: string, filename: string) => Promise<{ ok: boolean; error?: string }>;
      instanceToggleDatapack: (instanceId: string, worldName: string, filename: string) => Promise<{ ok: boolean; error?: string }>;
      instanceDeleteResourcepack: (instanceId: string, filename: string) => Promise<{ ok: boolean; error?: string }>;
      instanceDeleteShader: (instanceId: string, filename: string) => Promise<{ ok: boolean; error?: string }>;
      instanceDeleteDatapack: (instanceId: string, worldName: string, filename: string) => Promise<{ ok: boolean; error?: string }>;
      // Discord RPC
      discordRPCSetEnabled: (enabled: boolean) => Promise<void>;
      discordRPCUpdate: (status: "idle" | "playing" | "launching", serverName?: string) => Promise<void>;
      discordRPCIsConnected: () => Promise<boolean>;
      // Auth Window
      openAuthWindow: () => Promise<void>;
      closeAuthWindow: () => Promise<void>;
      onAuthCallback: (callback: (data: { token: string }) => void) => () => void;
      // Device Code Authentication
      startDeviceCodeAuth: () => Promise<{
        ok: boolean;
        deviceCode?: string;
        userCode?: string;
        verificationUri?: string;
        expiresIn?: number;
        interval?: number;
        message?: string;
        error?: string;
      }>;
      pollDeviceCodeAuth: (deviceCode: string) => Promise<{
        status: "pending" | "success" | "error" | "expired";
        error?: string;
        session?: {
          username: string;
          uuid: string;
          accessToken: string;
        };
      }>;
      // CatID Authentication
      loginCatID: (username: string, password: string) => Promise<{
        ok: boolean;
        session?: {
          username: string;
          uuid: string;
          token: string;
        };
        error?: string;
      }>;
      registerCatID: (username: string, email: string, password: string) => Promise<{
        ok: boolean;
        error?: string;
      }>;
      // Offline Account
      loginOffline: (username: string) => Promise<{
        ok: boolean;
        session?: {
          username: string;
          uuid: string;
        };
        error?: string;
      }>;
      // Window Control
      windowMinimize: () => Promise<void>;
      windowMaximize: () => Promise<void>;
      windowClose: () => Promise<void>;
      windowIsMaximized: () => Promise<boolean>;
      // Modrinth APIs
      modrinthSearch: (filters: { query?: string; projectType?: string; gameVersion?: string; loader?: string; limit?: number; offset?: number; sortBy?: string }) => Promise<any>;
      modrinthGetProject: (idOrSlug: string) => Promise<any>;
      modrinthGetVersions: (idOrSlug: string) => Promise<any>;
      modrinthGetVersion: (versionId: string) => Promise<any>;
      modrinthDownload: (versionId: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
      modrinthGetPopular: (limit?: number) => Promise<any>;
      modrinthGetGameVersions: () => Promise<{ version: string; version_type: string }[]>;
      modrinthGetLoaders: () => Promise<{ name: string; icon: string }[]>;
      modrinthGetInstalled: () => Promise<any[]>;
      modrinthDeleteModpack: (modpackPath: string) => Promise<boolean>;
      // Instance Management APIs
      instancesList: () => Promise<GameInstance[]>;
      instancesCreate: (options: CreateInstanceOptions) => Promise<GameInstance>;
      instancesGet: (id: string) => Promise<GameInstance | null>;
      instancesUpdate: (id: string, updates: UpdateInstanceOptions) => Promise<GameInstance | null>;
      instancesDelete: (id: string) => Promise<boolean>;
      instancesDuplicate: (id: string) => Promise<GameInstance | null>;
      instancesOpenFolder: (id: string) => Promise<void>;
      instancesLaunch: (id: string) => Promise<LaunchResult>;
      // Game Control
      isGameRunning: () => Promise<boolean>;
      killGame: () => Promise<boolean>;
      // Content Download
      contentDownloadToInstance: (options: { projectId: string; versionId: string; instanceId: string; contentType: string }) => Promise<{ ok: boolean; error?: string }>;
      onLaunchProgress: (callback: (data: { type: string; task?: string; current?: number; total?: number; percent?: number }) => void) => () => void;
      // Modpack Installer APIs
      modpackInstall: (mrpackPath: string) => Promise<{ ok: boolean; instance?: GameInstance; error?: string }>;
      modpackInstallFromModrinth: (versionId: string) => Promise<{ ok: boolean; instance?: GameInstance; error?: string }>;
      modpackCheckConflicts: (instanceId: string) => Promise<{ type: string; file1: string; file2?: string; reason: string }[]>;
      modpackParseInfo: (mrpackPath: string) => Promise<any>;
      onModpackInstallProgress: (callback: (data: { stage: string; message: string; current?: number; total?: number; percent?: number }) => void) => () => void;
    };
  }
}

export { };
