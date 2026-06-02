import React, { useEffect, useState, useRef, type Dispatch, type SetStateAction } from "react";
import toast from "react-hot-toast";
import { playClick, toastSuccess, toastError } from "../../lib/sounds";
import { Icons } from "../ui/Icons";
import { InstanceDetail } from "./InstanceDetail";
import { LiveLog } from "./LiveLog";
import { Skeleton } from "../ui/Skeleton";
import { SmartImage, SmartBackground } from "../ui/SmartImage";
import { useTranslation } from "../../hooks/useTranslation";
import {
    CreateInstanceModal,
    ImportModpackModal,
    DeleteConfirmModal,
    formatPlayTime,
    getLoaderLabel,
} from "./ModPackTabs";
import { useProgressStore } from "../../store/progressStore";
import { useLaunchStore } from "../../store/launchStore";
import { useInstances } from "../../hooks/useInstances";
import { useGameEvents } from "../../hooks/useGameEvents";
import { useAuthStore } from "../../store/authStore";
import { Portal } from "../ui/Portal";
import {
    getLaunchPolicyForInstance,
    shouldShowLaunchSpinner,
    shouldShowStopButton,
} from "../../lib/launchPolicy";
import {
    isInstallTargetActive,
    isInstanceInstallLocked,
} from "../../lib/installLock";
import { type AuthSession, type Server, type GameInstance, type LauncherConfig } from "../../types/launcher";

const DEFAULT_MODPACK_BANNER = "./banner.png";

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

const isCancellationError = (msg: unknown): boolean => {
    if (typeof msg !== "string" || !msg) return false;
    return msg.includes("cancelled") || msg.includes("cancel");
};

const Spinner = ({ className = "w-4 h-4" }: { className?: string }) => (
    <div className={`${className} border-2 border-current border-t-transparent rounded-full animate-spin`} />
);

export function ModPack({
    colors,
    config,
    setActiveTab,
    setSettingsTab,
    onShowConfirm,
    isActive,
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
    // launchingId อยู่ใน global store เพื่อให้สถานะ "กำลังเปิด" รอดการสลับแท็บ
    const launchingId = useLaunchStore((s) => s.launchingId);
    const setLaunchingId = useLaunchStore((s) => s.setLaunchingId);
    const [showImportModal, setShowImportModal] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [logViewerInstanceId, setLogViewerInstanceId] = useState<string | null>(null);
    const [refreshTrigger] = useState(0);
    const [showCreateMenu, setShowCreateMenu] = useState(false);
    const createMenuRef = useRef<HTMLDivElement>(null);
    const createButtonRef = useRef<HTMLButtonElement>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

    useEffect(() => {
        if (!showCreateMenu) return;
        const updatePos = () => {
            const rect = createButtonRef.current?.getBoundingClientRect();
            if (rect) {
                setMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
            }
        };
        updatePos();
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                createMenuRef.current && !createMenuRef.current.contains(target) &&
                createButtonRef.current && !createButtonRef.current.contains(target)
            ) {
                setShowCreateMenu(false);
            }
        };
        document.addEventListener("mousedown", handler);
        window.addEventListener("resize", updatePos);
        window.addEventListener("scroll", updatePos, true);
        return () => {
            document.removeEventListener("mousedown", handler);
            window.removeEventListener("resize", updatePos);
            window.removeEventListener("scroll", updatePos, true);
        };
    }, [showCreateMenu]);

    const {
        instances, isLoading, playingInstances, joinedServers, loadingServers,
        loadInstances, handleDelete, handleDuplicate, handleUpdate, handleOpenFolder,
        setPlayingInstances,
    } = useInstances({ session, t, isActive, selectedInstance, setSelectedInstance });

    const {
        isInstalling, setInstalling,
        installProgress: _installProgress, setInstallProgress,
        isInstallMinimized: _isInstallMinimized, setInstallMinimized,
        operationType, setOperationType,
        installingInstanceId, setInstallingInstanceId,
        startExport, setExportProgress, resetExport,
    } = useProgressStore();

    const installLockState = { isInstalling, operationType, installingInstanceId };

    const removeFromPlaying = (id: string) => {
        setPlayingInstances(prev => {
            const s = new Set(prev);
            s.delete(id);
            return s;
        });
    };

    const handleExportInstance = async (instanceId: string, options: any) => {
        startExport(instanceId, { stage: "extracting", message: t('preparing_export_dot'), percent: 0 });
        const cleanup = (window as any).api?.onExportProgress?.((_id: any, progress: any) => {
            setExportProgress({
                stage: "copying",
                message: t('exporting'),
                percent: progress.percent,
                current: progress.transferred,
                total: progress.total,
            });
        });
        try {
            const result = await (window as any).api?.instancesExport?.(instanceId, options);
            if (result?.ok) {
                toast.success(t('export_success'));
            } else {
                const errMsg = typeof result?.error === 'string' ? result.error : '';
                if (!isCancellationError(errMsg)) {
                    toast.error(t('export_failed') + (errMsg || t('error_occurred')));
                }
            }
        } catch (error: any) {
            const catchMsg = typeof error?.message === 'string' ? error.message : '';
            if (!isCancellationError(catchMsg)) {
                console.error("Export failed:", error);
                toast.error(t('export_failed') + (catchMsg || t('error_occurred')));
            }
        } finally {
            cleanup?.();
            resetExport();
        }
    };

    const handleOpenInstanceDetail = (instance: any) => {
        setSelectedInstance(instance);
    };

    const { handleCancelInstall: _handleCancelInstall, handleRepair } = useGameEvents({
        t, isInstalling, setInstalling, setInstallProgress, setInstallMinimized,
        operationType, setOperationType, installingInstanceId, setInstallingInstanceId, loadInstances,
    });

    const launchCancelledRef = useRef(false);
    const launchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handlePlay = async (id: string) => {
        if (launchingId !== null) return;

        playClick();
        launchCancelledRef.current = false;
        setLaunchingId(id);

        launchTimeoutRef.current = setTimeout(() => {
            console.warn(`[ModPack] Launch timeout for instance ${id}`);
            setLaunchingId(null);
            toastError(t('launch_timeout'));
        }, 60000);

        try {
            const targetInstance = instances.find((item) => item.id === id);
            const launchPolicy = getLaunchPolicyForInstance(targetInstance);
            const isServerInstance = launchPolicy.isServerBacked;

            if (launchPolicy.suppressInstallProgressModal) {
                setInstalling(false);
                setInstallProgress(null);
                setInstallMinimized(false);
                setOperationType(null);
                setInstallingInstanceId(null);
            }

            if (isServerInstance && session?.type === "catid" && session.minecraftUuid) {
                const linkedMsAccount = accounts.find(
                    (account) => account.type === "microsoft" && account.uuid === session.minecraftUuid,
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
                const refreshErr = typeof refreshResult.error === "string" ? refreshResult.error : "";
                toastError(
                    requiresRelogin
                        ? t('session_expired_login_server')
                        : (refreshErr || t('session_expired_login_server')),
                );
                return;
            }

            const result = await window.api?.instancesLaunch?.(id, launchPolicy.launchOptions);
            console.log("[ModPack] instancesLaunch result:", result);

            if (launchCancelledRef.current) {
                await window.api?.killGame?.(id);
                removeFromPlaying(id);
                return;
            }

            if (result?.ok) {
                toastSuccess(result.message || t('launching'));
                setPlayingInstances(prev => new Set(prev).add(id));
            } else {
                const errorMessage = result?.message || t('launch_failed');
                const lowerMsg = errorMessage.toLowerCase();
                const isJavaError = lowerMsg.includes("java") || lowerMsg.includes("jre") || lowerMsg.includes("java_home");

                if (isJavaError && onShowConfirm && setSettingsTab) {
                    const javaVersionMatch = errorMessage.match(/Java (\d+)/i);
                    const requiredVersion = javaVersionMatch ? parseInt(javaVersionMatch[1]) : 0;

                    onShowConfirm({
                        title: t('java_not_found_prompt'),
                        message: `${errorMessage}\n${t('install_java_now_ask')}`,
                        confirmText: t('install_now'),
                        cancelText: t('later'),
                        tertiaryText: t('go_to_install_page'),
                        confirmColor: "#22c55e",
                        onConfirm: () => {
                            if (requiredVersion > 0 && (window.api as any)?.installJava) {
                                setActiveTab("settings");
                                setSettingsTab("java");
                                toastSuccess(t('downloading_java_dot'));
                                setTimeout(() => {
                                    (window.api as any).installJava(requiredVersion)
                                        .then((result: any) => {
                                            if (result?.ok && result.path) {
                                                const pathKey =
                                                    requiredVersion >= 25
                                                        ? "java25"
                                                        : requiredVersion >= 21
                                                            ? "java21"
                                                            : requiredVersion >= 17
                                                                ? "java17"
                                                                : "java8";
                                                if (updateConfig) {
                                                    updateConfig({
                                                        javaPaths: { ...config.javaPaths, [pathKey]: result.path },
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
                                setActiveTab("settings");
                                setSettingsTab("java");
                            }
                        },
                        onTertiary: () => {
                            setActiveTab("settings");
                            setSettingsTab("java");
                        },
                    });
                } else {
                    toastError(errorMessage);
                }
                removeFromPlaying(id);
            }
        } catch (error: any) {
            toastError(error?.message || t('error_occurred'));
            removeFromPlaying(id);
        } finally {
            setLaunchingId(null);
            if (launchTimeoutRef.current) {
                clearTimeout(launchTimeoutRef.current);
                launchTimeoutRef.current = null;
            }
        }
    };

    const handleStop = async (id: string) => {
        const wasLaunching = launchingId === id;
        if (wasLaunching) {
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
            removeFromPlaying(id);
            toast.success(t('stop_command_sent'));
        } catch (error) {
            toast.error(t('stop_failed_server'));
        }
    };

    const handleImportModpack = async (filePath?: string) => {
        try {
            const targetPath = filePath || await window.api?.browseModpack?.();
            if (!targetPath) return;

            setShowImportModal(false);
            setOperationType("install");
            setInstalling(true);
            setInstallProgress({ stage: "extracting", message: t('extracting_modpack_dot') });

            const result = await window.api?.modpackInstall?.(targetPath);

            if (result?.ok && result.instance) {
                toast.success(t('install_complete'));
                loadInstances();
            } else {
                const errMsg = typeof result?.error === 'string' ? result.error : '';
                if (errMsg && !isCancellationError(errMsg)) {
                    toast.error(errMsg);
                }
            }
        } catch (error: any) {
            const catchMsg = typeof error?.message === 'string' ? error.message : '';
            if (catchMsg && !isCancellationError(catchMsg)) {
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
                const installErr = typeof result?.error === 'string' ? result.error : '';
                if (isCancellationError(installErr)) {
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
            if (isCancellationError(error?.message)) {
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
        const modpackFile = files.find(f => f.name.endsWith('.mrpack') || f.name.endsWith('.zip'));

        if (!modpackFile) {
            toast.error(t('drag_mrpack_zip'));
            return;
        }

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
    };

    const stagedRevealStyle = (delayMs: number): React.CSSProperties => ({
        animationDelay: `${delayMs}ms`,
        opacity: 0,
    });

    const getModPackCardFrameStyle = (borderColor?: string): React.CSSProperties => ({
        backgroundColor: colors.surfaceContainer,
        backgroundClip: "padding-box",
        backgroundOrigin: "padding-box",
        border: borderColor ? `2px solid ${borderColor}` : "none",
        boxShadow: borderColor ? undefined : "inset 0 0 0 1px rgba(0,0,0,0.45)",
    });

    const renderModPackSkeleton = (i: number) => (
        <div
            key={i}
            className="rounded-xl overflow-hidden p-4 animate-skeleton-wave"
            style={{
                backgroundColor: `${colors.surfaceContainer}60`,
                border: `1px solid ${colors.outline}15`,
                animationDelay: `${Math.min(i * 30, 150)}ms`,
            }}
        >
            <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl shrink-0" style={{ backgroundColor: colors.surfaceContainerHighest }} />
                <div className="flex-1 space-y-2">
                    <div className="h-5 w-3/4 rounded" style={{ backgroundColor: colors.surfaceContainerHighest }} />
                    <div className="h-4 w-1/2 rounded" style={{ backgroundColor: colors.surfaceContainerHighest }} />
                </div>
            </div>
            <div className="h-4 w-1/3 rounded mb-4" style={{ backgroundColor: colors.surfaceContainerHighest }} />
            <div className="flex gap-2">
                <div className="h-10 flex-1 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest }} />
                <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest }} />
                <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest }} />
            </div>
        </div>
    );

    const handleSetBanner = async (instanceId: string) => {
        const data = await window.api?.browseIcon?.();
        if (data) {
            handleUpdate(instanceId, { banner: data });
        }
    };

    const renderMyModPackCard = (instance: GameInstance) => {
        const isLaunching = launchingId === instance.id;
        const isPlaying = playingInstances.has(instance.id);
        const isInstallingThisInstance = isInstanceInstallLocked(instance, installLockState);
        const showSpinner = shouldShowLaunchSpinner(isLaunching, isPlaying);
        const showStop = shouldShowStopButton(isLaunching, isPlaying);
        const cardBanner = instance.banner || DEFAULT_MODPACK_BANNER;

        return (
            <SmartBackground
                key={instance.id}
                trigger={refreshTrigger}
                src={cardBanner}
                onClick={() => { playClick(); handleOpenInstanceDetail(instance); }}
                className="group relative rounded-2xl overflow-hidden cursor-pointer h-48 transition-all"
                style={getModPackCardFrameStyle()}
            >
                {/* Background scale on hover */}
                <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                    style={{ backgroundImage: "inherit" }} />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/50 to-transparent" />

                {/* Static bottom-left: icon + name */}
                <div className="absolute left-2 bottom-2 right-12 flex items-center gap-3 z-20 transition-all duration-500 ease-in-out group-hover:-translate-y-21 pointer-events-none">
                    <div className="w-12 h-12 rounded-xl bg-black/20 backdrop-blur-md border border-white/10 overflow-hidden shrink-0">
                        {instance.icon ? (
                            <SmartImage trigger={refreshTrigger} src={instance.icon} alt={instance.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-white/10 text-white">
                                <Icons.Box className="w-6 h-6" />
                            </div>
                        )}
                    </div>
                    <h3 className="text-lg font-bold text-white truncate opacity-90 group-hover:opacity-100 transition-opacity">
                        {instance.name}
                    </h3>
                </div>

                {/* Hover reveal: version + action buttons */}
                <div className="absolute bottom-0 left-0 right-0 p-4 z-10 w-full transition-all duration-500 ease-in-out transform translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100">
                    <div className="mb-2 pl-1">
                        <p className="text-sm text-gray-300 truncate">
                            {instance.minecraftVersion} • {getLoaderLabel(instance.loader)}
                            {instance.totalPlayTime > 0 && (
                                <span className="ml-2 opacity-70">
                                    · {formatPlayTime(instance.totalPlayTime, { minutes: t('minutes_unit'), hours: t('hours_unit') })}
                                </span>
                            )}
                        </p>
                    </div>

                    <div className="flex gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); playClick(); showStop ? handleStop(instance.id) : handlePlay(instance.id); }}
                            disabled={isInstallingThisInstance}
                            className="flex-1 h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10 disabled:opacity-50 disabled:pointer-events-none"
                            style={{ backgroundColor: showStop ? "#ef4444" : colors.secondary, color: showStop ? "#fff" : "#1a1a1a" }}
                        >
                            {isInstallingThisInstance ? (
                                <><Spinner /><span className="font-bold">{t('installing')}</span></>
                            ) : showStop ? (
                                <>
                                    {showSpinner ? <Spinner /> : <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" /></svg>}
                                    <span className="font-bold">{t('stop')}</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                    <span className="font-bold">{t('play')}</span>
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); playClick(); handleOpenFolder(instance.id); }}
                            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10 shrink-0 bg-white/10 text-white"
                            title={t('open_folder')}
                        >
                            <Icons.Folder className="w-5 h-5" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); playClick(); setLogViewerInstanceId(instance.id); }}
                            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10 shrink-0 bg-white/10 text-white"
                            title={t('view_logs')}
                        >
                            <Icons.Terminal className="w-5 h-5" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); playClick(); setDeleteConfirmId(instance.id); }}
                            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-red-500/20 hover:text-red-500 active:scale-95 backdrop-blur-md border border-white/10 shrink-0 bg-white/10 text-white"
                            title={t('delete')}
                        >
                            <Icons.Trash className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </SmartBackground>
        );
    };

    const renderInstalledServerCard = (serverInstance: GameInstance, server: Server) => {
        const isLaunching = launchingId === serverInstance.id;
        const isPlaying = playingInstances.has(serverInstance.id);
        const showStop = shouldShowStopButton(isLaunching, isPlaying);
        const showSpinner = shouldShowLaunchSpinner(isLaunching, isPlaying);
        const isInstallingThisServerInstance = isInstanceInstallLocked(serverInstance, installLockState);
        const autoUpdateOn = serverInstance.autoUpdate !== false;
        const cardBanner = serverInstance.banner || server.bannerUrl || server.iconUrl || DEFAULT_MODPACK_BANNER;

        return (
            <SmartBackground
                key={serverInstance.id}
                trigger={refreshTrigger}
                src={cardBanner}
                onClick={() => { playClick(); handleOpenInstanceDetail(serverInstance); }}
                className="group relative rounded-2xl overflow-hidden cursor-pointer h-48 transition-all"
                style={getModPackCardFrameStyle()}
            >
                <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                    style={{ backgroundImage: "inherit" }}
                />
                <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/50 to-transparent" />

                <div className="absolute left-2 bottom-2 right-12 flex items-center gap-3 z-20 transition-all duration-500 ease-in-out group-hover:-translate-y-21 pointer-events-none">
                    <div className="w-12 h-12 rounded-xl bg-black/20 backdrop-blur-md border border-white/10 overflow-hidden shrink-0 pointer-events-auto">
                        {serverInstance.icon ? (
                            <SmartImage trigger={refreshTrigger} src={serverInstance.icon} alt={serverInstance.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-white/10 text-white">
                                <Icons.Box className="w-6 h-6" />
                            </div>
                        )}
                    </div>
                    <h3 className="text-lg font-bold text-white truncate opacity-90 group-hover:opacity-100 transition-opacity">
                        {serverInstance.name}
                    </h3>
                </div>

                <div className="absolute top-2 right-2 z-10 select-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div
                        className="flex items-center gap-2 px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 hover:bg-black/50 transition-colors cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            playClick();
                            handleUpdate(serverInstance.id, { autoUpdate: !autoUpdateOn });
                        }}
                        title={autoUpdateOn ? t('instance_auto_update_on') : t('instance_auto_update_off')}
                    >
                        <div className={`w-2 h-2 rounded-full ${autoUpdateOn ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" : "bg-gray-400"}`} />
                        <span className="text-[10px] text-white/80 pr-1">{t('auto_update')}</span>
                    </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-4 z-10 w-full transition-all duration-500 ease-in-out transform translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100">
                    <div className="mb-2 pl-1">
                        <p className="text-sm text-gray-300 truncate">
                            {serverInstance.minecraftVersion} • {getLoaderLabel(serverInstance.loader)}
                        </p>
                    </div>

                    <div className="flex gap-2 w-full">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                playClick();
                                if (showStop) {
                                    handleStop(serverInstance.id);
                                } else {
                                    handlePlay(serverInstance.id);
                                }
                            }}
                            disabled={isInstallingThisServerInstance}
                            className="flex-1 h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10 disabled:opacity-50 disabled:pointer-events-none"
                            style={{
                                backgroundColor: showStop ? "#ef4444" : colors.secondary,
                                color: showStop ? "#fff" : "#1a1a1a",
                            }}
                        >
                            {isInstallingThisServerInstance ? (
                                <>
                                    <Spinner />
                                    <span className="font-bold">{t('installing')}</span>
                                </>
                            ) : showStop ? (
                                <>
                                    {showSpinner ? (
                                        <Spinner />
                                    ) : (
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                            <rect x="6" y="6" width="12" height="12" />
                                        </svg>
                                    )}
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
                            type="button"
                            onClick={(e) => { e.stopPropagation(); playClick(); handleOpenFolder(serverInstance.id); }}
                            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10 shrink-0 bg-white/10 text-white"
                            title={t('open_folder')}
                        >
                            <Icons.Folder className="w-5 h-5" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); playClick(); setLogViewerInstanceId(serverInstance.id); }}
                            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10 shrink-0 bg-white/10 text-white"
                            title={t('view_logs')}
                        >
                            <Icons.Terminal className="w-5 h-5" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); playClick(); handleRepair(serverInstance.id); }}
                            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-red-500/20 hover:text-red-500 active:scale-95 backdrop-blur-md border border-white/10 shrink-0 bg-white/10 text-white"
                            title={t('repair_files')}
                        >
                            <Icons.Wrench className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </SmartBackground>
        );
    };

    const renderUninstalledServerCard = (server: Server) => {
        const isInstallingThisServerCard = isInstallTargetActive(server.id, installLockState);
        const disableServerInstallAction = isInstalling && operationType === "install";
        const cardBanner = server.bannerUrl || server.iconUrl || DEFAULT_MODPACK_BANNER;

        return (
            <SmartBackground
                key={server.id}
                trigger={refreshTrigger}
                src={cardBanner}
                className="group relative rounded-2xl overflow-hidden h-48 transition-all"
                style={getModPackCardFrameStyle()}
            >
                <div
                    className="absolute inset-0 bg-cover bg-center transition-all duration-500 group-hover:scale-105 opacity-30 grayscale group-hover:grayscale-0"
                    style={{ backgroundImage: "inherit" }}
                />
                <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent" />

                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 transition-opacity group-hover:opacity-100">
                    <button
                        type="button"
                        onClick={() => { playClick(); handleInstallServerInstance(server.id); }}
                        disabled={disableServerInstallAction}
                        className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
                    >
                        <Icons.Download className="w-5 h-5" />
                        {isInstallingThisServerCard ? t('installing_modpack') : t('install')}
                    </button>
                </div>

                <div className="absolute bottom-4 left-4 right-4 z-10 pointer-events-none">
                    <h3 className="text-xl font-bold text-white truncate text-center">
                        {server.name}
                    </h3>
                    <p className="text-sm text-gray-400 text-center">{t('not_installed')}</p>
                </div>
            </SmartBackground>
        );
    };

    const myModPacks = instances.filter(i => !i.cloudId);

    return (
        <>
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
                        loadInstances();
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
                <div className="space-y-6">
                    <div
                        className="flex items-center justify-between flex-wrap gap-4"
                    >
                        <div>
                            <h2 className="text-2xl font-bold mb-1" style={{ color: colors.onSurface }}>{t('modpacks')}</h2>
                            <p className="text-sm opacity-70" style={{ color: colors.onSurfaceVariant }}>{t('modpacks_subtitle' as any)}</p>
                        </div>
                        <button
                            type="button"
                            ref={createButtonRef}
                            onClick={() => { playClick(); setShowCreateMenu(v => !v); }}
                            disabled={isInstalling}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-[1.02] disabled:opacity-50"
                            style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                        >
                            <Icons.Add className="w-5 h-5" />
                            Mod Pack
                            <svg className={`w-4 h-4 transition-transform ${showCreateMenu ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="currentColor">
                                <path d="M7 10l5 5 5-5z" />
                            </svg>
                        </button>
                        {showCreateMenu && menuPos && (
                            <Portal>
                                <div
                                    ref={createMenuRef}
                                    className="fixed w-92 rounded-xl overflow-hidden"
                                    style={{
                                        top: menuPos.top,
                                        right: menuPos.right,
                                        zIndex: 9999,
                                        backgroundColor: colors.surfaceContainerHighest,
                                        border: `1px solid ${colors.outline}30`,
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => { playClick(); setShowCreateMenu(false); setShowCreateModal(true); }}
                                        className="w-full flex items-center gap-3 px-4 py-3 transition-all hover:bg-white/5 text-left"
                                        style={{ color: colors.onSurface }}
                                    >
                                        <Icons.Add className="w-5 h-5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm">{t('create_modpack_create')}</div>
                                            <div className="text-xs opacity-60 truncate">{t('create_your_own')}</div>
                                        </div>
                                    </button>
                                    <div className="h-px" style={{ backgroundColor: colors.outline + '20' }} />
                                    <button
                                        type="button"
                                        onClick={() => { playClick(); setShowCreateMenu(false); setShowImportModal(true); }}
                                        disabled={isInstalling}
                                        className="w-full flex items-center gap-3 px-4 py-3 transition-all hover:bg-white/5 disabled:opacity-50 text-left"
                                        style={{ color: colors.onSurface }}
                                    >
                                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                                        </svg>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm">{t('import')}</div>
                                            <div className="text-xs opacity-60 truncate">.mrpack / .zip</div>
                                        </div>
                                    </button>
                                    <div className="h-px" style={{ backgroundColor: colors.outline + '20' }} />
                                    <button
                                        type="button"
                                        onClick={() => { playClick(); setShowCreateMenu(false); setActiveTab("explore"); }}
                                        className="w-full flex items-center gap-3 px-4 py-3 transition-all hover:bg-white/5 text-left"
                                        style={{ color: colors.onSurface }}
                                    >
                                        <Icons.Box className="w-5 h-5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm">{t('add_new_mod_pack_btn')}</div>
                                            <div className="text-xs opacity-60 truncate">{t('choose_and_play')}</div>
                                        </div>
                                    </button>
                                </div>
                            </Portal>
                        )}
                    </div>

                    <div>
                        <h3 className="text-lg font-medium mb-3" style={{ color: colors.onSurface }}>{t('my_mod_packs')}</h3>
                        {isLoading ? (
                            <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
                                {Array.from({ length: 9 }).map((_, i) => renderModPackSkeleton(i))}
                            </div>
                        ) : myModPacks.length === 0 ? (
                            <div
                                className="rounded-2xl p-8 text-center"
                                style={{ backgroundColor: colors.surfaceContainer }}
                            >
                                <Icons.Box className="w-12 h-12 mx-auto mb-3" style={{ color: colors.onSurfaceVariant, opacity: 0.5 }} />
                                <p className="font-medium mb-1" style={{ color: colors.onSurfaceVariant }}>{t('no_mod_packs')}</p>
                                <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{t('create_mod_pack_first')}</p>
                            </div>
                        ) : (
                            <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
                                {myModPacks.map(renderMyModPackCard)}
                            </div>
                        )}
                    </div>

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
                                    return serverInstance
                                        ? renderInstalledServerCard(serverInstance, server)
                                        : renderUninstalledServerCard(server);
                                })}
                            </div>
                        ) : (
                            <div
                                className="rounded-2xl p-8 text-center"
                                style={{ backgroundColor: colors.surfaceContainer }}
                            >
                                <Icons.Box className="w-12 h-12 mx-auto mb-3" style={{ color: colors.onSurfaceVariant, opacity: 0.5 }} />
                                <p className="font-medium mb-1" style={{ color: colors.onSurfaceVariant }}>{t('not_joined_server')}</p>
                                <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{t('join_server_to_play')}</p>
                            </div>
                        )}
                    </div>

                    {deleteConfirmId && (
                        <DeleteConfirmModal
                            colors={colors}
                            instanceId={deleteConfirmId}
                            onCancel={() => setDeleteConfirmId(null)}
                            onConfirm={(id) => {
                                setDeleteConfirmId(null);
                                handleDelete(id);
                            }}
                            language={language}
                        />
                    )}

                    {showCreateModal && (
                        <CreateInstanceModal
                            colors={colors}
                            config={config}
                            onClose={() => setShowCreateModal(false)}
                            onCreated={(instanceId?: string) => {
                                setShowCreateModal(false);
                                loadInstances();
                                // Pre-install Minecraft core files in background
                                // so user can press Play immediately without waiting
                                if (instanceId) {
                                    setOperationType("install");
                                    setInstalling(true);
                                    setInstallMinimized(false);
                                    setInstallProgress({
                                        stage: "extracting",
                                        message: t('preparing_game_files'),
                                    });
                                    window.api?.instancesPreInstall?.(instanceId)
                                        .then(() => {
                                            loadInstances();
                                        })
                                        .catch((err: any) => {
                                            console.warn("[ModPack] Pre-install failed:", err?.message);
                                        })
                                        .finally(() => {
                                            setInstalling(false);
                                            setInstallProgress(null);
                                            setOperationType(null);
                                        });
                                }
                            }}
                            language={language}
                        />
                    )}

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
                </div>
            )}
        </>
    );
}
