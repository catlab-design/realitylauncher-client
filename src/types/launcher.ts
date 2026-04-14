


export type ColorTheme =
  | "yellow"
  | "purple"
  | "blue"
  | "green"
  | "red"
  | "orange"
  | "custom";

export interface ExportOptions {
  format: "zip" | "mrpack";
  name: string;
  version: string;
  description?: string;
  includedPaths: string[]; 
}

export type LauncherCloseMode = "keep-open" | "hide-reopen" | "close";


export interface AuthSession {
  type: "catid" | "microsoft" | "offline";
  username: string;
  uuid: string;
  minecraftUuid?: string; 
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenExpiresAt?: number;
  createdAt?: number;
  skinUrl?: string;
  isAdmin?: boolean;
  apiToken?: string;
  apiTokenExpiresAt?: number;
}


export interface Server {
  id: string;
  name: string;
  version?: string;
  icon?: string;
  iconUrl?: string; 
  image?: string;
  bannerUrl?: string; 
  description?: string;
  websiteUrl?: string;
  socials?: string | null; 
  richDescription?: string;
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


export interface JavaInstallation {
  path: string; 
  version: string; 
  majorVersion: number; 
  vendor?: string; 
  isValid: boolean; 
}


export interface JavaPaths {
  java8?: string;
  java17?: string;
  java21?: string;
  java25?: string;
}


export interface LauncherConfig {
  username: string;
  selectedVersion: string;
  ramMB: number;
  javaPath?: string;
  javaPaths?: JavaPaths; 
  minecraftDir?: string;
  theme: "dark" | "light" | "oled" | "auto";
  colorTheme: ColorTheme;
  customColor?: string;
  language: "th" | "en";
  windowWidth: number;
  windowHeight: number;
  windowAuto: boolean;
  closeOnLaunch: LauncherCloseMode;
  downloadSpeedLimit: number;
  discordRPCEnabled: boolean;
  
  fullscreen: boolean;
  javaArguments: string;
  maxConcurrentDownloads: number;
  telemetryEnabled: boolean;
  autoUpdateEnabled: boolean;
  lastSeenVersion?: string; 
  
  clickSoundEnabled: boolean; 
  notificationSoundEnabled: boolean; 
  rainbowMode: boolean; 
}


export interface LauncherInfo {
  javaOK: boolean;
  runtime: string;
  minecraftDir: string;
}


export interface LaunchResult {
  ok: boolean;
  message?: string;
}


export interface ColorThemeInfo {
  primary: string;
  name: string;
}


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
  description?: string;
  richDescription?: string;
  icon?: string;
  loader?: LoaderType;
  loaderVersion?: string;
  javaPath?: string;
  ramMB?: number;
  javaArguments?: string;
  autoUpdate?: boolean;
}

export interface InstallProgress {
  stage: string;
  message: string;
  current?: number;
  total?: number;
  percent?: number;
  
  type?: string;
  filename?: string;
}
