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
import { useInstances } from "../../hooks/useInstances";
import { useGameEvents } from "../../hooks/useGameEvents";
import { useAuthStore } from "../../store/authStore";
import modpackIcon from "../../assets/modpack_icon.png";
import {
    getLaunchPolicyForInstance,
    shouldShowLaunchSpinner,
    shouldShowStopButton,
} from "../../lib/launchPolicy";
import {
    isInstallTargetActive,
    isInstanceInstallLocked,
} from "../../lib/installLock";

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


import { SmartImage, SmartBackground } from '../ui/SmartImage';
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
    const { accounts, setSession: setAuthSession, updateAccount } = useAuthStore();
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [launchingId, setLaunchingId] = useState<string | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [logViewerInstanceId, setLogViewerInstanceId] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const { 
        instances, isLoading, playingInstances, joinedServers, loadingServers, 
        loadInstances, loadJoinedServers, handleDelete, handleDuplicate, handleUpdate, handleOpenFolder,
        setInstances, setPlayingInstances
    } = useInstances({ session, t, isActive, selectedInstance, setSelectedInstance });

    const {
        isInstalling, setInstalling,
        installProgress, setInstallProgress,
        isInstallMinimized, setInstallMinimized,
        operationType, setOperationType,
        installingInstanceId, setInstallingInstanceId
    } = useProgressStore();
    
    const installLockState = {
        isInstalling,
        operationType,
        installingInstanceId,
    };

    const { startExport, setExportProgress, setExporting, setExportingInstanceId, resetExport } = useProgressStore();

    const handleExportInstance = async (instanceId: string, options: any) => {
        startExport(instanceId, { stage: "extracting", message: "Preparing export...", percent: 0 });
        const cleanup = (window as any).api?.onExportProgress?.((_id: any, progress: any) => {
             setExportProgress({
                stage: "copying",
                message: "Exporting...",
                percent: progress.percent,
                current: progress.transferred,
                total: progress.total
            });
        });
        try {
            const result = await (window as any).api?.instancesExport?.(instanceId, options);
            // toast handle omitted for brevity
        } catch (error) {
            console.error("Export failed:", error);
        } finally {
            cleanup?.();
            resetExport();
        }
    };

    const handleCancelExport = async (instanceId: string) => {
        try {
            await (window as any).api?.instancesExportCancel?.(instanceId);
        } catch (error) {
            console.error("Failed to cancel export:", error);
        }
    };

    const handleOpenInstanceDetail = (instance: any) => {
        if(setSelectedInstance) setSelectedInstance(instance);
    };

    // Needed for ModPack.tsx lower components
    const setInstallingSafe = (next: boolean) => setInstalling(next);
    const setOperationTypeSafe = (next: any) => setOperationType(next);
    const setInstallProgressThrottled = (next: any) => setInstallProgress(next);



    const { handleCancelInstall, handleRepair } = useGameEvents({
        t, isInstalling, setInstalling, setInstallProgress, setInstallMinimized,
        operationType, setOperationType, installingInstanceId, setInstallingInstanceId, loadInstances
    });


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
            const targetInstance = instances.find((item) => item.id === id);
            const launchPolicy = getLaunchPolicyForInstance(targetInstance);
            const isServerInstance = launchPolicy.isServerBacked;

            if (launchPolicy.suppressInstallProgressModal) {
                setInstallingSafe(false);
                setInstallProgress(null);
                setInstallMinimized(false);
                setOperationTypeSafe(null);
                setInstallingInstanceId(null);
            }

            if (isServerInstance && session?.type === "catid" && session.minecraftUuid) {
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
                    toastError(t('session_expired_login_server'));
                    return;
                }
            }

            const refreshResult = await window.api?.authRefreshToken?.();
            if (refreshResult && refreshResult.ok === false) {
                const requiresRelogin = refreshResult.requiresRelogin === true;
                const refreshErr = typeof refreshResult.error === "string"
                    ? refreshResult.error
                    : "";
                toastError(
                    requiresRelogin
                        ? t('session_expired_login_server')
                        : (refreshErr || t('session_expired_login_server')),
                );
                return;
            }

            // Note: instancesLaunch logic in backend now checks isGameRunning(id)
            const result = await window.api?.instancesLaunch?.(id, launchPolicy.launchOptions);
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
        const wasLaunching = launchingId === id;
        if (launchingId === id) {
            launchCancelledRef.current = true;
            setLaunchingId(null);
            if (launchTimeoutRef.current) {
                clearTimeout(launchTimeoutRef.current);
                launchTimeoutRef.current = null;
            }
        }

        try {
            if (wasLaunching) {
                await (window.api as any)?.instanceCancelAction?.(id);
            }
            await window.api?.killGame?.(id);
            setPlayingInstances(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });

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
            setInstalling(true);
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
            setInstalling(false);
            setInstallProgress(null);
            setOperationType(null);
        }
    };



    const handleInstallServerInstance = async (id?: string) => {
        setOperationType("install");
        setInstalling(true);
        setInstallMinimized(false);
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
            setInstalling(false);
            setInstallingInstanceId(null);
            setInstallMinimized(false);
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

    const stagedRevealStyle = (delayMs: number): React.CSSProperties => ({
        animationDelay: `${delayMs}ms`,
        opacity: 0,
    });


    // If an instance is selected, show detail view
    return (
        <>
            {/* Live Log Viewer */}
            <LiveLog
                colors={colors}
                isOpen={logViewerInstanceId !== null}
                onClose={() => setLogViewerInstanceId(null)}
                instanceId={logViewerInstanceId}
            />

            {selectedInstance ? (
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
                    onViewLogs={(id) => setLogViewerInstanceId(id)}
                    onRepair={handleRepair}
                    launchingId={launchingId}
                    isGameRunning={playingInstances.size > 0}
                    playingInstanceId={playingInstances.has(selectedInstance.id) ? selectedInstance.id : (playingInstances.size > 0 ? "OTHER" : null)}
                    isInstallLocked={isInstanceInstallLocked(selectedInstance, installLockState)}
                />
            ) : (
                <div className="space-y-6 animate-fade-in">


                {/* Header */}
                <div
                    className="flex items-center justify-between flex-wrap gap-4 animate-fade-in-up"
                    style={stagedRevealStyle(20)}
                >
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
                <div
                    className="rounded-2xl p-4 animate-fade-in-up"
                    style={{ ...stagedRevealStyle(80), backgroundColor: colors.surfaceContainer }}
                >
                    <div className="flex items-center gap-4 mb-4">
                        <div
                            className="w-16 h-16 rounded-xl flex items-center justify-center overflow-hidden shrink-0"
                            style={{ backgroundColor: colors.surfaceContainerHighest }}
                        >
                            <img src={modpackIcon.src} alt="Modpack Icon" className="w-14 h-14 opacity-90 drop-shadow-md" />
                        </div>
                        <div>
                            <h3 className="font-medium" style={{ color: colors.onSurface }}>{t('create_your_own')}</h3>
                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{t('choose_and_play')}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => { playClick(); setActiveTab("explore"); }}
                        className="w-full py-3 rounded-xl border-2 text-sm font-medium transition-all hover:opacity-80"
                        style={{ borderColor: colors.outline, color: colors.onSurfaceVariant }}
                    >
                        {t('add_new_mod_pack_btn')}
                    </button>
                </div>

                {/* My Mod Packs Section */}
                <div className="animate-fade-in" style={stagedRevealStyle(140)}>




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
                        <div
                            className="rounded-2xl p-8 text-center animate-fade-in"
                            style={{ ...stagedRevealStyle(180), backgroundColor: colors.surfaceContainer }}
                        >
                            <Icons.Box className="w-12 h-12 mx-auto mb-3" style={{ color: colors.onSurfaceVariant, opacity: 0.5 }} />
                            <p className="font-medium mb-1" style={{ color: colors.onSurfaceVariant }}>{t('no_mod_packs')}</p>
                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{t('create_mod_pack_first')}</p>
                        </div>
                    ) : (
                        <div
                            className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 animate-fade-in"
                            style={stagedRevealStyle(180)}
                        >
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
                                            const isInstallingThisInstance = isInstanceInstallLocked(
                                                instance,
                                                installLockState,
                                            );
                                            const disablePlayButton = false;
                                            const showSpinner = shouldShowLaunchSpinner(isLaunching, isPlaying);

                                            // Show stop as long as this instance is either launching or playing
                                            const showStop = shouldShowStopButton(isLaunching, isPlaying);

                                            if (showStop) {
                                                // Show stop immediately (including launching state)
                                                return (
                                                    <button
                                                        onClick={() => { playClick(); handleStop(instance.id); }}
                                                        className="flex-1 h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10 shadow-sm hover:shadow-md font-bold"
                                                        style={{
                                                            backgroundColor: "#ef4444",
                                                            color: "#ffffff",
                                                        }}
                                                    >
                                                        {showSpinner ? (
                                                            <>
                                                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                            </>
                                                        ) : (
                                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                                <rect x="6" y="6" width="12" height="12" />
                                                            </svg>
                                                        )}
                                                        {t('stop')}
                                                    </button>
                                                );
                                            }

                                            // Normal play button
                                            return (
                                                <button
                                                    onClick={() => { playClick(); handlePlay(instance.id); }}
                                                    disabled={disablePlayButton || isInstallingThisInstance}
                                                    className="flex-1 h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10 shadow-sm hover:shadow-md font-bold disabled:opacity-50 disabled:pointer-events-none"
                                                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                                >
                                                    {isInstallingThisInstance ? (
                                                        <>
                                                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                            {t('installing')}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                                <path d="M8 5v14l11-7z" />
                                                            </svg>
                                                            {t('play')}
                                                        </>
                                                    )}
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
                <div className="animate-fade-in" style={stagedRevealStyle(220)}>
                    <h3 className="text-lg font-medium mb-3" style={{ color: colors.onSurface }}>{t('server_mod_packs')}</h3>


                    {loadingServers ? (
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 animate-fade-in" style={stagedRevealStyle(260)}>
                            <Skeleton className="h-48 rounded-2xl" colors={colors} />
                            <Skeleton className="h-48 rounded-2xl" colors={colors} />
                        </div>
                    ) : joinedServers.length > 0 ? (
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 animate-fade-in" style={stagedRevealStyle(260)}>
                            {joinedServers.map(server => {
                                const serverInstance = instances.find(i => i.cloudId === server.id);
                                const isInstallingThisServerCard = isInstallTargetActive(
                                    server.id,
                                    installLockState,
                                );
                                const disableServerInstallAction =
                                    isInstalling && operationType === "install";

                                if (serverInstance) {
                                    const isInstallingThisServerInstance = isInstanceInstallLocked(
                                        serverInstance,
                                        installLockState,
                                    );
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
                                                            if (shouldShowStopButton(launchingId === serverInstance.id, playingInstances.has(serverInstance.id))) {
                                                                handleStop(serverInstance.id);
                                                            } else {
                                                                handlePlay(serverInstance.id);
                                                            }
                                                        }}
                                                        disabled={isInstallingThisServerInstance}
                                                        className="flex-1 h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10 disabled:opacity-50 disabled:pointer-events-none"
                                                        style={{
                                                            backgroundColor: shouldShowStopButton(launchingId === serverInstance.id, playingInstances.has(serverInstance.id))
                                                                ? "#ef4444"
                                                                : colors.secondary,
                                                            color: shouldShowStopButton(launchingId === serverInstance.id, playingInstances.has(serverInstance.id))
                                                                ? "#fff"
                                                                : "#1a1a1a",
                                                        }}
                                                    >
                                                        {isInstallingThisServerInstance ? (
                                                            <>
                                                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                                <span className="font-bold">{t('installing')}</span>
                                                            </>
                                                        ) : shouldShowStopButton(launchingId === serverInstance.id, playingInstances.has(serverInstance.id)) ? (
                                                            <>
                                                                {shouldShowLaunchSpinner(launchingId === serverInstance.id, playingInstances.has(serverInstance.id)) ? (
                                                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                                ) : (
                                                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                                        <rect x="6" y="6" width="12" height="12" />
                                                                    </svg>
                                                                )}
                                                                <span className="font-bold">{t('stop')}</span>
                                                            </>) : (
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
                                                    disabled={disableServerInstallAction}
                                                    className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
                                                >
                                                    <Icons.Download className="w-5 h-5" />
                                                    {isInstallingThisServerCard ? t('installing_modpack') : t('install')}
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
                        <div
                            className="rounded-2xl p-8 text-center animate-fade-in-up"
                            style={{ ...stagedRevealStyle(260), backgroundColor: colors.surfaceContainer }}
                        >
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


            </div >
            
            )}
        </>
    );
}
