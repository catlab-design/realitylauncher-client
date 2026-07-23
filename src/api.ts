import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { GameInstance, LauncherConfig } from './types/launcher';

interface AuthAccount {
    uuid: string;
    username: string;
    accessToken?: string;
    refreshToken?: string;
    apiToken?: string;
    expiresAt?: number;
    avatarUrl?: string;
    authType: 'catid' | 'microsoft';
}

interface AuthResult {
    ok: boolean;
    account?: AuthAccount;
    error?: string;
}

interface SimpleResult {
    ok: boolean;
    error?: string;
    message?: string;
}

interface JoinedServersData {
    owned: any[];
    member: any[];
}

interface JoinedServersResult {
    ok: boolean;
    data?: JoinedServersData;
    error?: string;
}

interface Invitation {
    id: string;
    instanceId: string;
    instanceName: string;
    instanceIcon?: string | null;
    invitedBy: string;
    inviterName?: string | null;
    role: 'member' | 'admin';
    message?: string | null;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: string;
}

interface NotificationItem {
    id: string;
    userId: string;
    type: string;
    title: string;
    message?: string | null;
    data?: string | null;
    actionUrl?: string | null;
    isRead: boolean;
    createdAt: string;
}

interface NotificationSyncResult {
    notifications: NotificationItem[];
    invitations: Invitation[];
}

export const api = {
    authLogin: (type: 'microsoft' | 'catid' | 'offline', credentials?: any) => {
        if (type === 'microsoft') {
            return invoke<AuthResult>('login_microsoft');
        } else if (type === 'catid') {
            return invoke<AuthResult>('login_catid', {
                username: credentials?.username || '',
                password: credentials?.password || '',
            });
        } else {
            return Promise.resolve({ ok: false, error: 'Offline login not implemented' });
        }
    },
    authLogout: (_uuid: string) => invoke<void>('logout'),
    logout: () => invoke<void>('logout'),
    authRefreshToken: (_uuid?: string) => invoke<AuthResult>('auth_refresh'),
    authGetAccount: async (_uuid: string) => {
        const r = await invoke<AuthResult>('get_session');
        return r.account ?? null;
    },
    getSession: async () => {
        const r = await invoke<AuthResult>('get_session');
        return r.account ?? null;
    },
    startDeviceCodeAuth: () => invoke<any>('start_device_code_auth'),
    pollDeviceCodeAuth: (deviceCode: string, isLinking?: boolean) => invoke<{
        status: 'pending' | 'success' | 'error' | 'expired';
        error?: string;
        session?: {
            username: string;
            uuid: string;
            accessToken: string;
            refreshToken?: string;
            expiresIn?: number;
            apiToken?: string;
            apiTokenExpiresAt?: string | number;
            catidLinked?: boolean;
        };
        linkSwitched?: boolean;
        oldCatID?: string | null;
    }>('poll_device_code_auth', { deviceCode, isLinking }),
    loginCatID: (username: string, password: string) => invoke<AuthResult>('login_catid', { username, password }),
    loginCatIDToken: (token: string) => invoke<any>('login_catid_token', { token }),
    linkCatID: (username: string, password: string) => invoke<any>('link_catid', { username, password }),
    registerCatID: (username: string, email: string, password: string, confirmPassword?: string) =>
        invoke<any>('register_catid', { username, email, password, confirmPassword }),
    checkRegistrationStatus: (token: string) => invoke<any>('check_registration_status', { token }),
    forgotPassword: (email: string) => invoke<any>('forgot_password', { email }),
    resetPassword: (email: string, otp: string, newPassword: string) =>
        invoke<any>('reset_password', { email, otp, newPassword }),
    setActiveSession: (session: any) => invoke<any>('set_active_session', { session }),
    authUnlink: (provider: 'catid' | 'microsoft') => invoke<any>('auth_unlink', { provider }),
    authUpdateAvatarSource: (avatarSource: 'catid_avatar' | 'minecraft_skin') =>
        invoke<AuthResult>('auth_update_avatar_source', { avatarSource }).then((r) => ({
            ok: r.ok,
            session: r.account ?? null,
            error: r.error,
        })),

    instancesList: () => invoke<GameInstance[]>('instances_list'),
    instancesGet: (id: string) => invoke<GameInstance | null>('instances_get', { id }),
    instancesCreate: (options: {
        name: string;
        minecraftVersion: string;
        loader?: string;
        loaderVersion?: string;
        icon?: string;
    }) => invoke<GameInstance>('instances_create', { options }),
    instancesUpdate: (id: string, updates: Parameters<NonNullable<Window['api']>['instancesUpdate']>[1]) =>
        invoke<GameInstance | null>('instances_update', { id, updates }),
    instancesDelete: (id: string) => invoke<boolean>('instances_delete', { id }),
    instancesDuplicate: (id: string) => invoke<GameInstance | null>('instances_duplicate', { id }),
    instancesLaunch: (id: string, options?: { skipServerModSync?: boolean }) =>
        invoke<{ ok: boolean; message?: string }>('instances_launch', { id, skipServerModSync: options?.skipServerModSync }),
    instancesSetIcon: (id: string, iconData: string) =>
        invoke<{ ok: boolean; error: string | null }>('instances_set_icon', { id, iconData }),
    instancesPreInstall: (id: string) =>
        invoke<{ ok: boolean; name: string; version: string; loaders: string[]; filesCount: number; error?: string }>(
            'instances_pre_install',
            { filePath: id },
        ),
    instancesListFiles: (instanceId: string, subPath?: string) =>
        invoke<{ ok: boolean; files?: any[]; error?: string }>('instances_list_files', { instanceId, subPath }),
    instancesOpenFolder: async (id: string) => {
        const mcDir = await invoke<string>('config_get_minecraft_dir');
        const instancePath = `${mcDir}/instances/${id}`;
        return invoke<void>('open_folder', { path: instancePath });
    },
    instancesExport: (_id: string, _options: any) => Promise.resolve({ ok: false, error: 'Not implemented' }),
    instancesExportCancel: (_id: string) => Promise.resolve({ ok: true }),
    instanceCancelAction: (_id: string) =>
        Promise.resolve({ ok: false, error: 'Cancellation not supported yet' }),
    modpackCancelInstall: () => invoke<{ ok: boolean; error: string | null }>('modpack_cancel_install'),

    isGameRunning: (instanceId?: string) => invoke<boolean>('is_game_running', { instanceId }),
    killGame: (_instanceId?: string) => invoke<void>('kill_game').then(() => true),
    getPlayingInstanceId: () => invoke<string | null>('get_playing_instance_id'),
    instanceReadLatestLog: (instanceId: string) =>
        invoke<{ ok: boolean; content: string; size: number }>('instance_read_latest_log', { instanceId }),
    instanceTailLog: (instanceId: string, from: number) =>
        invoke<{ ok: boolean; content: string; size: number }>('instance_tail_log', { instanceId, from }),

    getConfig: () => invoke<LauncherConfig>('config_get'),
    setConfig: async (partial: Partial<LauncherConfig>) => {
        const current = await invoke<LauncherConfig>('config_get');
        const merged = { ...current, ...partial };
        await invoke<void>('config_set', { config: merged });
        return merged;
    },
    configGetMinecraftDir: () => invoke<string>('config_get_minecraft_dir'),
    configMigrateMinecraftDir: (newDir: string) => invoke<void>('config_migrate_minecraft_dir', { newDir }),
    resetConfig: () => invoke<LauncherConfig>('reset_config'),
    getSystemRam: () => invoke<number>('get_system_ram'),
    getMaxRam: () => invoke<number>('get_max_ram'),

    instanceGetMods: (instanceId: string) => invoke<any[]>('instance_get_mods', { instanceId }),
    instanceToggleMod: (instanceId: string, filename: string) =>
        invoke<{ ok: boolean; newFilename?: string; enabled?: boolean; error?: string }>('instance_toggle_mod', { instanceId, filename }),
    instanceDeleteMod: (instanceId: string, filename: string) =>
        invoke<boolean>('instance_delete_mod', { instanceId, modFileName: filename }).then((ok) => ({ ok })),
    instanceGetResourcePacks: (instanceId: string) => invoke<any[]>('instance_get_resource_packs', { instanceId }),
    instanceGetShaders: (instanceId: string) => invoke<any[]>('instance_get_shaders', { instanceId }),
    instanceGetDatapacks: (instanceId: string) => invoke<any[]>('instance_get_datapacks', { instanceId }),
    instanceInstallContent: (instanceId: string, contentType: string, projectId: string, versionId: string) =>
        invoke<{ ok: boolean; error?: string }>('instance_install_content', {
            instanceId,
            contentType,
            projectId,
            versionId,
        }),
    instanceListMods: (instanceId: string) =>
        invoke<{ ok: boolean; mods: any[]; hasUncached?: boolean; error?: string }>('instance_list_mods', { instanceId }),
    instanceListResourcepacks: (instanceId: string) =>
        invoke<{ ok: boolean; items: any[]; error?: string }>('instance_list_resourcepacks', { instanceId }),
    instanceListShaders: (instanceId: string) =>
        invoke<{ ok: boolean; items: any[]; error?: string }>('instance_list_shaders', { instanceId }),
    instanceListDatapacks: (instanceId: string) =>
        invoke<{ ok: boolean; items: any[]; error?: string }>('instance_list_datapacks', { instanceId }),
    instanceLockMods: (instanceId: string, filenames: string[], lock: boolean) =>
        invoke<{ ok: boolean; lockedMods?: string[]; error?: string }>('instance_lock_mods', { instanceId, filenames, lock }),
    instanceToggleResourcepack: (instanceId: string, filename: string) =>
        invoke<{ ok: boolean; newFilename: string; enabled: boolean; error?: string }>('instance_toggle_resourcepack', { instanceId, filename }),
    instanceToggleShader: (instanceId: string, filename: string) =>
        invoke<{ ok: boolean; newFilename: string; enabled: boolean; error?: string }>('instance_toggle_shader', { instanceId, filename }),
    instanceToggleDatapack: (instanceId: string, worldName: string, filename: string) =>
        invoke<{ ok: boolean; newFilename: string; enabled: boolean; error?: string }>('instance_toggle_datapack', { instanceId, worldName, filename }),
    instanceDeleteResourcepack: (instanceId: string, filename: string) =>
        invoke<boolean>('instance_delete_resourcepack', { instanceId, filename }).then((ok) => ({ ok })),
    instanceDeleteShader: (instanceId: string, filename: string) =>
        invoke<boolean>('instance_delete_shader', { instanceId, filename }).then((ok) => ({ ok })),
    instanceDeleteDatapack: (instanceId: string, worldName: string, filename: string) =>
        invoke<boolean>('instance_delete_datapack', { instanceId, worldName, filename }).then((ok) => ({ ok })),
    instanceToggleLock: (instanceId: string, filename: string) =>
        invoke<{ ok: boolean; lockedMods: string[]; error?: string }>('instance_toggle_lock', { instanceId, filename }),
    instanceAddContentFile: (instanceId: string, filePath: string, contentType: string) =>
        invoke<{ ok: boolean; filename?: string; error?: string }>('instance_add_content_file', { instanceId, filePath, contentType }),
    contentDownloadToInstance: (options: {
        projectId: string;
        versionId: string;
        instanceId: string;
        contentType: string;
        contentSource?: string;
    }) => invoke<any>('content_download_to_instance', {
        projectId: options.projectId,
        versionId: options.versionId,
        instanceId: options.instanceId,
        contentType: options.contentType,
        contentSource: options.contentSource,
    }),

    modrinthSearch: (filters: {
        query?: string;
        projectType?: string;
        gameVersion?: string;
        loader?: string;
        limit?: number;
        offset?: number;
        sortBy?: string;
        facets?: string;
    }) =>
        invoke<any>('modrinth_search', {
            query: filters.query || '',
            projectType: filters.projectType || 'modpack',
            version: filters.gameVersion,
            loader: filters.loader,
            limit: filters.limit,
            offset: filters.offset,
            sortBy: filters.sortBy,
            facets: filters.facets,
        }),
    modrinthGetProject: (id: string) => invoke<any>('modrinth_get_project', { id }),
    modrinthGetProjectVersions: (id: string, loaders?: string[], gameVersions?: string[]) =>
        invoke<any[]>('modrinth_get_project_versions', { id, loaders, gameVersions }),
    modrinthGetGameVersions: () => invoke<{ version: string; version_type: string }[]>('modrinth_get_game_versions'),
    modrinthGetVersions: (projectId: string, _gameVersion?: string, _loader?: string) =>
        invoke<any[]>('modrinth_get_versions', { projectId }),
    modrinthGetLoaderVersions: (loader: string, gameVersion?: string) =>
        invoke<any[]>('modrinth_get_loader_versions', { loader, gameVersion }),

    curseforgeSearch: (filters: {
        query?: string;
        projectType?: string;
        gameVersion?: string;
        sortBy?: string;
        pageSize?: number;
        index?: number;
        modLoaderType?: string | number;
    }) => {
        let modLoaderType: number | undefined = undefined;
        if (typeof filters?.modLoaderType === 'number') {
            modLoaderType = filters.modLoaderType;
        } else if (typeof filters?.modLoaderType === 'string') {
            const lower = filters.modLoaderType.toLowerCase();
            if (lower === 'forge') modLoaderType = 1;
            else if (lower === 'fabric') modLoaderType = 4;
            else if (lower === 'neoforge') modLoaderType = 6;
            else if (lower === 'quilt') modLoaderType = 5;
        }
        return invoke<any>('curseforge_search', {
            query: filters?.query,
            projectType: filters?.projectType,
            gameVersion: filters?.gameVersion,
            modLoaderType: modLoaderType,
            sortBy: filters?.sortBy,
            pageSize: filters?.pageSize,
            index: filters?.index,
        });
    },
    curseforgeGetProject: (projectId: number | string) =>
        invoke<any>('curseforge_get_project', { projectId: Number(projectId) }),
    curseforgeGetFiles: (projectId: number | string, gameVersion?: string) =>
        invoke<any>('curseforge_get_files', { projectId: Number(projectId), gameVersion }),
    curseforgeGetDescription: (projectId: number | string) =>
        invoke<any>('curseforge_get_description', { projectId: Number(projectId) }),
    modrinthGetTeam: (projectId: string) => invoke<any>('modrinth_get_team', { projectId }),

    modpackInstall: (filePath: string) =>
        invoke<{ ok: boolean; instanceId?: string; instance?: GameInstance; name?: string; error?: string; failedFiles?: string[] }>(
            'modpack_install',
            { filePath },
        ),
    modpackInstallFromModrinth: (versionId: string) =>
        invoke<{ ok: boolean; instanceId?: string; instance?: GameInstance; name?: string; error?: string; failedFiles?: string[] }>(
            'modpack_install_from_modrinth',
            { versionId },
        ),
    modpackInstallFromCurseforge: (projectId: number | string, fileId: number | string) =>
        invoke<{ ok: boolean; instanceId?: string; instance?: GameInstance; name?: string; error?: string; failedFiles?: string[] }>(
            'modpack_install_from_curseforge',
            { projectId: Number(projectId), fileId: Number(fileId) },
        ),

    openFolder: async (path: string) => {
        let targetPath = path;
        if (!targetPath) {
            targetPath = await invoke<string>('config_get_minecraft_dir');
        }
        return invoke<void>('open_folder', { path: targetPath });
    },
    openUrl: (url: string) => invoke<void>('open_url', { url }),
    openExternal: (url: string) => invoke<void>('open_url', { url }),
    selectFile: async (filters?: any) => {
        if (filters?.filters?.some((f: any) => f.extensions?.includes('png') || f.extensions?.includes('jpg'))) {
            return invoke<string | null>('browse_icon');
        }
        return invoke<string | null>('browse_modpack');
    },
    selectFolder: () => invoke<string | null>('browse_directory'),
    browseDirectory: (title?: string) => invoke<string | null>('browse_directory', { title }),
    browseIcon: () => invoke<string | null>('browse_icon'),
    browseModpack: () => invoke<string | null>('browse_modpack'),
    launcherClearCache: () => invoke<void>('launcher_clear_cache').then(() => ({ ok: true })),
    cleanupTempFiles: () => invoke<number>('cleanup_temp_files'),
    curseforgeClearCache: () => invoke<void>('curseforge_clear_cache'),
    modrinthClearCache: () => invoke<void>('modrinth_clear_cache'),
    getPathForFile: (file: any) => file.path || null,

    discordRPCSetEnabled: (enabled: boolean) => invoke<void>('discord_rpc_set_enabled', { enabled }),
    discordRPCUpdate: (status: string, serverName?: string, serverIcon?: string) =>
        invoke<void>('discord_rpc_update', { status, serverName, serverIcon }),
    discordRPCIsConnected: () => invoke<boolean>('discord_rpc_is_connected'),

    checkLatestVersion: () => invoke<any>('check_latest_version'),
    getAppVersion: () => invoke<string>('get_app_version'),
    isDevMode: () => invoke<boolean>('is_dev_mode'),
    downloadUpdate: () => invoke<any>('download_update'),
    installUpdate: () => invoke<any>('install_update'),

    windowMinimize: () => invoke<void>('window_minimize'),
    windowMaximize: () => invoke<void>('window_maximize'),
    windowClose: () => invoke<void>('window_close'),
    windowIsMaximized: () => invoke<boolean>('window_is_maximized'),
    windowSetMainMode: () => invoke<void>('window_set_main_mode'),

    browseJava: (path?: string) => invoke<any>('browse_java', { path }),
    installJava: (majorVersion: number) => invoke<any>('install_java', { majorVersion }),
    detectJavaInstallations: () => invoke<any[]>('detect_java_installations'),
    deleteJava: (majorVersion: number) => invoke<any>('delete_java', { majorVersion }),
    testJavaExecution: (javaPath: string) => invoke<any>('test_java_execution', { javaPath }),
    autoDetectJava: () => invoke<string | null>('auto_detect_java'),

    checkAdminStatus: (_token?: string) => invoke<any>('admin_check_status'),
    getAdminSettings: (_token?: string) => invoke<any>('admin_get_settings'),
    saveAdminSetting: (_token: string, settingKey: string, value: string) =>
        invoke<any>('admin_save_setting', { settingKey, value }),
    getSystemInfo: () => invoke<any>('get_system_info'),
    getAdminUsers: (_token: string, page = 1, limit = 20, search = "") =>
        invoke<any>('admin_get_users', { page, limit, search }),
    getUserDetails: (_token: string, userId: string) =>
        invoke<any>('admin_get_user_details', { userId }),
    createUser: (_token: string, userData: any) =>
        invoke<any>('admin_create_user', { userData }),
    banUser: (_token: string, userId: string, reason = "") =>
        invoke<any>('admin_ban_user', { userId, reason }),
    unbanUser: (_token: string, userId: string) =>
        invoke<any>('admin_unban_user', { userId }),
    toggleUserAdmin: (_token: string, userId: string) =>
        invoke<any>('admin_toggle_user_admin', { userId }),

    instancesGetJoinedServers: () => invoke<JoinedServersResult>('instances_get_joined_servers'),
    instanceJoin: (key: string) => invoke<SimpleResult>('instance_join', { key }),
    instanceJoinPublic: (instanceId: string) => invoke<SimpleResult>('instance_join_public', { instanceId }),
    invalidateInstancesListCache: () => Promise.resolve(true),
    instanceLeave: (instanceId: string) => invoke<SimpleResult>('instance_leave', { instanceId }),
    instancesCloudInstall: (id: string) => invoke<SimpleResult>('instances_cloud_install', { id }),
    instancesCloudSync: () => invoke<SimpleResult>('instances_cloud_sync'),
    cloudInstanceSyncManaged: (id: string) => invoke<SimpleResult>('cloud_instance_sync_managed', { id }),
    instanceCheckIntegrity: (id: string) => invoke<SimpleResult>('instance_check_integrity', { id }),

    invitationsFetch: () => invoke<Invitation[]>('invitations_fetch'),
    invitationsAccept: (invitationId: string) => invoke<boolean>('invitations_accept', { invitationId }),
    invitationsReject: (invitationId: string) => invoke<boolean>('invitations_reject', { invitationId }),

    notificationsFetchAnnouncements: () => invoke<any[]>('notifications_fetch_announcements'),
    notificationsFetchUser: () => invoke<any[]>('notifications_fetch_user'),
    notificationsSync: () => invoke<NotificationSyncResult>('notifications_sync'),
    notificationsMarkRead: (notificationId: string) => invoke<boolean>('notifications_mark_read', { notificationId }),
    notificationsDelete: (notificationId: string) => invoke<boolean>('notifications_delete', { notificationId }),
    getAnnouncements: () => invoke<any[]>('notifications_fetch_announcements'),
    getNotifications: () => invoke<any[]>('notifications_fetch_user'),
    telemetryLogEvent: (eventType: string, data?: any) => invoke<void>('telemetry_log_event', { eventType, data }),
    serverPing: (host: string, port?: number) => invoke<any>('server_ping', { host, port }),

    catskincGetConfig: (gameDirectory?: string) => invoke<any>('catskinc_get_config', { gameDirectory }),
    catskincSaveConfig: (payload: { ip: string; gameDirectory?: string }) =>
        invoke<SimpleResult>('catskinc_save_config', { ip: payload.ip, gameDirectory: payload.gameDirectory }),
    catskincGetSelectedSkin: (gameDirectory?: string) =>
        invoke<{ ok: boolean; url?: string; mouthUrl?: string; slim?: boolean; error?: string }>('catskinc_get_selected_skin', { gameDirectory }),
    catskincUploadSkin: (payload: { dataUrl: string; slim: boolean; mouthOpenDataUrl?: string; gameDirectory?: string }) =>
        invoke<SimpleResult>('catskinc_upload_skin', {
            dataUrl: payload.dataUrl,
            slim: payload.slim,
            mouthOpenDataUrl: payload.mouthOpenDataUrl,
            gameDirectory: payload.gameDirectory,
        }),
    catskincClearAssets: (payload: { mode: string; gameDirectory?: string }) =>
        invoke<SimpleResult>('catskinc_clear_assets', { mode: payload.mode, gameDirectory: payload.gameDirectory }),
    minecraftGetProfile: (options?: { forceRefresh?: boolean }) =>
        invoke<any>('minecraft_get_profile', { forceRefresh: options?.forceRefresh }),
    minecraftUploadSkin: (dataUrl: string, variant: 'classic' | 'slim', fileName?: string) =>
        invoke<any>('minecraft_upload_skin', { dataUrl, variant, fileName }),
} satisfies Partial<NonNullable<Window['api']>> & Record<string, unknown>;

const warnedMissing = new Set<string>();

const apiProxy = new Proxy(api as Record<string, unknown>, {
    get(target, prop: string) {
        if (prop in target) return target[prop];

        if (typeof prop === 'string' && /^on[A-Z]/.test(prop)) {
            return (...args: unknown[]) => {
                const handler = args[0] as (data: any) => void;
                if (typeof handler === 'function') {
                    const eventName = prop.slice(2).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

                    let unsubscribed = false;
                    let unlisten: UnlistenFn | null = null;

                    listen(eventName, (event) => {
                        if (!unsubscribed) {
                            handler(event.payload);
                        }
                    }).then((fn) => {
                        unlisten = fn;
                        if (unsubscribed) {
                            fn();
                        }
                    });

                    return () => {
                        unsubscribed = true;
                        if (unlisten) {
                            unlisten();
                        }
                    };
                }
                return () => {};
            };
        }

        return (..._args: unknown[]) => {
            if (!warnedMissing.has(prop)) {
                warnedMissing.add(prop);
                console.warn(`[Tauri] window.api.${prop}() is not ported yet — returning null`);
            }
            return Promise.resolve(null);
        };
    },
});

// ── RAM cache (pre-fetched so GameTab shows real values immediately) ──
export let cachedMaxRam = 0;
export let cachedSystemRam = 0;

(async () => {
    try {
        const [maxRam, systemRam] = await Promise.all([
            invoke<number>('get_max_ram'),
            invoke<number>('get_system_ram'),
        ]);
        cachedMaxRam = maxRam;
        cachedSystemRam = systemRam;
    } catch {
        console.warn('[api] Failed to pre-fetch RAM info');
    }
})();

if (typeof window !== 'undefined') {
    (window as unknown as { api: unknown }).api = apiProxy;
}

export default apiProxy;
