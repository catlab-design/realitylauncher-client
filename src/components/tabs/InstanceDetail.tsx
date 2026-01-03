/**
 * ========================================
 * InstanceDetail - หน้าแสดงรายละเอียด Instance และจัดการ Mods
 * ========================================
 */

import { useState, useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import { Icons } from "../ui/Icons";
import { InstanceContentBrowser } from "./InstanceContentBrowser";
import type { GameInstance } from "../../types/launcher";

// ========================================
// Types
// ========================================

interface InstanceDetailProps {
    instance: GameInstance;
    colors: any;
    onBack: () => void;
    onPlay: (id: string) => void;
    onStop: () => void;
    onOpenFolder: (id: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    onUpdate: (id: string, updates: Partial<GameInstance>) => void;
    launchingId: string | null;
    isGameRunning: boolean;
    playingInstanceId: string | null;
}

interface ModInfo {
    filename: string;
    name: string;
    displayName: string;
    author: string;
    description: string;
    icon: string | null;
    enabled: boolean;
    size: number;
    modifiedAt: string;
}

type SettingsTab = "general" | "installation";

// ========================================
// LazyModItem Component - Loads metadata when visible
// ========================================

interface LazyModItemProps {
    mod: ModInfo;
    instanceId: string;
    colors: any;
    formatSize: (bytes: number) => string;
    onToggle: (filename: string) => void;
    onDelete: (filename: string) => void;
}

function LazyModItem({ mod, instanceId, colors, formatSize, onToggle, onDelete }: LazyModItemProps) {
    const [metadata, setMetadata] = useState<{
        displayName?: string | null;
        author?: string | null;
        icon?: string | null;
        loaded: boolean;
    }>({ loaded: false });

    const itemRef = useRef<HTMLDivElement>(null);
    const loadedRef = useRef(false);

    useEffect(() => {
        // Skip if already has metadata from cache
        if (mod.icon || (mod.displayName !== mod.name)) {
            setMetadata({
                displayName: mod.displayName,
                author: mod.author,
                icon: mod.icon,
                loaded: true
            });
            return;
        }

        const observer = new IntersectionObserver(
            async (entries) => {
                if (entries[0].isIntersecting && !loadedRef.current) {
                    loadedRef.current = true;
                    try {
                        const result = await (window.api as any)?.instanceGetModMetadata?.(instanceId, mod.filename);
                        if (result?.ok && result.metadata) {
                            setMetadata({
                                displayName: result.metadata.displayName,
                                author: result.metadata.author,
                                icon: result.metadata.icon,
                                loaded: true,
                            });
                        } else {
                            setMetadata({ loaded: true });
                        }
                    } catch (error) {
                        console.error("[LazyModItem] Failed to load metadata:", error);
                        setMetadata({ loaded: true });
                    }
                }
            },
            { threshold: 0.1, rootMargin: "100px" }
        );

        if (itemRef.current) {
            observer.observe(itemRef.current);
        }

        return () => observer.disconnect();
    }, [instanceId, mod.filename, mod.icon, mod.displayName, mod.name]);

    const displayName = metadata.loaded ? (metadata.displayName || mod.name) : mod.displayName;
    const author = metadata.loaded ? (metadata.author || "") : mod.author;
    const icon = metadata.loaded ? metadata.icon : mod.icon;

    return (
        <div
            ref={itemRef}
            className="flex items-center gap-4 p-4 rounded-xl transition-all"
            style={{
                backgroundColor: colors.surfaceContainer,
                opacity: mod.enabled ? 1 : 0.6
            }}
        >
            {/* Mod icon */}
            {icon ? (
                <img
                    src={icon}
                    alt={displayName}
                    className="w-10 h-10 rounded-lg object-cover"
                />
            ) : (
                <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: colors.surfaceContainerHighest }}
                >
                    <Icons.Box className="w-5 h-5" style={{ color: colors.onSurfaceVariant }} />
                </div>
            )}

            {/* Mod info */}
            <div className="flex-1 min-w-0">
                <p className="font-medium truncate" style={{ color: colors.onSurface }}>
                    {displayName}
                </p>
                <p className="text-xs truncate" style={{ color: colors.onSurfaceVariant }}>
                    {author ? `by ${author} • ` : ""}{formatSize(mod.size)}
                </p>
            </div>

            {/* Toggle switch */}
            <button
                onClick={() => onToggle(mod.filename)}
                className="relative w-12 h-6 rounded-full transition-colors"
                style={{ backgroundColor: mod.enabled ? colors.secondary : colors.surfaceContainerHighest }}
                title={mod.enabled ? "ปิด Mod" : "เปิด Mod"}
            >
                <div
                    className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow"
                    style={{ left: mod.enabled ? "calc(100% - 20px)" : "4px" }}
                />
            </button>

            {/* Delete button */}
            <button
                onClick={() => onDelete(mod.filename)}
                className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/20"
                style={{ color: "#ef4444" }}
                title="ลบ Mod"
            >
                <Icons.Trash className="w-5 h-5" />
            </button>
        </div>
    );
}

// ========================================
// Component
// ========================================

export function InstanceDetail({
    instance,
    colors,
    onBack,
    onPlay,
    onStop,
    onOpenFolder,
    onDelete,
    onDuplicate,
    onUpdate,
    launchingId,
    isGameRunning,
    playingInstanceId,
}: InstanceDetailProps) {
    const [mods, setMods] = useState<ModInfo[]>([]);
    const [modsLoading, setModsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [modsPage, setModsPage] = useState(1);
    const [showSettings, setShowSettings] = useState(false);
    const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
    const [editedName, setEditedName] = useState(instance.name);
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    // Content categories
    type ContentCategory = "mods" | "resourcepacks" | "datapacks" | "shaders";
    const [contentTab, setContentTab] = useState<ContentCategory>("mods");

    // Resource packs and shaders state
    interface ContentItem {
        filename: string;
        name: string;
        isDirectory: boolean;
        size: number;
        modifiedAt: string;
        enabled: boolean;
        icon: string | null;
    }
    interface DatapackItem extends ContentItem {
        worldName: string;
    }
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
    const isThisInstancePlaying = isGameRunning && playingInstanceId === instance.id;

    // Track which tabs have been loaded
    const [loadedTabs, setLoadedTabs] = useState<Set<ContentCategory>>(new Set());

    // Load mods on mount (default tab)
    useEffect(() => {
        loadMods();
        setLoadedTabs(new Set(["mods"]));
    }, [instance.id]);

    // Lazy load content when tab changes
    useEffect(() => {
        if (loadedTabs.has(contentTab)) return;

        switch (contentTab) {
            case "resourcepacks":
                loadResourcepacks();
                break;
            case "shaders":
                loadShaders();
                break;
            case "datapacks":
                loadDatapacks();
                break;
        }
        setLoadedTabs(prev => new Set([...prev, contentTab]));
    }, [contentTab]);

    // Update edited name when instance changes
    useEffect(() => {
        setEditedName(instance.name);
    }, [instance.name]);

    const loadMods = async () => {
        setModsLoading(true);
        try {
            const result = await (window.api as any)?.instanceListMods?.(instance.id);
            if (result?.ok) {
                setMods(result.mods);

                // If there are uncached mods, refresh after background loading completes
                if (result.hasUncached) {
                    setTimeout(async () => {
                        const refreshResult = await (window.api as any)?.instanceListMods?.(instance.id);
                        if (refreshResult?.ok) {
                            setMods(refreshResult.mods);
                        }
                    }, 1500); // Wait 1.5s for background loading
                }
            } else {
                toast.error(result?.error || "โหลดรายการ Mods ไม่สำเร็จ");
            }
        } catch (error) {
            console.error("[InstanceDetail] Failed to load mods:", error);
        } finally {
            setModsLoading(false);
        }
    };

    const loadResourcepacks = async () => {
        setResourcepacksLoading(true);
        try {
            const result = await (window.api as any)?.instanceListResourcepacks?.(instance.id);
            if (result?.ok) {
                setResourcepacks(result.items);
            }
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
            if (result?.ok) {
                setShaders(result.items);
            }
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
            if (result?.ok) {
                setDatapacks(result.items);
            }
        } catch (error) {
            console.error("[InstanceDetail] Failed to load datapacks:", error);
        } finally {
            setDatapacksLoading(false);
        }
    };

    const handleDeleteDatapack = async (worldName: string, filename: string) => {
        try {
            const result = await (window.api as any)?.instanceDeleteDatapack?.(instance.id, worldName, filename);
            if (result?.ok) {
                setDatapacks(prev => prev.filter(item => !(item.worldName === worldName && item.filename === filename)));
                toast.success("ลบ Datapack เรียบร้อย");
            } else {
                toast.error(result?.error || "ลบไม่สำเร็จ");
            }
        } catch (error) {
            toast.error("เกิดข้อผิดพลาด");
        }
    };

    const handleToggleDatapack = async (worldName: string, filename: string) => {
        try {
            const result = await (window.api as any)?.instanceToggleDatapack?.(instance.id, worldName, filename);
            if (result?.ok) {
                setDatapacks(prev => prev.map(item =>
                    item.worldName === worldName && item.filename === filename
                        ? { ...item, filename: result.newFilename, enabled: result.enabled }
                        : item
                ));
            } else {
                toast.error(result?.error || "เปลี่ยนสถานะไม่สำเร็จ");
            }
        } catch (error) {
            toast.error("เกิดข้อผิดพลาด");
        }
    };

    const handleDeleteResourcepack = async (filename: string) => {
        try {
            const result = await (window.api as any)?.instanceDeleteResourcepack?.(instance.id, filename);
            if (result?.ok) {
                setResourcepacks(prev => prev.filter(item => item.filename !== filename));
                toast.success("ลบ Resource Pack เรียบร้อย");
            } else {
                toast.error(result?.error || "ลบไม่สำเร็จ");
            }
        } catch (error) {
            toast.error("เกิดข้อผิดพลาด");
        }
    };

    const handleDeleteShader = async (filename: string) => {
        try {
            const result = await (window.api as any)?.instanceDeleteShader?.(instance.id, filename);
            if (result?.ok) {
                setShaders(prev => prev.filter(item => item.filename !== filename));
                toast.success("ลบ Shader เรียบร้อย");
            } else {
                toast.error(result?.error || "ลบไม่สำเร็จ");
            }
        } catch (error) {
            toast.error("เกิดข้อผิดพลาด");
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
                toast.error(result?.error || "เปลี่ยนสถานะไม่สำเร็จ");
            }
        } catch (error) {
            toast.error("เกิดข้อผิดพลาด");
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
                toast.error(result?.error || "เปลี่ยนสถานะไม่สำเร็จ");
            }
        } catch (error) {
            toast.error("เกิดข้อผิดพลาด");
        }
    };

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
                toast.error(result?.error || "เปลี่ยนสถานะ Mod ไม่สำเร็จ");
            }
        } catch (error) {
            toast.error("เกิดข้อผิดพลาด");
        }
    };

    const handleDeleteMod = async (filename: string) => {
        try {
            const result = await (window.api as any)?.instanceDeleteMod?.(instance.id, filename);
            if (result?.ok) {
                setMods(prev => prev.filter(mod => mod.filename !== filename));
                toast.success("ลบ Mod เรียบร้อย");
            } else {
                toast.error(result?.error || "ลบ Mod ไม่สำเร็จ");
            }
        } catch (error) {
            toast.error("เกิดข้อผิดพลาด");
        }
    };

    const handleSaveName = () => {
        if (editedName.trim() && editedName !== instance.name) {
            onUpdate(instance.id, { name: editedName.trim() });
            toast.success("บันทึกชื่อเรียบร้อย");
        }
    };

    const handlePlayStop = () => {
        if (isThisInstancePlaying) {
            onStop();
        } else {
            onPlay(instance.id);
        }
    };

    const filteredMods = mods.filter(mod =>
        mod.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mod.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Pagination for mods
    const MODS_PER_PAGE = 20;
    const totalModsPages = Math.ceil(filteredMods.length / MODS_PER_PAGE);
    const paginatedMods = filteredMods.slice(
        (modsPage - 1) * MODS_PER_PAGE,
        modsPage * MODS_PER_PAGE
    );

    // Reset page when search changes
    useEffect(() => {
        setModsPage(1);
    }, [searchQuery]);

    const formatSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const formatPlayTime = (minutes: number): string => {
        if (minutes < 60) return `${minutes} นาที`;
        const hours = Math.floor(minutes / 60);
        return `${hours} ชั่วโมง`;
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

    return (
        <div className="space-y-4">
            {/* Header with back button */}
            <div className="flex items-center gap-4 pb-4 border-b" style={{ borderColor: colors.outline + "30" }}>
                <button
                    onClick={onBack}
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-105"
                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                    </svg>
                </button>

                {/* Instance icon */}
                <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl overflow-hidden"
                    style={{ backgroundColor: colors.surfaceContainer }}
                >
                    {instance.icon?.startsWith("data:") || instance.icon?.startsWith("file://") || instance.icon?.startsWith("http") ? (
                        <img src={instance.icon} alt="icon" className="w-full h-full object-cover" />
                    ) : (
                        <Icons.Box className="w-8 h-8" style={{ color: colors.onSurfaceVariant }} />
                    )}
                </div>

                <div className="flex-1">
                    <h2 className="text-xl font-bold" style={{ color: colors.onSurface }}>{instance.name}</h2>
                    <div className="flex items-center gap-3 text-sm" style={{ color: colors.onSurfaceVariant }}>
                        <span>{getLoaderLabel(instance.loader)} {instance.minecraftVersion}</span>
                        {instance.totalPlayTime > 0 && (
                            <span>• {formatPlayTime(instance.totalPlayTime)}</span>
                        )}
                    </div>
                </div>

                {/* Play/Stop button */}
                <button
                    onClick={handlePlayStop}
                    disabled={launchingId !== null || (isGameRunning && !isThisInstancePlaying)}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:scale-105 disabled:opacity-50"
                    style={{
                        backgroundColor: isThisInstancePlaying ? "#ef4444" : colors.secondary,
                        color: isThisInstancePlaying ? "#ffffff" : "#1a1a1a"
                    }}
                >
                    {launchingId === instance.id ? (
                        <>
                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            กำลังเปิด...
                        </>
                    ) : isThisInstancePlaying ? (
                        <>
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 6h12v12H6z" />
                            </svg>
                            หยุด
                        </>
                    ) : (
                        <>
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            เล่น
                        </>
                    )}
                </button>

                {/* Settings button */}
                <button
                    onClick={() => setShowSettings(true)}
                    className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:opacity-80"
                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    title="ตั้งค่า"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                    </svg>
                </button>

                {/* Open folder button */}
                <button
                    onClick={() => onOpenFolder(instance.id)}
                    className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:opacity-80"
                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    title="เปิดโฟลเดอร์"
                >
                    <Icons.Folder className="w-5 h-5" />
                </button>
            </div>

            {/* Content Category Tabs */}
            <div className="flex gap-2 mb-4">
                {/* Mods Tab */}
                <button
                    onClick={() => setContentTab("mods")}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all"
                    style={{
                        backgroundColor: contentTab === "mods" ? colors.secondary : colors.surfaceContainerHighest,
                        color: contentTab === "mods" ? "#1a1a1a" : colors.onSurfaceVariant
                    }}
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18-.21 0-.41-.06-.57-.18l-7.9-4.44A.991.991 0 0 1 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18.21 0 .41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9zM12 4.15L6.04 7.5 12 10.85l5.96-3.35L12 4.15zM5 15.91l6 3.38v-6.71L5 9.21v6.7zm14 0v-6.7l-6 3.37v6.71l6-3.38z" />
                    </svg>
                    <span>Mods</span>
                    <span
                        className="px-2 py-0.5 rounded-full text-xs"
                        style={{
                            backgroundColor: contentTab === "mods" ? "rgba(0,0,0,0.2)" : colors.surfaceContainer,
                            color: contentTab === "mods" ? "#1a1a1a" : colors.onSurfaceVariant
                        }}
                    >
                        {modsLoading ? "..." : mods.length}
                    </span>
                </button>

                {/* Resource Packs Tab */}
                <button
                    onClick={() => setContentTab("resourcepacks")}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all"
                    style={{
                        backgroundColor: contentTab === "resourcepacks" ? colors.secondary : colors.surfaceContainerHighest,
                        color: contentTab === "resourcepacks" ? "#1a1a1a" : colors.onSurfaceVariant
                    }}
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                    </svg>
                    <span>Resource Packs</span>
                    {resourcepacks.length > 0 && (
                        <span
                            className="px-2 py-0.5 rounded-full text-xs"
                            style={{
                                backgroundColor: contentTab === "resourcepacks" ? "rgba(0,0,0,0.2)" : colors.surfaceContainer,
                                color: contentTab === "resourcepacks" ? "#1a1a1a" : colors.onSurfaceVariant
                            }}
                        >
                            {resourcepacks.length}
                        </span>
                    )}
                </button>

                {/* Datapacks Tab */}
                <button
                    onClick={() => setContentTab("datapacks")}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all"
                    style={{
                        backgroundColor: contentTab === "datapacks" ? colors.secondary : colors.surfaceContainerHighest,
                        color: contentTab === "datapacks" ? "#1a1a1a" : colors.onSurfaceVariant
                    }}
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                    </svg>
                    <span>Datapacks</span>
                    {datapacks.length > 0 && (
                        <span
                            className="px-2 py-0.5 rounded-full text-xs"
                            style={{
                                backgroundColor: contentTab === "datapacks" ? "rgba(0,0,0,0.2)" : colors.surfaceContainer,
                                color: contentTab === "datapacks" ? "#1a1a1a" : colors.onSurfaceVariant
                            }}
                        >
                            {datapacks.length}
                        </span>
                    )}
                </button>

                {/* Shaders Tab */}
                <button
                    onClick={() => setContentTab("shaders")}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all"
                    style={{
                        backgroundColor: contentTab === "shaders" ? colors.secondary : colors.surfaceContainerHighest,
                        color: contentTab === "shaders" ? "#1a1a1a" : colors.onSurfaceVariant
                    }}
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06z" />
                    </svg>
                    <span>Shaders</span>
                    {shaders.length > 0 && (
                        <span
                            className="px-2 py-0.5 rounded-full text-xs"
                            style={{
                                backgroundColor: contentTab === "shaders" ? "rgba(0,0,0,0.2)" : colors.surfaceContainer,
                                color: contentTab === "shaders" ? "#1a1a1a" : colors.onSurfaceVariant
                            }}
                        >
                            {shaders.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Content Section */}
            <div>
                {/* Mods Tab */}
                {contentTab === "mods" && (
                    <>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-medium" style={{ color: colors.onSurface }}>
                                Mods {modsLoading ? "" : `(${mods.length})`}
                            </h3>

                            {/* Search + Actions */}
                            <div className="flex items-center gap-2">
                                <div
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl"
                                    style={{ backgroundColor: colors.surfaceContainerHighest }}
                                >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" style={{ color: colors.onSurfaceVariant }}>
                                        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="ค้นหา Mod..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="bg-transparent outline-none text-sm w-40"
                                        style={{ color: colors.onSurface }}
                                    />
                                </div>
                                <button
                                    onClick={() => { setBrowserContentType("mod"); setShowContentBrowser(true); }}
                                    className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all hover:opacity-90"
                                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                >
                                    <i className="fa-solid fa-plus text-xs"></i>
                                    ติดตั้ง Mod
                                </button>
                                <button
                                    onClick={loadMods}
                                    className="px-4 py-2 rounded-xl text-sm transition-all hover:opacity-80"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                >
                                    รีเฟรช
                                </button>
                            </div>
                        </div>

                        {/* Mods list */}
                        {modsLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: colors.secondary, borderTopColor: "transparent" }} />
                            </div>
                        ) : filteredMods.length === 0 ? (
                            <div className="text-center py-12 rounded-2xl" style={{ backgroundColor: colors.surfaceContainer }}>
                                <Icons.Box className="w-12 h-12 mx-auto mb-3" style={{ color: colors.onSurfaceVariant, opacity: 0.5 }} />
                                <p className="font-medium" style={{ color: colors.onSurfaceVariant }}>
                                    {searchQuery ? "ไม่พบ Mod ที่ค้นหา" : "ไม่มี Mod ใน Instance นี้"}
                                </p>
                                <p className="text-sm mt-1" style={{ color: colors.onSurfaceVariant }}>
                                    ลากไฟล์ .jar มาที่โฟลเดอร์ mods หรือติดตั้งจาก Explore
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Pagination Controls - Top */}
                                {totalModsPages > 1 && (
                                    <div className="flex items-center gap-3 mb-4 pb-4 border-b" style={{ borderColor: colors.outline + "30" }}>
                                        <button
                                            onClick={() => setModsPage(p => Math.max(1, p - 1))}
                                            disabled={modsPage === 1}
                                            className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                                            </svg>
                                            ก่อนหน้า
                                        </button>

                                        <span className="px-4 py-2 rounded-xl text-sm" style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}>
                                            {modsPage} / {totalModsPages}
                                        </span>

                                        <button
                                            onClick={() => setModsPage(p => Math.min(totalModsPages, p + 1))}
                                            disabled={modsPage === totalModsPages}
                                            className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            ถัดไป
                                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                                            </svg>
                                        </button>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    {paginatedMods.map((mod) => (
                                        <LazyModItem
                                            key={mod.filename}
                                            mod={mod}
                                            instanceId={instance.id}
                                            colors={colors}
                                            formatSize={formatSize}
                                            onToggle={handleToggleMod}
                                            onDelete={handleDeleteMod}
                                        />
                                    ))}
                                </div>

                                {/* Pagination Controls - Bottom */}
                                {totalModsPages > 1 && (
                                    <div className="flex items-center gap-3 mt-4 pt-4 border-t" style={{ borderColor: colors.outline + "30" }}>
                                        <button
                                            onClick={() => setModsPage(p => Math.max(1, p - 1))}
                                            disabled={modsPage === 1}
                                            className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                                            </svg>
                                            ก่อนหน้า
                                        </button>

                                        <span className="px-4 py-2 rounded-xl text-sm" style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}>
                                            {modsPage} / {totalModsPages}
                                        </span>

                                        <button
                                            onClick={() => setModsPage(p => Math.min(totalModsPages, p + 1))}
                                            disabled={modsPage === totalModsPages}
                                            className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            ถัดไป
                                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                                            </svg>
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}

                {/* Resource Packs Tab */}
                {contentTab === "resourcepacks" && (
                    <>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-medium" style={{ color: colors.onSurface }}>
                                Resource Packs ({resourcepacks.length})
                            </h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => { setBrowserContentType("resourcepack"); setShowContentBrowser(true); }}
                                    className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all hover:opacity-90"
                                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                >
                                    <i className="fa-solid fa-plus text-xs"></i>
                                    ติดตั้ง
                                </button>
                                <button
                                    onClick={loadResourcepacks}
                                    className="px-4 py-2 rounded-xl text-sm transition-all hover:opacity-80"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                >
                                    รีเฟรช
                                </button>
                            </div>
                        </div>
                        {resourcepacksLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: colors.secondary, borderTopColor: "transparent" }} />
                            </div>
                        ) : resourcepacks.length === 0 ? (
                            <div className="text-center py-12 rounded-2xl" style={{ backgroundColor: colors.surfaceContainer }}>
                                <svg className="w-12 h-12 mx-auto mb-4" viewBox="0 0 24 24" fill="currentColor" style={{ color: colors.onSurfaceVariant, opacity: 0.5 }}>
                                    <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                                </svg>
                                <p className="font-medium" style={{ color: colors.onSurfaceVariant }}>
                                    ไม่มี Resource Pack ใน Instance นี้
                                </p>
                                <p className="text-sm mt-1" style={{ color: colors.onSurfaceVariant }}>
                                    ลากไฟล์ .zip มาที่โฟลเดอร์ resourcepacks หรือติดตั้งจาก Explore
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {resourcepacks.map((item) => (
                                    <div
                                        key={item.filename}
                                        className="flex items-center gap-4 p-4 rounded-xl"
                                        style={{
                                            backgroundColor: colors.surfaceContainer,
                                            opacity: item.enabled ? 1 : 0.6
                                        }}
                                    >
                                        {/* Icon */}
                                        {item.icon ? (
                                            <img
                                                src={item.icon}
                                                alt={item.name}
                                                className="w-10 h-10 rounded-lg object-cover"
                                            />
                                        ) : (
                                            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: colors.onSurfaceVariant }}>
                                                    <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z" />
                                                </svg>
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate" style={{ color: colors.onSurface }}>{item.name}</p>
                                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>{formatSize(item.size)}</p>
                                        </div>
                                        {/* Toggle switch */}
                                        {!item.isDirectory && (
                                            <button
                                                onClick={() => handleToggleResourcepack(item.filename)}
                                                className="relative w-12 h-6 rounded-full transition-colors"
                                                style={{ backgroundColor: item.enabled ? colors.secondary : colors.surfaceContainerHighest }}
                                            >
                                                <div
                                                    className="absolute top-1 w-4 h-4 rounded-full transition-transform"
                                                    style={{
                                                        backgroundColor: item.enabled ? colors.surface : colors.onSurfaceVariant,
                                                        left: item.enabled ? "calc(100% - 20px)" : "4px"
                                                    }}
                                                />
                                            </button>
                                        )}
                                        {/* Delete button */}
                                        <button
                                            onClick={() => handleDeleteResourcepack(item.filename)}
                                            className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/20"
                                            style={{ color: "#ef4444" }}
                                            title="ลบ"
                                        >
                                            <Icons.Trash className="w-5 h-5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* Datapacks Tab */}
                {contentTab === "datapacks" && (
                    <>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-medium" style={{ color: colors.onSurface }}>
                                Datapacks ({datapacks.length})
                            </h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => { setBrowserContentType("datapack"); setShowContentBrowser(true); }}
                                    className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all hover:opacity-90"
                                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                >
                                    <i className="fa-solid fa-plus text-xs"></i>
                                    ติดตั้ง
                                </button>
                                <button
                                    onClick={loadDatapacks}
                                    className="px-4 py-2 rounded-xl text-sm transition-all hover:opacity-80"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                >
                                    รีเฟรช
                                </button>
                            </div>
                        </div>
                        {datapacksLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: colors.secondary, borderTopColor: "transparent" }} />
                            </div>
                        ) : datapacks.length === 0 ? (
                            <div className="text-center py-12 rounded-2xl" style={{ backgroundColor: colors.surfaceContainer }}>
                                <svg className="w-12 h-12 mx-auto mb-4" viewBox="0 0 24 24" fill="currentColor" style={{ color: colors.onSurfaceVariant, opacity: 0.5 }}>
                                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                                </svg>
                                <p className="font-medium" style={{ color: colors.onSurfaceVariant }}>
                                    ไม่มี Datapack ใน Instance นี้
                                </p>
                                <p className="text-sm mt-1" style={{ color: colors.onSurfaceVariant }}>
                                    ใส่ Datapack ในโฟลเดอร์ saves/&lt;เวิร์ล&gt;/datapacks
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Group by world */}
                                {[...new Set(datapacks.map(d => d.worldName))].map(worldName => (
                                    <div key={worldName}>
                                        <p className="text-sm font-medium mb-2 px-2" style={{ color: colors.onSurfaceVariant }}>
                                        </p>
                                        <div className="space-y-2">
                                            {datapacks.filter(d => d.worldName === worldName).map((item) => (
                                                <div
                                                    key={`${item.worldName}-${item.filename}`}
                                                    className="flex items-center gap-4 p-4 rounded-xl"
                                                    style={{
                                                        backgroundColor: colors.surfaceContainer,
                                                        opacity: item.enabled ? 1 : 0.6
                                                    }}
                                                >
                                                    {/* Icon */}
                                                    {item.icon ? (
                                                        <img
                                                            src={item.icon}
                                                            alt={item.name}
                                                            className="w-10 h-10 rounded-lg object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: colors.onSurfaceVariant }}>
                                                                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                                                            </svg>
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium truncate" style={{ color: colors.onSurface }}>{item.name}</p>
                                                        <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>{formatSize(item.size)}</p>
                                                    </div>
                                                    {/* Toggle switch */}
                                                    {!item.isDirectory && (
                                                        <button
                                                            onClick={() => handleToggleDatapack(item.worldName, item.filename)}
                                                            className="relative w-12 h-6 rounded-full transition-colors"
                                                            style={{ backgroundColor: item.enabled ? colors.secondary : colors.surfaceContainerHighest }}
                                                        >
                                                            <div
                                                                className="absolute top-1 w-4 h-4 rounded-full transition-transform"
                                                                style={{
                                                                    backgroundColor: item.enabled ? colors.surface : colors.onSurfaceVariant,
                                                                    left: item.enabled ? "calc(100% - 20px)" : "4px"
                                                                }}
                                                            />
                                                        </button>
                                                    )}
                                                    {/* Delete button */}
                                                    <button
                                                        onClick={() => handleDeleteDatapack(item.worldName, item.filename)}
                                                        className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/20"
                                                        style={{ color: "#ef4444" }}
                                                        title="ลบ"
                                                    >
                                                        <Icons.Trash className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* Shaders Tab */}
                {contentTab === "shaders" && (
                    <>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-medium" style={{ color: colors.onSurface }}>
                                Shaders ({shaders.length})
                            </h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => { setBrowserContentType("shader"); setShowContentBrowser(true); }}
                                    className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all hover:opacity-90"
                                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                >
                                    <i className="fa-solid fa-plus text-xs"></i>
                                    ติดตั้ง
                                </button>
                                <button
                                    onClick={loadShaders}
                                    className="px-4 py-2 rounded-xl text-sm transition-all hover:opacity-80"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                >
                                    รีเฟรช
                                </button>
                            </div>
                        </div>
                        {shadersLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: colors.secondary, borderTopColor: "transparent" }} />
                            </div>
                        ) : shaders.length === 0 ? (
                            <div className="text-center py-12 rounded-2xl" style={{ backgroundColor: colors.surfaceContainer }}>
                                <svg className="w-12 h-12 mx-auto mb-4" viewBox="0 0 24 24" fill="currentColor" style={{ color: colors.onSurfaceVariant, opacity: 0.5 }}>
                                    <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06z" />
                                </svg>
                                <p className="font-medium" style={{ color: colors.onSurfaceVariant }}>
                                    ไม่มี Shader ใน Instance นี้
                                </p>
                                <p className="text-sm mt-1" style={{ color: colors.onSurfaceVariant }}>
                                    ต้องใช้ Optifine/Iris Mod แล้วใส่ Shader ในโฟลเดอร์ shaderpacks
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {shaders.map((item) => (
                                    <div
                                        key={item.filename}
                                        className="flex items-center gap-4 p-4 rounded-xl"
                                        style={{
                                            backgroundColor: colors.surfaceContainer,
                                            opacity: item.enabled ? 1 : 0.6
                                        }}
                                    >
                                        {/* Icon */}
                                        {item.icon ? (
                                            <img
                                                src={item.icon}
                                                alt={item.name}
                                                className="w-10 h-10 rounded-lg object-cover"
                                            />
                                        ) : (
                                            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: colors.onSurfaceVariant }}>
                                                    <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1z" />
                                                </svg>
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate" style={{ color: colors.onSurface }}>{item.name}</p>
                                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>{formatSize(item.size)}</p>
                                        </div>
                                        {/* Toggle switch */}
                                        {!item.isDirectory && (
                                            <button
                                                onClick={() => handleToggleShader(item.filename)}
                                                className="relative w-12 h-6 rounded-full transition-colors"
                                                style={{ backgroundColor: item.enabled ? colors.secondary : colors.surfaceContainerHighest }}
                                            >
                                                <div
                                                    className="absolute top-1 w-4 h-4 rounded-full transition-transform"
                                                    style={{
                                                        backgroundColor: item.enabled ? colors.surface : colors.onSurfaceVariant,
                                                        left: item.enabled ? "calc(100% - 20px)" : "4px"
                                                    }}
                                                />
                                            </button>
                                        )}
                                        {/* Delete button */}
                                        <button
                                            onClick={() => handleDeleteShader(item.filename)}
                                            className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/20"
                                            style={{ color: "#ef4444" }}
                                            title="ลบ"
                                        >
                                            <Icons.Trash className="w-5 h-5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Settings Modal */}
            {showSettings && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div
                        className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl"
                        style={{ backgroundColor: colors.surface }}
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: colors.outline + "30" }}>
                            <div className="flex items-center gap-3">
                                {instance.icon?.startsWith("data:") ? (
                                    <img src={instance.icon} alt="icon" className="w-6 h-6 rounded-lg object-cover" />
                                ) : instance.icon ? (
                                    <span className="text-xl">{instance.icon}</span>
                                ) : (
                                    <Icons.Box className="w-6 h-6" style={{ color: colors.onSurfaceVariant }} />
                                )}
                                <span className="font-medium" style={{ color: colors.onSurface }}>{instance.name}</span>
                                <span style={{ color: colors.onSurfaceVariant }}>›</span>
                                <span className="font-medium" style={{ color: colors.onSurface }}>ตั้งค่า</span>
                            </div>
                            <button
                                onClick={() => setShowSettings(false)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10"
                                style={{ color: colors.onSurfaceVariant }}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="flex">
                            {/* Sidebar */}
                            <div className="w-48 p-4 border-r" style={{ borderColor: colors.outline + "30" }}>
                                <button
                                    onClick={() => setSettingsTab("general")}
                                    className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm mb-1 transition-all"
                                    style={{
                                        backgroundColor: settingsTab === "general" ? colors.secondary : "transparent",
                                        color: settingsTab === "general" ? "#1a1a1a" : colors.onSurfaceVariant
                                    }}
                                >
                                    <i className="fa-solid fa-circle-info w-4" /> ทั่วไป
                                </button>
                                <button
                                    onClick={() => setSettingsTab("installation")}
                                    className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm mb-1 transition-all"
                                    style={{
                                        backgroundColor: settingsTab === "installation" ? colors.secondary : "transparent",
                                        color: settingsTab === "installation" ? "#1a1a1a" : colors.onSurfaceVariant
                                    }}
                                >
                                    <i className="fa-solid fa-download w-4" /> การติดตั้ง
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 p-6 max-h-96 overflow-y-auto">
                                {settingsTab === "general" && (
                                    <div className="space-y-6">
                                        {/* Name */}
                                        <div className="flex gap-6">
                                            <div className="flex-1">
                                                <label className="block text-sm font-medium mb-2" style={{ color: colors.onSurface }}>ชื่อ</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={editedName}
                                                        onChange={(e) => setEditedName(e.target.value)}
                                                        className="flex-1 px-4 py-2 rounded-xl outline-none"
                                                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                                    />
                                                    {editedName !== instance.name && (
                                                        <button
                                                            onClick={handleSaveName}
                                                            className="px-4 py-2 rounded-xl text-sm"
                                                            style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                                        >
                                                            บันทึก
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Icon picker */}
                                            <div>
                                                <label className="block text-sm font-medium mb-2" style={{ color: colors.onSurface }}>ไอคอน</label>
                                                <div className="relative group">
                                                    <div
                                                        className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl cursor-pointer transition-all hover:opacity-80 overflow-hidden"
                                                        style={{ backgroundColor: colors.surfaceContainerHighest }}
                                                        onClick={async () => {
                                                            const result = await window.api?.browseIcon?.();
                                                            if (result) {
                                                                onUpdate(instance.id, { icon: result });
                                                            }
                                                        }}
                                                    >
                                                        {instance.icon?.startsWith("data:") || instance.icon?.includes("/") || instance.icon?.includes("\\") ? (
                                                            <img
                                                                src={instance.icon}
                                                                alt="icon"
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : instance.icon ? (
                                                            <span className="text-4xl">{instance.icon}</span>
                                                        ) : (
                                                            <Icons.Box className="w-10 h-10" style={{ color: colors.onSurfaceVariant }} />
                                                        )}
                                                    </div>
                                                    <div
                                                        className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-xs cursor-pointer"
                                                        style={{ backgroundColor: colors.surface, border: `2px solid ${colors.surfaceContainerHighest}` }}
                                                        onClick={async () => {
                                                            const result = await window.api?.browseIcon?.();
                                                            if (result) {
                                                                onUpdate(instance.id, { icon: result });
                                                            }
                                                        }}
                                                    >
                                                        <Icons.Edit className="w-3 h-3" style={{ color: colors.onSurface }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Duplicate */}
                                        <div>
                                            <h4 className="font-medium mb-1" style={{ color: colors.onSurface }}>สำเนา Instance</h4>
                                            <p className="text-sm mb-2" style={{ color: colors.onSurfaceVariant }}>
                                                สร้างสำเนาของ Instance นี้ รวม worlds, configs, mods
                                            </p>
                                            <button
                                                onClick={() => {
                                                    onDuplicate(instance.id);
                                                    setShowSettings(false);
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all hover:opacity-80"
                                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                            >
                                                <i className="fa-regular fa-copy" /> สำเนา
                                            </button>
                                        </div>

                                        {/* Delete */}
                                        <div>
                                            <h4 className="font-medium mb-1" style={{ color: colors.onSurface }}>ลบ Instance</h4>
                                            <p className="text-sm mb-2" style={{ color: colors.onSurfaceVariant }}>
                                                ลบ Instance นี้อย่างถาวร รวม worlds, configs และเนื้อหาทั้งหมด
                                            </p>
                                            {deleteConfirm ? (
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => {
                                                            onDelete(instance.id);
                                                            setShowSettings(false);
                                                        }}
                                                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm bg-red-500 text-white"
                                                    >
                                                        <i className="fa-solid fa-trash" /> ยืนยันลบ
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteConfirm(false)}
                                                        className="px-4 py-2 rounded-xl text-sm"
                                                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                                    >
                                                        ยกเลิก
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setDeleteConfirm(true)}
                                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm border border-red-500 text-red-500 hover:bg-red-500/10"
                                                >
                                                    <i className="fa-solid fa-trash" /> ลบ Instance
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {settingsTab === "installation" && (
                                    <div className="space-y-6">
                                        {/* Currently installed */}
                                        <div>
                                            <h4 className="font-medium mb-3" style={{ color: colors.onSurface }}>ติดตั้งอยู่</h4>
                                            <div
                                                className="flex items-center gap-4 p-4 rounded-xl"
                                                style={{ backgroundColor: colors.surfaceContainerHighest }}
                                            >
                                                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainer }}>
                                                    <Icons.Box className="w-6 h-6" style={{ color: colors.onSurfaceVariant }} />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-medium" style={{ color: colors.onSurface }}>
                                                        Minecraft {instance.minecraftVersion}
                                                    </p>
                                                    <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                                                        {getLoaderLabel(instance.loader)} {instance.loaderVersion || ""}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Platform */}
                                        <div>
                                            <h4 className="font-medium mb-3" style={{ color: colors.onSurface }}>Platform</h4>
                                            <div className="flex gap-2">
                                                {["vanilla", "fabric", "forge", "neoforge", "quilt"].map((loader) => (
                                                    <button
                                                        key={loader}
                                                        className="px-4 py-2 rounded-lg text-sm transition-all"
                                                        style={{
                                                            backgroundColor: instance.loader === loader ? colors.secondary : colors.surfaceContainerHighest,
                                                            color: instance.loader === loader ? "#000000ff" : colors.onSurface,
                                                            border: instance.loader === loader ? "none" : `1px solid ${colors.outline}30`
                                                        }}
                                                    >
                                                        {instance.loader === loader && <span className="mr-1">✓</span>}
                                                        {getLoaderLabel(loader)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Game version */}
                                        <div>
                                            <h4 className="font-medium mb-2" style={{ color: colors.onSurface }}>เวอร์ชันเกม</h4>
                                            <div
                                                className="px-4 py-3 rounded-xl flex items-center justify-between"
                                                style={{ backgroundColor: colors.surfaceContainerHighest }}
                                            >
                                                <span style={{ color: colors.onSurface }}>{instance.minecraftVersion}</span>
                                                <i className="fa-solid fa-chevron-down" style={{ color: colors.onSurfaceVariant }} />
                                            </div>
                                        </div>

                                        {instance.loader !== "vanilla" && (
                                            <div>
                                                <h4 className="font-medium mb-2" style={{ color: colors.onSurface }}>
                                                    เวอร์ชัน {getLoaderLabel(instance.loader)}
                                                </h4>
                                                <div
                                                    className="px-4 py-3 rounded-xl flex items-center justify-between"
                                                    style={{ backgroundColor: colors.surfaceContainerHighest }}
                                                >
                                                    <span style={{ color: colors.onSurface }}>{instance.loaderVersion || "ล่าสุด"}</span>
                                                    <i className="fa-solid fa-chevron-down" style={{ color: colors.onSurfaceVariant }} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Content Browser Modal */}
            {showContentBrowser && (
                <InstanceContentBrowser
                    instance={instance}
                    contentType={browserContentType}
                    colors={colors}
                    onClose={() => setShowContentBrowser(false)}
                    onInstalled={() => {
                        // Refresh the appropriate content list after installation
                        if (browserContentType === "mod") loadMods();
                        else if (browserContentType === "resourcepack") loadResourcepacks();
                        else if (browserContentType === "shader") loadShaders();
                        else if (browserContentType === "datapack") loadDatapacks();
                    }}
                />
            )}
        </div>
    );
}
