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
    const { accounts, setSession: setAuthSession, updateAccount } = useAuthStore();
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
    const [launchingId, setLaunchingId] = useState<string | null>(null);
    const [viewingInstance, setViewingInstance] = useState<Instance | null>(null);
    const [timestamp, setTimestamp] = useState(Date.now());
    const [localInstances, setLocalInstances] = useState<Set<string>>(new Set());

    // Confirm Dialog State
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

    // Public / Search State
    const [showPublic, setShowPublic] = useState(false);
    const [publicInstances, setPublicInstances] = useState<Instance[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);

    // Joined servers state (Owned + Member)
    const [joinedServers, setJoinedServers] = useState<any[]>([]);
    
    // Inline Join State
    const [isJoinMode, setIsJoinMode] = useState(false);
    const [joinKey, setJoinKey] = useState("");

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
                 setIsJoinMode(false);
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

    // Helper for cache busting
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

    // Event Listeners for Game Status
    useEffect(() => {
        const removeStartedListener = (window.api as any)?.onGameStarted((data: any) => {
            console.log("[ServerMenu] Game Started:", data);
            setPlayingInstances(prev => new Set(prev).add(data.instanceId));
            setLaunchingId(prev => (prev === data.instanceId ? null : prev));
        });

        const removeStoppedListener = (window.api as any)?.onGameStopped((data: any) => {
            console.log("[ServerMenu] Game Stopped:", data);
            setPlayingInstances(prev => {
                const newSet = new Set(prev);
                newSet.delete(data.instanceId);
                return newSet;
            });
            setLaunchingId(prev => (prev === data.instanceId ? null : prev));
        });

        return () => {
            removeStartedListener?.();
            removeStoppedListener?.();
        };
    }, []);

    // Sync status when instances load
    useEffect(() => {
        if (instances && (instances.owned.length > 0 || instances.member.length > 0)) {
            const syncStatuses = async () => {
                const runningIds = new Set<string>();
                const all = [...(instances.owned || []), ...(instances.member || [])];

                for (const inst of all) {
                    try {
                        const isRunning = await (window.api as any)?.isGameRunning?.(inst.id);
                        if (isRunning) {
                            runningIds.add(inst.id);
                        }
                    } catch { }
                }
                setPlayingInstances(runningIds);
            };
            syncStatuses();
        }
    }, [instances]);



    // Track if launch was cancelled
    const launchCancelledRef = React.useRef(false);

    const handlePlayServer = async (e: React.MouseEvent, instance: any) => {
        e.stopPropagation();
        if (launchingId) return;

        launchCancelledRef.current = false;
        setLaunchingId(instance.id);

        try {
            if (session?.type === "catid" && session.minecraftUuid) {
                const linkedMsAccount = accounts.find(
                    (account) =>
                        account.type === "microsoft" &&
                        account.uuid === session.minecraftUuid,
                );

                if (linkedMsAccount) {
                    const switchedSession = await window.api?.setActiveSession?.(linkedMsAccount);
                    if (switchedSession) {
                        setAuthSession(switchedSession as AuthSession);
                        updateAccount(switchedSession as AuthSession);
                    }
                } else {
                    toast.error(t('session_expired_login_server'));
                    return;
                }
            }

            // Check Token first like ModPack
            const refreshResult = await window.api?.authRefreshToken?.();
            if (refreshResult && refreshResult.ok === false) {
                const requiresRelogin = refreshResult.requiresRelogin === true;
                const refreshErr = typeof refreshResult.error === "string"
                    ? refreshResult.error
                    : "";
                toast.error(
                    requiresRelogin
                        ? t('session_expired_login_server')
                        : (refreshErr || t('session_expired_login_server')),
                );
                return;
            }

            // Use instancesLaunch (High-level API)
            const res = await window.api?.instancesLaunch?.(instance.id);

            // Check if cancelled during launch preparation
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
                const isJavaError = errorMessage.toLowerCase().includes("java") ||
                    errorMessage.toLowerCase().includes("jre") ||
                    errorMessage.toLowerCase().includes("java_home");

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
                                setActiveTab?.("settings");
                                setSettingsTab?.("java");
                                toastSuccess(t('downloading_java_dot') || "Downloading Java...");
                                setTimeout(() => {
                                    (window.api as any).installJava(requiredVersion)
                                        .then((result: any) => {
                                            if (result?.ok && result.path) {
                                                const pathKey = requiredVersion >= 21 ? "java21" : "java17";
                                                if (updateConfig) {
                                                    updateConfig({
                                                        javaPaths: {
                                                            ...config.javaPaths,
                                                            [pathKey]: result.path
                                                        }
                                                    });
                                                }
                                                toastSuccess(t('java_install_success_simple') || "Java installed successfully");
                                            }
                                        })
                                        .catch((err: any) => {
                                            toastError((t('java_install_failed_prompt') || "Java install failed") + ": " + (err.message || "Unknown error"));
                                        });
                                }, 1000);
                             } else {
                                setActiveTab?.("settings");
                                setSettingsTab?.("java");
                             }
                        },
                        onTertiary: () => {
                             setActiveTab?.("settings");
                             setSettingsTab?.("java");
                        }
                    });
                } else {
                     toast.error(errorMessage);
                }
                setPlayingInstances(prev => { const s = new Set(prev); s.delete(instance.id); return s; });
            }
        } catch (err: any) {
            toast.error(err.message || t('error_occurred'));
            setPlayingInstances(prev => { const s = new Set(prev); s.delete(instance.id); return s; });
        } finally {
            setLaunchingId(null);
        }
    };

    const handleStopServer = async (e: React.MouseEvent, instanceId: string) => {
        e.stopPropagation();

        // If stopping the currently launching game
        if (launchingId === instanceId) {
            launchCancelledRef.current = true;
        }

        try {
            await (window.api as any)?.killGame?.(instanceId);
            setPlayingInstances(prev => {
                const newSet = new Set(prev);
                newSet.delete(instanceId);
                return newSet;
            });
            // If it was launching, clear the loading state immediately (optimistic update)
            if (launchingId === instanceId) setLaunchingId(null);

            toast.success(t('stop_command_sent'));
        } catch (error) {
            toast.error(t('stop_failed_server'));
        }
    };

    const handleOpenFolder = (e: React.MouseEvent, instanceId: string) => {
        e.stopPropagation();
        // Use the correct local instance ID (storagePath if available)
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
                        fetchInstances();     // Refresh local instances
                        setShowPublic(false); // Go back to list
                    } else {
                        toast.error(res?.error || t('join_failed'), { id: toastId });
                    }
                } catch (err: any) {
                    toast.error(t('error_occurred') + ": " + err.message, { id: toastId });
                }
            }
        });
    };

    useEffect(() => {
        fetchInstances();
    }, [session, refreshTrigger]); // Refetch when session or trigger changes

    const fetchInstances = async () => {
        // Only show full loading state if we don't have data yet
        if (!instances) {
            setLoading(true);
        }
        setApiError(null);

        try {
            // Run both fetches in parallel for faster loading
            let cloudError: string | null = null;
            const [cloudData, localList] = await Promise.all([
                // 1. Fetch Cloud Instances
                (async () => {
                    try {
                        const result = await (window.api as any)?.instancesGetJoinedServers?.();
                        if (result?.ok && result.data) return result.data;
                        // API returned error (e.g. not logged in, server down)
                        if (result && !result.ok) {
                            cloudError = result.error || "API error";
                        }
                    } catch (err: any) {
                        cloudError = err.message || "Network error";
                    }
                    return { owned: [], member: [] };
                })(),
                // 2. Fetch Local Instances
                (window.api as any)?.instancesList
                    ? (window.api as any).instancesList().catch(() => [])
                    : Promise.resolve([])
            ]);

            const owned = cloudData.owned || [];
            const member = cloudData.member || [];

            setInstances({ owned, member });

            // Track API error only when we got zero cloud results
            if (cloudError && owned.length === 0 && member.length === 0) {
                setApiError(cloudError);
            }

            // Set joined servers (Owned + Member) for flat lookup
            const all = [...owned, ...member];
            const unique = all.filter((v: any, i: number, a: any[]) => a.findIndex(t => t.id === v.id) === i);
            setJoinedServers(unique);

            // Set local instances
            if (localList) {
                setLocalInstances(new Set(localList.map((i: any) => i.id)));
            }

        } catch (e: any) {
            console.error("Error fetching instances", e);
            setInstances({ owned: [], member: [] });
            setJoinedServers([]);
            setApiError(e.message || "Unknown error");
        } finally {
            setLoading(false);
        }
    };

    const fetchPublicInstances = async (query: string = "") => {
        setIsSearching(true);
        try {
            const apiUrl = (window as any).API_URL;
            const url = new URL(`${apiUrl}/instances/public`);
            if (query) url.searchParams.append("q", query);

            const token = session?.type === "catid"
                ? (session.apiToken || session.accessToken)
                : session?.apiToken;

            const res = await fetch(url.toString(), {
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            });

            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setPublicInstances(data);
                } else if (data && Array.isArray(data.data)) {
                    setPublicInstances(data.data);
                } else {
                    setPublicInstances([]);
                }
            } else {
                setPublicInstances([]);
            }
        } catch (e) {
            console.error("Error searching public instances", e);
            setPublicInstances([]);
        } finally {
            setIsSearching(false);
        }
    };

    // Trigger search when showPublic is toggled or query entered via Enter
    useEffect(() => {
        if (showPublic) {
            fetchPublicInstances(searchQuery);
        }
    }, [showPublic]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setShowPublic(true); // Switch to public view automatically
        fetchPublicInstances(searchQuery);
    };

    // Combine for display
    const displayedInstances = showPublic
        ? publicInstances
        : [...(instances?.owned || []), ...(instances?.member || [])];

    // Helper to select an instance and create a 'Server' object from it
    const handleInstanceClick = (instance: any) => {
        const serverObj: Server = {
            id: instance.id, // Cloud ID or just ID
            name: instance.name,
            description: instance.description || "",
            image: instance.iconUrl || "", // Use icon as image
            status: "online", // Assume online/active for now
            version: instance.minecraftVersion || "1.20.1",
            address: "", // Not used for launch
            modpack: instance.name // Assign string name instead of object
        };
        setSelectedServer(serverObj);
        onInstanceSelect?.(instance);
    };

    const handleInstall = async (e: React.MouseEvent, instance: any) => {
        e.stopPropagation();

        try {
            // Mark active install target so global cancel knows which operation to abort
            setOperationType("install");
            setInstalling(true);
            setInstallMinimized(false);
            setInstallingInstanceId(instance.id);
            setInstallProgress({
                stage: "sync-start",
                type: "sync-start",
                message: t('starting_install'),
            });

            // 1. Select Server (so ModPack tab knows what to show)
            handleInstanceClick(instance);

            // 2. Switch Tab IMMEDIATELY to show progress
            setActiveTab?.("modpack");

            // 3. Trigger install via IPC
            console.log("[ServerMenu] Calling instancesCloudInstall for:", instance.id);
            toast.success(t('starting_install'));
            const res = await (window.api as any)?.instancesCloudInstall?.(instance.id);
            console.log("[ServerMenu] Install result:", res);

            if (res?.ok) {
                // Success handled by toast/progress events
            } else {
                const errMsg = typeof res?.error === 'string' ? res.error : t('install_failed_server');
                console.error("[ServerMenu] Install failed:", errMsg);
                if (errMsg.includes("401") || errMsg.includes("Unauthorized")) {
                    toast.error(t('session_expired_login_server'));
                } else if (errMsg.includes("Not logged in")) {
                    toast.error(t('please_login_session'));
                } else {
                    toast.error(errMsg);
                }
            }
        } catch (error: any) {
            console.error("[ServerMenu] Install exception:", error);
            toast.error(t('error_occurred') + ": " + error.message);
        } finally {
            setInstalling(false);
            setInstallProgress(null);
            setInstallMinimized(false);
            setOperationType(null);
            setInstallingInstanceId(null);
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
                        fetchInstances(); // Refresh list to remove it
                    } else {
                        toast.error(res?.error || t('leave_failed') || "Failed to leave server", { id: toastId });
                    }
                } catch (err: any) {
                    toast.error(t('error_occurred') + ": " + err.message, { id: toastId });
                }
            }
        });
    };

    const handleViewLogs = (e: React.MouseEvent, instance: any) => {
        e.stopPropagation();
        setLogViewerInstanceId(instance.id);
    };

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
                <div
                    className="flex justify-between items-center mb-6 gap-4 animate-fade-in"
                    style={stagedRevealStyle(20)}
                >
                <div className="flex-1">
                    <h2 className="text-2xl font-bold mb-1" style={{ color: colors.onSurface }}>
                        {isJoinMode ? t('enter_key') : (showPublic ? t('explore_servers') : t('server_list'))}
                    </h2>
                    <p className="text-sm opacity-70" style={{ color: colors.onSurfaceVariant }}>
                        {isJoinMode 
                            ? t('enter_invite_key_desc')
                            : (showPublic ? t('explore_community_desc') : t('select_server_desc'))
                        }
                    </p>
                </div>

                {/* Search Bar / Join Input */}
                <form 
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (isJoinMode) {
                            handleJoinSubmit(e);
                        } else {
                            handleSearchSubmit(e);
                        }
                    }} 
                    className="flex-1 max-w-sm relative group animate-fade-in"
                    style={stagedRevealStyle(80)}
                >
                    <input
                        type="text"
                        placeholder={isJoinMode ? t('enter_invite_key_placeholder') : t('search_public_servers')}
                        value={isJoinMode ? joinKey : searchQuery}
                        onChange={(e) => {
                            if (isJoinMode) {
                                // Format key: uppercase, alphanumeric + dash only
                                const val = e.target.value.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
                                setJoinKey(val);
                            } else {
                                setSearchQuery(e.target.value);
                            }
                        }}
                        className="w-full px-4 py-2 pl-10 rounded-xl outline-none transition-all placeholder:text-gray-500/50 border border-transparent focus:border-white/10"
                        style={{ 
                            backgroundColor: colors.surfaceContainerHighest, 
                            color: colors.onSurface,
                            letterSpacing: isJoinMode ? "0.1em" : "normal",
                            fontFamily: isJoinMode ? "monospace" : "inherit"
                        }}
                        autoFocus={isJoinMode}
                        maxLength={isJoinMode ? 32 : undefined}
                    />
                    {isJoinMode ? (
                        <Icons.Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" style={{ color: colors.onSurface }} />
                    ) : (
                        <Icons.Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" style={{ color: colors.onSurface }} />
                    )}

                    {/* Submit Button for Join Mode */}
                    {isJoinMode && joinKey.trim() && (
                         <button
                            type="submit"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white/10 transition-all"
                            title={t('join')}
                            style={{ color: colors.primary }}
                         >
                            <Icons.Login className="w-4 h-4" />
                         </button>
                    )}
                </form>

                {/* Actions */}
                <div
                    className="flex gap-2 animate-fade-in"
                    style={stagedRevealStyle(120)}
                >
                    {!isJoinMode && (
                        <button
                            onClick={() => {
                                playClick();
                                setShowPublic(!showPublic);
                            }}
                            className={cn(
                                "px-3 py-2 rounded-xl flex items-center gap-2 transition-all hover:brightness-110 border cursor-pointer",
                                showPublic ? "brightness-110" : "opacity-80 hover:opacity-100"
                            )}
                            style={{
                                backgroundColor: showPublic ? colors.primary : colors.surfaceContainerHighest,
                                color: showPublic ? colors.onPrimary : colors.onSurface,
                                borderColor: showPublic ? "transparent" : colors.outline
                            }}
                            title={t('explore_servers')}
                        >
                            <Icons.Compass className="w-5 h-5" />
                            <span className="hidden sm:inline">{t('explore')}</span>
                        </button>
                    )}

                    <button
                        onClick={() => { 
                            playClick(); 
                            setIsJoinMode(!isJoinMode);
                            if (!isJoinMode) {
                                // Reset states when entering join mode
                                setJoinKey("");
                                setShowPublic(false);
                            }
                        }}
                        className={cn(
                            "px-4 py-2 rounded-xl flex items-center gap-2 transition-all hover:brightness-110",
                            isJoinMode ? "brightness-90 hover:brightness-100" : ""
                        )}
                        style={{ 
                            backgroundColor: isJoinMode ? colors.error || "#ef4444" : colors.secondary, 
                            color: isJoinMode ? "#fff" : "#1a1a1a" 
                        }}
                    >
                        {isJoinMode ? (
                            <>
                                <Icons.Close className="w-5 h-5" />
                                <span className="hidden sm:inline">{t('cancel')}</span>
                            </>
                        ) : (
                            <>
                                <span>+</span>
                                <span className="hidden sm:inline">{t('enter_key')}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Loading / List */}
            {/* Not logged in - Show login prompt */}
            {!session ? (
                <div
                    className="flex-1 flex flex-col items-center justify-center gap-6 animate-fade-in"
                    style={stagedRevealStyle(160)}
                >
                    <div className="w-24 h-24 rounded-3xl flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                        <Icons.Person className="w-12 h-12" style={{ color: colors.primary }} />
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold mb-2" style={{ color: colors.onSurface }}>
                            {t('please_login_session')}
                        </h3>
                        <p className="mb-4" style={{ color: colors.onSurfaceVariant }}>
                            {t('connect_microsoft_desc')}
                        </p>
                    </div>
                </div>
            ) : (session.type === "microsoft" && !session.apiToken) ? (
                <div
                    className="flex-1 flex flex-col items-center justify-center gap-6 animate-fade-in"
                    style={stagedRevealStyle(160)}
                >
                    <div className="w-24 h-24 rounded-3xl flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                        <svg className="w-12 h-12" style={{ color: colors.secondary }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold mb-2" style={{ color: colors.onSurface }}>
                            {t('connect_catid')}
                        </h3>
                        <p className="mb-4" style={{ color: colors.onSurfaceVariant }}>
                            {t('connect_catid_desc')}
                        </p>
                    </div>
                </div>
            ) : loading || isSearching ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={i}
                            className="relative rounded-2xl overflow-hidden h-48 animate-skeleton-wave"
                            style={{
                                backgroundColor: colors.surfaceContainer,
                                border: `2px solid ${colors.outline}15`,
                                animationDelay: `${Math.min(i * 40, 150)}ms`
                            }}
                        >
                            {/* Icon skeleton - Top Left */}
                            <div className="absolute top-4 left-4 w-12 h-12 rounded-xl overflow-hidden"
                                style={{ backgroundColor: colors.surfaceContainerHighest }}>
                            </div>

                            {/* Badge skeleton - Top Right */}
                            <div className="absolute top-3 right-3 flex gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.surfaceContainerHighest }} />
                            </div>

                            {/* Content skeleton - Bottom */}
                            <div className="absolute bottom-0 left-0 right-0 p-4">
                                <div className="space-y-2">
                                    <div className="h-6 rounded-lg overflow-hidden relative" style={{ width: `${50 + (i % 3) * 15}%`, backgroundColor: colors.surfaceContainerHighest }}>
                                    </div>
                                    <div className="h-4 rounded-lg overflow-hidden relative" style={{ width: `${70 + (i % 2) * 10}%`, backgroundColor: colors.surfaceContainerHighest }}>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : displayedInstances.length === 0 ? (
                <div
                    className="flex-1 flex flex-col items-center justify-center gap-6 opacity-60 animate-fade-in"
                    style={stagedRevealStyle(180)}
                >
                    <div className="w-24 h-24 rounded-3xl flex items-center justify-center bg-gray-500/10">
                        {apiError ? (
                            <svg className="w-12 h-12" style={{ color: colors.error || "#ef4444" }} viewBox="0 0 24 24" fill="currentColor">
                                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                            </svg>
                        ) : showPublic ? (
                            <Icons.Search className="w-12 h-12" />
                        ) : (
                            <span className="text-4xl text-gray-500">?</span>
                        )}
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold mb-2" style={{ color: colors.onSurface }}>
                            {apiError
                                ? (t('api_connection_error') || "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้")
                                : showPublic ? t('no_public_servers')
                                : session?.type === "offline" ? t('offline_mode')
                                : t('no_servers_found_in_list')
                            }
                        </h3>
                        <p style={{ color: colors.onSurfaceVariant }}>
                            {apiError
                                ? (t('api_connection_error_desc') || "API อาจล่มหรือเครือข่ายขัดข้อง กดลองใหม่อีกครั้ง")
                                : showPublic
                                    ? t('no_search_results')
                                    : session?.type === "offline"
                                        ? t('use_catid_to_play')
                                        : t('no_server_invite_desc')
                            }
                        </p>
                        {apiError && (
                            <button
                                type="button"
                                onClick={() => { setLoading(true); fetchInstances(); }}
                                className="mt-4 px-6 py-2.5 rounded-xl font-medium transition-all hover:brightness-110 active:scale-95"
                                style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                            >
                                {t('retry') || "ลองใหม่"}
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div
                    className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 overflow-y-auto animate-fade-in"
                    style={stagedRevealStyle(180)}
                >
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
                                onSelect={(inst) => {
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
            )
            }

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
        </div >
    );
}
