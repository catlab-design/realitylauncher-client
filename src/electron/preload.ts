/**
 * ========================================
 * Electron Preload Script
 * ========================================
 *
 * Bridge ระหว่าง Main Process และ Renderer Process
 * ใช้ contextBridge เพื่อ expose APIs อย่างปลอดภัย
 */

import { contextBridge, ipcRenderer, webUtils } from "electron";

// Simple cache/coalescing for instancesList to avoid rapid duplicate IPC calls
let _instancesCacheKey: string = "";
let _instancesCacheTs: number = 0;
let _instancesCacheData: any[] | null = null;
let _instancesCachePromise: Promise<any> | null = null;
const INSTANCES_CACHE_MS = 500; // milliseconds

// ========================================
// API Definition
// ========================================

const api = {
  // ----------------------------------------
  // Config APIs
  // ----------------------------------------
  getConfig: () => ipcRenderer.invoke("get-config"),
  setConfig: (config: Record<string, unknown>) =>
    ipcRenderer.invoke("set-config", config),
  resetConfig: () => ipcRenderer.invoke("reset-config"),
  getColorThemes: () => ipcRenderer.invoke("get-color-themes"),

  // ----------------------------------------
  // Auth APIs
  // ----------------------------------------
  // Note: loginOffline was removed in favor of CatID auth (use loginCatID)
  logout: () => ipcRenderer.invoke("auth-logout"),
  getSession: () => ipcRenderer.invoke("auth-get-session"),
  isLoggedIn: () => ipcRenderer.invoke("auth-is-logged-in"),
  setActiveSession: (session: any) =>
    ipcRenderer.invoke("auth-set-active-session", session),

  // ----------------------------------------
  // Launcher APIs
  // ----------------------------------------
  listVersions: () => ipcRenderer.invoke("list-versions"),
  getLauncherInfo: () => ipcRenderer.invoke("get-launcher-info"),
  launchGame: (payload: { version: string; username: string; ramMB: number }) =>
    ipcRenderer.invoke("launch-game", payload),

  // ----------------------------------------
  // Utility APIs
  // ----------------------------------------
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  openMicrosoftLogin: (verificationUri: string, userCode: string) =>
    ipcRenderer.invoke("open-microsoft-login", verificationUri, userCode),
  getMinecraftDir: () => ipcRenderer.invoke("get-minecraft-dir"),
  getAppDataDir: () => ipcRenderer.invoke("get-app-data-dir"),
  getSystemRam: () => ipcRenderer.invoke("get-system-ram"),
  getMaxRam: () => ipcRenderer.invoke("get-max-ram"),
  autoDetectJava: () => ipcRenderer.invoke("auto-detect-java"),

  // ----------------------------------------
  // Dialog APIs
  // ----------------------------------------
  browseJava: () => ipcRenderer.invoke("browse-java"),
  browseDirectory: (title?: string) =>
    ipcRenderer.invoke("browse-directory", title),
  validateJavaPath: (javaPath: string) =>
    ipcRenderer.invoke("validate-java-path", javaPath),
  openFolder: (folderPath: string) =>
    ipcRenderer.invoke("open-folder", folderPath),
  browseModpack: () => ipcRenderer.invoke("browse-modpack"),
  importModpack: (filePath: string) =>
    ipcRenderer.invoke("import-modpack", filePath),
  detectJavaInstallations: () =>
    ipcRenderer.invoke("detect-java-installations"),
  testJavaExecution: (javaPath: string) =>
    ipcRenderer.invoke("test-java-execution", javaPath),
  installJava: (majorVersion: number) =>
    ipcRenderer.invoke("install-java", majorVersion),
  deleteJava: (majorVersion: number) =>
    ipcRenderer.invoke("delete-java", majorVersion),
  onJavaInstallProgress: (
    callback: (data: {
      majorVersion: number;
      phase: string;
      percent: number;
      message: string;
    }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: {
        majorVersion: number;
        phase: string;
        percent: number;
        message: string;
      },
    ) => callback(data);
    ipcRenderer.on("java-install-progress", handler);
    return () => ipcRenderer.removeListener("java-install-progress", handler);
  },

  // ----------------------------------------
  // Discord RPC APIs
  // ----------------------------------------
  discordRPCSetEnabled: (enabled: boolean) =>
    ipcRenderer.invoke("discord-rpc-set-enabled", enabled),
  discordRPCUpdate: (
    status: "idle" | "playing" | "launching" | "browsing_modpacks" | "browsing_servers",
    serverName?: string,
    serverIcon?: string,
  ) => ipcRenderer.invoke("discord-rpc-update", status, serverName, serverIcon),
  discordRPCIsConnected: () => ipcRenderer.invoke("discord-rpc-is-connected"),

  // ----------------------------------------
  // Auth Window APIs
  // ----------------------------------------
  openAuthWindow: () => ipcRenderer.invoke("open-auth-window"),
  closeAuthWindow: () => ipcRenderer.invoke("close-auth-window"),
  onAuthCallback: (callback: (data: { token: string }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { token: string },
    ) => callback(data);
    ipcRenderer.on("auth-callback", handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener("auth-callback", handler);
  },

  // Device Code Authentication APIs
  startDeviceCodeAuth: () => ipcRenderer.invoke("auth-device-code-start"),
  pollDeviceCodeAuth: (deviceCode: string, isLinking?: boolean) =>
    ipcRenderer.invoke("auth-device-code-poll", deviceCode, isLinking),

  // CatID Authentication APIs
  loginCatID: (username: string, password: string) =>
    ipcRenderer.invoke("auth-catid-login", username, password),
  linkCatID: (username: string, password: string) =>
    ipcRenderer.invoke("auth-link-catid", username, password),
  registerCatID: (
    username: string,
    email: string,
    password: string,
    confirmPassword?: string,
  ) =>
    ipcRenderer.invoke(
      "auth-catid-register",
      username,
      email,
      password,
      confirmPassword,
    ),
  checkRegistrationStatus: (token: string) =>
    ipcRenderer.invoke("auth-check-registration-status", token),
  loginCatIDToken: (token: string) =>
    ipcRenderer.invoke("auth-catid-login-token", token),
  authUnlink: (provider: "catid" | "microsoft") =>
    ipcRenderer.invoke("auth-unlink", provider),
  forgotPassword: (email: string) =>
    ipcRenderer.invoke("auth-forgot-password", email),
  resetPassword: (email: string, otp: string, newPassword: string) =>
    ipcRenderer.invoke("auth-reset-password", email, otp, newPassword),

  // Offline Account API
  loginOffline: (username: string) =>
    ipcRenderer.invoke("auth-offline-login", username),

  // Token Refresh API
  authRefreshToken: () => ipcRenderer.invoke("auth-refresh-token"),

  // Minecraft Skin APIs (Microsoft account)
  minecraftGetProfile: () => ipcRenderer.invoke("minecraft-get-profile"),
  minecraftUploadSkin: (
    dataUrl: string,
    variant: "classic" | "slim",
    fileName?: string,
  ) =>
    ipcRenderer.invoke("minecraft-upload-skin", {
      dataUrl,
      variant,
      fileName,
    }),

  // ----------------------------------------
  // Auto Update APIs
  // ----------------------------------------
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  isDevMode: () => ipcRenderer.invoke("is-dev-mode"),
  onUpdateAvailable: (
    callback: (data: { version: string; releaseDate: string }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { version: string; releaseDate: string },
    ) => callback(data);
    ipcRenderer.on("update-available", handler);
    return () => ipcRenderer.removeListener("update-available", handler);
  },
  onUpdateProgress: (
    callback: (data: {
      percent: number;
      bytesPerSecond: number;
      transferred: number;
      total: number;
    }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: {
        percent: number;
        bytesPerSecond: number;
        transferred: number;
        total: number;
      },
    ) => callback(data);
    ipcRenderer.on("update-progress", handler);
    return () => ipcRenderer.removeListener("update-progress", handler);
  },
  onUpdateDownloaded: (
    callback: (data: { version: string; releaseDate: string }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { version: string; releaseDate: string },
    ) => callback(data);
    ipcRenderer.on("update-downloaded", handler);
    return () => ipcRenderer.removeListener("update-downloaded", handler);
  },
  onUpdateNotAvailable: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("update-not-available", handler);
    return () => ipcRenderer.removeListener("update-not-available", handler);
  },
  onUpdateError: (callback: (data: { message: string }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { message: string },
    ) => callback(data);
    ipcRenderer.on("update-error", handler);
    return () => ipcRenderer.removeListener("update-error", handler);
  },

  // ----------------------------------------
  // Window Control APIs
  // ----------------------------------------
  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowMaximize: () => ipcRenderer.invoke("window-maximize"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  windowIsMaximized: () => ipcRenderer.invoke("window-is-maximized"),

  // ----------------------------------------
  // Modrinth APIs
  // ----------------------------------------
  modrinthSearch: (filters: {
    query?: string;
    projectType?: string;
    gameVersion?: string;
    loader?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
  }) => ipcRenderer.invoke("modrinth-search", filters),
  modrinthGetProject: (idOrSlug: string) =>
    ipcRenderer.invoke("modrinth-get-project", idOrSlug),
  modrinthGetVersions: (idOrSlug: string) =>
    ipcRenderer.invoke("modrinth-get-versions", idOrSlug),
  modrinthGetVersion: (versionId: string) =>
    ipcRenderer.invoke("modrinth-get-version", versionId),
  modrinthDownload: (versionId: string) =>
    ipcRenderer.invoke("modrinth-download", versionId),
  modrinthGetPopular: (limit?: number) =>
    ipcRenderer.invoke("modrinth-get-popular", limit),
  modrinthGetGameVersions: () =>
    ipcRenderer.invoke("modrinth-get-game-versions"),
  modrinthGetLoaders: () => ipcRenderer.invoke("modrinth-get-loaders"),
  modrinthGetLoaderVersions: (loader: string, gameVersion: string) =>
    ipcRenderer.invoke("modrinth-get-loader-versions", loader, gameVersion),
  modrinthGetInstalled: () => ipcRenderer.invoke("modrinth-get-installed"),
  modrinthDeleteModpack: (modpackPath: string) =>
    ipcRenderer.invoke("modrinth-delete-modpack", modpackPath),
  modrinthPrefetch: () => ipcRenderer.invoke("modrinth-prefetch"),
  modrinthClearCache: () => ipcRenderer.invoke("modrinth-clear-cache"),
  onModrinthDownloadProgress: (
    callback: (data: {
      filename: string;
      downloaded: number;
      total: number;
      percent: number;
    }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: {
        filename: string;
        downloaded: number;
        total: number;
        percent: number;
      },
    ) => callback(data);
    ipcRenderer.on("modrinth-download-progress", handler);
    return () =>
      ipcRenderer.removeListener("modrinth-download-progress", handler);
  },

  // ----------------------------------------
  // CurseForge APIs
  // ----------------------------------------
  curseforgeSearch: (filters: {
    query?: string;
    projectType?: string;
    gameVersion?: string;
    sortBy?: string;
    pageSize?: number;
    index?: number;
  }) => ipcRenderer.invoke("curseforge-search", filters),
  curseforgeGetProject: (projectId: number | string) =>
    ipcRenderer.invoke("curseforge-get-project", projectId),
  curseforgeGetFiles: (projectId: number | string, gameVersion?: string) =>
    ipcRenderer.invoke("curseforge-get-files", projectId, gameVersion),
  curseforgeGetFile: (projectId: number | string, fileId: number | string) =>
    ipcRenderer.invoke("curseforge-get-file", projectId, fileId),
  curseforgeGetDownloadUrl: (
    projectId: number | string,
    fileId: number | string,
  ) => ipcRenderer.invoke("curseforge-get-download-url", projectId, fileId),
  curseforgePrefetch: () => ipcRenderer.invoke("curseforge-prefetch"),
  curseforgeClearCache: () => ipcRenderer.invoke("curseforge-clear-cache"),

  // ----------------------------------------
  // Instance Management APIs
  // ----------------------------------------
  // Instance Management APIs
  instancesList: (offset?: number, limit?: number) => {
    const key = `${offset || 0}:${limit || 1000}`;
    const now = Date.now();

    // Return cached data if fresh and same key
    if (
      _instancesCacheData &&
      _instancesCacheKey === key &&
      now - _instancesCacheTs < INSTANCES_CACHE_MS
    ) {
      return Promise.resolve(_instancesCacheData);
    }

    // Return in-flight promise if same key
    if (_instancesCachePromise && _instancesCacheKey === key) {
      return _instancesCachePromise;
    }

    // Otherwise invoke IPC and store promise
    _instancesCacheKey = key;
    _instancesCacheTs = now;
    _instancesCachePromise = ipcRenderer
      .invoke("instances-list", offset, limit)
      .then((res) => {
        _instancesCacheData = res;
        _instancesCachePromise = null;
        _instancesCacheTs = Date.now();
        return res;
      })
      .catch((err) => {
        _instancesCachePromise = null;
        throw err;
      });

    return _instancesCachePromise;
  },
  fetchInstanceAgendas: (instanceId: string) =>
    ipcRenderer.invoke("fetch-instance-agendas", instanceId),
  fetchAllAgendas: () => ipcRenderer.invoke("fetch-all-agendas"),
  instancesGetJoinedServers: () => ipcRenderer.invoke("instances-get-joined"),
  instancesCloudInstall: (id: string) =>
    ipcRenderer.invoke("instances-cloud-install", id),
  instancesCloudSync: () => ipcRenderer.invoke("instances-cloud-sync"),
  instancesCreate: (options: {
    name: string;
    minecraftVersion: string;
    loader?: string;
    loaderVersion?: string;
    icon?: string;
    javaPath?: string;
    ramMB?: number;
  }) => ipcRenderer.invoke("instances-create", options),
  instancesGet: (id: string) => ipcRenderer.invoke("instances-get", id),
  instancesUpdate: (
    id: string,
    updates: {
      name?: string;
      icon?: string;
      loader?: string;
      loaderVersion?: string;
      javaPath?: string;
      ramMB?: number;
      javaArguments?: string;
      autoUpdate?: boolean;
    },
  ) => ipcRenderer.invoke("instances-update", id, updates),
  instanceCancelAction: (id: string) =>
    ipcRenderer.invoke("instance-cancel-action", id),
  instancesDelete: (id: string) => ipcRenderer.invoke("instances-delete", id),
  instancesDuplicate: (id: string) =>
    ipcRenderer.invoke("instances-duplicate", id),
  instancesOpenFolder: (id: string) =>
    ipcRenderer.invoke("instances-open-folder", id),
  instancesExport: (id: string, options: any) =>
    ipcRenderer.invoke("instances-export", id, options),
  instancesExportCancel: (id: string) =>
    ipcRenderer.invoke("instances-export-cancel", id),
  instancesListFiles: (id: string) =>
    ipcRenderer.invoke("instances-list-files", id),
  onExportProgress: (
    callback: (
      id: string,
      progress: { transferred: number; total: number; percent: number },
    ) => void,
  ) => {
    const subscription = (
      _event: any,
      instanceId: string,
      data: { transferred: number; total: number; percent: number },
    ) => callback(instanceId, data);
    ipcRenderer.on("instance-export-progress", subscription);
    return () =>
      ipcRenderer.removeListener("instance-export-progress", subscription);
  },
  // ----------------------------------------
  // Instance Events
  // ----------------------------------------
  onInstancesUpdated: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("instances-updated", handler);
    return () => ipcRenderer.removeListener("instances-updated", handler);
  },

  instancesLaunch: (id: string) => ipcRenderer.invoke("instances-launch", id),
  instanceJoin: (key: string) => ipcRenderer.invoke("instance-join", key),
  instanceJoinPublic: (id: string) =>
    ipcRenderer.invoke("instance-join-public", id),
  instanceLeave: (id: string) => ipcRenderer.invoke("instance-leave", id),
  onLaunchProgress: (
    callback: (data: {
      type: string;
      task?: string;
      current?: number;
      total?: number;
      percent?: number;
    }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: {
        type: string;
        task?: string;
        current?: number;
        total?: number;
        percent?: number;
      },
    ) => callback(data);
    ipcRenderer.on("launch-progress", handler);
    return () => ipcRenderer.removeListener("launch-progress", handler);
  },
  onInstallProgress: (
    callback: (data: {
      type: string;
      task?: string;
      current?: number;
      total?: number;
      percent?: number;
    }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: {
        type: string;
        task?: string;
        current?: number;
        total?: number;
        percent?: number;
      },
    ) => callback(data);
    ipcRenderer.on("install-progress", handler);
    return () => ipcRenderer.removeListener("install-progress", handler);
  },
  onDeepLinkJoinInstance: (callback: (key: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, key: string) =>
      callback(key);
    ipcRenderer.on("deep-link-join-instance", handler);
    return () => ipcRenderer.removeListener("deep-link-join-instance", handler);
  },
  onDeepLinkAuthCallback: (
    callback: (data: { token: string; username?: string }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { token: string; username?: string },
    ) => callback(data);
    ipcRenderer.on("deep-link-auth-callback", handler);
    return () => ipcRenderer.removeListener("deep-link-auth-callback", handler);
  },
  onGameStarted: (callback: (data: { instanceId: string }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { instanceId: string },
    ) => callback(data);
    ipcRenderer.on("game-started", handler);
    return () => ipcRenderer.removeListener("game-started", handler);
  },
  onGameStopped: (callback: (data: { instanceId: string }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { instanceId: string },
    ) => callback(data);
    ipcRenderer.on("game-stopped", handler);
    return () => ipcRenderer.removeListener("game-stopped", handler);
  },
  isGameRunning: (instanceId?: string) =>
    ipcRenderer.invoke("is-game-running", instanceId),
  killGame: (instanceId?: string) =>
    ipcRenderer.invoke("kill-game", instanceId),

  // Instance Content Management APIs
  instanceListMods: (instanceId: string) =>
    ipcRenderer.invoke("instance-list-mods", instanceId),
  instanceToggleMod: (instanceId: string, filename: string) =>
    ipcRenderer.invoke("instance-toggle-mod", instanceId, filename),
  instanceToggleLock: (instanceId: string, filename: string) =>
    ipcRenderer.invoke("instance-toggle-lock", instanceId, filename),
  instanceCheckIntegrity: (instanceId: string) =>
    ipcRenderer.invoke("instance-check-integrity", instanceId),
  instanceDeleteMod: (instanceId: string, filename: string) =>
    ipcRenderer.invoke("instance-delete-mod", instanceId, filename),
  instanceGetModMetadata: (instanceId: string, filename: string) =>
    ipcRenderer.invoke("instance-get-mod-metadata", instanceId, filename),

  // Browse icon dialog
  browseIcon: () => ipcRenderer.invoke("browse-icon"),

  // Set instance icon (saves to icon.png file)
  instancesSetIcon: (instanceId: string, iconData: string) =>
    ipcRenderer.invoke("instances-set-icon", instanceId, iconData),

  // List resourcepacks and shaders
  instanceListResourcepacks: (instanceId: string) =>
    ipcRenderer.invoke("instance-list-resourcepacks", instanceId),
  instanceListShaders: (instanceId: string) =>
    ipcRenderer.invoke("instance-list-shaders", instanceId),

  // Toggle resourcepacks and shaders
  instanceToggleResourcepack: (instanceId: string, filename: string) =>
    ipcRenderer.invoke("instance-toggle-resourcepack", instanceId, filename),
  instanceToggleShader: (instanceId: string, filename: string) =>
    ipcRenderer.invoke("instance-toggle-shader", instanceId, filename),

  // Delete resourcepacks and shaders
  instanceDeleteResourcepack: (instanceId: string, filename: string) =>
    ipcRenderer.invoke("instance-delete-resourcepack", instanceId, filename),
  instanceDeleteShader: (instanceId: string, filename: string) =>
    ipcRenderer.invoke("instance-delete-shader", instanceId, filename),

  // Datapacks APIs
  instanceListDatapacks: (instanceId: string) =>
    ipcRenderer.invoke("instance-list-datapacks", instanceId),
  instanceToggleDatapack: (
    instanceId: string,
    worldName: string,
    filename: string,
  ) =>
    ipcRenderer.invoke(
      "instance-toggle-datapack",
      instanceId,
      worldName,
      filename,
    ),
  instanceDeleteDatapack: (
    instanceId: string,
    worldName: string,
    filename: string,
  ) =>
    ipcRenderer.invoke(
      "instance-delete-datapack",
      instanceId,
      worldName,
      filename,
    ),

  // ----------------------------------------
  // Content Download APIs
  // ----------------------------------------
  contentDownloadToInstance: (options: {
    projectId: string;
    versionId: string;
    instanceId: string;
    contentType: string;
    contentSource?: "modrinth" | "curseforge";
  }) => ipcRenderer.invoke("content-download-to-instance", options),
  contentGetCompatibleVersions: (projectId: string, instanceId: string) =>
    ipcRenderer.invoke(
      "content-get-compatible-versions",
      projectId,
      instanceId,
    ),
  onContentDownloadProgress: (
    callback: (data: {
      filename: string;
      downloaded: number;
      total: number;
      percent: number;
    }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: {
        filename: string;
        downloaded: number;
        total: number;
        percent: number;
      },
    ) => callback(data);
    ipcRenderer.on("content-download-progress", handler);
    return () =>
      ipcRenderer.removeListener("content-download-progress", handler);
  },

  // ----------------------------------------
  // Server Status APIs
  // ----------------------------------------
  pingServer: (options: { host: string; port?: number; timeout?: number }) =>
    ipcRenderer.invoke("ping-server", options),
  isServerOnline: (host: string, port?: number) =>
    ipcRenderer.invoke("is-server-online", host, port),

  // ----------------------------------------
  // Modpack Installer APIs
  // ----------------------------------------
  modpackInstall: (mrpackPath: string) =>
    ipcRenderer.invoke("modpack-install", mrpackPath),
  modpackInstallFromModrinth: (versionId: string) =>
    ipcRenderer.invoke("modpack-install-from-modrinth", versionId),
  modpackInstallFromCurseforge: (projectId: string, fileId: string) =>
    ipcRenderer.invoke("modpack-install-from-curseforge", projectId, fileId),
  modpackCheckConflicts: (instanceId: string) =>
    ipcRenderer.invoke("modpack-check-conflicts", instanceId),
  modpackParseInfo: (mrpackPath: string) =>
    ipcRenderer.invoke("modpack-parse-info", mrpackPath),
  onModpackInstallProgress: (
    callback: (data: {
      stage: string;
      message: string;
      current?: number;
      total?: number;
      percent?: number;
    }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: {
        stage: string;
        message: string;
        current?: number;
        total?: number;
        percent?: number;
      },
    ) => callback(data);
    ipcRenderer.on("modpack-install-progress", handler);
    return () =>
      ipcRenderer.removeListener("modpack-install-progress", handler);
  },
  modpackCancelInstall: () => ipcRenderer.invoke("modpack-cancel-install"),

  // ----------------------------------------
  // Game Log APIs
  // ----------------------------------------
  onGameLog: (callback: (data: { level: string; message: string }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { level: string; message: string },
    ) => callback(data);
    ipcRenderer.on("game-log", handler);
    return () => ipcRenderer.removeListener("game-log", handler);
  },
  instanceReadLatestLog: (instanceId: string) =>
    ipcRenderer.invoke("instance-read-latest-log", instanceId),
  instanceAddContentFile: (
    instanceId: string,
    filePath: string,
    contentType: string,
  ) =>
    ipcRenderer.invoke(
      "instance-add-content-file",
      instanceId,
      filePath,
      contentType,
    ),

  // ----------------------------------------
  // Admin Panel APIs
  // ----------------------------------------
  checkAdminStatus: (token: string) =>
    ipcRenderer.invoke("admin-check-status", token),
  getAdminSettings: (token: string) =>
    ipcRenderer.invoke("admin-get-settings", token),
  saveAdminSetting: (token: string, settingKey: string, value: string) =>
    ipcRenderer.invoke("admin-save-setting", token, settingKey, value),
  getSystemInfo: () => ipcRenderer.invoke("admin-get-system-info"),
  // User Management APIs
  getAdminUsers: (
    token: string,
    page?: number,
    limit?: number,
    search?: string,
  ) => ipcRenderer.invoke("admin-get-users", token, page, limit, search),
  banUser: (token: string, userId: string, reason?: string) =>
    ipcRenderer.invoke("admin-ban-user", token, userId, reason),
  unbanUser: (token: string, userId: string) =>
    ipcRenderer.invoke("admin-unban-user", token, userId),
  toggleUserAdmin: (token: string, userId: string) =>
    ipcRenderer.invoke("admin-toggle-user-admin", token, userId),
  createUser: (
    token: string,
    userData: {
      email: string;
      catidUsername: string;
      password: string;
      isAdmin: boolean;
    },
  ) => ipcRenderer.invoke("admin-create-user", token, userData),
  getUserDetails: (token: string, userId: string) =>
    ipcRenderer.invoke("admin-get-user-details", token, userId),

  // ----------------------------------------
  // Notifications APIs
  // ----------------------------------------
  notificationsFetchAnnouncements: () =>
    ipcRenderer.invoke("notifications-fetch-announcements"),
  notificationsFetchUser: () => ipcRenderer.invoke("notifications-fetch-user"),
  notificationsSync: () => ipcRenderer.invoke("notifications-sync"),
  notificationsMarkRead: (notificationId: string) =>
    ipcRenderer.invoke("notifications-mark-read", notificationId),
  notificationsDelete: (notificationId: string) =>
    ipcRenderer.invoke("notifications-delete", notificationId),

  // ----------------------------------------
  // Invitation APIs
  // ----------------------------------------
  invitationsFetch: () => ipcRenderer.invoke("invitations-fetch"),
  invitationsAccept: (invitationId: string) =>
    ipcRenderer.invoke("invitations-accept", invitationId),
  invitationsReject: (invitationId: string) =>
    ipcRenderer.invoke("invitations-reject", invitationId),
};

// ========================================
// Expose API to Renderer
// ========================================

contextBridge.exposeInMainWorld("api", api);
contextBridge.exposeInMainWorld(
  "API_URL",
  "https://api.reality.notpumpkins.com",
);
