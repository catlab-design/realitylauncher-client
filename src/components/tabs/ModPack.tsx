import React, { useEffect, useMemo, useState, useRef, type Dispatch, type SetStateAction } from "react";
import appBanner from "../../assets/banner.png";
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
import { useUiStore } from "../../store/uiStore";
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

// App banner (src/assets) is the fallback for any card without its own art.
const DEFAULT_MODPACK_BANNER = appBanner;

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
    handleRepair?: (id: string) => void | Promise<void>;
}

const isCancellationError = (msg: unknown): boolean => {
    if (typeof msg !== "string" || !msg) return false;
    const lower = msg.toLowerCase();
    return lower.includes("cancelled") || lower.includes("cancel");
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
    handleRepair,
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
    } = useProgressStore();

    const installLockState = { isInstalling, operationType, installingInstanceId };

    const removeFromPlaying = (id: string) => {
        setPlayingInstances(prev => {
            const s = new Set(prev);
            s.delete(id);
            return s;
        });
    };

    const handleOpenInstanceDetail = (instance: any) => {
        setSelectedInstance(instance);
    };



    const launchCancelledRef = useRef(false);
    const launchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handlePlay = async (id: string) => {
        if (launchingId !== null) return;

        playClick();
        launchCancelledRef.current = false;
        setLaunchingId(id);

        // instances_launch resolves only once the JVM is spawned, so surface the
        // backend's prepare stages (download/extract) while we wait.
        const removeLaunchProgress = (window.api as any)?.onLaunchProgress?.(
            (progress: { stage?: string; message?: string; progress?: number }) => {
                if (progress?.stage === "running") {
                    setInstallProgress(null);
                    return;
                }
                setInstallProgress({
                    stage: progress?.stage || "preparing",
                    message: progress?.message || t('launching'),
                    percent: Math.round((progress?.progress ?? 0) * 100),
                });
            },
        );

        // Server-backed instances sync mods first; that step reports on the
        // install-progress channel, so mirror it into the same modal.
        const removeSyncProgress = (window.api as any)?.onInstallProgress?.(
            (p: { type?: string; task?: string; percent?: number; current?: number; total?: number }) => {
                if (p?.type === "sync-complete") return;
                setInstallProgress({
                    stage: p?.type || "sync",
                    message: p?.task || t('syncing') || 'Syncing...',
                    percent: typeof p?.percent === "number" ? p.percent : 0,
                });
            },
        );

        launchTimeoutRef.current = setTimeout(() => {
            console.warn(`[ModPack] Launch timeout for instance ${id}`);
            setLaunchingId(null);
            toastError(t('launch_timeout'));
        }, 120000);

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

            if (isServerInstance && session?.authType === "catid" && session.minecraftUuid) {
                const linkedMsAccount = accounts.find(
                    (account) => account.authType === "microsoft" && account.uuid === session.minecraftUuid,
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
                const refreshErr = typeof refreshResult.error === "string" ? refreshResult.error : "";
                toastError(refreshErr || t('session_expired_login_server'));
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
                // Forge/NeoForge installer failures mention "JVM"/"java.net..." in their
                // log dump — don't misread those as a missing-Java problem.
                const isInstallerError = lowerMsg.includes("installer exited") || lowerMsg.includes("installer finished");
                const isJavaError = !isInstallerError && (lowerMsg.includes("java") || lowerMsg.includes("jre") || lowerMsg.includes("java_home"));

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
            removeLaunchProgress?.();
            removeSyncProgress?.();
            setInstallProgress(null);
            if (launchTimeoutRef.current) {
                clearTimeout(launchTimeoutRef.current);
                launchTimeoutRef.current = null;
            }
        }
    };

    // Play pressed on Home: run the normal launch flow (account switch, Java
    // checks, progress) once this tab has the instance list.
    const pendingLaunchId = useUiStore((state) => state.pendingLaunchId);
    const setPendingLaunchId = useUiStore((state) => state.setPendingLaunchId);
    useEffect(() => {
        if (!pendingLaunchId || isLoading) return;
        if (!instances.some((item) => item.id === pendingLaunchId)) return;
        setPendingLaunchId(null);
        void handlePlay(pendingLaunchId);
    }, [pendingLaunchId, isLoading, instances]);

    // Same hand-off for "Install" on a server modpack card on Home.
    const pendingInstallServerId = useUiStore((state) => state.pendingInstallServerId);
    const setPendingInstallServerId = useUiStore((state) => state.setPendingInstallServerId);
    useEffect(() => {
        if (!pendingInstallServerId) return;
        setPendingInstallServerId(null);
        void handleInstallServerInstance(pendingInstallServerId);
    }, [pendingInstallServerId]);

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
        setInstallProgress({ stage: "sync-start", type: "sync-start", message: t('starting_install') });
        if (id) setInstallingInstanceId(id);

        // Interim progress is driven by the install-progress/modpack-install-progress
        // events useGameEvents subscribes to globally (rendered as the toast progress
        // card in LauncherAppShell) — a second toast.loading() here used to fight it
        // for the same corner of the screen with no percent/cancel of its own.
        try {
            const result = id
                ? await (window.api as any)?.instancesCloudInstall?.(id)
                : await (window.api as any)?.instancesCloudSync?.();

            if (result?.ok) {
                toast.success(t('install_complete'));
                loadInstances();
            } else {
                const installErr = typeof result?.error === 'string' ? result.error : '';
                if (isCancellationError(installErr)) return;
                const errMsg = installErr || t('install_failed');
                if (errMsg.includes("401") || errMsg.includes("Unauthorized")) {
                    toast.error(t('session_expired'));
                } else if (errMsg.includes("Not logged in")) {
                    toast.error(t('login_before_use'));
                } else {
                    toast.error(errMsg);
                }
            }
        } catch (error: any) {
            if (!isCancellationError(error?.message)) {
                toast.error(error?.message || t('error_occurred'));
            }
        } finally {
            setInstalling(false);
            setInstallingInstanceId(null);
            setInstallProgress(null);
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

    const renderModPackSkeleton = (i: number) => (
        <div
            key={i}
            className="rounded-2xl overflow-hidden p-4 animate-skeleton-wave"
            style={{
                backgroundColor: colors.surfaceContainer,
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

    // Shared card, same look as the Servers list tiles: full-bleed art, logo top-left,
    // name bottom-left, actions docked in the bottom-right corner.
    const renderCardShell = ({ key, banner, onOpen, icon, name, meta, badge, actions, dimArt }: {
        key: string;
        banner: string;
        onOpen?: () => void;
        icon?: string;
        name: string;
        meta: React.ReactNode;
        badge?: React.ReactNode;
        actions: React.ReactNode;
        dimArt?: boolean;
    }) => (
        <SmartBackground
            key={key}
            trigger={refreshTrigger}
            src={banner}
            onClick={onOpen}
            className={`group relative overflow-hidden rounded-2xl h-48 transition-all duration-300 hover:shadow-lg ${onOpen ? "cursor-pointer" : ""}`}
            style={{ backgroundColor: colors.surfaceContainer }}
        >
            <div
                className={`absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105 ${dimArt ? "grayscale opacity-50" : ""}`}
                style={{ backgroundImage: "inherit" }}
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/30 to-transparent" />

            <div className="absolute top-4 left-4 z-10 w-16 h-16 rounded-2xl overflow-hidden shadow-lg">
                {icon ? (
                    <SmartImage trigger={refreshTrigger} src={icon} alt={name} className={`w-full h-full object-cover ${dimArt ? "grayscale opacity-60" : ""}`} />
                ) : (
                    <div className="w-full h-full rounded-xl flex items-center justify-center bg-white/15 text-white">
                        <Icons.Box className="w-6 h-6" />
                    </div>
                )}
            </div>
            {badge && <div className="absolute top-4 right-4 z-10">{badge}</div>}

            <div className="absolute bottom-4 left-5 z-10 max-w-[55%] min-w-0">
                <h3 className="font-black text-lg md:text-xl text-white truncate leading-tight drop-shadow-md">{name}</h3>
                <p className="text-white/70 text-sm truncate mt-1 font-semibold drop-shadow-sm">{meta}</p>
            </div>

            <div className="absolute bottom-0 right-0 z-10 flex items-stretch" onClick={(e) => e.stopPropagation()}>
                {actions}
            </div>
        </SmartBackground>
    );

    // Corner segments: dark glass icons after the primary action.
    const iconButton = "h-12 w-12 flex items-center justify-center shrink-0 bg-black/55 text-white backdrop-blur-md border-l border-white/10 transition hover:bg-black/75 active:scale-95";
    const iconButtonStyle = undefined;

    const renderPlayButton = (id: string, showStop: boolean, showSpinner: boolean, locked: boolean) => (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); playClick(); showStop ? handleStop(id) : handlePlay(id); }}
            disabled={locked}
            className="h-12 px-6 rounded-tl-2xl flex items-center gap-2 font-extrabold text-sm transition hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            style={{ backgroundColor: showStop ? "#ef4444" : colors.secondary, color: showStop ? "#fff" : "#1a1a1a" }}
        >
            {locked ? (
                <><Spinner />{t('installing')}</>
            ) : showStop ? (
                <>
                    {showSpinner ? <Spinner /> : <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z" /></svg>}
                    {t('stop')}
                </>
            ) : (
                <>
                    <Icons.Play className="w-5 h-5 fill-current" />
                    {t('play')}
                </>
            )}
        </button>
    );

    const renderMyModPackCard = (instance: GameInstance) => {
        const isLaunching = launchingId === instance.id;
        const isPlaying = playingInstances.has(instance.id);
        const isInstallingThisInstance = isInstanceInstallLocked(instance, installLockState);
        const showSpinner = shouldShowLaunchSpinner(isLaunching, isPlaying);
        const showStop = shouldShowStopButton(isLaunching, isPlaying);

        return renderCardShell({
            key: instance.id,
            banner: instance.banner || DEFAULT_MODPACK_BANNER,
            onOpen: () => { playClick(); handleOpenInstanceDetail(instance); },
            icon: instance.icon,
            name: instance.name,
            meta: (
                <>
                    {getLoaderLabel(instance.loader)} {instance.minecraftVersion}
                    {instance.totalPlayTime > 0 && ` · ${formatPlayTime(instance.totalPlayTime, { minutes: t('minutes_unit'), hours: t('hours_unit') })}`}
                </>
            ),
            actions: (
                <>
                    {renderPlayButton(instance.id, showStop, showSpinner, isInstallingThisInstance)}
                    <button type="button" onClick={(e) => { e.stopPropagation(); playClick(); handleOpenFolder(instance.id); }} className={iconButton} style={iconButtonStyle} title={t('open_folder')}>
                        <Icons.Folder className="w-4.5 h-4.5" />
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); playClick(); setLogViewerInstanceId(instance.id); }} className={iconButton} style={iconButtonStyle} title={t('view_logs')}>
                        <Icons.Terminal className="w-4.5 h-4.5" />
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); playClick(); setDeleteConfirmId(instance.id); }} className={`${iconButton} hover:text-red-500!`} style={iconButtonStyle} title={t('delete')}>
                        <Icons.Trash className="w-4.5 h-4.5" />
                    </button>
                </>
            ),
        });
    };

    const renderInstalledServerCard = (serverInstance: GameInstance, server: Server) => {
        const isLaunching = launchingId === serverInstance.id;
        const isPlaying = playingInstances.has(serverInstance.id);
        const showStop = shouldShowStopButton(isLaunching, isPlaying);
        const showSpinner = shouldShowLaunchSpinner(isLaunching, isPlaying);
        const isInstallingThisServerInstance = isInstanceInstallLocked(serverInstance, installLockState);
        const autoUpdateOn = serverInstance.autoUpdate !== false;

        return renderCardShell({
            key: serverInstance.id,
            banner: serverInstance.banner || server.bannerUrl || DEFAULT_MODPACK_BANNER,
            onOpen: () => { playClick(); handleOpenInstanceDetail(serverInstance); },
            icon: serverInstance.icon,
            name: serverInstance.name,
            meta: <>{getLoaderLabel(serverInstance.loader)} {serverInstance.minecraftVersion}</>,
            badge: (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); playClick(); handleUpdate(serverInstance.id, { autoUpdate: !autoUpdateOn }); }}
                    title={autoUpdateOn ? t('instance_auto_update_on') : t('instance_auto_update_off')}
                    className="h-7 px-2.5 rounded flex items-center gap-1.5 text-xs font-semibold text-white bg-black/40 border border-white/10 hover:bg-black/60 transition-colors"
                >
                    <span className={`w-2 h-2 rounded-full ${autoUpdateOn ? "bg-green-400" : "bg-gray-400"}`} />
                    {t('auto_update')}
                </button>
            ),
            actions: (
                <>
                    {renderPlayButton(serverInstance.id, showStop, showSpinner, isInstallingThisServerInstance)}
                    <button type="button" onClick={(e) => { e.stopPropagation(); playClick(); handleOpenFolder(serverInstance.id); }} className={iconButton} style={iconButtonStyle} title={t('open_folder')}>
                        <Icons.Folder className="w-4.5 h-4.5" />
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); playClick(); setLogViewerInstanceId(serverInstance.id); }} className={iconButton} style={iconButtonStyle} title={t('view_logs')}>
                        <Icons.Terminal className="w-4.5 h-4.5" />
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); playClick(); handleRepair?.(serverInstance.id); }} className={iconButton} style={iconButtonStyle} title={t('repair_files')}>
                        <Icons.Wrench className="w-4.5 h-4.5" />
                    </button>
                </>
            ),
        });
    };

    const renderUninstalledServerCard = (server: Server) => {
        const isInstallingThisServerCard = isInstallTargetActive(server.id, installLockState);
        const disableServerInstallAction = isInstalling && operationType === "install";

        return renderCardShell({
            key: server.id,
            banner: server.bannerUrl || DEFAULT_MODPACK_BANNER,
            icon: server.iconUrl,
            name: server.name,
            meta: t('not_installed'),
            dimArt: true,
            actions: (
                <button
                    type="button"
                    onClick={() => { playClick(); handleInstallServerInstance(server.storagePath || server.id); }}
                    disabled={disableServerInstallAction}
                    className="h-12 px-6 rounded-tl-2xl flex items-center gap-2 font-extrabold text-sm transition hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                >
                    {isInstallingThisServerCard ? <Spinner /> : <Icons.Download className="w-4.5 h-4.5" />}
                    {isInstallingThisServerCard ? t('installing_modpack') : t('install')}
                </button>
            ),
        });
    };

    const myModPacks = useMemo(
        () => instances.filter(i => !i.cloudId),
        [instances],
    );
    const serverInstancesByCloudId = useMemo(() => {
        const byCloudId = new Map<string, GameInstance>();
        for (const instance of instances) {
            if (instance.cloudId) {
                byCloudId.set(instance.cloudId, instance);
            }
        }
        return byCloudId;
    }, [instances]);

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
                    onViewLogs={(id) => setLogViewerInstanceId(id)}
                    onRepair={handleRepair}
                    launchingId={launchingId}
                    isGameRunning={playingInstances.size > 0}
                    playingInstanceId={playingInstances.has(selectedInstance.id) ? selectedInstance.id : (playingInstances.size > 0 ? "OTHER" : null)}
                    isInstallLocked={isInstanceInstallLocked(selectedInstance, installLockState)}
                />
            ) : (
                <div className="space-y-6 animate-fade-in">
                    <div
                        className="flex items-center justify-between flex-wrap gap-4"
                    >
                        <div>
                            <h2 className="font-display text-2xl mb-1" style={{ color: colors.onSurface }}>{t('modpacks')}</h2>
                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{t('modpacks_subtitle' as any)}</p>
                        </div>
                        <button
                            type="button"
                            ref={createButtonRef}
                            onClick={() => { playClick(); setShowCreateMenu(v => !v); }}
                            disabled={isInstalling}
                            className="h-11 flex items-center gap-2 px-5 rounded-xl text-sm font-bold transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
                            style={{ backgroundColor: colors.secondary, color: "#111" }}
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
                                        backgroundColor: colors.surfaceContainerHigh,
                                        boxShadow: "0 16px 40px -12px rgba(0,0,0,0.4)",
                                        padding: 6,
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => { playClick(); setShowCreateMenu(false); setShowCreateModal(true); }}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-black/5 text-left"
                                        style={{ color: colors.onSurface }}
                                    >
                                        <Icons.Add className="w-5 h-5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-[15px]">{t('create_modpack_create')}</div>
                                            <div className="text-[13px] truncate" style={{ color: colors.onSurfaceVariant }}>{t('create_your_own')}</div>
                                        </div>
                                    </button>
                                                                        <button
                                        type="button"
                                        onClick={() => { playClick(); setShowCreateMenu(false); setShowImportModal(true); }}
                                        disabled={isInstalling}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-black/5 disabled:opacity-50 text-left"
                                        style={{ color: colors.onSurface }}
                                    >
                                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                                        </svg>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-[15px]">{t('import')}</div>
                                            <div className="text-[13px] truncate" style={{ color: colors.onSurfaceVariant }}>.mrpack / .zip</div>
                                        </div>
                                    </button>
                                                                        <button
                                        type="button"
                                        onClick={() => { playClick(); setShowCreateMenu(false); setActiveTab("explore"); }}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-black/5 text-left"
                                        style={{ color: colors.onSurface }}
                                    >
                                        <Icons.Box className="w-5 h-5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-[15px]">{t('add_new_mod_pack_btn')}</div>
                                            <div className="text-[13px] truncate" style={{ color: colors.onSurfaceVariant }}>{t('choose_and_play')}</div>
                                        </div>
                                    </button>
                                </div>
                            </Portal>
                        )}
                    </div>

                    <div>
                        <h3 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: colors.onSurface }}>{t('my_mod_packs')}{!isLoading && <span className="text-sm font-semibold px-2 rounded-md" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>{myModPacks.length}</span>}</h3>
                        {isLoading ? (
                            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
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
                            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                                {myModPacks.map(renderMyModPackCard)}
                            </div>
                        )}
                    </div>

                    <div>
                        <h3 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: colors.onSurface }}>{t('server_mod_packs')}{!loadingServers && <span className="text-sm font-semibold px-2 rounded-md" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>{joinedServers.length}</span>}</h3>

                        {loadingServers ? (
                            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                                <Skeleton className="h-48 rounded-2xl" colors={colors} />
                                <Skeleton className="h-48 rounded-2xl" colors={colors} />
                            </div>
                        ) : joinedServers.length > 0 ? (
                            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                                {joinedServers.map(server => {
                                    const serverInstance = serverInstancesByCloudId.get(server.id);
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
                            onCreated={() => {
                                setShowCreateModal(false);
                                loadInstances();
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
