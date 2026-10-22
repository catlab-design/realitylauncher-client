import React, { useState, useEffect } from "react";
import { apiUrl } from "../../lib/apiBase";
import { useShallow } from "zustand/react/shallow";
import { motion } from "framer-motion";
import { useMotionPreset } from "../../lib/motion";
import { createLaunchWatchdog, type LaunchWatchdog } from "../../lib/launchWatchdog";
import { useTranslation } from "../../hooks/useTranslation";
import { playClick, toastSuccess, toastError } from "../../lib/sounds";
import type { Server, LauncherConfig } from "../../types/launcher";
import { LiveLog } from "./LiveLog";
import {
    ServerHero,
    ServerHeroSkeleton,
    ServerCardRows,
    ServerCardRowSkeleton,
    ServerStatusStrip,
    getServerAddress,
    splitServerAddress,
    type Instance,
    type ServerAddressInfo,
    type ServerFlags,
    type ServerPing,
} from "./ServerItem";
import { ServerDetailView } from "./ServerDetailView";
import { Icons } from "../ui/Icons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import toast from "react-hot-toast";
import { useAuthStore } from "../../store/authStore";
import { useProgressStore } from "../../store/progressStore";
import { useLaunchStore } from "../../store/launchStore";
import { useUiStore } from "../../store/uiStore";
import { useConfigStore } from "../../store/configStore";
import { type AuthSession } from "../../types/launcher";

// ---------------------------------------------------------------------------
// Cache: the page paints instantly from the last known server list + pings
// (per account, memory + localStorage), then refreshes in the background.
// ---------------------------------------------------------------------------

type ServersSnapshot = {
    uid: string;
    instances: { owned: Instance[]; member: Instance[] };
    pings: Record<string, ServerPing>;
    savedAt: number;
};

const SERVERS_CACHE_KEY = "servers-cache-v1";
const IMAGE_STAMP_KEY = "servers-image-stamp";
/** Image URLs keep the same cache-busting stamp this long, so banners/icons come from the HTTP cache. */
const IMAGE_STAMP_TTL_MS = 6 * 60 * 60 * 1000;

let serversMemoryCache: ServersSnapshot | null = null;

function readServersCache(uid: string | undefined): ServersSnapshot | null {
    if (!uid) return null;
    if (serversMemoryCache?.uid === uid) return serversMemoryCache;
    try {
        const parsed = JSON.parse(localStorage.getItem(SERVERS_CACHE_KEY) || "null") as ServersSnapshot | null;
        if (parsed && parsed.uid === uid && parsed.instances) {
            serversMemoryCache = parsed;
            return parsed;
        }
    } catch { /* corrupt or unavailable storage: start empty */ }
    return null;
}

function writeServersCache(snapshot: ServersSnapshot) {
    serversMemoryCache = snapshot;
    try {
        // Favicons are data URLs and can be large; keep them in memory only.
        const pings: Record<string, ServerPing> = {};
        for (const [id, ping] of Object.entries(snapshot.pings)) pings[id] = { ...ping, favicon: null };
        localStorage.setItem(SERVERS_CACHE_KEY, JSON.stringify({ ...snapshot, pings }));
    } catch { /* quota or private mode: memory cache still works */ }
}

function readImageStamp(): number {
    try {
        const saved = Number(localStorage.getItem(IMAGE_STAMP_KEY));
        if (saved && Date.now() - saved < IMAGE_STAMP_TTL_MS) return saved;
    } catch { /* fall through */ }
    return bumpImageStamp();
}

function bumpImageStamp(): number {
    const now = Date.now();
    try { localStorage.setItem(IMAGE_STAMP_KEY, String(now)); } catch { /* ignore */ }
    return now;
}

/** Warms the HTTP cache for images that are about to be shown. */
const preloadedImages = new Set<string>();
function preloadImage(url: string) {
    if (!url || preloadedImages.has(url) || url.startsWith("data:") || url.startsWith("blob:")) return;
    preloadedImages.add(url);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
}

interface ServerMenuProps {
    servers: Server[];
    selectedServer: Server | null;
    setSelectedServer: (server: Server) => void;
    colors: any;
    onInstanceSelect?: (instance: Instance) => void;
    session: AuthSession | null;
    setActiveTab?: (tab: string) => void;
    refreshTrigger?: number;
    language?: "th" | "en";
    config: LauncherConfig;
    updateConfig?: (newConfig: Partial<LauncherConfig>) => void;
    setSettingsTab?: (tab: any) => void;
}

type ActiveTab = "my" | "explore" | "join";

export function ServerMenu({
    selectedServer,
    setSelectedServer,
    colors,
    onInstanceSelect,
    session,
    setActiveTab,
    refreshTrigger = 0,
    language = "th",
    config,
    updateConfig,
    setSettingsTab,
}: ServerMenuProps) {
    const { t } = useTranslation(language);
    const { accounts, setSession: setAuthSession, updateAccount } = useAuthStore(useShallow((s) => ({ accounts: s.accounts, setSession: s.setSession, updateAccount: s.updateAccount })));
    const {
        setInstalling,
        setInstallProgress,
        setInstallMinimized,
        setOperationType,
        setInstallingInstanceId,
    } = useProgressStore(useShallow((s) => ({
        setInstalling: s.setInstalling,
        setInstallProgress: s.setInstallProgress,
        setInstallMinimized: s.setInstallMinimized,
        setOperationType: s.setOperationType,
        setInstallingInstanceId: s.setInstallingInstanceId,
    })));

    // With a custom app background the page body stays see-through so the image shows.
    const hasAppBackground = useConfigStore((s) => !!s.backgroundImage);
    const [instances, setInstances] = useState<{ owned: Instance[]; member: Instance[] } | null>(
        () => readServersCache(session?.uuid)?.instances ?? null,
    );
    const [loading, setLoading] = useState(() => !readServersCache(session?.uuid));
    const [apiError, setApiError] = useState<string | null>(null);

    const [logViewerInstanceId, setLogViewerInstanceId] = useState<string | null>(null);
    const [playingInstances, setPlayingInstances] = useState<Set<string>>(new Set());
    
    const launchingId = useLaunchStore((s) => s.launchingId);
    const setLaunchingId = useLaunchStore((s) => s.setLaunchingId);
    const [viewingInstance, setViewingInstance] = useState<Instance | null>(null);

    // Home cards ask for a server's detail page: open it once the list has loaded.
    const pendingServerDetailId = useUiStore((state) => state.pendingServerDetailId);
    const setPendingServerDetailId = useUiStore((state) => state.setPendingServerDetailId);
    useEffect(() => {
        if (!pendingServerDetailId || loading || !instances) return;
        const found = [...instances.owned, ...instances.member].find((inst: any) => inst.id === pendingServerDetailId);
        setPendingServerDetailId(null);
        if (found) {
            handleInstanceClick(found);
            setViewingInstance(found);
        }
    }, [pendingServerDetailId, loading, instances]);
    const [timestamp, setTimestamp] = useState(readImageStamp);
    const [localInstancesByCloudId, setLocalInstancesByCloudId] = useState<Map<string, any>>(new Map());

    const [activeTab, setActiveTabState] = useState<ActiveTab>("my");
    // Card picked in the rail or a row; the hero shows it (falls back to the selected or first server).
    const [heroId, setHeroId] = useState<string | null>(null);

    const showPublic = activeTab === "explore";
    const isJoinMode = activeTab === "join";

    const [joinKey, setJoinKey] = useState("");

    const [searchQuery, setSearchQuery] = useState("");
    const [mySearchQuery, setMySearchQuery] = useState("");
    const [publicInstances, setPublicInstances] = useState<Instance[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isExploreJoinedExpanded, setIsExploreJoinedExpanded] = useState(false);

    const [joinedServers, setJoinedServers] = useState<any[]>([]);

    // Live status from the launcher's Minecraft status ping, keyed by instance id.
    const [pingById, setPingById] = useState<Record<string, ServerPing>>(() => readServersCache(session?.uuid)?.pings ?? {});
    // First servers.dat entry of installed servers that have no address on the API (status strip fallback).
    const [savedServerById, setSavedServerById] = useState<Record<string, { ip: string; name: string; icon: string | null }>>({});

    const m = useMotionPreset();
    const setImmersive = useUiStore((state) => state.setImmersive);
    const setFullBleed = useUiStore((state) => state.setFullBleed);
    const listRootRef = React.useRef<HTMLDivElement>(null);
    const heroWrapRef = React.useRef<HTMLDivElement>(null);
    const headerRef = React.useRef<HTMLDivElement>(null);
    const searchInputRef = React.useRef<HTMLInputElement>(null);

    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        confirmText?: string;
        confirmColor?: string;
        tertiaryText?: string;
        onTertiary?: () => void;
        tertiaryColor?: string;
        cancelText?: string;
        onConfirm: () => void;
    }>({
        isOpen: false,
        title: "",
        message: "",
        onConfirm: () => { },
    });

    const isAuthErrorMessage = (message: string) => (
        message.includes("401") ||
        message.includes("Unauthorized") ||
        message.includes("INVALID_TOKEN") ||
        message.includes("Session expired") ||
        message.includes("API token") ||
        message.includes("Not logged in")
    );

    const handleJoinSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!joinKey.trim()) {
            toast.error(t('please_enter_invite_key'));
            return;
        }
        const toastId = toast.loading(t('submitting'));
        try {
            const result = await (window.api as any)?.instanceJoin?.(joinKey.trim());
            if (result?.ok) {
                toast.success(t('join_success'), { id: toastId });
                fetchInstances();
                setJoinKey("");
                setActiveTabState("my");
            } else {
                let errMsg = typeof result?.error === 'string' ? result.error : t('join_failed');
                if (errMsg.includes("API token") || errMsg.includes("Unauthorized") || errMsg.includes("No token")) {
                    errMsg = t('session_expired_game') || "ไม่มี CatID หรือเซสชั่นหมดอายุ";
                }
                toast.error(errMsg, { id: toastId });
            }
        } catch (err: any) {
            toast.error(err.message || t('error_occurred'), { id: toastId });
        }
    };

    const getWithTimestamp = (url: string | null | undefined) => {
        if (!url) return "";
        if (url.startsWith("blob:") || url.startsWith("data:")) return url;
        const [base, hash] = url.split("#", 2);
        const separator = base.includes("?") ? "&" : "?";
        const stamped = `${base}${separator}t=${timestamp}`;
        return hash ? `${stamped}#${hash}` : stamped;
    };

    const stagedRevealStyle = (delayMs: number): React.CSSProperties => ({
        animationDelay: `${delayMs}ms`,
        opacity: 0,
    });

    useEffect(() => {
        const removeStartedListener = (window.api as any)?.onGameStarted((data: any) => {
            setPlayingInstances(prev => new Set(prev).add(data.instanceId));
            setLaunchingId(prev => (prev === data.instanceId ? null : prev));
        });
        const removeStoppedListener = (window.api as any)?.onGameStopped((data: any) => {
            setPlayingInstances(prev => { const s = new Set(prev); s.delete(data.instanceId); return s; });
            setLaunchingId(prev => (prev === data.instanceId ? null : prev));
        });
        return () => { removeStartedListener?.(); removeStoppedListener?.(); };
    }, []);

    const resolveLocalId = React.useCallback((instance: any): string => {
        const cloudTargetId = instance.storagePath || instance.id;
        const local = localInstancesByCloudId.get(instance.id) || (instance.storagePath && localInstancesByCloudId.get(instance.storagePath));
        return local?.id || cloudTargetId;
    }, [localInstancesByCloudId]);

    const isServerInstalled = React.useCallback((instance: any): boolean => {
        return localInstancesByCloudId.has(instance.id) || (!!instance.storagePath && localInstancesByCloudId.has(instance.storagePath));
    }, [localInstancesByCloudId]);

    useEffect(() => {
        if (instances && (instances.owned.length > 0 || instances.member.length > 0)) {
            const sync = async () => {
                const runningIds = new Set<string>();
                const all = [...(instances.owned || []), ...(instances.member || [])];
                for (const inst of all) {
                    try {
                        const targetId = resolveLocalId(inst);
                        if (await (window.api as any)?.isGameRunning?.(targetId)) runningIds.add(targetId);
                    } catch { }
                }
                setPlayingInstances(runningIds);
            };
            sync();
        }
    }, [instances, resolveLocalId]);

    // One object per Play press, so a stale launch that resolves late can't
    // clear the state of a newer one.
    const launchRef = React.useRef<{ cancelled: boolean; watchdog: LaunchWatchdog } | null>(null);

    const handleLaunchStalled = async (launch: { cancelled: boolean }) => {
        // cancel_launch refuses once the game process exists, so a game that
        // started late is left running.
        if (!(await window.api?.cancelLaunch?.())) return;
        launch.cancelled = true;
        if (launchRef.current === launch) {
            launchRef.current = null;
            setLaunchingId(null);
        }
        toast.error(t('launch_timeout'));
    };

    const handlePlayServer = async (e: React.MouseEvent, instance: any) => {
        e.stopPropagation();
        if (launchingId) {
            console.warn(`[ServerMenu] Play ignored: ${launchingId} is still launching`);
            return;
        }
        const targetId = resolveLocalId(instance);
        const launch: { cancelled: boolean; watchdog: LaunchWatchdog } = {
            cancelled: false,
            watchdog: createLaunchWatchdog(() => void handleLaunchStalled(launch)),
        };
        launchRef.current = launch;
        setLaunchingId(targetId);
        const removeLaunchProgress = window.api?.onLaunchProgress?.(() => launch.watchdog.touch());
        const removeSyncProgress = window.api?.onInstallProgress?.(() => launch.watchdog.touch());
        try {
            if (session?.authType === "catid" && session.minecraftUuid) {
                const linkedMsAccount = accounts.find(a => a.authType === "microsoft" && a.uuid === session.minecraftUuid);
                if (linkedMsAccount) {
                    const switchedSession = await window.api?.setActiveSession?.(linkedMsAccount);
                    if (switchedSession) { setAuthSession(switchedSession as AuthSession); updateAccount(switchedSession as AuthSession); }
                } else {
                    toast.error(t('session_expired_login_server'));
                    return;
                }
            }
            const refreshResult = await window.api?.authRefreshToken?.();
            if (refreshResult && refreshResult.ok === false) {
                const refreshErr = typeof refreshResult.error === "string" ? refreshResult.error : "";
                toast.error(refreshErr || t('session_expired_login_server'));
                return;
            }
            if (launch.cancelled) return;
            const res = await window.api?.instancesLaunch?.(targetId);
            // Stop or the stall watchdog already moved the launch generation
            // on, so the backend dropped this launch's game process itself.
            if (launch.cancelled) {
                setPlayingInstances(prev => { const s = new Set(prev); s.delete(targetId); return s; });
                return;
            }
            if (res?.ok) {
                toast.success(res.message || t('launching'));
                setPlayingInstances(prev => new Set(prev).add(targetId));
            } else {
                const errorMessage = res?.message || t('launch_failed_server') || t('error_occurred');
                const lowerMsg = errorMessage.toLowerCase();
                // Forge/NeoForge installer failures mention "JVM"/"java.net..." in their
                // log dump — don't misread those as a missing-Java problem.
                const isInstallerError = lowerMsg.includes("installer exited") || lowerMsg.includes("installer finished");
                const isJavaError = !isInstallerError && (lowerMsg.includes("java") || lowerMsg.includes("jre") || lowerMsg.includes("java_home"));
                if (isJavaError) {
                    const javaVersionMatch = errorMessage.match(/Java (\d+)/i);
                    const requiredVersion = javaVersionMatch ? parseInt(javaVersionMatch[1]) : 0;
                    setConfirmDialog({
                        isOpen: true,
                        title: t('java_not_found_prompt') || "Java Not Found",
                        message: `${errorMessage}\n${t('install_java_now_ask') || "Do you want to install Java now?"}`,
                        confirmText: t('install_now') || "Install Now",
                        cancelText: t('later') || "Later",
                        tertiaryText: t('go_to_install_page') || "Go to Install Page",
                        confirmColor: "#22c55e",
                        onConfirm: () => {
                            if (requiredVersion > 0 && (window.api as any)?.installJava) {
                                setActiveTab?.("settings"); setSettingsTab?.("java");
                                toastSuccess(t('downloading_java_dot') || "Downloading Java...");
                                setTimeout(() => {
                                    (window.api as any).installJava(requiredVersion)
                                        .then((result: any) => {
                                            if (result?.ok && result.path) {
                                                const pathKey = requiredVersion >= 25 ? "java25" : requiredVersion >= 21 ? "java21" : requiredVersion >= 17 ? "java17" : "java8";
                                                if (updateConfig) updateConfig({ javaPaths: { ...config.javaPaths, [pathKey]: result.path } });
                                                toastSuccess(t('java_install_success_simple') || "Java installed successfully");
                                            }
                                        })
                                        .catch((err: any) => { toastError((t('java_install_failed_prompt') || "Java install failed") + ": " + (err.message || "Unknown error")); });
                                }, 1000);
                            } else { setActiveTab?.("settings"); setSettingsTab?.("java"); }
                        },
                        onTertiary: () => { setActiveTab?.("settings"); setSettingsTab?.("java"); }
                    });
                } else {
                    toast.error(errorMessage);
                }
                setPlayingInstances(prev => { const s = new Set(prev); s.delete(targetId); return s; });
            }
        } catch (err: any) {
            toast.error(err.message || t('error_occurred'));
            setPlayingInstances(prev => { const s = new Set(prev); s.delete(targetId); return s; });
        } finally {
            launch.watchdog.stop();
            removeLaunchProgress?.();
            removeSyncProgress?.();
            if (launchRef.current === launch) {
                launchRef.current = null;
                setLaunchingId(null);
            }
        }
    };

    const handleStopServer = async (e: React.MouseEvent, instance: any) => {
        e.stopPropagation();
        const instanceId = resolveLocalId(instance);
        if (launchingId === instanceId && launchRef.current) {
            launchRef.current.cancelled = true;
            launchRef.current.watchdog.stop();
            launchRef.current = null;
        }
        try {
            await (window.api as any)?.killGame?.(instanceId);
            setPlayingInstances(prev => { const s = new Set(prev); s.delete(instanceId); return s; });
            if (launchingId === instanceId) setLaunchingId(null);
            toast.success(t('stop_command_sent'));
        } catch { toast.error(t('stop_failed_server')); }
    };

    const handleOpenFolder = (e: React.MouseEvent, instanceId: string) => {
        e.stopPropagation();
        (window.api as any)?.instancesOpenFolder?.(instanceId);
    };

    const handleJoinServer = (instance: any) => {
        setConfirmDialog({
            isOpen: true,
            title: t('confirm_join'),
            message: t('join_server_ask').replace("{name}", instance.name),
            confirmText: t('join'),
            confirmColor: colors.primary,
            onConfirm: async () => {
                const toastId = toast.loading(t('loading'));
                try {
                    const res = await (window.api as any).instanceJoinPublic(instance.id);
                    if (res?.ok) {
                        toast.success(t('join_success'), { id: toastId });
                        fetchInstances();
                        setActiveTabState("my");
                    } else { toast.error(res?.error || t('join_failed'), { id: toastId }); }
                } catch (err: any) { toast.error(t('error_occurred') + ": " + err.message, { id: toastId }); }
            }
        });
    };

    useEffect(() => { fetchInstances(); }, [session, refreshTrigger]);

    const fetchInstances = async () => {
        if (!instances) setLoading(true);
        setApiError(null);
        try {
            let cloudError: string | null = null;
            const [cloudData, localList] = await Promise.all([
                (async () => {
                    try {
                        const result = await (window.api as any)?.instancesGetJoinedServers?.();
                        if (result?.ok && result.data) return result.data;
                        // Auth errors only show the "login again" state below; never delete the
                        // saved account or log out here (a missing/rejected cloud token is often
                        // transient, e.g. right after switching accounts).
                        if (result && !result.ok) {
                            cloudError = result.error || "API error";
                        }
                    } catch (err: any) { cloudError = err.message || "Network error"; }
                    return { owned: [], member: [] };
                })(),
                (window.api as any)?.instancesList
                    ? (window.api as any).instancesList().catch(() => [])
                    : Promise.resolve([])
            ]);

            const owned = (cloudData.owned || []).map((inst: any) => ({ ...inst, isOwned: true }));
            const member = (cloudData.member || []).map((inst: any) => ({ ...inst, isOwned: false }));
            console.log("[Debug Servers] Owned:", owned, "Member:", member);
            setInstances({ owned, member });

            if (cloudError && owned.length === 0 && member.length === 0) setApiError(cloudError);

            const all = [...owned, ...member];
            const unique = all.filter((v: any, i: number, a: any[]) => a.findIndex((t: any) => t.id === v.id) === i);
            setJoinedServers(unique);

            // Cloud-backed servers are matched by cloudId (a locally installed
            // instance's own id is a fresh generated one, unrelated to the
            // server's storagePath/id) — falling back to id keeps purely local
            // instances (no cloudId) matchable too.
            if (localList) {
                const byCloudId = new Map<string, any>();
                for (const inst of localList as any[]) {
                    byCloudId.set(inst.cloudId || inst.id, inst);
                }
                setLocalInstancesByCloudId(byCloudId);
            }
        } catch (e: any) {
            setInstances({ owned: [], member: [] });
            setJoinedServers([]);
            setApiError(e.message || "Unknown error");
        } finally { setLoading(false); }
    };

    const fetchPublicInstances = async (query: string = "") => {
        setIsSearching(true);
        try {
            const url = apiUrl("/instances/public", { q: query });
            const token = session?.authType === "catid" ? (session.apiToken || session.accessToken) : session?.apiToken;
            const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
            if (res.ok) {
                const data = await res.json();
                setPublicInstances(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
            } else { setPublicInstances([]); }
        } catch { setPublicInstances([]); }
        finally { setIsSearching(false); }
    };

    useEffect(() => {
        if (activeTab === "explore") fetchPublicInstances(searchQuery);
    }, [activeTab]);

    // Pings each target's address; every result lands as soon as it arrives (a slow server doesn't hold up the rest).
    const pingServers = React.useCallback((targets: { id: string; address: string }[]) => {
        const ping = (window.api as any)?.serverPing;
        if (!ping || targets.length === 0) return undefined;
        let cancelled = false;
        for (const { id, address } of targets) {
            // "host:port" / "[v6]:port" (IPv6 literals without brackets are pinged on the default port).
            const { host, port } = splitServerAddress(address);
            Promise.resolve()
                .then(() => ping(host, port))
                .then((res: any): ServerPing => {
                    if (!res) return { online: false, players: null };
                    const players = res.players && typeof res.players.online === "number" && typeof res.players.max === "number"
                        ? { online: res.players.online, max: res.players.max }
                        : null;
                    return {
                        online: !!res.online,
                        players,
                        motd: typeof res.motd === "string" ? res.motd : null,
                        motdRaw: res.motdRaw ?? null,
                        latency: typeof res.latency === "number" ? res.latency : null,
                        version: typeof res.version === "string" ? res.version : null,
                        favicon: typeof res.favicon === "string" && res.favicon.startsWith("data:image/") ? res.favicon : null,
                        error: typeof res.error === "string" ? res.error : null,
                    };
                }, (err: any): ServerPing => ({ online: false, players: null, error: String(err?.message || err) }))
                .then((result) => {
                    if (!cancelled) setPingById((prev) => ({ ...prev, [id]: result }));
                });
        }
        return () => { cancelled = true; };
    }, []);

    // Keep the cache in step with what's on screen (never overwrite it with an error result).
    useEffect(() => {
        if (!session?.uuid || !instances || apiError) return;
        writeServersCache({ uid: session.uuid, instances, pings: pingById, savedAt: Date.now() });
    }, [session?.uuid, instances, pingById, apiError]);

    // Fetch banners/icons as soon as the list is known, so the hero and cards don't pop in late.
    useEffect(() => {
        const listed = [...(instances?.owned || []), ...(instances?.member || [])];
        for (const inst of listed) {
            if (inst.bannerUrl) preloadImage(getWithTimestamp(inst.bannerUrl));
            if (inst.iconUrl) preloadImage(getWithTimestamp(inst.iconUrl));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instances, timestamp]);

    // Ping each listed server's first address for its live status.
    useEffect(() => {
        const listed = [...(instances?.owned || []), ...(instances?.member || []), ...publicInstances.slice(0, 20)];
        const targets = listed
            .map((inst) => ({ id: inst.id, address: getServerAddress(inst) }))
            .filter((x, i, a): x is { id: string; address: string } => !!x.address && a.findIndex((y) => y.id === x.id) === i);
        return pingServers(targets);
    }, [instances, publicInstances, pingServers]);

    // Installed servers without an address on the API: take the first entry of their in-game server list.
    useEffect(() => {
        const read = (window.api as any)?.instanceSavedServers;
        if (!read || !instances) return;
        const targets = [...instances.owned, ...instances.member]
            .filter((inst, i, a) => !getServerAddress(inst) && isServerInstalled(inst) && a.findIndex((x) => x.id === inst.id) === i);
        if (targets.length === 0) {
            setSavedServerById((prev) => (Object.keys(prev).length === 0 ? prev : {}));
            return;
        }
        let cancelled = false;
        Promise.all(targets.map(async (inst) => {
            try {
                const list = await read(resolveLocalId(inst));
                const first = Array.isArray(list) ? list.find((s: any) => typeof s?.ip === "string" && s.ip.trim()) : null;
                return first
                    ? [inst.id, { ip: first.ip.trim() as string, name: typeof first.name === "string" ? first.name : "", icon: typeof first.icon === "string" ? first.icon : null }] as const
                    : null;
            } catch {
                return null;
            }
        })).then((entries) => {
            if (cancelled) return;
            const next: Record<string, { ip: string; name: string; icon: string | null }> = {};
            for (const entry of entries) if (entry) next[entry[0]] = entry[1];
            setSavedServerById(next);
        });
        return () => { cancelled = true; };
    }, [instances, isServerInstalled, resolveLocalId]);

    useEffect(() => {
        return pingServers(Object.entries(savedServerById).map(([id, saved]) => ({ id, address: saved.ip })));
    }, [savedServerById, pingServers]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        fetchPublicInstances(searchQuery);
    };

    const handleInstall = async (e: React.MouseEvent, instance: any) => {
        e.stopPropagation();
        try {
            setOperationType("install"); setInstalling(true); setInstallMinimized(false);
            setInstallingInstanceId(instance.storagePath || instance.id);
            setInstallProgress({ stage: "sync-start", type: "sync-start", message: t('starting_install') });
            handleInstanceClick(instance);
            setActiveTab?.("modpack");
            toast.success(t('starting_install'));
            const res = await (window.api as any)?.instancesCloudInstall?.(instance.storagePath || instance.id);
            if (!res?.ok) {
                const errMsg = typeof res?.error === 'string' ? res.error : t('install_failed_server');
                if (errMsg.includes("401") || errMsg.includes("Unauthorized")) toast.error(t('session_expired_login_server'));
                else if (errMsg.includes("Not logged in")) toast.error(t('please_login_session'));
                else toast.error(errMsg);
            }
        } catch (error: any) {
            toast.error(t('error_occurred') + ": " + error.message);
        } finally {
            setInstalling(false); setInstallProgress(null); setInstallMinimized(false);
            setOperationType(null); setInstallingInstanceId(null);
        }
    };

    const handleLeaveServer = (e: React.MouseEvent, instance: any) => {
        e.stopPropagation();
        setConfirmDialog({
            isOpen: true,
            title: t('confirm_leave') || "Leave Server?",
            message: t('leave_server_ask')?.replace("{name}", instance.name) || `Are you sure you want to leave ${instance.name}?`,
            confirmText: t('leave') || "Leave",
            confirmColor: colors.error || "#ef4444",
            onConfirm: async () => {
                const toastId = toast.loading(t('leaving_server') || "Leaving server...");
                try {
                    const res = await (window.api as any)?.instanceLeave?.(instance.id);
                    if (res?.ok) {
                        toast.success(t('leave_success') || "Left server successfully", { id: toastId });
                        fetchInstances();
                    } else { toast.error(res?.error || t('leave_failed') || "Failed to leave server", { id: toastId }); }
                } catch (err: any) { toast.error(t('error_occurred') + ": " + err.message, { id: toastId }); }
            }
        });
    };

    const handleViewLogs = (e: React.MouseEvent, instance: any) => {
        e.stopPropagation();
        setLogViewerInstanceId(resolveLocalId(instance));
    };

    const handleInstanceClick = (instance: any) => {
        const serverObj: Server = {
            id: instance.id,
            name: instance.name,
            description: instance.description || "",
            image: instance.iconUrl || "",
            status: "online",
            version: instance.minecraftVersion || "1.20.1",
            address: "",
            modpack: instance.name
        };
        setSelectedServer(serverObj);
        onInstanceSelect?.(instance);
    };

    const allMyInstances = [...(instances?.owned || []), ...(instances?.member || [])];

    const displayedInstances = showPublic
        ? publicInstances.filter((pubInst: any) => !joinedServers.some(joined => joined.id === pubInst.id))
        : mySearchQuery.trim()
            ? allMyInstances.filter((inst: any) => {
                const q = mySearchQuery.toLowerCase();
                return (
                    inst.name?.toLowerCase().includes(q) ||
                    inst.description?.toLowerCase().includes(q) ||
                    inst.minecraftVersion?.toLowerCase().includes(q) ||
                    inst.loaderType?.toLowerCase().includes(q)
                );
            })
            : allMyInstances;

    const myServerCount = (instances?.owned?.length ?? 0) + (instances?.member?.length ?? 0);
    const isSessionError = !!apiError && isAuthErrorMessage(apiError);

    const joinedPublicServers = joinedServers.filter((inst: any) => !!inst.isPublic);

    // Hero: the poster the user picked, else the selected server if it is listed, else the first listed one.
    const heroCandidates = showPublic && isExploreJoinedExpanded
        ? [...displayedInstances, ...joinedPublicServers]
        : displayedInstances;
    const heroInstance: any = heroCandidates.find((inst: any) => inst.id === heroId)
        ?? heroCandidates.find((inst: any) => inst.id === selectedServer?.id)
        ?? displayedInstances[0]
        ?? null;

    const selectHero = (inst: Instance) => { setHeroId(inst.id); handleInstanceClick(inst); };
    const openDetail = (inst: Instance) => { handleInstanceClick(inst); setViewingInstance(inst); };

    const getFlags = (inst: Instance): ServerFlags => {
        const targetId = resolveLocalId(inst);
        return {
            isMember: joinedServers.some((s: any) => s.id === inst.id),
            isInstalled: isServerInstalled(inst),
            isPlaying: playingInstances.has(targetId),
            isLaunching: launchingId === targetId,
        };
    };
    const getPing = (inst: Instance): ServerPing | undefined => pingById[inst.id];
    // The instance's "Server address" field first, else its first servers.dat entry.
    const getAddress = (inst: Instance): ServerAddressInfo | null => {
        const address = getServerAddress(inst);
        if (address) return { address, source: "api" };
        const saved = savedServerById[inst.id];
        return saved ? { address: saved.ip, source: "local", name: saved.name, icon: saved.icon } : null;
    };

    const showHero = !!session && !loading && !isSearching && !!heroInstance;
    // Loading draws a hero placeholder too; the controls sit on top of either, so nothing jumps when data lands.
    const heroArea = showHero || (!!session && (loading || isSearching));

    // Page draws under the title bar; bar text turns white while the hero art is under it.
    // The detail view sets its own flags, so step aside while it is open.
    useEffect(() => {
        if (viewingInstance) return;
        setFullBleed(true);
        return () => setFullBleed(false);
    }, [viewingInstance, setFullBleed]);
    useEffect(() => {
        if (viewingInstance) return;
        const scroller = listRootRef.current?.closest("main") ?? null;
        const update = () => {
            const hero = heroWrapRef.current;
            setImmersive(!!hero && !!scroller && scroller.scrollTop < hero.offsetHeight - 48);
        };
        update();
        scroller?.addEventListener("scroll", update, { passive: true });
        return () => {
            scroller?.removeEventListener("scroll", update);
            setImmersive(false);
        };
    }, [viewingInstance, showHero, setImmersive]);

    const scrollBehavior: ScrollBehavior = m.reduced ? "auto" : "smooth";
    const selectFromCard = (inst: Instance) => {
        selectHero(inst);
        listRootRef.current?.closest("main")?.scrollTo({ top: 0, behavior: scrollBehavior });
    };
    const focusSearch = () => {
        if (activeTab === "join") setActiveTabState("my");
        headerRef.current?.scrollIntoView({ behavior: scrollBehavior, block: "center" });
        requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }));
    };

    const cardHandlers = {
        getFlags,
        getPing,
        colors,
        getWithTimestamp,
        t,
        onSelect: selectFromCard,
        onViewDetail: openDetail,
        onPlay: handlePlayServer,
        onStop: handleStopServer,
        onJoin: handleJoinServer,
        onInstall: handleInstall,
    };

    // Tabs, search, refresh and key entry. Above the hero when it shows (so the hero's text can never run into
    // them), otherwise in the section header.
    const headerControls = (
        <div className={`${heroArea ? "w-full" : "min-w-0 flex-1"} flex flex-wrap items-center justify-end gap-2 *:pointer-events-auto`}>
            <div role="tablist" className="flex shrink-0 items-center gap-1 rounded-xl p-1" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                {([
                    { id: "my" as const, label: t('server_list') || "My Servers", count: !loading && myServerCount > 0 ? myServerCount : null },
                    { id: "explore" as const, label: t('explore') || "Explore", count: null },
                ]).map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => { playClick(); setActiveTabState(tab.id); }}
                            className="pressable relative isolate flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap"
                            style={{ color: active ? colors.surface : colors.onSurfaceVariant }}
                        >
                            {/* Active pill. Not a shared layoutId: it was measured mid page-transition
                                (the page scales/moves in) and could settle a few px off the track. */}
                            {active && (
                                <motion.span
                                    key="servers-tab-pill"
                                    initial={m.reduced ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={m.tabIndicator}
                                    className="absolute inset-0 -z-10 rounded-lg"
                                    style={{ backgroundColor: colors.onSurface }}
                                />
                            )}
                            <span>{tab.label}</span>
                            {tab.count !== null && (
                                <span
                                    className="min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center text-[11px] font-bold tabular-nums"
                                    style={active
                                        ? { backgroundColor: colors.secondary, color: "#111" }
                                        : { backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}
                                >
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {activeTab === "my" && (
                <div className="relative min-w-0 w-full max-w-64">
                    <Icons.Search
                        className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none"
                        style={{ color: colors.onSurface }}
                    />
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder={t('search') ? `${t('search')}…` : "ค้นหาเซิร์ฟเวอร์…"}
                        value={mySearchQuery}
                        onChange={(e) => setMySearchQuery(e.target.value)}
                        className="w-full h-10 pl-10 pr-10 rounded-full outline-none font-semibold text-sm"
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    />
                    {mySearchQuery && (
                        <button
                            type="button"
                            onClick={() => setMySearchQuery("")}
                            title="Clear search"
                            aria-label="Clear search"
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: colors.onSurfaceVariant + "30", color: colors.onSurface }}
                        >
                            <Icons.Close className="w-3 h-3" />
                        </button>
                    )}
                </div>
            )}

            {activeTab === "explore" && (
                <>
                    <form onSubmit={handleSearchSubmit} className="relative min-w-0 w-full max-w-64 group">
                        <Icons.Search
                            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none"
                            style={{ color: colors.onSurface }}
                        />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder={t('search_public_servers') || "Search servers…"}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-10 pl-10 pr-14 rounded-full outline-none text-sm"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                        />
                        {searchQuery && (
                            <button
                                type="submit"
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold px-2 py-1 rounded-full opacity-60 hover:opacity-100 transition-opacity"
                                style={{ color: colors.primary }}
                            >
                                {t('search') || "Go"}
                            </button>
                        )}
                    </form>

                    <button
                        type="button"
                        onClick={() => { playClick(); setIsExploreJoinedExpanded(!isExploreJoinedExpanded); }}
                        className="pressable h-10 pl-3.5 pr-2 rounded-full flex items-center gap-2 text-sm font-semibold select-none shrink-0 hover:brightness-105"
                        style={isExploreJoinedExpanded
                            ? { backgroundColor: colors.secondary, color: "#111" }
                            : { backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                        aria-pressed={isExploreJoinedExpanded}
                    >
                        {isExploreJoinedExpanded ? <Icons.Check className="w-4 h-4" /> : <Icons.Users className="w-4 h-4" />}
                        <span>{t('joined_servers')}</span>
                        <span
                            className="min-w-6 h-6 px-1.5 rounded-full flex items-center justify-center text-xs font-bold tabular-nums"
                            style={isExploreJoinedExpanded ? { backgroundColor: "rgba(0,0,0,0.12)" } : { backgroundColor: colors.surface, color: colors.onSurfaceVariant }}
                        >
                            {joinedPublicServers.length}
                        </span>
                    </button>
                </>
            )}

            <button
                type="button"
                onClick={() => { playClick(); setTimestamp(bumpImageStamp()); fetchInstances(); }}
                className="pressable w-10 h-10 shrink-0 rounded-full flex items-center justify-center hover:brightness-95"
                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                title={t('retry') || "Refresh"}
                aria-label={t('retry') || "Refresh"}
            >
                <Icons.Refresh className="w-4.5 h-4.5" />
            </button>
            <button
                type="button"
                onClick={() => {
                    playClick();
                    setActiveTabState(activeTab === "join" ? "my" : "join");
                    setJoinKey("");
                }}
                className="pressable h-10 px-4 shrink-0 rounded-full flex items-center gap-2 text-sm font-bold hover:brightness-105"
                style={activeTab === "join"
                    ? { backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }
                    : { backgroundColor: colors.secondary, color: "#111" }}
            >
                {activeTab === "join" ? <Icons.Close className="w-4 h-4" /> : <Icons.Key className="w-4 h-4" />}
                <span className="hidden sm:inline">{activeTab === "join" ? t('cancel') : t('enter_key')}</span>
            </button>
        </div>
    );

    return (
        <div className="h-full flex flex-col">
            <LiveLog
                colors={colors}
                isOpen={logViewerInstanceId !== null}
                onClose={() => setLogViewerInstanceId(null)}
                instanceId={logViewerInstanceId}
            />

            {viewingInstance ? (
                <ServerDetailView
                    instance={viewingInstance}
                    onBack={() => setViewingInstance(null)}
                    onPlay={handlePlayServer}
                    onStop={handleStopServer}
                    onInstall={handleInstall}
                    onJoin={handleJoinServer}
                    onViewLogs={handleViewLogs}
                    isInstalled={isServerInstalled(viewingInstance)}
                    isPlaying={playingInstances.has(resolveLocalId(viewingInstance))}
                    isLaunching={launchingId === resolveLocalId(viewingInstance)}
                    isMember={joinedServers.some(s => s.id === viewingInstance.id)}
                    address={getAddress(viewingInstance)?.address ?? null}
                    ping={getPing(viewingInstance)}
                    colors={colors}
                    t={t}
                    getWithTimestamp={getWithTimestamp}
                />
            ) : (
                <div
                    ref={listRootRef}
                    className="-mx-6 -mt-3 -mb-6 relative flex min-h-[calc(100%+2.25rem)] flex-col pb-16 animate-fade-in"
                    style={{ backgroundColor: hasAppBackground ? "transparent" : colors.surface }}
                >
                    {/* Hero: the selected server's art runs under the title bar, with the controls floating on it. */}
                    {showHero && heroInstance ? (
                        <div ref={heroWrapRef} className="relative shrink-0">
                            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-8 pt-14">{headerControls}</div>
                            <ServerHero
                                instance={heroInstance}
                                railItems={heroCandidates}
                                flags={getFlags(heroInstance)}
                                ping={getPing(heroInstance)}
                                colors={colors}
                                getWithTimestamp={getWithTimestamp}
                                t={t}
                                onSelect={selectHero}
                                onViewDetail={openDetail}
                                onLeave={handleLeaveServer}
                                onSearch={focusSearch}
                                onViewLogs={handleViewLogs}
                                onPlay={handlePlayServer}
                                onStop={handleStopServer}
                                onJoin={handleJoinServer}
                                onInstall={handleInstall}
                            />
                        </div>
                    ) : session && (loading || isSearching) ? (
                        <div className="relative shrink-0">
                            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-8 pt-14">{headerControls}</div>
                            <ServerHeroSkeleton colors={colors} />
                        </div>
                    ) : (
                        // Nothing to draw under the title bar: keep the content clear of it.
                        <div className="h-16 shrink-0" />
                    )}

                    <div className={`relative z-10 flex flex-1 flex-col px-8 ${heroArea ? "pt-6" : ""}`}>
                        {/* Section header: title left; controls right unless they sit above the hero. */}
                        <div ref={headerRef} className="relative z-20 shrink-0">
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                                <h2 className="text-lg font-bold" style={{ color: colors.onSurface }}>
                                    {activeTab === "explore" ? (t('explore') || "Explore") : (t('my_servers') || "My Servers")}
                                </h2>

                                {!heroArea && headerControls}
                            </div>

                            {activeTab === "join" && (
                                <form onSubmit={handleJoinSubmit} className="relative mt-3 animate-fade-in flex gap-2">
                                    <div className="relative flex-1">
                                        <Icons.Key
                                            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none"
                                            style={{ color: colors.onSurface }}
                                        />
                                        <input
                                            type="text"
                                            placeholder={t('enter_invite_key_placeholder') || "INVITE-KEY"}
                                            value={joinKey}
                                            onChange={(e) => setJoinKey(e.target.value.replace(/[^A-Z0-9-]/gi, '').toUpperCase())}
                                            className="w-full h-10 pl-10 pr-4 rounded-full outline-none transition-all border font-mono tracking-widest uppercase text-sm"
                                            style={{
                                                backgroundColor: colors.surfaceContainerHighest,
                                                color: colors.onSurface,
                                                borderColor: "transparent",
                                                letterSpacing: "0.15em"
                                            }}
                                            onFocus={(e) => e.currentTarget.style.borderColor = colors.primary + "60"}
                                            onBlur={(e) => e.currentTarget.style.borderColor = "transparent"}
                                            autoFocus
                                            maxLength={32}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={!joinKey.trim()}
                                        className="h-10 px-5 rounded-full font-bold text-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
                                        style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                                    >
                                        {t('join') || "Join"}
                                    </button>
                                </form>
                            )}
                        </div>

                        {!session ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-5 py-16 animate-fade-in">
                                <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                    <Icons.Person className="w-10 h-10" style={{ color: colors.primary }} />
                                </div>
                                <div className="text-center">
                                    <h3 className="text-lg font-bold mb-1.5" style={{ color: colors.onSurface }}>{t('please_login_session')}</h3>
                                    <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{t('connect_microsoft_desc')}</p>
                                </div>
                            </div>
                        ) : (loading || isSearching) ? (
                            // Loading: skeleton hero above and a skeleton card row here.
                            <div className="mt-5">
                                <ServerCardRowSkeleton colors={colors} />
                            </div>
                        ) : (
                            <div className="mt-5 flex flex-1 flex-col gap-10">
                                {showPublic && isExploreJoinedExpanded && (
                                    <section className="animate-fade-in">
                                        <div className="mb-3 flex items-baseline gap-2.5">
                                            <h3 className="text-base font-bold" style={{ color: colors.onSurface }}>{t('joined_servers')}</h3>
                                            <span className="text-sm font-semibold tabular-nums" style={{ color: colors.onSurfaceVariant }}>{joinedPublicServers.length}</span>
                                        </div>
                                        {joinedPublicServers.length > 0 ? (
                                            <ServerCardRows instances={joinedPublicServers} selectedId={heroInstance?.id ?? null} {...cardHandlers} />
                                        ) : (
                                            <p className="py-3 text-sm font-semibold" style={{ color: colors.onSurfaceVariant, opacity: 0.6 }}>{t('no_joined_public_servers')}</p>
                                        )}
                                    </section>
                                )}

                                {displayedInstances.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center gap-5 py-16 animate-fade-in">
                                        <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                            {apiError ? (
                                                <svg className="w-10 h-10" style={{ color: colors.error || "#ef4444" }} viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                                                </svg>
                                            ) : showPublic ? (
                                                <Icons.Search className="w-10 h-10" style={{ color: colors.onSurfaceVariant }} />
                                            ) : (
                                                <Icons.Dns className="w-10 h-10" style={{ color: colors.onSurfaceVariant }} />
                                            )}
                                        </div>
                                        <div className="text-center">
                                            <h3 className="text-lg font-bold mb-1.5" style={{ color: colors.onSurface }}>
                                                {apiError
                                                    ? isSessionError
                                                        ? (t('session_expired_login_server') || "Session expired, please login again")
                                                        : (t('api_connection_error') || "ไม่สามารถเชื่อมต่อได้")
                                                    : showPublic ? t('no_public_servers')
                                                        : t('no_servers_found_in_list')}
                                            </h3>
                                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                                                {apiError
                                                    ? isSessionError
                                                        ? (t('session_expired') || "Session expired - Please login again")
                                                        : (t('api_connection_error_desc') || "API อาจล่มหรือเครือข่ายขัดข้อง")
                                                    : showPublic ? t('no_search_results')
                                                        : t('no_server_invite_desc')}
                                            </p>
                                            {apiError && (
                                                <button
                                                    type="button"
                                                    onClick={() => { setLoading(true); fetchInstances(); }}
                                                    className="mt-4 px-6 py-2.5 rounded-xl font-bold text-sm transition-all hover:brightness-110 active:scale-95"
                                                    style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                                                >
                                                    {t('retry') || "ลองใหม่"}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <ServerCardRows instances={displayedInstances} selectedId={heroInstance?.id ?? null} {...cardHandlers} />
                                )}

                                {/* Live status of the listed servers that have an address (cards skeleton until their first ping). */}
                                {!showPublic && displayedInstances.some((inst: any) => !!getAddress(inst)) && (
                                    <motion.section variants={m.fadeUp} {...m.states}>
                                        <h3 className="mb-3 text-base font-bold" style={{ color: colors.onSurface }}>{t('server_status_title')}</h3>
                                        <ServerStatusStrip
                                            instances={displayedInstances}
                                            getAddress={getAddress}
                                            getFlags={getFlags}
                                            getPing={getPing}
                                            getWithTimestamp={getWithTimestamp}
                                            colors={colors}
                                            t={t}
                                            onPlay={handlePlayServer}
                                            onStop={handleStopServer}
                                            onJoin={handleJoinServer}
                                            onInstall={handleInstall}
                                        />
                                    </motion.section>
                                )}
                            </div>
                        )}
                    </div>

                    <ConfirmDialog
                        isOpen={confirmDialog.isOpen}
                        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                        onConfirm={confirmDialog.onConfirm}
                        title={confirmDialog.title}
                        message={confirmDialog.message}
                        confirmText={confirmDialog.confirmText}
                        confirmColor={confirmDialog.confirmColor}
                        tertiaryText={confirmDialog.tertiaryText}
                        onTertiary={confirmDialog.onTertiary}
                        tertiaryColor={confirmDialog.tertiaryColor}
                        cancelText={confirmDialog.cancelText}
                        colors={colors}
                    />
                </div>
            )}
        </div>
    );
}
