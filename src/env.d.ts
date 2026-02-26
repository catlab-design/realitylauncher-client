/// <reference types="astro/client" />

/**
 * Global Type Declarations for Reality Launcher
 */

type ColorTheme =
  | "yellow"
  | "purple"
  | "blue"
  | "green"
  | "red"
  | "orange"
  | "custom";
type LauncherCloseMode = "keep-open" | "hide-reopen" | "close";

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
  closeOnLaunch: LauncherCloseMode;
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
      setActiveSession: (session: AuthSession) => Promise<AuthSession | null>;
      isLoggedIn: () => Promise<boolean>;
      forgotPassword: (
        email: string,
      ) => Promise<{ ok: boolean; message?: string; error?: string }>;
      resetPassword: (
        email: string,
        otp: string,
        newPassword: string,
      ) => Promise<{ ok: boolean; message?: string; error?: string }>;
      // Launcher
      listVersions: () => Promise<string[]>;
      getLauncherInfo: () => Promise<LauncherInfo>;
      launchGame: (payload: {
        version: string;
        username: string;
        ramMB: number;
      }) => Promise<LaunchResult>;
      // Utility
      getPathForFile: (file: File) => string;
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
      importModpack: (
        filePath: string,
      ) => Promise<{ success: boolean; name: string; error?: string }>;
      detectJavaInstallations: () => Promise<string[]>;
      // Instance Content Management
      instanceListMods: (instanceId: string) => Promise<{
        ok: boolean;
        mods: any[];
        hasUncached?: boolean;
        error?: string;
      }>;
      instanceToggleMod: (
        instanceId: string,
        filename: string,
      ) => Promise<{
        ok: boolean;
        newFilename?: string;
        enabled?: boolean;
        error?: string;
      }>;
      instanceDeleteMod: (
        instanceId: string,
        filename: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      instanceGetModMetadata: (
        instanceId: string,
        filename: string,
      ) => Promise<{
        ok: boolean;
        metadata?: {
          displayName?: string;
          author?: string;
          description?: string;
          icon?: string;
        };
        error?: string;
      }>;
      instanceListResourcepacks: (
        instanceId: string,
      ) => Promise<{ ok: boolean; items: any[]; error?: string }>;
      instanceListShaders: (
        instanceId: string,
      ) => Promise<{ ok: boolean; items: any[]; error?: string }>;
      instanceListDatapacks: (
        instanceId: string,
      ) => Promise<{ ok: boolean; items: any[]; error?: string }>;
      instanceToggleResourcepack: (
        instanceId: string,
        filename: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      instanceToggleShader: (
        instanceId: string,
        filename: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      instanceToggleDatapack: (
        instanceId: string,
        worldName: string,
        filename: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      instanceDeleteResourcepack: (
        instanceId: string,
        filename: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      instanceDeleteShader: (
        instanceId: string,
        filename: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      instanceDeleteDatapack: (
        instanceId: string,
        worldName: string,
        filename: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      // Discord RPC
      discordRPCSetEnabled: (enabled: boolean) => Promise<void>;
      discordRPCUpdate: (
        status:
          | "idle"
          | "playing"
          | "launching"
          | "browsing_modpacks"
          | "browsing_servers",
        serverName?: string,
        serverIcon?: string,
      ) => Promise<void>;
      discordRPCIsConnected: () => Promise<boolean>;
      // Auth Window
      openAuthWindow: () => Promise<void>;
      closeAuthWindow: () => Promise<void>;
      onAuthCallback: (
        callback: (data: { token: string }) => void,
      ) => () => void;
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
      pollDeviceCodeAuth: (
        deviceCode: string,
        isLinking?: boolean,
      ) => Promise<{
        status: "pending" | "success" | "error" | "expired";
        error?: string;
        linkSwitched?: boolean;
        oldCatID?: string | null;
        session?: {
          username: string;
          uuid: string;
          accessToken: string;
          refreshToken?: string;
          expiresIn?: number;
          apiToken?: string;
          apiTokenExpiresAt?: number;
        };
      }>;
      // CatID Authentication
      loginCatID: (
        username: string,
        password: string,
      ) => Promise<{
        ok: boolean;
        session?: {
          username: string;
          uuid: string;
          token: string;
          minecraftUuid?: string;
        };
        error?: string;
      }>;
      linkCatID: (
        username: string,
        password: string,
      ) => Promise<{
        ok: boolean;
        token?: string;
        linkSwitched?: boolean;
        oldCatID?: string | null;
        error?: string;
      }>;
      registerCatID: (
        username: string,
        email: string,
        password: string,
        confirmPassword?: string,
      ) => Promise<{
        ok: boolean;
        error?: string;
        message?: string;
        requiresVerification?: boolean;
        verifyToken?: string;
        expiresAt?: string;
        expiresInSeconds?: number;
      }>;
      checkRegistrationStatus: (token: string) => Promise<{
        status: "pending" | "verified" | "expired" | "not_found" | "error";
        message?: string;
        remainingSeconds?: number;
        token?: string;
        user?: {
          id: string;
          username: string;
          email: string;
        };
      }>;
      loginCatIDToken: (token: string) => Promise<{
        ok: boolean;
        session?: any;
        error?: string;
      }>;
      authUnlink: (provider: "catid" | "microsoft") => Promise<{
        ok: boolean;
        session?: AuthSession;
        updatedAccount?: AuthSession;
        message?: string;
        forceRelogin?: boolean;
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
      authRefreshToken: () => Promise<{
        ok: boolean;
        refreshed?: boolean;
        newAccessToken?: string;
        newApiToken?: string;
        requiresRelogin?: boolean;
        error?: string;
      }>;
      minecraftGetProfile: () => Promise<{
        ok: boolean;
        profile?: {
          id: string;
          name: string;
          skins: Array<{
            id: string;
            state: string;
            url: string;
            variant: string;
            alias?: string;
          }>;
          capes: any[];
          activeSkin?: {
            id: string;
            state: string;
            url: string;
            variant: string;
            alias?: string;
          } | null;
          skinUrl?: string | null;
          variant?: string;
        };
        requiresRelogin?: boolean;
        error?: string;
      }>;
      minecraftUploadSkin: (
        dataUrl: string,
        variant: "classic" | "slim",
        fileName?: string,
      ) => Promise<{
        ok: boolean;
        profile?: {
          id: string;
          name: string;
          skins: Array<{
            id: string;
            state: string;
            url: string;
            variant: string;
            alias?: string;
          }>;
          capes: any[];
          activeSkin?: {
            id: string;
            state: string;
            url: string;
            variant: string;
            alias?: string;
          } | null;
          skinUrl?: string | null;
          variant?: string;
        };
        message?: string;
        requiresRelogin?: boolean;
        error?: string;
      }>;
      // Window Control
      windowMinimize: () => Promise<void>;
      windowMaximize: () => Promise<void>;
      windowClose: () => Promise<void>;
      windowIsMaximized: () => Promise<boolean>;
      // Modrinth APIs
      modrinthSearch: (filters: {
        query?: string;
        projectType?: string;
        gameVersion?: string;
        loader?: string;
        limit?: number;
        offset?: number;
        sortBy?: string;
        facets?: string;
      }) => Promise<any>;
      modrinthGetProject: (idOrSlug: string) => Promise<any>;
      modrinthGetVersions: (idOrSlug: string) => Promise<any>;
      modrinthGetVersion: (versionId: string) => Promise<any>;
      modrinthDownload: (
        versionId: string,
      ) => Promise<{ ok: boolean; path?: string; error?: string }>;
      modrinthGetPopular: (limit?: number) => Promise<any>;
      modrinthGetGameVersions: () => Promise<
        { version: string; version_type: string }[]
      >;
      modrinthGetLoaders: () => Promise<{ name: string; icon: string }[]>;
      modrinthGetLoaderVersions: (
        loader: string,
        gameVersion: string,
      ) => Promise<string[]>;
      modrinthGetInstalled: () => Promise<any[]>;
      modrinthDeleteModpack: (modpackPath: string) => Promise<boolean>;
      // CurseForge APIs
      curseforgeSearch: (filters: {
        query?: string;
        projectType?: string;
        gameVersion?: string;
        sortBy?: string;
        pageSize?: number;
        index?: number;
        modLoaderType?: string | number;
      }) => Promise<{
        data: Array<{
          id: number;
          name: string;
          slug: string;
          summary: string;
          downloadCount: number;
          logo: { url: string } | null;
          authors: { name: string }[];
          categories: { id: number; name: string }[];
          latestFiles: Array<{
            id: number;
            displayName: string;
            fileName: string;
            gameVersions: string[];
            releaseType: number;
          }>;
          dateCreated: string;
          dateModified: string;
          thumbsUpCount: number;
        }>;
        pagination: {
          index: number;
          pageSize: number;
          resultCount: number;
          totalCount: number;
        };
      }>;
      curseforgeGetProject: (
        projectId: number | string,
      ) => Promise<{ data: any }>;
      curseforgeGetDescription: (
        projectId: number | string,
      ) => Promise<{ data: string }>;
      curseforgeGetFiles: (
        projectId: number | string,
        gameVersion?: string,
      ) => Promise<{ data: any[] }>;
      curseforgeGetFile: (
        projectId: number | string,
        fileId: number | string,
      ) => Promise<{ data: any }>;
      curseforgeGetDownloadUrl: (
        projectId: number | string,
        fileId: number | string,
      ) => Promise<{ data: string }>;
      // Instance Management APIs
      instancesList: (
        offset?: number,
        limit?: number,
      ) => Promise<GameInstance[]>;
      instancesCreate: (
        options: CreateInstanceOptions,
      ) => Promise<GameInstance>;
      instancesGet: (id: string) => Promise<GameInstance | null>;
      instancesUpdate: (
        id: string,
        updates: UpdateInstanceOptions,
      ) => Promise<GameInstance | null>;
      instanceCancelAction: (
        id: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      instancesDelete: (id: string) => Promise<boolean>;
      instancesDuplicate: (id: string) => Promise<GameInstance | null>;
      instancesOpenFolder: (id: string) => Promise<void>;
      instancesLaunch: (id: string) => Promise<LaunchResult>;
      instancesExport: (
        id: string,
        options: any,
      ) => Promise<{ ok: boolean; error?: string }>;
      instancesExportCancel: (
        id: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      onExportProgress: (
        callback: (
          id: string,
          progress: { transferred: number; total: number; percent: number },
        ) => void,
      ) => () => void;
      instanceJoin: (key: string) => Promise<{
        ok: boolean;
        message?: string;
        instance?: any;
        error?: string;
      }>;
      // Game Control
      isGameRunning: (instanceId?: string) => Promise<boolean>;
      killGame: (instanceId?: string) => Promise<boolean>;
      onGameStarted: (
        callback: (data: { instanceId: string; pid: number }) => void,
      ) => () => void;
      onGameStopped: (
        callback: (data: {
          instanceId: string;
          pid: number;
          code: number;
        }) => void,
      ) => () => void;
      // Content Download
      contentDownloadToInstance: (options: {
        projectId: string;
        versionId: string;
        instanceId: string;
        contentType: string;
        contentSource?: "modrinth" | "curseforge";
      }) => Promise<{ ok: boolean; error?: string }>;
      onLaunchProgress: (
        callback: (data: {
          type: string;
          task?: string;
          current?: number;
          total?: number;
          percent?: number;
        }) => void,
      ) => () => void;
      onInstancesUpdated: (callback: () => void) => () => void;
      onDeepLinkJoinInstance: (callback: (key: string) => void) => () => void;
      onDeepLinkAuthCallback: (
        callback: (data: { token: string; username?: string }) => void,
      ) => () => void;
      // Modpack Installer APIs
      modpackInstall: (
        mrpackPath: string,
      ) => Promise<{ ok: boolean; instance?: GameInstance; error?: string }>;
      modpackInstallFromModrinth: (
        versionId: string,
      ) => Promise<{ ok: boolean; instance?: GameInstance; error?: string }>;
      modpackInstallFromCurseforge: (
        projectId: string,
        fileId: string,
      ) => Promise<{ ok: boolean; instance?: GameInstance; error?: string }>;
      modpackCheckConflicts: (
        instanceId: string,
      ) => Promise<
        { type: string; file1: string; file2?: string; reason: string }[]
      >;
      modpackParseInfo: (mrpackPath: string) => Promise<any>;
      onModpackInstallProgress: (
        callback: (data: {
          stage: string;
          message: string;
          current?: number;
          total?: number;
          percent?: number;
        }) => void,
      ) => () => void;
      // Admin Panel APIs
      checkAdminStatus: (
        token: string,
      ) => Promise<{ isAdmin: boolean; username?: string }>;
      getAdminSettings: (
        token: string,
      ) => Promise<{ ok: boolean; settings?: any; error?: string }>;
      saveAdminSetting: (
        token: string,
        settingKey: string,
        value: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      getSystemInfo: () => Promise<{ apiUrl: string; version: string }>;
      // User Management APIs
      getAdminUsers: (
        token: string,
        page?: number,
        limit?: number,
        search?: string,
      ) => Promise<{
        ok: boolean;
        users?: any[];
        pagination?: any;
        error?: string;
      }>;
      banUser: (
        token: string,
        userId: string,
        reason?: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      unbanUser: (
        token: string,
        userId: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      toggleUserAdmin: (
        token: string,
        userId: string,
      ) => Promise<{ ok: boolean; isAdmin?: boolean; error?: string }>;
      createUser: (
        token: string,
        userData: {
          email: string;
          catidUsername: string;
          password: string;
          isAdmin: boolean;
        },
      ) => Promise<{ ok: boolean; user?: any; error?: string }>;
      getUserDetails: (
        token: string,
        userId: string,
      ) => Promise<{
        ok: boolean;
        user?: any;
        sessions?: any[];
        error?: string;
      }>;
      instancesListFiles: (id: string) => Promise<{
        ok: boolean;
        files?: any[];
        error?: string;
      }>;
      isDevMode: () => Promise<boolean>;
      checkForUpdates: () => Promise<void>;
      downloadUpdate: () => Promise<void>;
      installUpdate: () => Promise<void>;
      getAppVersion: () => Promise<string>;
      onUpdateAvailable: (
        callback: (data: { version: string; releaseDate: string }) => void,
      ) => () => void;
      onUpdateProgress: (
        callback: (data: {
          percent: number;
          bytesPerSecond: number;
          transferred: number;
          total: number;
        }) => void,
      ) => () => void;
      onUpdateDownloaded: (
        callback: (data: { version: string; releaseDate: string }) => void,
      ) => () => void;
      onUpdateNotAvailable: (callback: () => void) => () => void;
      onUpdateError: (
        callback: (data: { message: string }) => void,
      ) => () => void;
      // Notifications APIs
      notificationsFetchAnnouncements: () => Promise<any[]>;
      notificationsFetchUser: () => Promise<any[]>;
      notificationsSync: () => Promise<{
        notifications: any[];
        invitations: Array<{
          id: string;
          instanceId: string;
          instanceName: string;
          instanceIcon?: string | null;
          invitedBy: string;
          inviterName?: string | null;
          role: "member" | "admin";
          message?: string | null;
          status: "pending" | "accepted" | "rejected";
          createdAt: string;
        }>;
      }>;
      notificationsMarkRead: (notificationId: string) => Promise<boolean>;
      notificationsDelete: (notificationId: string) => Promise<boolean>;
      // Invitation APIs
      invitationsFetch: () => Promise<
        {
          id: string;
          instanceId: string;
          instanceName: string;
          instanceIcon?: string | null;
          invitedBy: string;
          inviterName?: string;
          role: "member" | "admin";
          message?: string | null;
          status: "pending" | "accepted" | "rejected";
          createdAt: string;
        }[]
      >;
      invitationsAccept: (invitationId: string) => Promise<boolean>;
      invitationsReject: (invitationId: string) => Promise<boolean>;
    };
  }
}

export {};
