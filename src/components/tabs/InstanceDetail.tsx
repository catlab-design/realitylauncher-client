/**
 * ========================================
 * InstanceDetail - หน้าแสดงรายละเอียด Instance และจัดการ Mods
 * Refactored to use ModPackTabs components
 * ========================================
 */

import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { Icons } from "../ui/Icons";
import { InstanceContentBrowser } from "./InstanceContentBrowser";
import type { GameInstance, LauncherConfig } from "../../types/launcher";
import { playClick } from "../../lib/sounds";
import { useTranslation } from "../../hooks/useTranslation";
import bannerImage from "../../assets/banner.png";

// Import from ModPackTabs
import {
    ContentTabs,
    ModsList,
    ContentList,
    InstanceSettingsModal,
    formatPlayTime,
    getLoaderLabel,
    type ModInfo,
    type ContentItem,
    type DatapackItem,
    type ContentCategory,
} from "./ModPackTabs";

// ========================================
// Types
// ========================================

interface InstanceDetailProps {
    instance: GameInstance;
    colors: any;
    config: LauncherConfig;
    onBack: () => void;
    onPlay: (id: string) => void;
    onStop: () => void;
    onOpenFolder: (id: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    onUpdate: (id: string, updates: Partial<GameInstance>) => void;
    onExport: (id: string, options: any) => Promise<void>;
    onViewLogs: (id: string) => void;
    onRepair?: (id: string) => void;
    launchingId: string | null;
    isGameRunning: boolean;
    playingInstanceId: string | null;
}

// ========================================
// Component
// ========================================

export function InstanceDetail({
    instance,
    colors,
    config,
    onBack,
    onPlay,
    onStop,
    onOpenFolder,
    onDelete,
    onDuplicate,
    onUpdate,
    onExport,
    onViewLogs,
    launchingId,
    isGameRunning,
    playingInstanceId,
    onRepair,
}: InstanceDetailProps) {
    const { t } = useTranslation(config.language);
    // Mods state
    const [mods, setMods] = useState<ModInfo[]>([]);
    const [modsLoading, setModsLoading] = useState(true);

    // Settings state
    const [showSettings, setShowSettings] = useState(false);

    // Content category tabs - default to resourcepacks for vanilla (no mods support)
    const [contentTab, setContentTab] = useState<ContentCategory>(
        instance.loader === "vanilla" ? "resourcepacks" : "mods"
    );

    // Content state
    const [resourcepacks, setResourcepacks] = useState<ContentItem[]>([]);
    const [resourcepacksLoading, setResourcepacksLoading] = useState(false);
    const [shaders, setShaders] = useState<ContentItem[]>([]);
    const [shadersLoading, setShadersLoading] = useState(false);
    const [datapacks, setDatapacks] = useState<DatapackItem[]>([]);
    const [datapacksLoading, setDatapacksLoading] = useState(false);

    // Content browser modal state
    const [showContentBrowser, setShowContentBrowser] = useState(false);
    const [browserContentType, setBrowserContentType] = useState<"mod" | "resourcepack" | "shader" | "datapack">("mod");

    // Check if this instance is currently playing
    // Check playingInstanceId directly as fallback for when isGameRunning hasn't updated yet
    const isThisInstancePlaying = playingInstanceId === instance.id;

    // Track which tabs have been loaded
    const [loadedTabs, setLoadedTabs] = useState<Set<ContentCategory>>(new Set());

    // Ref to cancel recursive metadata refresh on unmount/instance change
    const modMetadataCancelRef = useRef(false);

    // Drag & drop state
    const [isDragging, setIsDragging] = useState(false);

    // Get content type name for current tab
    const getContentTypeForTab = (tab: ContentCategory): "mod" | "resourcepack" | "shader" | "datapack" => {
        const map: Record<ContentCategory, "mod" | "resourcepack" | "shader" | "datapack"> = {
            mods: "mod",
            resourcepacks: "resourcepack",
            shaders: "shader",
            datapacks: "datapack",
        };
        return map[tab];
    };

    // Get valid extensions for current tab
    const getValidExtensions = (tab: ContentCategory): string[] => {
        const map: Record<ContentCategory, string[]> = {
            mods: [".jar"],
            resourcepacks: [".zip"],
            shaders: [".zip"],
            datapacks: [".zip"],
        };
        return map[tab];
    };

    // Drag handlers
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
        console.log("[Drop] Files:", files.length, files.map(f => f.name));

        const contentType = getContentTypeForTab(contentTab);
        const validExts = getValidExtensions(contentTab);

        let successCount = 0;
        let errorMessages: string[] = [];

        for (const file of files) {
            // In Electron, File object has a path property directly
            let filePath: string | undefined;

            // Method 1: Direct path property (Electron adds this)
            filePath = (file as any).path;
            console.log("[Drop] File path from .path:", filePath);

            // Method 2: Try webUtils if available and path is empty
            if (!filePath && window.api?.getPathForFile) {
                try {
                    filePath = window.api.getPathForFile(file);
                    console.log("[Drop] File path from webUtils:", filePath);
                } catch (err) {
                    console.warn("[Drop] Failed to get path via webUtils:", err);
                }
            }

            if (!filePath) {
                errorMessages.push(`ไม่สามารถอ่านไฟล์ ${file.name}`);
                continue;
            }

            // Check extension
            const ext = "." + file.name.split(".").pop()?.toLowerCase();
            if (!validExts.includes(ext)) {
                errorMessages.push(`${file.name}: ไม่รองรับ ${ext}`);
                continue;
            }

            // Add file via IPC
            console.log("[Drop] Adding file:", filePath, "as", contentType);
            const result = await (window.api as any)?.instanceAddContentFile?.(instance.id, filePath, contentType);
            console.log("[Drop] Result:", result);

            if (result?.ok) {
                successCount++;
            } else {
                errorMessages.push(`${file.name}: ${result?.error || t('error_occurred')}`);
            }
        }

        // Show results
        if (successCount > 0) {
            toast.success(t('files_added_success'));
            // Refresh current tab
            switch (contentTab) {
                case "mods": loadMods(); break;
                case "resourcepacks": loadResourcepacks(); break;
                case "shaders": loadShaders(); break;
                case "datapacks": loadDatapacks(); break;
            }
        }
        if (errorMessages.length > 0) {
            toast.error(errorMessages.slice(0, 3).join("\n") + (errorMessages.length > 3 ? `\n${t('and_more_files').replace('{count}', String(errorMessages.length - 3))}` : ""));
        }
    };

    // ========================================
    // Effects
    // ========================================

    // Load all content on mount - parallel loading for speed
    useEffect(() => {
        modMetadataCancelRef.current = false;
        const loadAll = async () => {
            // Load all content in parallel (no artificial delays)
            await Promise.all([
                loadMods(),
                loadResourcepacks(),
                loadShaders(),
                loadDatapacks()
            ]);

            setLoadedTabs(new Set(["mods", "resourcepacks", "shaders", "datapacks"]));
        };
        loadAll();
        return () => { modMetadataCancelRef.current = true; };
    }, [instance.id]);

    // Lazy load effect removed - we load everything upfront now



    // ========================================
    // Data Loading
    // ========================================

    const loadMods = async () => {
        setModsLoading(true);

        try {
            const result = await (window.api as any)?.instanceListMods?.(instance.id);

            if (result?.ok) {
                // Show mods immediately with basic info
                setMods(result.mods);
                setModsLoading(false);

                // Then progressively load metadata for uncached mods
                if (result.hasUncached) {
                    let retryCount = 0;
                    const MAX_RETRIES = 10; // Cap retries to prevent infinite polling
                    // Wait a bit then refresh to get cached metadata
                    const refreshMetadata = async () => {
                        if (modMetadataCancelRef.current) return;
                        await new Promise(resolve => setTimeout(resolve, 800));
                        if (modMetadataCancelRef.current) return;
                        const refreshResult = await (window.api as any)?.instanceListMods?.(instance.id);
                        if (modMetadataCancelRef.current) return;
                        if (refreshResult?.ok) {
                            setMods(refreshResult.mods);
                            // If still has uncached and under retry limit, try again
                            if (refreshResult.hasUncached && ++retryCount < MAX_RETRIES) {
                                setTimeout(refreshMetadata, 1500);
                            }
                        }
                    };
                    refreshMetadata();
                }
            } else {
                toast.error(result?.error || t('load_mods_failed'));
                setModsLoading(false);
            }
        } catch (error) {
            console.error("[InstanceDetail] Failed to load mods:", error);
            setModsLoading(false);
        }
    };

    const loadResourcepacks = async () => {
        setResourcepacksLoading(true);
        try {
            const result = await (window.api as any)?.instanceListResourcepacks?.(instance.id);
            if (result?.ok) setResourcepacks(result.items);
        } catch (error) {
            console.error("[InstanceDetail] Failed to load resourcepacks:", error);
        } finally {
            setResourcepacksLoading(false);
        }
    };

    const loadShaders = async () => {
        setShadersLoading(true);
        try {
            const result = await (window.api as any)?.instanceListShaders?.(instance.id);
            if (result?.ok) setShaders(result.items);
        } catch (error) {
            console.error("[InstanceDetail] Failed to load shaders:", error);
        } finally {
            setShadersLoading(false);
        }
    };

    const loadDatapacks = async () => {
        setDatapacksLoading(true);
        try {
            const result = await (window.api as any)?.instanceListDatapacks?.(instance.id);
            if (result?.ok) setDatapacks(result.items);
        } catch (error) {
            console.error("[InstanceDetail] Failed to load datapacks:", error);
        } finally {
            setDatapacksLoading(false);
        }
    };

    // ========================================
    // Handlers
    // ========================================

    const handleToggleMod = async (filename: string) => {
        try {
            const result = await (window.api as any)?.instanceToggleMod?.(instance.id, filename);
            if (result?.ok) {
                setMods(prev => prev.map(mod =>
                    mod.filename === filename
                        ? { ...mod, filename: result.newFilename, enabled: result.enabled }
                        : mod
                ));
            } else {
                toast.error(result?.error || t('toggle_mod_failed'));
            }
        } catch (error) {
            toast.error(t('error_occurred'));
        }
    };

    const handleDeleteMod = async (filename: string) => {
        try {
            const result = await (window.api as any)?.instanceDeleteMod?.(instance.id, filename);
            if (result?.ok) {
                setMods(prev => prev.filter(mod => mod.filename !== filename));
                toast.success(t('mod_deleted_success'));
            } else {
                toast.error(result?.error || t('mod_delete_failed'));
            }
        } catch (error) {
            toast.error(t('error_occurred'));
        }
    };

    const handleToggleResourcepack = async (filename: string) => {
        try {
            const result = await (window.api as any)?.instanceToggleResourcepack?.(instance.id, filename);
            if (result?.ok) {
                setResourcepacks(prev => prev.map(item =>
                    item.filename === filename
                        ? { ...item, filename: result.newFilename, enabled: result.enabled }
                        : item
                ));
            } else {
                toast.error(result?.error || t('error_occurred'));
            }
        } catch (error) {
            toast.error(t('error_occurred'));
        }
    };

    const handleDeleteResourcepack = async (filename: string) => {
        try {
            const result = await (window.api as any)?.instanceDeleteResourcepack?.(instance.id, filename);
            if (result?.ok) {
                setResourcepacks(prev => prev.filter(item => item.filename !== filename));
                toast.success(t('resourcepack_deleted_success'));
            } else {
                toast.error(result?.error || t('error_occurred'));
            }
        } catch (error) {
            toast.error(t('error_occurred'));
        }
    };

    const handleToggleShader = async (filename: string) => {
        try {
            const result = await (window.api as any)?.instanceToggleShader?.(instance.id, filename);
            if (result?.ok) {
                setShaders(prev => prev.map(item =>
                    item.filename === filename
                        ? { ...item, filename: result.newFilename, enabled: result.enabled }
                        : item
                ));
            } else {
                toast.error(result?.error || t('error_occurred'));
            }
        } catch (error) {
            toast.error(t('error_occurred'));
        }
    };

    const handleDeleteShader = async (filename: string) => {
        try {
            const result = await (window.api as any)?.instanceDeleteShader?.(instance.id, filename);
            if (result?.ok) {
                setShaders(prev => prev.filter(item => item.filename !== filename));
                toast.success(t('shader_deleted_success'));
            } else {
                toast.error(result?.error || t('error_occurred'));
            }
        } catch (error) {
            toast.error(t('error_occurred'));
        }
    };

    const handleToggleDatapack = async (filename: string, worldName?: string) => {
        if (!worldName) return;
        try {
            const result = await (window.api as any)?.instanceToggleDatapack?.(instance.id, worldName, filename);
            if (result?.ok) {
                setDatapacks(prev => prev.map(item =>
                    item.worldName === worldName && item.filename === filename
                        ? { ...item, filename: result.newFilename, enabled: result.enabled }
                        : item
                ));
            } else {
                toast.error(result?.error || t('error_occurred'));
            }
        } catch (error) {
            toast.error(t('error_occurred'));
        }
    };

    const handleDeleteDatapack = async (filename: string, worldName?: string) => {
        if (!worldName) return;
        try {
            const result = await (window.api as any)?.instanceDeleteDatapack?.(instance.id, worldName, filename);
            if (result?.ok) {
                setDatapacks(prev => prev.filter(item => !(item.worldName === worldName && item.filename === filename)));
                toast.success(t('datapack_deleted_success'));
            } else {
                toast.error(result?.error || t('error_occurred'));
            }
        } catch (error) {
            toast.error(t('error_occurred'));
        }
    };

    const handlePlayStop = () => {
        if (isThisInstancePlaying) {
            onStop();
        } else {
            onPlay(instance.id);
        }
    };

    // ========================================
    // Render
    // ========================================

    const validExtsLabel = getValidExtensions(contentTab).join(", ");
    const contentTypeLabel = {
        mods: t('mods'),
        resourcepacks: t('resourcepacks'),
        shaders: t('shaders'),
        datapacks: t('datapacks'),
    }[contentTab];

    return (
        <div
            className="space-y-4 relative w-full"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Drag indicator */}
            {isDragging && (
                <div
                    className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3 rounded-full shadow-lg pointer-events-none animate-pulse"
                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                >
                    <Icons.Folder className="w-6 h-6" />
                    <span className="font-medium">{t('drop_to_add_content' as any).replace('{ext}', validExtsLabel).replace('{type}', contentTypeLabel)}</span>
                </div>
            )}

            {/* Conditional Header: Hero (if has banner) vs Compact (if no banner) */}
            {instance.banner ? (
                /* Hero Header */
                <div className="rounded-2xl overflow-hidden relative shadow-lg mb-6 border" style={{ borderColor: colors.outline + "30", backgroundColor: colors.surfaceContainer }}>
                    <div className="relative h-48 w-full bg-cover bg-center"
                        style={{
                            backgroundColor: colors.surfaceContainerHighest,
                        }}>
                        <img
                            src={instance.banner}
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                            }}
                            className="absolute inset-0 w-full h-full object-cover"
                            alt="banner"
                        />
                        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent" />

                        {/* Back Button (Absolute Top Left) */}
                        <button
                            onClick={() => { playClick(); onBack(); }}
                            className="absolute top-4 left-4 w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 z-20 backdrop-blur-md"
                            style={{ backgroundColor: "rgba(0,0,0,0.5)", color: "#ffffff" }}
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                            </svg>
                        </button>

                        {/* Floating Icon */}
                        <div className="absolute -bottom-8 left-8 w-24 h-24 rounded-2xl shadow-2xl p-1 z-10"
                            style={{ backgroundColor: colors.surface }}>
                            <div className="w-full h-full rounded-[14px] bg-cover bg-center overflow-hidden flex items-center justify-center"
                                style={{
                                    backgroundColor: colors.surfaceContainerHighest
                                }}>
                                {instance.icon?.startsWith("data:") || instance.icon?.startsWith("file://") || instance.icon?.startsWith("http") ? (
                                    <img src={instance.icon} alt="icon" className="w-full h-full object-cover" />
                                ) : (
                                    <Icons.Box className="w-10 h-10 opacity-50" style={{ color: colors.onSurfaceVariant }} />
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="pt-12 px-8 pb-8 flex flex-col md:flex-row md:items-end gap-6">
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <h2 className="text-3xl font-black tracking-tight mb-2 truncate" style={{ color: colors.onSurface }}>{instance.name}</h2>
                            <div className="flex flex-wrap items-center gap-4 text-sm font-medium" style={{ color: colors.onSurfaceVariant }}>
                                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                    {getLoaderLabel(instance.loader)}
                                    <span className="w-1 h-1 rounded-full bg-current opacity-50" />
                                    {instance.minecraftVersion}
                                </div>

                                {instance.totalPlayTime > 0 && (
                                    <div className="flex items-center gap-1.5">
                                        <i className="fa-solid fa-clock text-xs opacity-70"></i>
                                        <span>{formatPlayTime(instance.totalPlayTime)}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                            {/* Open folder button */}
                            <button
                                onClick={() => { playClick(); onOpenFolder(instance.id); }}
                                className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:bg-white/5 active:scale-95"
                                style={{ border: `1px solid ${colors.outline}30`, color: colors.onSurface }}
                                title={t('open_folder')}
                            >
                                <Icons.Folder className="w-5 h-5" />
                            </button>

                            {/* View Logs button */}
                            <button
                                onClick={() => { playClick(); onViewLogs(instance.id); }}
                                className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:bg-white/5 active:scale-95"
                                style={{ border: `1px solid ${colors.outline}30`, color: colors.onSurface }}
                                title={t('view_logs')}
                            >
                                <Icons.Terminal className="w-5 h-5" />
                            </button>

                            {/* Settings button */}
                            <button
                                onClick={() => { playClick(); setShowSettings(true); }}
                                className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:bg-white/5 active:scale-95"
                                style={{ border: `1px solid ${colors.outline}30`, color: colors.onSurface }}
                                title={t('settings')}
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                                </svg>
                            </button>

                            {/* Play/Stop button */}
                            <button
                                onClick={() => { playClick(); handlePlayStop(); }}
                                disabled={launchingId !== null || ((isGameRunning || playingInstanceId !== null) && !isThisInstancePlaying)}
                                className="h-12 px-8 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-2 shadow-lg hover:shadow-xl"
                                style={{
                                    backgroundColor: isThisInstancePlaying ? "#ef4444" : colors.secondary,
                                    color: isThisInstancePlaying ? "#ffffff" : "#1a1a1a"
                                }}
                            >
                                {launchingId === instance.id ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        {t('launching')}
                                    </>
                                ) : isThisInstancePlaying ? (
                                    <>
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M6 6h12v12H6z" />
                                        </svg>
                                        {t('stop')}
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
                        </div>
                    </div>
                </div>
            ) : (
                /* Compact Header: Simple Row (No Banner) */
                <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-8 pt-2">
                    <button
                        onClick={() => { playClick(); onBack(); }}
                        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 shrink-0"
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                        </svg>
                    </button>

                    <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-4xl overflow-hidden shadow-lg shrink-0"
                        style={{ backgroundColor: colors.surfaceContainer }}>
                        {instance.icon?.startsWith("data:") || instance.icon?.startsWith("file://") || instance.icon?.startsWith("http") ? (
                            <img src={instance.icon} alt="icon" className="w-full h-full object-cover" />
                        ) : (
                            <Icons.Box className="w-12 h-12" style={{ color: colors.onSurfaceVariant }} />
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <h2 className="text-3xl font-black tracking-tight mb-2 truncate" style={{ color: colors.onSurface }}>{instance.name}</h2>
                        <div className="flex flex-wrap items-center gap-4 text-sm font-medium" style={{ color: colors.onSurfaceVariant }}>
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                {getLoaderLabel(instance.loader)}
                                <span className="w-1 h-1 rounded-full bg-current opacity-50" />
                                {instance.minecraftVersion}
                            </div>

                            {instance.totalPlayTime > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <i className="fa-solid fa-clock text-xs opacity-70"></i>
                                    <span>{formatPlayTime(instance.totalPlayTime)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Open folder button */}
                        <button
                            onClick={() => { playClick(); onOpenFolder(instance.id); }}
                            className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:bg-white/5 active:scale-95"
                            style={{ border: `1px solid ${colors.outline}30`, color: colors.onSurface }}
                            title={t('open_folder')}
                        >
                            <Icons.Folder className="w-5 h-5" />
                        </button>

                        {/* View Logs button */}
                        <button
                            onClick={() => { playClick(); onViewLogs(instance.id); }}
                            className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:bg-white/5 active:scale-95"
                            style={{ border: `1px solid ${colors.outline}30`, color: colors.onSurface }}
                            title={t('view_logs')}
                        >
                            <Icons.Terminal className="w-5 h-5" />
                        </button>

                        {/* Settings button */}
                        <button
                            onClick={() => { playClick(); setShowSettings(true); }}
                            className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:bg-white/5 active:scale-95"
                            style={{ border: `1px solid ${colors.outline}30`, color: colors.onSurface }}
                            title={t('settings')}
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                            </svg>
                        </button>

                        {/* Play/Stop button */}
                        <button
                            onClick={() => { playClick(); handlePlayStop(); }}
                            disabled={launchingId !== null || ((isGameRunning || playingInstanceId !== null) && !isThisInstancePlaying)}
                            className="h-12 px-8 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-2 shadow-lg hover:shadow-xl"
                            style={{
                                backgroundColor: isThisInstancePlaying ? "#ef4444" : colors.secondary,
                                color: isThisInstancePlaying ? "#ffffff" : "#1a1a1a"
                            }}
                        >
                            {launchingId === instance.id ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    {t('launching')}
                                </>
                            ) : isThisInstancePlaying ? (
                                <>
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M6 6h12v12H6z" />
                                    </svg>
                                    {t('stop')}
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
                    </div>
                </div>
            )}


            {/* Content Category Tabs */}
            <ContentTabs
                colors={colors}
                activeTab={contentTab}
                modsCount={mods.length}
                modsLoading={modsLoading}
                resourcepacksCount={resourcepacks.length}
                datapacksCount={datapacks.length}
                shadersCount={shaders.length}
                onTabChange={setContentTab}
                loader={instance.loader}
            />

            {/* Content Section */}
            <div>
                {/* Mods Tab */}
                {contentTab === "mods" && (
                    <ModsList
                        colors={colors}
                        instanceId={instance.id}
                        instanceName={instance.name}
                        minecraftVersion={instance.minecraftVersion}
                        loader={instance.loader}
                        mods={mods}
                        isLoading={modsLoading}
                        onToggle={handleToggleMod}
                        onDelete={handleDeleteMod}
                        onRefresh={loadMods}
                        onAddMod={() => { setBrowserContentType("mod"); setShowContentBrowser(true); }}
                        // Only show lock UI for Cloud/Server instances
                        lockedMods={new Set(instance.cloudId ? (instance.lockedMods || []) : [])}
                        isServerManaged={!!instance.cloudId}
                        onToggleLock={instance.cloudId ? async (filename) => {
                            try {
                                const result = await (window.api as any)?.instanceToggleLock?.(instance.id, filename);
                                if (result?.ok) {
                                    // Update local instance state via onUpdate (to reflect changes in lockedMods)
                                    // But onUpdate takes Partial<GameInstance>.
                                    // The result should contain the new lockedMods array.
                                    if (result.lockedMods) {
                                        onUpdate(instance.id, { lockedMods: result.lockedMods });
                                    }
                                } else {
                                    toast.error(t('save_lock_failed' as any));
                                }
                            } catch (e) {
                                toast.error(t('error_occurred' as any));
                            }
                        } : undefined}
                    />
                )}

                {/* Resource Packs Tab */}
                {contentTab === "resourcepacks" && (
                    <ContentList
                        colors={colors}
                        instanceId={instance.id}
                        instanceName={instance.name}
                        minecraftVersion={instance.minecraftVersion}
                        loader={instance.loader}
                        items={resourcepacks}
                        isLoading={resourcepacksLoading}
                        contentType="resourcepack"
                        emptyMessage={t('no_resourcepacks' as any)}
                        onToggle={handleToggleResourcepack}
                        onDelete={handleDeleteResourcepack}
                        onAddContent={() => { setBrowserContentType("resourcepack"); setShowContentBrowser(true); }}
                        onRefresh={loadResourcepacks}
                    />
                )}

                {/* Datapacks Tab */}
                {contentTab === "datapacks" && (
                    <ContentList
                        colors={colors}
                        instanceId={instance.id}
                        instanceName={instance.name}
                        minecraftVersion={instance.minecraftVersion}
                        loader={instance.loader}
                        items={datapacks}
                        isLoading={datapacksLoading}
                        contentType="datapack"
                        emptyMessage={t('no_datapacks' as any)}
                        onToggle={handleToggleDatapack}
                        onDelete={handleDeleteDatapack}
                        onAddContent={() => { setBrowserContentType("datapack"); setShowContentBrowser(true); }}
                        onRefresh={loadDatapacks}
                    />
                )}

                {/* Shaders Tab */}
                {contentTab === "shaders" && (
                    <ContentList
                        colors={colors}
                        instanceId={instance.id}
                        instanceName={instance.name}
                        minecraftVersion={instance.minecraftVersion}
                        loader={instance.loader}
                        items={shaders}
                        isLoading={shadersLoading}
                        contentType="shader"
                        emptyMessage={t('no_shaders' as any)}
                        onToggle={handleToggleShader}
                        onDelete={handleDeleteShader}
                        onAddContent={() => { setBrowserContentType("shader"); setShowContentBrowser(true); }}
                        onRefresh={loadShaders}
                    />
                )}
            </div>

            {
                showContentBrowser && (
                    <InstanceContentBrowser
                        colors={colors}
                        instance={instance}
                        contentType={browserContentType}
                        onClose={() => setShowContentBrowser(false)}
                        onInstalled={() => {
                            // Don't close - just refresh the relevant content
                            switch (browserContentType) {
                                case "mod": loadMods(); break;
                                case "resourcepack": loadResourcepacks(); break;
                                case "shader": loadShaders(); break;
                                case "datapack": loadDatapacks(); break;
                            }
                        }}
                    />
                )
            }

            {/* Settings Modal */}
            {
                showSettings && (
                    <InstanceSettingsModal
                        colors={colors}
                        instance={instance}
                        onClose={() => setShowSettings(false)}
                        onUpdate={onUpdate}
                        onDelete={onDelete}
                        onDuplicate={onDuplicate}
                        onExport={onExport}
                        language={config.language}
                        config={config}
                        onRepair={onRepair}
                    />
                )
            }
        </div >
    );
}
