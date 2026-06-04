import React, { useState, useEffect } from "react";
import { useTranslation } from "../../hooks/useTranslation";
import { playClick, toastSuccess, toastError } from "../../lib/sounds";
import { cn } from "../../lib/utils";
import type { Server, LauncherConfig } from "../../types/launcher";
import { LiveLog } from "./LiveLog";
import ServerItem, { type Instance } from "./ServerItem";
import { ServerDetailView } from "./ServerDetailView";
import { Icons } from "../ui/Icons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import toast from "react-hot-toast";
import { useAuthStore } from "../../store/authStore";
import { useProgressStore } from "../../store/progressStore";
import { useLaunchStore } from "../../store/launchStore";
import { type AuthSession } from "../../types/launcher";

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

// ── Active Tab Type ──────────────────────────────────────────────────────────
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
    const { accounts, setSession: setAuthSession, updateAccount, removeAccount } = useAuthStore();
    const {
        setInstalling,
        setInstallProgress,
        setInstallMinimized,
        setOperationType,
        setInstallingInstanceId,
    } = useProgressStore();

    const [instances, setInstances] = useState<{ owned: Instance[]; member: Instance[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [apiError, setApiError] = useState<string | null>(null);

    const [logViewerInstanceId, setLogViewerInstanceId] = useState<string | null>(null);
    const [playingInstances, setPlayingInstances] = useState<Set<string>>(new Set());
    // launchingId อยู่ใน global store เพื่อให้สถานะ "กำลังเปิด" รอดการสลับแท็บ
    const launchingId = useLaunchStore((s) => s.launchingId);
    const setLaunchingId = useLaunchStore((s) => s.setLaunchingId);
    const [viewingInstance, setViewingInstance] = useState<Instance | null>(null);
    const [timestamp, setTimestamp] = useState(Date.now());
    const [localInstances, setLocalInstances] = useState<Set<string>>(new Set());

    // ── Tab state ────────────────────────────────────────────────────────────
    const [activeTab, setActiveTabState] = useState<ActiveTab>("my");
    const [viewMode, setViewMode] = useState<"tiles" | "table" | "list">(() => {
        if (typeof window !== "undefined") {
            return (localStorage.getItem("serverViewMode") as any) || "list";
        }
        return "list";
    });
    const [viewMenuOpen, setViewMenuOpen] = useState(false);

    // Legacy state derived from tab
    const showPublic = activeTab === "explore";
    const isJoinMode = activeTab === "join";

    // ── Join state ───────────────────────────────────────────────────────────
    const [joinKey, setJoinKey] = useState("");

    // ── Explore / Search state ───────────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState("");
    const [mySearchQuery, setMySearchQuery] = useState("");
    const [publicInstances, setPublicInstances] = useState<Instance[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isExploreJoinedExpanded, setIsExploreJoinedExpanded] = useState(false);

    // ── Joined servers (flat list) ────────────────────────────────────────────
    const [joinedServers, setJoinedServers] = useState<any[]>([]);

    // ── Confirm Dialog ────────────────────────────────────────────────────────
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

    // ── Join Submit ────────────────────────────────────────────────────────────
    const isAuthErrorMessage = (message: string) => (
        message.includes("401") ||
        message.includes("Unauthorized") ||
        message.includes("INVALID_TOKEN") ||
        message.includes("Session expired") ||
        message.includes("API token") ||
        message.includes("Not logged in")
    );

    const handleInvalidSession = async () => {
        if (session) {
            removeAccount(session.uuid, session.type);
        }
        setAuthSession(null);
        try {
            await window.api?.logout?.();
        } catch {
        }
    };

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

    // ── Helpers ────────────────────────────────────────────────────────────────
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

    // ── Game Event Listeners ───────────────────────────────────────────────────
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

    // ── Sync running status when instances load ────────────────────────────────
    useEffect(() => {
        if (instances && (instances.owned.length > 0 || instances.member.length > 0)) {
            const sync = async () => {
                const runningIds = new Set<string>();
                const all = [...(instances.owned || []), ...(instances.member || [])];
                for (const inst of all) {
                    try {
                        if (await (window.api as any)?.isGameRunning?.(inst.id)) runningIds.add(inst.id);
                    } catch { }
                }
                setPlayingInstances(runningIds);
            };
            sync();
        }
    }, [instances]);

    const launchCancelledRef = React.useRef(false);

    // ── Play ───────────────────────────────────────────────────────────────────
    const handlePlayServer = async (e: React.MouseEvent, instance: any) => {
        e.stopPropagation();
        if (launchingId) return;
        launchCancelledRef.current = false;
        setLaunchingId(instance.id);
        try {
            if (session?.type === "catid" && session.minecraftUuid) {
                const linkedMsAccount = accounts.find(a => a.type === "microsoft" && a.uuid === session.minecraftUuid);
                if (linkedMsAccount) {
                    const switchedSession = await window.api?.setActiveSession?.(linkedMsAccount);
                    if (switchedSession) { setAuthSession(switchedSession as AuthSession); updateAccount(switchedSession as AuthSession); }
                } else {
                    toast.error(t('session_expired_login_server')); return;
                }
            }
            const refreshResult = await window.api?.authRefreshToken?.();
            if (refreshResult && refreshResult.ok === false) {
                const requiresRelogin = refreshResult.requiresRelogin === true;
                const refreshErr = typeof refreshResult.error === "string" ? refreshResult.error : "";
                toast.error(requiresRelogin ? t('session_expired_login_server') : (refreshErr || t('session_expired_login_server')));
                return;
            }
            const res = await window.api?.instancesLaunch?.(instance.id);
            if (launchCancelledRef.current) {
                await window.api?.killGame?.(instance.id);
                setPlayingInstances(prev => { const s = new Set(prev); s.delete(instance.id); return s; });
                return;
            }
            if (res?.ok) {
                toast.success(res.message || t('launching'));
                setPlayingInstances(prev => new Set(prev).add(instance.id));
            } else {
                const errorMessage = res?.message || t('launch_failed_server') || t('error_occurred');
                const isJavaError = errorMessage.toLowerCase().includes("java") || errorMessage.toLowerCase().includes("jre") || errorMessage.toLowerCase().includes("java_home");
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
                setPlayingInstances(prev => { const s = new Set(prev); s.delete(instance.id); return s; });
            }
        } catch (err: any) {
            toast.error(err.message || t('error_occurred'));
            setPlayingInstances(prev => { const s = new Set(prev); s.delete(instance.id); return s; });
        } finally { setLaunchingId(null); }
    };

    // ── Stop ───────────────────────────────────────────────────────────────────
    const handleStopServer = async (e: React.MouseEvent, instanceId: string) => {
        e.stopPropagation();
        if (launchingId === instanceId) launchCancelledRef.current = true;
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

    // ── Join (public) ──────────────────────────────────────────────────────────
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

    // ── Fetch ──────────────────────────────────────────────────────────────────
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
                        if (result && !result.ok) {
                            cloudError = result.error || "API error";
                            if (cloudError && isAuthErrorMessage(cloudError)) {
                                await handleInvalidSession();
                            }
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

            if (localList) setLocalInstances(new Set(localList.map((i: any) => i.id)));
        } catch (e: any) {
            setInstances({ owned: [], member: [] });
            setJoinedServers([]);
            setApiError(e.message || "Unknown error");
        } finally { setLoading(false); }
    };

    // ── Public / Explore ───────────────────────────────────────────────────────
    const fetchPublicInstances = async (query: string = "") => {
        setIsSearching(true);
        try {
            const apiUrl = (window as any).API_URL;
            const url = new URL(`${apiUrl}/instances/public`);
            if (query) url.searchParams.append("q", query);
            const token = session?.type === "catid" ? (session.apiToken || session.accessToken) : session?.apiToken;
            const res = await fetch(url.toString(), { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
            if (res.ok) {
                const data = await res.json();
                setPublicInstances(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
            } else { setPublicInstances([]); }
        } catch { setPublicInstances([]); }
        finally { setIsSearching(false); }
    };

    useEffect(() => {
        setViewMenuOpen(false);
        if (activeTab === "explore") fetchPublicInstances(searchQuery);
    }, [activeTab]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        fetchPublicInstances(searchQuery);
    };

    // ── Install ────────────────────────────────────────────────────────────────
    const handleInstall = async (e: React.MouseEvent, instance: any) => {
        e.stopPropagation();
        try {
            setOperationType("install"); setInstalling(true); setInstallMinimized(false);
            setInstallingInstanceId(instance.id);
            setInstallProgress({ stage: "sync-start", type: "sync-start", message: t('starting_install') });
            handleInstanceClick(instance);
            setActiveTab?.("modpack");
            toast.success(t('starting_install'));
            const res = await (window.api as any)?.instancesCloudInstall?.(instance.id);
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

    // ── Leave ──────────────────────────────────────────────────────────────────
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
        setLogViewerInstanceId(instance.id);
    };

    // ── Instance Click ─────────────────────────────────────────────────────────
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

    // ── Displayed instances ────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    //  RENDER
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="h-full flex flex-col">
            {/* LiveLog Viewer */}
            <LiveLog
                colors={colors}
                isOpen={logViewerInstanceId !== null}
                onClose={() => setLogViewerInstanceId(null)}
                instanceId={logViewerInstanceId}
            />

            {/* Server Detail View */}
            {viewingInstance ? (
                <ServerDetailView
                    instance={viewingInstance}
                    onBack={() => setViewingInstance(null)}
                    onPlay={handlePlayServer}
                    onStop={handleStopServer}
                    onInstall={handleInstall}
                    onJoin={handleJoinServer}
                    onViewLogs={handleViewLogs}
                    isInstalled={localInstances.has(viewingInstance.storagePath || viewingInstance.id)}
                    isPlaying={playingInstances.has(viewingInstance.id)}
                    isLaunching={launchingId === viewingInstance.id}
                    isMember={joinedServers.some(s => s.id === viewingInstance.id)}
                    colors={colors}
                    t={t}
                    getWithTimestamp={getWithTimestamp}
                />
            ) : (
                <div className="h-full flex flex-col animate-fade-in">

                    {/* ── HEADER ──────────────────────────────────────────── */}
                    <div className="shrink-0 mb-5 animate-fade-in relative z-20">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            {/* Page Title */}
                            <div>
                                <h2 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>
                                    {activeTab === "join"
                                        ? t('enter_key')
                                        : activeTab === "explore"
                                            ? t('explore_servers')
                                            : t('server_list')}
                                </h2>
                                <p className="text-sm mt-0.5" style={{ color: colors.onSurfaceVariant, opacity: 0.65 }}>
                                    {activeTab === "join"
                                        ? t('enter_invite_key_desc')
                                        : activeTab === "explore"
                                            ? t('explore_community_desc')
                                            : t('select_server_desc')}
                                </p>
                            </div>

                            {/* Right actions: Refresh + Join button */}
                            <div className="flex items-center gap-2 shrink-0">
                                {/* Refresh */}
                                <button
                                    type="button"
                                    onClick={() => { playClick(); fetchInstances(); }}
                                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:brightness-110 active:scale-95"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}
                                    title={t('retry') || "Refresh"}
                                >
                                    <Icons.Refresh className="w-4 h-4" />
                                </button>

                                {/* Join with Key button */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        playClick();
                                        setActiveTabState(activeTab === "join" ? "my" : "join");
                                        setJoinKey("");
                                    }}
                                    className="h-9 px-4 rounded-xl flex items-center gap-2 transition-all hover:brightness-110 active:scale-95 font-bold text-sm"
                                    style={activeTab === "join"
                                        ? { backgroundColor: colors.error || "#ef4444", color: "#fff" }
                                        : { backgroundColor: colors.secondary, color: "#1a1a1a" }
                                    }
                                >
                                    {activeTab === "join" ? (
                                        <>
                                            <Icons.Close className="w-4 h-4" />
                                            <span className="hidden sm:inline">{t('cancel')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Icons.Key className="w-4 h-4" />
                                            <span className="hidden sm:inline">{t('enter_key')}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* ── TAB BAR ───────────────────────────────────────── */}
                        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                            {/* My Servers Tab */}
                            <button
                                type="button"
                                onClick={() => { playClick(); setActiveTabState("my"); }}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-semibold transition-all",
                                    activeTab === "my" ? "" : "hover:bg-white/5"
                                )}
                                style={activeTab === "my"
                                    ? { backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }
                                    : { color: colors.onSurfaceVariant }
                                }
                            >
                                <Icons.Dns className="w-4 h-4" />
                                <span>{t('server_list') || "My Servers"}</span>
                                {!loading && myServerCount > 0 && (
                                    <span
                                        className="px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-4.5 text-center"
                                        style={{
                                            backgroundColor: activeTab === "my" ? colors.primary + "25" : colors.surfaceContainerHighest,
                                            color: activeTab === "my" ? colors.primary : colors.onSurfaceVariant
                                        }}
                                    >
                                        {myServerCount}
                                    </span>
                                )}
                            </button>

                            {/* Explore Tab */}
                            <button
                                type="button"
                                onClick={() => { playClick(); setActiveTabState("explore"); }}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-semibold transition-all",
                                    activeTab === "explore" ? "" : "hover:bg-white/5"
                                )}
                                style={activeTab === "explore"
                                    ? { backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }
                                    : { color: colors.onSurfaceVariant }
                                }
                            >
                                <Icons.Compass className="w-4 h-4" />
                                <span>{t('explore') || "Explore"}</span>
                            </button>
                        </div>

                        {/* ── MY SERVERS SEARCH BAR & VIEW SWITCHER ─────────── */}
                        {activeTab === "my" && (
                            <div className="flex items-center gap-2 mt-3 animate-fade-in">
                                <div className="relative flex-1">
                                    <Icons.Search
                                        className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none"
                                        style={{ color: colors.onSurface }}
                                    />
                                    <input
                                        type="text"
                                        placeholder={t('search') ? `${t('search')}…` : "ค้นหาเซิร์ฟเวอร์…"}
                                        value={mySearchQuery}
                                        onChange={(e) => setMySearchQuery(e.target.value)}
                                        className="w-full h-10 pl-10 pr-10 rounded-xl outline-none transition-all border font-semibold text-sm"
                                        style={{
                                            backgroundColor: colors.surfaceContainerHighest,
                                            color: colors.onSurface,
                                            borderColor: "transparent",
                                        }}
                                        onFocus={(e) => { e.currentTarget.style.borderColor = colors.primary + "60"; }}
                                        onBlur={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
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

                                {/* View Switcher Dropdown */}
                                <div className="relative shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => { playClick(); setViewMenuOpen(!viewMenuOpen); }}
                                        className="h-10 px-4 rounded-xl flex items-center gap-2 transition-all hover:brightness-110 active:scale-95 font-bold text-sm select-none border border-transparent outline-none focus:outline-none focus:ring-0"
                                        style={{
                                            backgroundColor: colors.surfaceContainerHighest,
                                            color: colors.onSurface,
                                        }}
                                    >
                                        {viewMode === "tiles" ? (
                                            <Icons.Grid className="w-4 h-4" />
                                        ) : viewMode === "table" ? (
                                            <Icons.Table className="w-4 h-4" />
                                        ) : (
                                            <Icons.List className="w-4 h-4" />
                                        )}
                                        <span>{t('view_mode') || "View"}</span>
                                        <Icons.ArrowDown className="w-3.5 h-3.5 opacity-60" />
                                    </button>

                                    {viewMenuOpen && (
                                        <>
                                            {/* Click outside backdrop */}
                                            <div 
                                                className="fixed inset-0 z-40" 
                                                onClick={() => setViewMenuOpen(false)}
                                            />
                                            {/* Dropdown Menu */}
                                            <div 
                                                className="absolute right-0 mt-1.5 z-50 min-w-[140px] rounded-xl shadow-xl border p-1 flex flex-col gap-0.5 animate-fade-in"
                                                style={{ 
                                                    backgroundColor: colors.surfaceContainer,
                                                    borderColor: colors.outline + "15",
                                                    color: colors.onSurface
                                                }}
                                            >
                                                {/* Tiles option */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        playClick();
                                                        setViewMode("tiles");
                                                        localStorage.setItem("serverViewMode", "tiles");
                                                        setViewMenuOpen(false);
                                                    }}
                                                    className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold hover:bg-white/5 transition-all w-full text-left"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Icons.Grid className="w-3.5 h-3.5 opacity-70" />
                                                        <span>{t('view_tiles') || "Tiles"}</span>
                                                    </div>
                                                    {viewMode === "tiles" && <Icons.Check className="w-3.5 h-3.5 text-emerald-500" />}
                                                </button>

                                                {/* Table option */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        playClick();
                                                        setViewMode("table");
                                                        localStorage.setItem("serverViewMode", "table");
                                                        setViewMenuOpen(false);
                                                    }}
                                                    className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold hover:bg-white/5 transition-all w-full text-left"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Icons.Table className="w-3.5 h-3.5 opacity-70" />
                                                        <span>{t('view_table') || "Table"}</span>
                                                    </div>
                                                    {viewMode === "table" && <Icons.Check className="w-3.5 h-3.5 text-emerald-500" />}
                                                </button>

                                                {/* List option */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        playClick();
                                                        setViewMode("list");
                                                        localStorage.setItem("serverViewMode", "list");
                                                        setViewMenuOpen(false);
                                                    }}
                                                    className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold hover:bg-white/5 transition-all w-full text-left"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Icons.List className="w-3.5 h-3.5 opacity-70" />
                                                        <span>{t('view_list') || "List"}</span>
                                                    </div>
                                                    {viewMode === "list" && <Icons.Check className="w-3.5 h-3.5 text-emerald-500" />}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── EXPLORE SEARCH & FILTER ROW ──────────────────────── */}
                        {activeTab === "explore" && (
                            <div className="flex flex-col gap-3 mt-3 animate-fade-in">
                                <div className="flex items-center gap-2">
                                    <form onSubmit={handleSearchSubmit} className="relative flex-1 group">
                                        <Icons.Search
                                            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none"
                                            style={{ color: colors.onSurface }}
                                        />
                                        <input
                                            type="text"
                                            placeholder={t('search_public_servers') || "Search servers…"}
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full h-10 pl-10 pr-4 rounded-xl outline-none transition-all border"
                                            style={{
                                                backgroundColor: colors.surfaceContainerHighest,
                                                color: colors.onSurface,
                                                borderColor: "transparent",
                                            }}
                                            onFocus={(e) => e.currentTarget.style.borderColor = colors.primary + "60"}
                                            onBlur={(e) => e.currentTarget.style.borderColor = "transparent"}
                                        />
                                        {searchQuery && (
                                            <button
                                                type="submit"
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold px-2 py-1 rounded-lg opacity-60 hover:opacity-100 transition-opacity"
                                                style={{ color: colors.primary }}
                                            >
                                                {t('search') || "Go"}
                                            </button>
                                        )}
                                    </form>

                                    <button
                                        type="button"
                                        onClick={() => { playClick(); setIsExploreJoinedExpanded(!isExploreJoinedExpanded); }}
                                        className="h-10 px-4 rounded-xl flex items-center gap-2 transition-all hover:brightness-110 active:scale-95 font-bold text-sm select-none shrink-0"
                                        style={{
                                            backgroundColor: isExploreJoinedExpanded ? colors.primary : colors.surfaceContainer,
                                            color: isExploreJoinedExpanded ? colors.onPrimary : colors.onSurface,
                                            border: `1.5px solid ${colors.outline}12`,
                                        }}
                                    >
                                        <i className="fa-solid fa-circle-check text-base" />
                                        <span>{t('joined_servers')}</span>
                                        <span 
                                            className="px-1.5 py-0.5 rounded-md text-[10px] font-black"
                                            style={{
                                                backgroundColor: isExploreJoinedExpanded ? "rgba(0,0,0,0.15)" : colors.surfaceContainerHighest,
                                                color: isExploreJoinedExpanded ? "#fff" : colors.onSurfaceVariant
                                            }}
                                        >
                                            {joinedServers.filter((inst: any) => !!inst.isPublic).length}
                                        </span>
                                    </button>

                                    {/* View Switcher Dropdown */}
                                    <div className="relative shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => { playClick(); setViewMenuOpen(!viewMenuOpen); }}
                                            className="h-10 px-4 rounded-xl flex items-center gap-2 transition-all hover:brightness-110 active:scale-95 font-bold text-sm select-none border border-transparent outline-none focus:outline-none focus:ring-0"
                                            style={{
                                                backgroundColor: colors.surfaceContainerHighest,
                                                color: colors.onSurface,
                                            }}
                                        >
                                            {viewMode === "tiles" ? (
                                                <Icons.Grid className="w-4 h-4" />
                                            ) : viewMode === "table" ? (
                                                <Icons.Table className="w-4 h-4" />
                                            ) : (
                                                <Icons.List className="w-4 h-4" />
                                            )}
                                            <span>{t('view_mode') || "View"}</span>
                                            <Icons.ArrowDown className="w-3.5 h-3.5 opacity-60" />
                                        </button>

                                        {viewMenuOpen && (
                                            <>
                                                {/* Click outside backdrop */}
                                                <div 
                                                    className="fixed inset-0 z-40" 
                                                    onClick={() => setViewMenuOpen(false)}
                                                />
                                                {/* Dropdown Menu */}
                                                <div 
                                                    className="absolute right-0 mt-1.5 z-50 min-w-[140px] rounded-xl shadow-xl border p-1 flex flex-col gap-0.5 animate-fade-in"
                                                    style={{ 
                                                        backgroundColor: colors.surfaceContainer,
                                                        borderColor: colors.outline + "15",
                                                        color: colors.onSurface
                                                    }}
                                                >
                                                    {/* Tiles option */}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            playClick();
                                                            setViewMode("tiles");
                                                            localStorage.setItem("serverViewMode", "tiles");
                                                            setViewMenuOpen(false);
                                                        }}
                                                        className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold hover:bg-white/5 transition-all w-full text-left"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <Icons.Grid className="w-3.5 h-3.5 opacity-70" />
                                                            <span>{t('view_tiles') || "Tiles"}</span>
                                                        </div>
                                                        {viewMode === "tiles" && <Icons.Check className="w-3.5 h-3.5 text-emerald-500" />}
                                                    </button>

                                                    {/* Table option */}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            playClick();
                                                            setViewMode("table");
                                                            localStorage.setItem("serverViewMode", "table");
                                                            setViewMenuOpen(false);
                                                        }}
                                                        className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold hover:bg-white/5 transition-all w-full text-left"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <Icons.Table className="w-3.5 h-3.5 opacity-70" />
                                                            <span>{t('view_table') || "Table"}</span>
                                                        </div>
                                                        {viewMode === "table" && <Icons.Check className="w-3.5 h-3.5 text-emerald-500" />}
                                                    </button>

                                                    {/* List option */}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            playClick();
                                                            setViewMode("list");
                                                            localStorage.setItem("serverViewMode", "list");
                                                            setViewMenuOpen(false);
                                                        }}
                                                        className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold hover:bg-white/5 transition-all w-full text-left"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <Icons.List className="w-3.5 h-3.5 opacity-70" />
                                                            <span>{t('view_list') || "List"}</span>
                                                        </div>
                                                        {viewMode === "list" && <Icons.Check className="w-3.5 h-3.5 text-emerald-500" />}
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Expanded List Content */}
                                {isExploreJoinedExpanded && (
                                    <div 
                                        className={cn(
                                            "mt-1 pl-2 border-l-2 animate-fade-in",
                                            viewMode === "tiles" 
                                                ? "grid grid-cols-1 md:grid-cols-2 gap-4 content-start" 
                                                : "flex flex-col gap-2"
                                        )} 
                                        style={{ borderColor: colors.outline + "15" }}
                                    >
                                        {viewMode === "table" && joinedServers.filter((inst: any) => !!inst.isPublic).length > 0 && (
                                            <div 
                                                className="flex items-center px-6 py-2 text-xs font-black uppercase tracking-wider opacity-50 shrink-0 select-none border-b mb-2" 
                                                style={{ color: colors.onSurface, borderColor: colors.outline + "15" }}
                                            >
                                                <div className="w-2/5">{t('server') || "Server"}</div>
                                                <div className="w-1/5">{t('minecraft_version_label') || "Version"}</div>
                                                <div className="w-1/5">{t('status') || "Status / IP"}</div>
                                                <div className="w-1/5 text-right">{t('account_management') || "Actions"}</div>
                                            </div>
                                        )}
                                        {joinedServers.filter((inst: any) => !!inst.isPublic).length > 0 ? (
                                            joinedServers.filter((inst: any) => !!inst.isPublic).map((instance: any, index: number) => {
                                                const targetId = instance.storagePath || instance.id;
                                                const isInstalled = localInstances.has(targetId);
                                                return (
                                                    <ServerItem
                                                        key={`joined-${instance.id}`}
                                                        index={index}
                                                        instance={instance}
                                                        colors={colors}
                                                        isSelected={selectedServer?.id === instance.id}
                                                        isInstalled={isInstalled}
                                                        isMember={true}
                                                        showPublic={false}
                                                        isPlaying={playingInstances.has(instance.id)}
                                                        isLaunching={launchingId === instance.id}
                                                        getWithTimestamp={getWithTimestamp}
                                                        viewMode={viewMode}
                                                        onSelect={(inst) => {
                                                            handleInstanceClick(inst);
                                                        }}
                                                        onViewDetail={(inst) => {
                                                            handleInstanceClick(inst);
                                                            setViewingInstance(inst);
                                                        }}
                                                        onPlay={handlePlayServer}
                                                        onStop={handleStopServer}
                                                        onJoin={handleJoinServer}
                                                        onInstall={handleInstall}
                                                        onLeave={handleLeaveServer}
                                                        t={t}
                                                    />
                                                );
                                            })
                                        ) : (
                                            <div className="py-3 text-center text-xs font-semibold" style={{ color: colors.onSurfaceVariant, opacity: 0.6 }}>
                                                {t('no_joined_public_servers')}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── JOIN FORM ───────────────────────────────────────── */}
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
                                        className="w-full h-10 pl-10 pr-4 rounded-xl outline-none transition-all border font-mono tracking-widest uppercase text-sm"
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
                                    className="h-10 px-5 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
                                    style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                                >
                                    {t('join') || "Join"}
                                </button>
                            </form>
                        )}
                    </div>

                    {/* ── CONTENT AREA ─────────────────────────────────────── */}
                    {/* Not logged in */}
                    {!session ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-5 animate-fade-in">
                            <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                <Icons.Person className="w-10 h-10" style={{ color: colors.primary }} />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-bold mb-1.5" style={{ color: colors.onSurface }}>{t('please_login_session')}</h3>
                                <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{t('connect_microsoft_desc')}</p>
                            </div>
                        </div>
                    ) : (loading || isSearching) ? (
                        /* Loading skeleton */
                        <div className="flex flex-col gap-2 pb-4">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="flex items-center gap-4 px-5 py-4 rounded-2xl animate-skeleton-wave"
                                    style={{
                                        backgroundColor: colors.surfaceContainer,
                                        border: `1.5px solid ${colors.outline}12`,
                                        animationDelay: `${Math.min(i * 40, 150)}ms`
                                    }}
                                >
                                    {/* Icon skeleton */}
                                    <div className="w-16 h-16 rounded-xl shrink-0" style={{ backgroundColor: colors.surfaceContainerHighest }} />
                                    {/* Text skeleton */}
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 rounded-lg" style={{ width: `${40 + (i % 3) * 12}%`, backgroundColor: colors.surfaceContainerHighest }} />
                                        <div className="h-3 rounded-md" style={{ width: `${55 + (i % 2) * 15}%`, backgroundColor: colors.surfaceContainerHighest }} />
                                    </div>
                                    {/* Button skeleton */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <div className="w-20 h-10 rounded-xl" style={{ backgroundColor: colors.surfaceContainerHighest }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : displayedInstances.length === 0 ? (
                        /* Empty state */
                        <div className="flex-1 flex flex-col items-center justify-center gap-5 animate-fade-in">
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
                        /* Server Grid */
                        <div className="flex-1 flex flex-col min-h-0">
                            {viewMode === "table" && (
                                <div 
                                    className="flex items-center px-6 py-2 text-xs font-black uppercase tracking-wider opacity-50 shrink-0 select-none border-b mb-2" 
                                    style={{ color: colors.onSurface, borderColor: colors.outline + "15" }}
                                >
                                    <div className="w-2/5">{t('server') || "Server"}</div>
                                    <div className="w-1/5">{t('minecraft_version_label') || "Version"}</div>
                                    <div className="w-1/5">{t('status') || "Status / IP"}</div>
                                    <div className="w-1/5 text-right">{t('account_management') || "Actions"}</div>
                                </div>
                            )}
                            <div className={cn(
                                "pb-24 overflow-y-auto flex-1 min-h-0",
                                viewMode === "tiles" 
                                    ? "grid grid-cols-1 md:grid-cols-2 gap-4 content-start" 
                                    : "flex flex-col gap-2"
                            )}>
                                {displayedInstances.map((instance: any, index: number) => {
                                    const targetId = instance.storagePath || instance.id;
                                    const isInstalled = localInstances.has(targetId);
                                    const isMember = joinedServers.some(s => s.id === instance.id);
                                    return (
                                        <ServerItem
                                            key={instance.id}
                                            index={index}
                                            instance={instance}
                                            colors={colors}
                                            isSelected={selectedServer?.id === instance.id}
                                            isInstalled={isInstalled}
                                            isMember={isMember}
                                            showPublic={showPublic}
                                            isPlaying={playingInstances.has(instance.id)}
                                            isLaunching={launchingId === instance.id}
                                            getWithTimestamp={getWithTimestamp}
                                            viewMode={viewMode}
                                            onSelect={(inst) => {
                                                handleInstanceClick(inst);
                                            }}
                                            onViewDetail={(inst) => {
                                                handleInstanceClick(inst);
                                                setViewingInstance(inst);
                                            }}
                                            onPlay={handlePlayServer}
                                            onStop={handleStopServer}
                                            onJoin={handleJoinServer}
                                            onInstall={handleInstall}
                                            onLeave={handleLeaveServer}
                                            t={t}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Confirm Dialog */}
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
