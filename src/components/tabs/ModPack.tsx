import React, { useEffect, useState, useRef, type Dispatch, type SetStateAction } from "react";
import toast from "react-hot-toast";
import { playClick, toastSuccess, toastError } from "../../lib/sounds";
import { Icons } from "../ui/Icons";
import { InstanceDetail } from "./InstanceDetail";
import { LiveLog } from "./LiveLog";
import { Skeleton } from "../ui/Skeleton";
import { useTranslation } from "../../hooks/useTranslation";
import {
    CreateInstanceModal,
    ImportModpackModal,
    InstallProgressModal,
    DeleteConfirmModal,
    type InstallProgress,
    type ModInfo,
} from "./ModPackTabs";
import { useProgressStore } from "../../store/progressStore";

// ========================================
// Types
// ========================================

import { type AuthSession, type Server, type GameInstance, type LauncherConfig } from "../../types/launcher";

// GameInstance imported from types


interface ModPackProps {
    colors: any;
    config: LauncherConfig;
    setImportModpackOpen: (open: boolean) => void;
    setActiveTab: (tab: string) => void;
    setSettingsTab?: (tab: any) => void;
    onShowConfirm?: (options: any) => void;
    isActive?: boolean;
    selectedServer: Server | null;
    selectedInstance?: GameInstance | null;
    setSelectedInstance?: Dispatch<SetStateAction<GameInstance | null>>;
    session?: AuthSession | null;
    updateConfig?: (newConfig: Partial<LauncherConfig>) => void;
    language: "th" | "en";
}

// Inner component for Server Mods List
function ServerModsList({ serverId, colors }: { serverId: string, colors: any }) {
    const [mods, setMods] = useState<ModInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const { t } = useTranslation();

    useEffect(() => {
        const fetchMods = async () => {
            setLoading(true);
            try {
                // Try fetching remote mods via API if possible, or fallback to local checks
                // For now, assuming synced instance means we can check local mods
                const result = await (window.api as any)?.instanceListMods?.(serverId);
                if (result?.ok) {
                    setMods(result.mods);
                }
            } catch (e) {
                console.error("Failed to fetch server mods", e);
            } finally {
                setLoading(false);
            }
        };
        fetchMods();
    }, [serverId]);

    if (loading) return <div className="text-center p-4">{t('loading')}</div>;

    if (mods.length === 0) return (
        <div className="text-center p-4 text-sm" style={{ color: colors.onSurfaceVariant }}>
            {t('no_mods_found' as any)}
        </div>
    );

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
            {mods.map((mod, idx) => (
                <div key={`${mod.filename}-${idx}`} className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                    <div className="w-8 h-8 rounded bg-gray-500/20 flex items-center justify-center shrink-0">
                        <Icons.Box className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: colors.onSurface }}>{mod.name || mod.filename}</div>
                        <div className="text-xs truncate" style={{ color: colors.onSurfaceVariant }}>{mod.filename || "Unknown filename"}</div>
                    </div>
                    <div className={mod.enabled ? "text-green-500" : "text-red-500"}>
                        {mod.enabled ? "✓" : "✗"}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ========================================
// Component
// ========================================


// Smart Image Component with caching (no timestamp cache busting)
const imageCache = new Map<string, string>();

function SmartImage({ src, alt, className, style, trigger }: { src: string | undefined, alt?: string, className?: string, style?: any, trigger?: number }) {
    const [displaySrc, setDisplaySrc] = useState(() => {
        if (!src) return undefined;
        return imageCache.get(src) || src;
    });
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (!src) {
            setDisplaySrc(undefined);
            return;
        }

        // Use cached version if available
        const cached = imageCache.get(src);
        if (cached) {
            setDisplaySrc(cached);
            return;
        }

        setDisplaySrc(src);
        setHasError(false);

        // Skip fetch for data/blob URLs
        if (src.startsWith("data:") || src.startsWith("blob:")) return;

        // Preload image in background (no cache busting)
        const img = new Image();
        img.onload = () => {
            imageCache.set(src, src);
            setDisplaySrc(src);
        };
        img.onerror = () => setHasError(true);
        img.src = src;
    }, [src, trigger]);

    if (hasError || !displaySrc) {
        return <div className={className} style={{ ...style, backgroundColor: 'rgba(128,128,128,0.2)' }} />;
    }

    return <img src={displaySrc} alt={alt} className={className} style={style} loading="lazy" />;
}

// Smart Background Component with caching (no timestamp cache busting)
function SmartBackground({ src, className, style, children, onClick, trigger }: { src: string | undefined, className?: string, style?: any, children?: React.ReactNode, onClick?: () => void, trigger?: number }) {
    const [displaySrc, setDisplaySrc] = useState(() => {
        if (!src) return undefined;
        return imageCache.get(src) || src;
    });

    useEffect(() => {
        if (!src) {
            setDisplaySrc(undefined);
            return;
        }

        // Use cached version if available
        const cached = imageCache.get(src);
        if (cached) {
            setDisplaySrc(cached);
            return;
        }

        setDisplaySrc(src);

        // Skip fetch for data/blob URLs
        if (src.startsWith("data:") || src.startsWith("blob:")) return;

        // Preload image in background
        const img = new Image();
        img.onload = () => {
            imageCache.set(src, src);
            setDisplaySrc(src);
        };
        img.src = src;
    }, [src, trigger]);

    return (
        <div
            className={className}
            style={{
                ...style,
                backgroundImage: displaySrc ? `url("${displaySrc}")` : style?.backgroundImage
            }}
            onClick={onClick}
        >
            {children}
        </div>
    );
}


export function ModPack({ colors, config, setImportModpackOpen, setActiveTab, setSettingsTab,
    onShowConfirm,
    isActive,
    selectedServer,
    selectedInstance = null,
    setSelectedInstance = () => {},
    session,
    updateConfig,
    language,
}: ModPackProps) {
    const { t } = useTranslation(language);
    const [instances, setInstances] = useState<GameInstance[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [launchingId, setLaunchingId] = useState<string | null>(null);
    const [playingInstances, setPlayingInstances] = useState<Set<string>>(new Set());
    const hasLoadedRef = useRef(false);

    const [showImportModal, setShowImportModal] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [logViewerInstanceId, setLogViewerInstanceId] = useState<string | null>(null);

    // Installation progress state
    const [isInstalling, setIsInstalling] = useState(false);
    const [installProgress, setInstallProgress] = useState<(InstallProgress & { type?: string; filename?: string }) | null>(null);
    const [isInstallMinimized, setIsInstallMinimized] = useState(false);
    const [operationType, setOperationType] = useState<"install" | "repair" | null>(null);


    // Export State (Global)
    const { startExport, setExportProgress, setExporting, setExportingInstanceId, resetExport } = useProgressStore();

    // Export Handler
    const handleExportInstance = async (instanceId: string, options: any) => {
        playClick();
        
        // Initial state
        startExport(instanceId, { stage: "extracting", message: t('preparing_export_dot'), percent: 0 });

        // Subscribe to progress events
        const cleanup = window.api?.onExportProgress?.((_id, progress) => {
             setExportProgress({
                stage: "copying",
                message: `${t('export')}...`,
                percent: progress.percent,
                current: progress.transferred,
                total: progress.total
            });
        });

        try {
            const result = await window.api?.instancesExport?.(instanceId, options);
            if (result?.ok) {
                toastSuccess(t('export_success'));
            } else if (result?.error === "Cancelled") {
                toast('Export cancelled', { icon: '🚫' });
            } else {
                toastError(t('export_failed') + (result?.error || ""));
            }
        } catch (error) {
            console.error("Export failed:", error);
            toastError(t('export_failed'));
        } finally {
            cleanup?.();
            resetExport();
        }
    };

    const handleCancelExport = async (instanceId: string) => {
        playClick();
        try {
            await window.api?.instancesExportCancel?.(instanceId);
            // State reset handled in finally block of handleExportInstance
        } catch (error) {
            console.error("Failed to cancel export:", error);
        }
    };

    // Instance detail view state (now via props)
    // const [selectedInstance, setSelectedInstance] = useState<GameInstance | null>(null);

    // Local state for joined servers
    const [joinedServers, setJoinedServers] = useState<Server[]>([]);
    const [loadingServers, setLoadingServers] = useState(false);

    // Trigger for background image revalidation
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Cache busting

    // List of joined servers from Cloud
    const loadJoinedServers = async () => {
        if (joinedServers.length === 0) {
            setLoadingServers(true);
        }
        try {
            const result = await (window.api as any)?.instancesGetJoinedServers?.();
            if (result?.ok && result.data) {
                const all = [...(result.data.owned || []), ...(result.data.member || [])];
                const unique = all.filter((v: Server, i: number, a: Server[]) => a.findIndex(t => t.id === v.id) === i);
                setJoinedServers(unique);
            } else if (result?.error) {
                const errMsg = typeof result.error === 'string' ? result.error : '';
                if (errMsg.includes("401") || errMsg.includes("Unauthorized")) {
                    console.warn("[ModPack] Session expired, user needs to re-login");
                } else if (!errMsg.includes("Not logged in")) {
                    console.error("[ModPack] Failed to fetch joined servers:", errMsg);
                }
            }
        } catch (e) {
            console.error("Failed to fetch joined servers", e);
        } finally {
            setLoadingServers(false);
        }
    };

    // Fetch joined servers on mount and when session changes
    useEffect(() => {
        loadJoinedServers();
    }, [session]);

    // Track previous isActive to detect tab re-entry
    const wasActiveRef = useRef(isActive);

    // Reload data when tab becomes active (coming back from another tab)
    useEffect(() => {
        // Only reload data if we don't have a selected instance (i.e. we are in list view)
        // This preserves the specific instance view if one is selected (e.g. via Home tab)
        if (isActive && !wasActiveRef.current) {
             // Note: We DO NOT reset selectedInstance here, because it might have been set by the Home tab (Recent Play)
             // or we might want to preserve the previous state.
             
             if (!selectedInstance) {
                setRefreshTrigger(prev => prev + 1);
                loadInstances();
                loadJoinedServers();
             }
        }
        
        wasActiveRef.current = isActive;
    }, [isActive, selectedInstance]);

    // Load instances on mount and when session changes
    useEffect(() => {
        loadInstances();

        // Listen for updates from backend (e.g. after cloud sync or background changes)
        const cleanup = window.api?.onInstancesUpdated?.(() => {
            console.log("[ModPack] Instances updated event received, reloading...");
            loadInstances();
        });

        return () => cleanup?.();
    }, [session]);

    // Update selectedInstance when instances list changes (to reflect background updates)
    useEffect(() => {
        if (selectedInstance && instances.length > 0) {
            const fresh = instances.find(i => i.id === selectedInstance.id);
            if (fresh && JSON.stringify(fresh) !== JSON.stringify(selectedInstance)) {
                console.log("[ModPack] Updating selected instance with fresh data");
                setSelectedInstance(fresh);
            }
        }
    }, [instances]);

    // Listen for install progress
    useEffect(() => {
        const cleanup = window.api?.onModpackInstallProgress?.((progress) => {
            setInstallProgress(progress);
        });
        return () => cleanup?.();
    }, []);

    // Check game status for all instances on load
    useEffect(() => {
        const checkAllStatuses = async () => {
            // We need instances list to check. 
            // Since instances might not be loaded yet, we can't easily check here.
            // Instead, we can try checking after loadInstances.
            // But simpler: just listen to events.
            // Initial check provided by "isGameRunning" call in polling was global.
        };
    }, []);

    // Sync status when instances load - properly reset playingInstances based on actual state
    useEffect(() => {
        if (instances.length > 0) {
            const syncStatuses = async () => {
                // Check all instances in parallel instead of sequentially
                const results = await Promise.all(
                    instances.map(async (inst) => {
                        try {
                            const isRunning = await window.api?.isGameRunning?.(inst.id);
                            return isRunning ? inst.id : null;
                        } catch { return null; }
                    })
                );
                const runningIds = new Set<string>(results.filter((id): id is string => id !== null));
                // Replace entire set instead of only adding
                setPlayingInstances(runningIds);
            };
            syncStatuses();
        }
    }, [instances]);

    // Listen for game started/stopped events from main process
    useEffect(() => {
        const removeStartedListener = (window.api as any).onGameStarted((data: any) => {
            console.log("[UI] Game Started Event:", data);
            setLaunchingId(null);
            setPlayingInstances(prev => new Set(prev).add(data.instanceId));
            // Clear launch timeout since game started successfully
            if (launchTimeoutRef.current) {
                clearTimeout(launchTimeoutRef.current);
                launchTimeoutRef.current = null;
            }
        });

        const removeStoppedListener = (window.api as any).onGameStopped((data: any) => {
            console.log("[UI] Game Stopped Event:", data);
            setPlayingInstances(prev => {
                const newSet = new Set(prev);
                newSet.delete(data.instanceId);
                return newSet;
            });
        });

        return () => {
            removeStartedListener?.();
            removeStoppedListener?.();
        };
    }, []);

    // Warn: Polling refactor needed?
    // Current polling logic relies on `isGameRunning()` global.
    // We can rely on individual checks or just events.
    // For now, let's disable the global poller or make it check specific instances if needed.
    // Events should be sufficient if robust.

    // Debug: Log state changes
    useEffect(() => {
        console.log("[ModPack STATE]", { launchingId, playingInstances: Array.from(playingInstances) });
    }, [launchingId, playingInstances]);

    // Track if cancellation was requested to prevent race conditions with pending progress events
    const isCancellingRef = useRef(false);

    // Listen for cloud installation progress
    useEffect(() => {
        const removeListener = (window.api as any).onInstallProgress((data: any) => {
            if (isCancellingRef.current) {
                console.log("[ModPack] Ignoring progress event (Cancelled):", data);
                return;
            }

            console.log("[ModPack] Install Progress:", data);

            setInstallProgress({
                stage: data.type,
                message: data.task, // Fallback message
                type: data.type,    // Key for translation
                filename: data.filename, // Parameter for translation
                current: data.current,
                total: data.total,
                percent: data.percent
            });

            if (data.type === "complete" || data.percent === 100) {
                // Optional: Delay close?
                setTimeout(() => {
                    if (!isCancellingRef.current) {
                        setIsInstalling(false);
                        setInstallProgress(null);
                        setIsInstallMinimized(false);
                        loadInstances(); // Reload list
                    }
                }, 1000);
            } else if (data.type === "error" || data.type === "cancelled" || data.type === "sync-error") {
                setIsInstalling(false);
                setInstallProgress(null);
                setIsInstallMinimized(false);
                setOperationType(null);
            } else {
                if (!isInstalling) {
                    setOperationType("install");
                }
                setIsInstalling(true);
            }
        });

        // Also listen for Modpack Import progress (local/Modrinth/CurseForge)
        const removeModpackListener = (window.api as any).onModpackInstallProgress((data: any) => {
            if (isCancellingRef.current) return;

            console.log("[ModPack] Modpack Progress:", data);

            // Map modpack progress to InstallProgress format
            setInstallProgress({
                stage: data.stage,
                message: data.message,
                current: data.current,
                total: data.total,
                percent: data.percent
            });

            if (data.percent === 100 || data.stage === "complete") {
                setTimeout(() => {
                    if (!isCancellingRef.current) {
                        setIsInstalling(false);
                        setInstallProgress(null);
                        setIsInstallMinimized(false);
                        loadInstances();
                    }
                }, 1000);
            } else if (data.stage === "error" || data.stage === "cancelled") {
                setIsInstalling(false);
                setInstallProgress(null);
                setIsInstallMinimized(false);
                setOperationType(null);
            } else {
                if (!isInstalling) {
                    setOperationType("install");
                }
                setIsInstalling(true);
            }
        });

        return () => {
            removeListener?.();
            removeModpackListener?.();
        };
    }, []);

    // ... (rest of code)

    // Track which instance is being installed/synced for cancellation
    const [installingInstanceId, setInstallingInstanceId] = useState<string | null>(null);

    const handleCancelInstall = async () => {
        isCancellingRef.current = true;
        try {
            // If it's a cloud install/sync (we have an ID)
            if (installingInstanceId) {
                await (window.api as any)?.instanceCancelAction?.(installingInstanceId);
            }
            // Also try legacy cancellation (for local import)
            await (window.api as any)?.modpackCancelInstall?.();

            toast.error(t('cancel_install_success'));
            setIsInstalling(false);
            setInstallProgress(null);
            setInstallingInstanceId(null);
            setOperationType(null);
        } catch (e) {
            console.error("Failed to cancel install", e);
        } finally {
            // Reset flag after a delay to ensure pending events are flushed
            setTimeout(() => {
                isCancellingRef.current = false;
            }, 1000);
        }
    };

    const loadInstances = async () => {
        // Only show loading state on first load to avoid flashing skeleton on refresh
        if (!hasLoadedRef.current) {
            setIsLoading(true);
        }

        try {
            // Load all instances (limit 1000) at once to ensure backend "current view" is valid
            // This prevents the backend from entering an empty state if a second "page" is requested empty
            const allInstances = await window.api?.instancesList?.(0, 1000);

            if (allInstances) {
                setInstances(allInstances);
                hasLoadedRef.current = true;
            }
        } catch (error) {
            console.error("[ModPack] Failed to load instances:", error);
        } finally {
            setIsLoading(false);
        }
    };




    // Open instance detail view
    const handleOpenInstanceDetail = (instance: GameInstance) => {
        setSelectedInstance(instance);
    };

    const handleDelete = async (id: string) => {
        // Optimistic UI: Remove from list immediately
        setInstances(prev => prev.filter(inst => inst.id !== id));
        setDeleteConfirmId(null);

        try {
            const success = await window.api?.instancesDelete?.(id);
            if (success) {
                toast.success(t('instance_delete_success'));
            } else {
                toast.error(t('instance_delete_failed'));
                loadInstances(); // Reload on failure
            }
        } catch (error) {
            toast.error(t('error_occurred'));
            loadInstances(); // Reload on error
        }
    };

    const handleDuplicate = async (id: string) => {
        try {
            const newInstance = await window.api?.instancesDuplicate?.(id);
            if (newInstance) {
                toast.success(t('instance_created_success'));
                loadInstances();
            }
        } catch (error) {
            toast.error(t('error_occurred'));
        }
    };

    const handleOpenFolder = async (id: string) => {
        await window.api?.instancesOpenFolder?.(id);
    };

    const handleUpdate = async (id: string, updates: Partial<GameInstance>) => {
        console.log(`[ModPack] handleUpdate called for ID: ${id}`, updates);

        // Optimistic Update: Update UI immediately
        setInstances(prev => prev.map(inst =>
            inst.id === id ? { ...inst, ...updates } : inst
        ));

        // Also update selected instance immediately if applicable
        if (selectedInstance?.id === id) {
            setSelectedInstance(prev => prev ? { ...prev, ...updates } : prev);
        }

        try {
            console.log("[ModPack] Sending IPC instances-update...");
            const success = await window.api?.instancesUpdate?.(id, updates);
            console.log("[ModPack] IPC result:", success);

            if (success) {
                // Confirm with server response
                setInstances(prev => prev.map(inst =>
                    inst.id === id ? success : inst
                ));
                if (selectedInstance?.id === id) {
                    setSelectedInstance(success);
                }
            } else {
                // Revert on failure
                console.error("[ModPack] Update failed (success was falsy/null), reverting...");
                const freshInstances = await window.api?.instancesList?.();
                if (freshInstances) setInstances(freshInstances);
                toast.error(t('save_failed'));
            }
        } catch (error) {
            console.error("[ModPack] Update error (Exception):", error);
            // Revert on error
            const freshInstances = await window.api?.instancesList?.();
            if (freshInstances) setInstances(freshInstances);
            toast.error(t('save_failed'));
        }
    };

    const handleRepair = async (id: string) => {
        // Show progress modal instead of toast
        setOperationType("repair");
        setIsInstalling(true);
        setInstallProgress({ stage: "sync-start", message: t('sync-start' as any) });

        try {
            const result = await (window.api as any)?.instanceCheckIntegrity?.(id);
            if (result?.ok) {
                // Progress modal will auto-close when percent reaches 100
                // Show success toast after a delay
                setTimeout(() => {
                    setIsInstalling(false);
                    setInstallProgress(null);
                    setOperationType(null);
                    toast.success(result.message || t('repair_success'));
                    loadInstances(); // Reload instances
                }, 1000);
            } else {
                setIsInstalling(false);
                setInstallProgress(null);
                setOperationType(null);
                toast.error(result?.error || t('repair_failed'));
            }
        } catch (error: any) {
            setIsInstalling(false);
            setInstallProgress(null);
            setOperationType(null);
            toast.error(error?.message || t('error_occurred'));
        }
    };

    // Track if launch was cancelled (use ref to work in async)
    const launchCancelledRef = useRef(false);
    // Timeout ref for launch safety (prevent infinite hang)
    const launchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handlePlay = async (id: string) => {
        // Prevent double-launch race condition (Global lock for safety during download)
        if (launchingId !== null) {
            return;
        }

        playClick(); // Play click sound on play button
        launchCancelledRef.current = false;
        setLaunchingId(id);

        // Set a 60-second timeout to reset launchingId if launch hangs
        launchTimeoutRef.current = setTimeout(() => {
            console.warn(`[ModPack] Launch timeout for instance ${id}`);
            setLaunchingId(null);
            toastError(t('launch_timeout'));
        }, 60000);

        // Optimistic: add to playing immediately? No, wait for success or use 'launchingId' for UI.

        try {
            const refreshResult = await (window.api as any)?.authRefreshToken?.();
            if (refreshResult && !refreshResult.ok && refreshResult.error) {
                const refreshErr = typeof refreshResult.error === 'string' ? refreshResult.error : '';
                if (refreshErr.includes("re-login")) {
                    toastError(t('session_expired_login_server'));
                    setLaunchingId(null);
                    return;
                }
            }

            // Note: instancesLaunch logic in backend now checks isGameRunning(id)
            const result = await window.api?.instancesLaunch?.(id);
            console.log("[ModPack] instancesLaunch result:", result);

            if (launchCancelledRef.current) {
                await window.api?.killGame?.(id);
                setPlayingInstances(prev => { const s = new Set(prev); s.delete(id); return s; });
                return;
            }

            if (result?.ok) {
                toastSuccess(result.message || t('launching'));
                setPlayingInstances(prev => new Set(prev).add(id));
            } else {
                const errorMessage = result?.message || t('launch_failed');
                const isJavaError = errorMessage.toLowerCase().includes("java") ||
                    errorMessage.toLowerCase().includes("jre") ||
                    errorMessage.toLowerCase().includes("java_home");

                if (isJavaError && onShowConfirm && setSettingsTab) {
                    // Try to parse Java version from error message (e.g. "Java 21+")
                    const javaVersionMatch = errorMessage.match(/Java (\d+)/i);
                    const requiredVersion = javaVersionMatch ? parseInt(javaVersionMatch[1]) : 0;

                    onShowConfirm({
                        title: t('java_not_found_prompt'),
                        message: `${errorMessage}\n${t('install_java_now_ask')}`,
                        confirmText: t('install_now'),
                        cancelText: t('later'),
                        tertiaryText: t('go_to_install_page'),
                        confirmColor: "#22c55e", // Green for direct install
                        onConfirm: () => {
                            if (requiredVersion > 0 && (window.api as any)?.installJava) {
                                setActiveTab("settings");
                                setSettingsTab("java");
                                toastSuccess(t('downloading_java_dot'));
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
                                                toastSuccess(t('java_install_success_simple'));
                                            }
                                        })
                                        .catch((err: any) => {
                                            toastError(t('java_install_failed_prompt') + ": " + (err.message || "Unknown error"));
                                        });
                                }, 1000);
                            } else {
                                // Fallback
                                setActiveTab("settings");
                                setSettingsTab("java");
                            }
                        },
                        onTertiary: () => {
                            setActiveTab("settings");
                            setSettingsTab("java");
                        }
                    });
                }
                else {
                    toastError(errorMessage);
                }
                setPlayingInstances(prev => { const s = new Set(prev); s.delete(id); return s; });
            }
        } catch (error: any) {
            toastError(error?.message || t('error_occurred'));
            setPlayingInstances(prev => { const s = new Set(prev); s.delete(id); return s; });
        } finally {
            setLaunchingId(null);
            // Clear timeout if launch completed
            if (launchTimeoutRef.current) {
                clearTimeout(launchTimeoutRef.current);
                launchTimeoutRef.current = null;
            }
        }
    };

    const handleStop = async (id: string) => {
        // If stopping the currently launching game
        if (launchingId === id) {
            launchCancelledRef.current = true;
        }

        try {
            await window.api?.killGame?.(id);
            setPlayingInstances(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });

            if (launchingId === id) setLaunchingId(null);

            toast.success(t('stop_command_sent'));
        } catch (error) {
            toast.error(t('stop_failed_server'));
        }
    };

    const handleImportModpack = async (filePath?: string) => {
        try {
            // Use provided file path (from drag-drop) or open file dialog
            const targetPath = filePath || await window.api?.browseModpack?.();
            if (!targetPath) return;

            // Close import modal if open
            setShowImportModal(false);

            // Start installation
            setOperationType("install");
            setIsInstalling(true);
            setInstallProgress({ stage: "extracting", message: t('extracting_modpack_dot') });

            // Install the modpack (will create new instance)
            const result = await window.api?.modpackInstall?.(targetPath);

            if (result?.ok && result.instance) {
                toast.success(t('install_complete'));
                loadInstances();
            } else {
                // Don't show error toast if it was cancelled (already shown by handleCancelInstall)
                const cancelErr = typeof result?.error === 'string' ? result.error : '';
                if (cancelErr && !cancelErr.includes("cancelled") && !cancelErr.includes("cancel")) {
                    toast.error(cancelErr);
                }
            }
        } catch (error: any) {
            // Don't show error toast if it was cancelled
            const catchMsg = typeof error?.message === 'string' ? error.message : '';
            if (catchMsg && !catchMsg.includes("cancelled") && !catchMsg.includes("cancel")) {
                toast.error(error.message || t('error_occurred'));
            }
        } finally {
            setIsInstalling(false);
            setInstallProgress(null);
            setOperationType(null);
        }
    };



    const handleInstallServerInstance = async (id?: string) => {
        setOperationType("install");
        setIsInstalling(true);
        isCancellingRef.current = false; // Ensure flag is reset
        // For Sync (no ID passed), we might fallback to checking selectedInstance or just handle specific Cloud Install (ID passed)
        // If id is undefined, it's global sync... which might be iterating multiple instances or checking updates.
        // Actually (window.api as any)?.instancesCloudSync?.() is the global sync.
        // But wait, the cancel action requires an ID.
        // If it's global sync, we might not have a single ID.
        // However, the user issue is likely about specific "Server Modpack" installation (which passes ID).
        if (id) setInstallingInstanceId(id);

        const toastId = toast.loading(id ? t('installing') : t('loading'));
        try {
            const result = id
                ? await (window.api as any)?.instancesCloudInstall?.(id)
                : await (window.api as any)?.instancesCloudSync?.();

            if (result?.ok) {
                toast.success(t('install_complete'), { id: toastId });
                loadInstances();
            } else {
                // Check if it was cancelled (already shown by handleCancelInstall)
                const installErr = typeof result?.error === 'string' ? result.error : '';
                if (installErr && (installErr.includes("cancelled") || installErr.includes("cancel"))) {
                    toast.dismiss(toastId);
                    return;
                }
                const errMsg = installErr || t('install_failed');
                if (errMsg.includes("401") || errMsg.includes("Unauthorized")) {
                    toast.error(t('session_expired'), { id: toastId });
                } else if (errMsg.includes("Not logged in")) {
                    toast.error(t('login_before_use'), { id: toastId });
                } else {
                    toast.error(errMsg, { id: toastId });
                }
            }
        } catch (error: any) {
            // Check if it was cancelled (already shown by handleCancelInstall)
            if (typeof error?.message === 'string' && (error.message.includes("cancelled") || error.message.includes("cancel"))) {
                toast.dismiss(toastId);
            } else {
                toast.error(error?.message || t('error_occurred'), { id: toastId });
            }
        } finally {
            setIsInstalling(false);
            setInstallingInstanceId(null);
            setIsInstallMinimized(false);
            setOperationType(null);
        }
    };

    // Drag and drop handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        const modpackFile = files.find(f =>
            f.name.endsWith('.mrpack') || f.name.endsWith('.zip')
        );

        if (modpackFile) {
            // Get the file path - use webUtils via preload if available
            let filePath = (modpackFile as any).path;
            if (window.api?.getPathForFile) {
                try {
                    filePath = window.api.getPathForFile(modpackFile);
                } catch (e) {
                    console.warn("Failed to get path via webUtils:", e);
                }
            }

            if (filePath) {
                await handleImportModpack(filePath);
            } else {
                toast.error(t('cannot_read_file'));
            }
        } else {
            toast.error(t('drag_mrpack_zip'));
        }
    };

    const formatPlayTime = (minutes: number): string => {
        if (minutes < 60) return `${minutes} ${t('minutes_unit')}`;
        const hours = Math.floor(minutes / 60);
        return `${hours} ${t('hours_unit')}`;
    };

    const getLoaderLabel = (loader: string): string => {
        const labels: Record<string, string> = {
            vanilla: "Vanilla",
            fabric: "Fabric",
            forge: "Forge",
            neoforge: "NeoForge",
            quilt: "Quilt",
        };
        return labels[loader] || loader;
    };


    // If an instance is selected, show detail view
    if (selectedInstance) {
        return (
            <InstanceDetail
                instance={selectedInstance}
                colors={colors}
                config={config}
                onBack={() => {
                    setSelectedInstance(null);
                    loadInstances(); // Reload in case of changes
                }}
                onPlay={handlePlay}
                onStop={() => handleStop(selectedInstance.id)}
                onOpenFolder={handleOpenFolder}
                onDelete={(id) => {
                    handleDelete(id);
                    setSelectedInstance(null);
                }}
                onDuplicate={handleDuplicate}
                onUpdate={handleUpdate}
                onExport={handleExportInstance}
                launchingId={launchingId}
                isGameRunning={playingInstances.size > 0}
                playingInstanceId={playingInstances.has(selectedInstance.id) ? selectedInstance.id : (playingInstances.size > 0 ? "OTHER" : null)}
            />
        );
    }

    return (
        <>
            {/* Live Log Viewer */}
            <LiveLog
                colors={colors}
                isOpen={logViewerInstanceId !== null}
                onClose={() => setLogViewerInstanceId(null)}
                instanceId={logViewerInstanceId}
            />

            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <h2 className="text-xl font-medium" style={{ color: colors.onSurface }}>{t('modpacks')}</h2>
                    <div className="flex gap-2">
                        <button
                            onClick={() => { playClick(); setShowImportModal(true); }}
                            disabled={isInstalling}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:opacity-80 disabled:opacity-50"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                            </svg>
                            {t('import')}
                        </button>
                        <button
                            onClick={() => { playClick(); setShowCreateModal(true); }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-[1.02]"
                            style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                        >
                            <Icons.Add className="w-5 h-5" />
                            {t('create_modpack_create')}
                        </button>
                    </div>
                </div>

                {/* Create Mod Pack Section */}
                <div className="rounded-2xl p-4" style={{ backgroundColor: colors.surfaceContainer }}>
                    <div className="flex items-center gap-4 mb-4">
                        <div
                            className="w-14 h-14 rounded-xl flex items-center justify-center"
                            style={{ backgroundColor: colors.surfaceContainerHighest }}
                        >
                            <Icons.Box className="w-7 h-7" style={{ color: colors.secondary }} />
                        </div>
                        <div>
                            <h3 className="font-medium" style={{ color: colors.onSurface }}>{t('create_your_own')}</h3>
                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{t('choose_and_play')}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => { playClick(); setActiveTab("explore"); }}
                        className="w-full py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-all hover:opacity-80"
                        style={{ borderColor: colors.outline, color: colors.onSurfaceVariant }}
                    >
                        {t('add_new_mod_pack_btn')}
                    </button>
                </div>

                {/* My Mod Packs Section */}
                <div>




                    <h3 className="text-lg font-medium mb-3" style={{ color: colors.onSurface }}>{t('my_mod_packs')}</h3>
                    {isLoading ? (
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                            {Array.from({ length: 9 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="rounded-xl overflow-hidden p-4 animate-skeleton-wave"
                                    style={{
                                        backgroundColor: `${colors.surfaceContainer}60`,
                                        border: `1px solid ${colors.outline}15`,
                                        animationDelay: `${Math.min(i * 30, 150)}ms`
                                    }}
                                >
                                    {/* Header: Icon + Info */}
                                    <div className="flex items-start gap-3 mb-3">
                                        <div className="w-12 h-12 rounded-xl shrink-0"
                                            style={{ backgroundColor: colors.surfaceContainerHighest }} />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-5 w-3/4 rounded" style={{ backgroundColor: colors.surfaceContainerHighest }} />
                                            <div className="h-4 w-1/2 rounded" style={{ backgroundColor: colors.surfaceContainerHighest }} />
                                        </div>
                                    </div>

                                    {/* Stats Line */}
                                    <div className="h-4 w-1/3 rounded mb-4" style={{ backgroundColor: colors.surfaceContainerHighest }} />

                                    {/* Buttons */}
                                    <div className="flex gap-2">
                                        <div className="h-10 flex-1 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest }} />
                                        <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest }} />
                                        <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : instances.filter(i => !i.cloudId).length === 0 ? (
                        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: colors.surfaceContainer }}>
                            <Icons.Box className="w-12 h-12 mx-auto mb-3" style={{ color: colors.onSurfaceVariant, opacity: 0.5 }} />
                            <p className="font-medium mb-1" style={{ color: colors.onSurfaceVariant }}>{t('no_mod_packs')}</p>
                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{t('create_mod_pack_first')}</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                            {instances.filter(i => !i.cloudId).map((instance) => (
                                <div
                                    key={instance.id}
                                    onClick={() => { playClick(); handleOpenInstanceDetail(instance); }}
                                    className="p-4 rounded-xl transition-all hover:shadow-lg cursor-pointer"
                                    style={{ backgroundColor: colors.surfaceContainer }}
                                >
                                    {/* Header */}
                                    <div className="flex items-start gap-3 mb-3">
                                        <div
                                            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                                            style={{ backgroundColor: colors.surfaceContainerHigh }}
                                        >
                                            {instance.icon ? (
                                                <SmartImage trigger={refreshTrigger} src={instance.icon} alt={instance.name} className="w-full h-full object-cover rounded-xl" />
                                            ) : (
                                                <Icons.Box className="w-6 h-6" style={{ color: colors.onSurfaceVariant }} />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate" style={{ color: colors.onSurface }}>{instance.name}</div>
                                            <div className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                                                {instance.minecraftVersion} • {getLoaderLabel(instance.loader)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stats */}
                                    <div className="flex items-center gap-4 mb-4 text-sm" style={{ color: colors.onSurfaceVariant }}>
                                        {instance.lastPlayedAt && (
                                            <span>{t('last_played')} {new Date(instance.lastPlayedAt).toLocaleDateString("th-TH")}</span>
                                        )}
                                        {instance.totalPlayTime > 0 && (
                                            <span>{formatPlayTime(instance.totalPlayTime)}</span>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                        {(() => {
                                            // Determine button state - combine launching and playing
                                            const isLaunching = launchingId === instance.id;
                                            const isPlaying = playingInstances.has(instance.id);

                                            // Show stop as long as this instance is either launching or playing
                                            const showStop = isLaunching || isPlaying;

                                            if (showStop) {
                                                // Show stop button - loading if launching, red if playing
                                                return (
                                                    <button
                                                        onClick={() => { playClick(); handleStop(instance.id); }}
                                                        className="flex-1 h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10 shadow-sm hover:shadow-md font-bold"
                                                        style={{
                                                            backgroundColor: isLaunching ? colors.surfaceContainerHighest : "#ef4444",
                                                            color: isLaunching ? colors.onSurface : "#ffffff"
                                                        }}
                                                    >
                                                        {isLaunching ? (
                                                            <>
                                                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                                {t('loading')}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                                    <rect x="6" y="6" width="12" height="12" />
                                                                </svg>
                                                                {t('stop')}
                                                            </>
                                                        )}
                                                    </button>
                                                );
                                            }

                                            // Normal play button
                                            return (
                                                <button
                                                    onClick={() => { playClick(); handlePlay(instance.id); }}
                                                    className="flex-1 h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10 shadow-sm hover:shadow-md font-bold"
                                                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                                >
                                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                        <path d="M8 5v14l11-7z" />
                                                    </svg>
                                                    {t('play')}
                                                </button>
                                            );
                                        })()}
                                        <button
                                            onClick={() => { playClick(); handleOpenFolder(instance.id); }}
                                            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                            title={t('open_folder')}
                                        >
                                            <Icons.Folder className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => { playClick(); setLogViewerInstanceId(instance.id); }}
                                            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                            title={t('view_logs')}
                                        >
                                            <Icons.Terminal className="w-5 h-5" />
                                        </button>

                                        <button
                                            onClick={() => { playClick(); setDeleteConfirmId(instance.id); }}
                                            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10"
                                            style={{ backgroundColor: "#ef444420", color: "#ef4444" }}
                                            title={t('delete')}
                                        >
                                            <Icons.Trash className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Server Mods Section */}
                <div>
                    <h3 className="text-lg font-medium mb-3" style={{ color: colors.onSurface }}>{t('server_mod_packs')}</h3>


                    {loadingServers ? (
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                            <Skeleton className="h-48 rounded-2xl" colors={colors} />
                            <Skeleton className="h-48 rounded-2xl" colors={colors} />
                        </div>
                    ) : joinedServers.length > 0 ? (
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                            {joinedServers.map(server => {
                                const serverInstance = instances.find(i => i.cloudId === server.id);

                                if (serverInstance) {
                                    // Installed: Show Banner Card
                                    return (
                                        <SmartBackground
                                            key={serverInstance.id}
                                            trigger={refreshTrigger}
                                            src={serverInstance.banner || server.bannerUrl || server.iconUrl}
                                            onClick={() => { playClick(); handleOpenInstanceDetail(serverInstance); }}
                                            className="group relative rounded-2xl overflow-hidden cursor-pointer h-48 transition-all hover:shadow-xl"
                                            style={{
                                                backgroundColor: colors.surfaceContainer,
                                                border: "2px solid transparent"
                                            }}
                                        >
                                            {/* Full Background Image is handled by SmartBackground */}
                                            <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                                                style={{ backgroundImage: "inherit" }}
                                            />

                                            {/* Gradient Overlay */}
                                            <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/50 to-transparent" />

                                            {/* Icon & Name - Animated from Bottom-Left to Just Above Buttons */}
                                            <div className="absolute left-2 bottom-2 right-12 flex items-center gap-3 z-20 transition-all duration-500 ease-in-out group-hover:-translate-y-21 pointer-events-none">
                                                {/* Logo Box */}
                                                <div className="w-12 h-12 rounded-xl bg-black/20 backdrop-blur-md border border-white/10 overflow-hidden shadow-lg shrink-0 pointer-events-auto">
                                                    {serverInstance.icon ? (
                                                        <SmartImage trigger={refreshTrigger} src={serverInstance.icon} alt={serverInstance.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-white/10 text-white">
                                                            <Icons.Box className="w-6 h-6" />
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Name */}
                                                <h3 className="text-lg font-bold text-white truncate drop-shadow-md opacity-90 group-hover:opacity-100 transition-opacity">
                                                    {serverInstance.name}
                                                </h3>
                                            </div>

                                            {/* Auto Update Badge - Top Right */}
                                            <div className="absolute top-2 right-2 z-10 select-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                                <div
                                                    className="flex items-center gap-2 px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 hover:bg-black/50 transition-colors cursor-pointer"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        playClick();
                                                        // Toggle logic: undefined (implicit ON) -> false (OFF), true -> false, false -> true
                                                        handleUpdate(serverInstance.id, { autoUpdate: serverInstance.autoUpdate === false });
                                                    }}
                                                    title={serverInstance.autoUpdate !== false ? t('instance_auto_update_on') : t('instance_auto_update_off')}
                                                >
                                                    <div className={`w-2 h-2 rounded-full ${serverInstance.autoUpdate !== false ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" : "bg-gray-400"}`} />
                                                    <span className="text-[10px] text-white/80 pr-1">{t('auto_update')}</span>
                                                </div>
                                            </div>

                                            {/* Content & Actions - Bottom (Reveals on Hover) */}
                                            <div className="absolute bottom-0 left-0 right-0 p-4 z-10 w-full transition-all duration-500 ease-in-out transform translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100">
                                                
                                                {/* Version - Always Visible in this container, Above Buttons */}
                                                <div className="mb-2 pl-1">
                                                    <p className="text-sm text-gray-300 truncate drop-shadow-sm">
                                                        {serverInstance.minecraftVersion} • {getLoaderLabel(serverInstance.loader)}
                                                    </p>
                                                </div>

                                                {/* Buttons - Always Visible, Full Width */}
                                                <div className="flex gap-2 w-full">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            playClick();
                                                            if (playingInstances.has(serverInstance.id) || launchingId === serverInstance.id) {
                                                                handleStop(serverInstance.id);
                                                            } else {
                                                                handlePlay(serverInstance.id);
                                                            }
                                                        }}
                                                        className="flex-1 h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10"
                                                        style={{
                                                            backgroundColor: launchingId === serverInstance.id
                                                                ? colors.surfaceContainerHighest
                                                                : playingInstances.has(serverInstance.id)
                                                                    ? "#ef4444"
                                                                    : colors.secondary,
                                                            color: launchingId === serverInstance.id
                                                                ? colors.onSurface
                                                                : playingInstances.has(serverInstance.id)
                                                                    ? "#fff"
                                                                    : "#1a1a1a"
                                                        }}
                                                    >
                                                        {launchingId === serverInstance.id ? (
                                                            <>
                                                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                                <span className="font-bold">{t('loading')}</span>
                                                            </>
                                                        ) : playingInstances.has(serverInstance.id) ? (
                                                            <>
                                                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                                    <rect x="6" y="6" width="12" height="12" />
                                                                </svg>
                                                                <span className="font-bold">{t('stop')}</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                                    <path d="M8 5v14l11-7z" />
                                                                </svg>
                                                                <span className="font-bold">{t('play')}</span>
                                                            </>
                                                        )}
                                                    </button>

                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            playClick();
                                                            handleOpenFolder(serverInstance.id);
                                                        }}
                                                        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10 shrink-0"
                                                        style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#fff" }}
                                                        title={t('open_folder')}
                                                    >
                                                        <Icons.Folder className="w-5 h-5" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            playClick();
                                                            setLogViewerInstanceId(serverInstance.id);
                                                        }}
                                                        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10 shrink-0"
                                                        style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#fff" }}
                                                        title={t('view_logs')}
                                                    >
                                                        <Icons.Terminal className="w-5 h-5" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            playClick();
                                                            handleRepair(serverInstance.id);
                                                        }}
                                                        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-red-500/20 hover:text-red-500 active:scale-95 backdrop-blur-md border border-white/10 shrink-0"
                                                        style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#fff" }}
                                                        title={t('repair_files')}
                                                    >
                                                        <Icons.Wrench className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </SmartBackground>
                                    );
                                } else {
                                    // Not Installed: Show Install Card (Banner Style)
                                    return (
                                        <SmartBackground
                                            key={server.id}
                                            trigger={refreshTrigger}
                                            src={server.bannerUrl || server.iconUrl}
                                            className="group relative rounded-2xl overflow-hidden h-48 transition-all hover:shadow-xl"
                                            style={{
                                                backgroundColor: colors.surfaceContainer,
                                                border: "2px solid " + colors.outline
                                            }}
                                        >
                                            {/* Full Background Image (Grayscale) */}
                                            {(server.bannerUrl || server.iconUrl) && (
                                                <div
                                                    className="absolute inset-0 bg-cover bg-center transition-all duration-500 group-hover:scale-105 opacity-30 grayscale group-hover:grayscale-0"
                                                    style={{ backgroundImage: "inherit" }}
                                                />
                                            )}

                                            {/* Gradient Overlay */}
                                            <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent" />

                                            {/* Center Content: Install Button */}
                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 transition-opacity group-hover:opacity-100">
                                                <button
                                                    onClick={() => { playClick(); handleInstallServerInstance(server.id); }}
                                                    disabled={isInstalling}
                                                    className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
                                                >
                                                    <Icons.Download className="w-5 h-5" />
                                                    {isInstalling ? t('installing_modpack') : t('install')}
                                                </button>
                                            </div>

                                            {/* Name Bottom Left */}
                                            <div className="absolute bottom-4 left-4 right-4 z-10 pointer-events-none">
                                                <h3 className="text-xl font-bold text-white truncate drop-shadow-md text-center">
                                                    {server.name}
                                                </h3>
                                                <p className="text-sm text-gray-400 text-center">{t('not_installed')}</p>
                                            </div>
                                        </SmartBackground>
                                    );
                                }
                            })}
                        </div>
                    ) : (
                        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: colors.surfaceContainer }}>
                            <Icons.Box className="w-12 h-12 mx-auto mb-3" style={{ color: colors.onSurfaceVariant, opacity: 0.5 }} />
                            <p className="font-medium mb-1" style={{ color: colors.onSurfaceVariant }}>{t('not_joined_server')}</p>
                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{t('join_server_to_play')}</p>
                        </div>
                    )}

                </div>



                {/* Delete Confirmation Modal */}
                {deleteConfirmId && (
                    <DeleteConfirmModal
                        colors={colors}
                        instanceId={deleteConfirmId}
                        onCancel={() => setDeleteConfirmId(null)}
                        onConfirm={handleDelete}
                        language={language}
                    />
                )}

                {/* Create Instance Modal */}
                {showCreateModal && (
                    <CreateInstanceModal
                        colors={colors}
                        config={config}
                        onClose={() => setShowCreateModal(false)}
                        onCreated={() => {
                            setShowCreateModal(false);
                            loadInstances();
                        }}
                        language={language}
                    />
                )}

                {/* Import Modal */}
                {showImportModal && (
                    <ImportModpackModal
                        colors={colors}
                        isDragging={isDragging}
                        isInstalling={isInstalling}
                        onClose={() => setShowImportModal(false)}
                        onImport={() => handleImportModpack()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        language={language}
                    />
                )}

                {/* Installation Progress Modal */}
                {isInstalling && installProgress && !isInstallMinimized && (
                    <InstallProgressModal
                        colors={colors}
                        installProgress={installProgress}
                        title={operationType === "repair" ? t('repairing_instance') : undefined}
                        onCancel={handleCancelInstall}
                        onMinimize={() => setIsInstallMinimized(true)}
                        language={language}
                    />
                )}

                {/* Minimized Progress Widget */}
                {isInstalling && installProgress && isInstallMinimized && (
                    <div
                        className="fixed bottom-6 right-6 z-50 w-80 rounded-2xl shadow-2xl overflow-hidden border border-white/10 animate-fade-in-up cursor-pointer transition-transform hover:scale-105"
                        style={{ backgroundColor: colors.surfaceContainer }}
                        onClick={() => setIsInstallMinimized(false)}
                    >
                        <div className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center relative shrink-0"
                                style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                {installProgress.percent !== undefined ? (
                                    <svg className="w-10 h-10 -rotate-90 transform" viewBox="0 0 36 36">
                                        <path
                                            className="text-gray-200 opacity-20"
                                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="3"
                                        />
                                        <path
                                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                            fill="none"
                                            stroke={colors.secondary}
                                            strokeWidth="3"
                                            strokeDasharray={`${installProgress.percent}, 100`}
                                        />
                                    </svg>
                                ) : (
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2" style={{ borderColor: colors.secondary }}></div>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color: colors.onSurface }}>
                                    {installProgress.percent}%
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm truncate" style={{ color: colors.onSurface }}>
                                    {operationType === "repair" ? t('repairing_instance') : t('installing')}
                                </h4>
                                <p className="text-xs truncate" style={{ color: colors.onSurfaceVariant }}>
                                    {installProgress.type ? t(installProgress.type as any, { filename: installProgress.filename, current: installProgress.current, total: installProgress.total } as any) : installProgress.message}
                                </p>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsInstallMinimized(false); }}
                                className="p-2 rounded-lg hover:bg-white/10"
                                title="Expand"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: colors.onSurfaceVariant }}>
                                    <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" />
                                </svg>
                            </button>
                        </div>
                    </div>
                )}

            </div >
            

        </>
    );
}
