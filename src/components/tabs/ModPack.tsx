import React, { useEffect, useState, useRef } from "react";
import toast from "react-hot-toast";
import { Icons } from "../ui/Icons";
import { InstanceDetail } from "./InstanceDetail";
import { LiveLog } from "./LiveLog";

// ========================================
// Types
// ========================================

interface GameInstance {
    id: string;
    name: string;
    icon?: string;
    minecraftVersion: string;
    loader: "vanilla" | "fabric" | "forge" | "neoforge" | "quilt";
    loaderVersion?: string;
    createdAt: string;
    lastPlayedAt?: string;
    totalPlayTime: number;
    gameDirectory: string;
}

interface ModPackProps {
    colors: any;
    setImportModpackOpen: (open: boolean) => void;
    setActiveTab: (tab: string) => void;
    isActive?: boolean; // Whether this tab is currently active
}

interface InstallProgress {
    stage: string;
    message: string;
    current?: number;
    total?: number;
    percent?: number;
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

// ========================================
// Component
// ========================================

export function ModPack({ colors, setImportModpackOpen, setActiveTab, isActive = true }: ModPackProps) {
    const [instances, setInstances] = useState<GameInstance[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [launchingId, setLaunchingId] = useState<string | null>(null);
    const [isGameRunning, setIsGameRunning] = useState(false);
    const [playingInstanceId, setPlayingInstanceId] = useState<string | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [logViewerInstanceId, setLogViewerInstanceId] = useState<string | null>(null);

    // Installation progress state
    const [isInstalling, setIsInstalling] = useState(false);
    const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);

    // Instance detail view state
    const [selectedInstance, setSelectedInstance] = useState<GameInstance | null>(null);
    const [instanceMods, setInstanceMods] = useState<ModInfo[]>([]);
    const [modsLoading, setModsLoading] = useState(false);
    const [modSearchQuery, setModSearchQuery] = useState("");

    // Reset selectedInstance when tab becomes active (coming back from another tab)
    useEffect(() => {
        if (isActive) {
            setSelectedInstance(null);
            loadInstances();
        }
    }, [isActive]);

    // Load instances on mount
    useEffect(() => {
        loadInstances();
    }, []);

    // Listen for install progress
    useEffect(() => {
        const cleanup = window.api?.onModpackInstallProgress?.((progress) => {
            setInstallProgress(progress);
        });
        return () => cleanup?.();
    }, []);

    // Track state with refs to avoid stale closures in polling
    const shouldPollRef = useRef(false);
    const isGameRunningRef = useRef(false);
    const playingInstanceIdRef = useRef<string | null>(null);

    // Keep refs in sync with state
    useEffect(() => {
        isGameRunningRef.current = isGameRunning;
    }, [isGameRunning]);

    useEffect(() => {
        playingInstanceIdRef.current = playingInstanceId;
    }, [playingInstanceId]);

    // Poll game running status
    useEffect(() => {
        const checkGameStatus = async () => {
            try {
                const running = await window.api?.isGameRunning?.();
                const wasRunning = isGameRunningRef.current;

                setIsGameRunning(running ?? false);

                // Clear playing instance if game stopped
                if (!running && wasRunning) {
                    setPlayingInstanceId(null);
                    shouldPollRef.current = false;
                }
            } catch (error) {
                console.error("[ModPack] Error checking game status:", error);
            }
        };

        // Check immediately on mount
        checkGameStatus();

        // Poll every second for more responsive UI
        const interval = setInterval(() => {
            // Always poll when there's potential game activity
            if (shouldPollRef.current || playingInstanceIdRef.current || launchingId || isGameRunningRef.current) {
                checkGameStatus();
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [launchingId]); // Only depend on launchingId to minimize recreations

    const loadInstances = async () => {
        setIsLoading(true);
        try {
            const list = await window.api?.instancesList?.();
            if (list) {
                setInstances(list);
            }
        } catch (error) {
            console.error("[ModPack] Failed to load instances:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Load mods for selected instance
    const loadInstanceMods = async (instanceId: string) => {
        setModsLoading(true);
        try {
            const result = await (window.api as any)?.instanceListMods?.(instanceId);
            if (result?.ok) {
                setInstanceMods(result.mods);
            } else {
                toast.error(result?.error || "โหลดรายการ Mods ไม่สำเร็จ");
            }
        } catch (error) {
            console.error("[ModPack] Failed to load mods:", error);
        } finally {
            setModsLoading(false);
        }
    };

    // Toggle mod enabled/disabled
    const handleToggleMod = async (filename: string) => {
        if (!selectedInstance) return;
        try {
            const result = await (window.api as any)?.instanceToggleMod?.(selectedInstance.id, filename);
            if (result?.ok) {
                // Update local state
                setInstanceMods(prev => prev.map(mod =>
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

    // Delete mod from instance
    const handleDeleteMod = async (filename: string) => {
        if (!selectedInstance) return;
        try {
            const result = await (window.api as any)?.instanceDeleteMod?.(selectedInstance.id, filename);
            if (result?.ok) {
                setInstanceMods(prev => prev.filter(mod => mod.filename !== filename));
                toast.success("ลบ Mod เรียบร้อย");
            } else {
                toast.error(result?.error || "ลบ Mod ไม่สำเร็จ");
            }
        } catch (error) {
            toast.error("เกิดข้อผิดพลาด");
        }
    };

    // Open instance detail view
    const handleOpenInstanceDetail = (instance: GameInstance) => {
        setSelectedInstance(instance);
        loadInstanceMods(instance.id);
    };

    const handleDelete = async (id: string) => {
        try {
            const success = await window.api?.instancesDelete?.(id);
            if (success) {
                toast.success("ลบ Instance เรียบร้อย");
                loadInstances();
            } else {
                toast.error("ลบ Instance ไม่สำเร็จ");
            }
        } catch (error) {
            toast.error("เกิดข้อผิดพลาด");
        }
        setDeleteConfirmId(null);
    };

    const handleDuplicate = async (id: string) => {
        try {
            const newInstance = await window.api?.instancesDuplicate?.(id);
            if (newInstance) {
                toast.success(`สร้าง ${newInstance.name} เรียบร้อย`);
                loadInstances();
            }
        } catch (error) {
            toast.error("เกิดข้อผิดพลาด");
        }
    };

    const handleOpenFolder = async (id: string) => {
        await window.api?.instancesOpenFolder?.(id);
    };

    const handleUpdate = async (id: string, updates: Partial<GameInstance>) => {
        try {
            const success = await window.api?.instancesUpdate?.(id, updates);
            if (success) {
                // Update local state
                setInstances(prev => prev.map(inst =>
                    inst.id === id ? { ...inst, ...updates } : inst
                ));
                // Update selected instance if it's the one being updated
                if (selectedInstance?.id === id) {
                    setSelectedInstance(prev => prev ? { ...prev, ...updates } : prev);
                }
            }
        } catch (error) {
            toast.error("อัปเดตไม่สำเร็จ");
        }
    };

    // Track if launch was cancelled (use ref to work in async)
    const launchCancelledRef = useRef(false);

    const handlePlay = async (id: string) => {
        // Prevent double-launch race condition
        if (launchingId !== null) {
            console.log("[ModPack] Already launching, ignoring");
            return;
        }

        launchCancelledRef.current = false;  // Reset cancel flag
        shouldPollRef.current = true; // Start polling for game status
        setLaunchingId(id);
        setPlayingInstanceId(id);  // Set immediately so stop button shows
        try {
            const result = await window.api?.instancesLaunch?.(id);

            // Check if cancelled during launch
            if (launchCancelledRef.current) {
                // User clicked stop while launching - kill the game
                await window.api?.killGame?.();
                setIsGameRunning(false);
                setPlayingInstanceId(null);
                return;
            }

            if (result?.ok) {
                toast.success(result.message || "กำลังเปิดเกม...");
                setIsGameRunning(true);
            } else {
                toast.error(result?.message || "เปิดเกมไม่สำเร็จ");
                setPlayingInstanceId(null);  // Clear on error
            }
        } catch (error: any) {
            toast.error(error?.message || "เกิดข้อผิดพลาด");
            setPlayingInstanceId(null);  // Clear on error
        } finally {
            setLaunchingId(null);
        }
    };

    const handleStop = async () => {
        // Set cancel flag for if we're still launching
        launchCancelledRef.current = true;

        try {
            const stopped = await window.api?.killGame?.();
            // Always clear state when stop is clicked
            setIsGameRunning(false);
            setPlayingInstanceId(null);
            setLaunchingId(null);

            if (stopped) {
                toast.success("หยุดเกมแล้ว");
            } else {
                toast.success("ยกเลิกการเปิดเกมแล้ว");
            }
        } catch (error) {
            // Still clear state even on error
            setIsGameRunning(false);
            setPlayingInstanceId(null);
            setLaunchingId(null);
            toast.success("ยกเลิกแล้ว");
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
            setIsInstalling(true);
            setInstallProgress({ stage: "extracting", message: "กำลังอ่านข้อมูล modpack..." });

            // Install the modpack (will create new instance)
            const result = await window.api?.modpackInstall?.(targetPath);

            if (result?.ok && result.instance) {
                toast.success(`ติดตั้ง ${result.instance.name} เรียบร้อย!`);
                loadInstances();
            } else {
                toast.error(result?.error || "ติดตั้งไม่สำเร็จ");
            }
        } catch (error: any) {
            toast.error(error?.message || "เกิดข้อผิดพลาด");
        } finally {
            setIsInstalling(false);
            setInstallProgress(null);
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
                toast.error("ไม่สามารถอ่านไฟล์ได้");
            }
        } else {
            toast.error("กรุณาลากไฟล์ .mrpack หรือ .zip");
        }
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

    // Filter mods by search query
    const filteredMods = instanceMods.filter(mod =>
        mod.name.toLowerCase().includes(modSearchQuery.toLowerCase())
    );

    // Format file size
    const formatSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // If an instance is selected, show detail view
    if (selectedInstance) {
        return (
            <InstanceDetail
                instance={selectedInstance}
                colors={colors}
                onBack={() => {
                    setSelectedInstance(null);
                    loadInstances(); // Reload in case of changes
                }}
                onPlay={handlePlay}
                onStop={handleStop}
                onOpenFolder={handleOpenFolder}
                onDelete={(id) => {
                    handleDelete(id);
                    setSelectedInstance(null);
                }}
                onDuplicate={handleDuplicate}
                onUpdate={handleUpdate}
                launchingId={launchingId}
                isGameRunning={isGameRunning}
                playingInstanceId={playingInstanceId}
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
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-medium" style={{ color: colors.onSurface }}>Mod Pack</h2>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowImportModal(true)}
                            disabled={isInstalling}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:opacity-80 disabled:opacity-50"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                            </svg>
                            นำเข้า
                        </button>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-[1.02]"
                            style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                        >
                            <Icons.Add className="w-5 h-5" />
                            สร้าง Mod Pack ใหม่
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
                            <h3 className="font-medium" style={{ color: colors.onSurface }}>สร้าง Mod Pack ของคุณเอง</h3>
                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>หรือเลือก mod pack ที่ต้องการแล้วโหลดเล่นเลย</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setActiveTab("explore")}
                        className="w-full py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-all hover:opacity-80"
                        style={{ borderColor: colors.outline, color: colors.onSurfaceVariant }}
                    >
                        + เพิ่ม Mod Pack ใหม่
                    </button>
                </div>

                {/* My Mod Packs Section */}
                <div>
                    <h3 className="text-lg font-medium mb-3" style={{ color: colors.onSurface }}>Mod Pack ของฉัน</h3>
                    {isLoading ? (
                        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: colors.surfaceContainer }}>
                            <div className="animate-spin w-8 h-8 border-2 border-current border-t-transparent rounded-full mx-auto mb-2" style={{ color: colors.secondary }} />
                            <p style={{ color: colors.onSurfaceVariant }}>กำลังโหลด...</p>
                        </div>
                    ) : instances.length === 0 ? (
                        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: colors.surfaceContainer }}>
                            <Icons.Box className="w-12 h-12 mx-auto mb-3" style={{ color: colors.onSurfaceVariant, opacity: 0.5 }} />
                            <p className="font-medium mb-1" style={{ color: colors.onSurfaceVariant }}>ยังไม่มี Mod Pack</p>
                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>สร้าง Mod Pack แล้วกลับมานะ</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                            {instances.map((instance) => (
                                <div
                                    key={instance.id}
                                    onClick={() => handleOpenInstanceDetail(instance)}
                                    className="p-4 rounded-xl transition-all hover:shadow-lg cursor-pointer"
                                    style={{ backgroundColor: colors.surfaceContainer }}
                                >
                                    {/* Header */}
                                    <div className="flex items-start gap-3 mb-3">
                                        <div
                                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                            style={{ backgroundColor: colors.surfaceContainerHigh }}
                                        >
                                            {instance.icon ? (
                                                <img src={instance.icon} alt={instance.name} className="w-full h-full object-cover rounded-xl" />
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
                                            <span>เล่นล่าสุด: {new Date(instance.lastPlayedAt).toLocaleDateString("th-TH")}</span>
                                        )}
                                        {instance.totalPlayTime > 0 && (
                                            <span>{formatPlayTime(instance.totalPlayTime)}</span>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                        {(playingInstanceId === instance.id || launchingId === instance.id) ? (
                                            <button
                                                onClick={handleStop}
                                                className="flex-1 py-2 rounded-lg font-medium transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                                                style={{ backgroundColor: "#ef4444", color: "#ffffff" }}
                                            >
                                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                                    <rect x="6" y="6" width="12" height="12" />
                                                </svg>
                                                {launchingId === instance.id ? "กำลังเปิด..." : "หยุด"}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handlePlay(instance.id)}
                                                disabled={launchingId !== null}
                                                className="flex-1 py-2 rounded-lg font-medium transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                                                style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                            >
                                                ▶  เล่น
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleOpenFolder(instance.id)}
                                            className="px-3 py-2 rounded-lg transition-all hover:opacity-80"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                            title="เปิดโฟลเดอร์"
                                        >
                                            <Icons.Folder className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => setLogViewerInstanceId(instance.id)}
                                            className="px-3 py-2 rounded-lg transition-all hover:opacity-80"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                            title="ดู Logs"
                                        >
                                            <Icons.Terminal className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => handleDuplicate(instance.id)}
                                            className="px-3 py-2 rounded-lg transition-all hover:opacity-80"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                            title="คัดลอก"
                                        >
                                            <Icons.Copy className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => setDeleteConfirmId(instance.id)}
                                            className="px-3 py-2 rounded-lg transition-all hover:opacity-80"
                                            style={{ backgroundColor: "#ef444420", color: "#ef4444" }}
                                            title="ลบ"
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
                    <h3 className="text-lg font-medium mb-3" style={{ color: colors.onSurface }}>Mod ของเซิร์ฟเวอร์</h3>
                    <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: colors.surfaceContainer }}>
                        <Icons.Box className="w-12 h-12 mx-auto mb-3" style={{ color: colors.onSurfaceVariant, opacity: 0.5 }} />
                        <p className="font-medium mb-1" style={{ color: colors.onSurfaceVariant }}>ไม่มีเซิร์ฟเวอร์</p>
                        <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>เพิ่มเซิร์ฟเวอร์จากเมนูเซิร์ฟเวอร์ก่อน mod</p>
                    </div>
                </div>



                {/* Delete Confirmation Modal */}
                {deleteConfirmId && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                        <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: colors.surface }}>
                            <h3 className="text-lg font-medium mb-2" style={{ color: colors.onSurface }}>
                                ยืนยันการลบ Instance?
                            </h3>
                            <p className="mb-6" style={{ color: colors.onSurfaceVariant }}>
                                การลบจะลบไฟล์ทั้งหมดใน Instance นี้ รวมถึง mods, saves, และ config
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="flex-1 py-2 rounded-lg"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    onClick={() => handleDelete(deleteConfirmId)}
                                    className="flex-1 py-2 rounded-lg font-medium"
                                    style={{ backgroundColor: "#ef4444", color: "#ffffff" }}
                                >
                                    ลบ
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Create Instance Modal */}
                {showCreateModal && (
                    <CreateInstanceModal
                        colors={colors}
                        onClose={() => setShowCreateModal(false)}
                        onCreated={() => {
                            setShowCreateModal(false);
                            loadInstances();
                        }}
                    />
                )}

                {/* Import Modal */}
                {showImportModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                        <div className="w-full max-w-md rounded-2xl p-6 relative" style={{ backgroundColor: colors.surface }}>
                            <button
                                onClick={() => setShowImportModal(false)}
                                className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20"
                                style={{ color: colors.onSurfaceVariant }}
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                                </svg>
                            </button>

                            <div className="flex items-center gap-3 mb-4">
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center"
                                    style={{ backgroundColor: colors.secondary }}
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1a1a1a">
                                        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="font-semibold" style={{ color: colors.onSurface }}>นำเข้า Mod Pack</h3>
                                    <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>รองรับ CurseForge (.zip) และ Modrinth (.mrpack)</p>
                                </div>
                            </div>

                            {/* Drop Zone */}
                            <div
                                className={`rounded-xl p-8 text-center border-2 border-dashed mb-4 cursor-pointer transition-all hover:opacity-80 ${isDragging ? 'scale-[1.02] opacity-80' : ''}`}
                                style={{
                                    borderColor: isDragging ? colors.secondary : colors.outline,
                                    backgroundColor: isDragging ? `${colors.secondary}15` : colors.surfaceContainer
                                }}
                                onClick={() => handleImportModpack()}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                <Icons.Box className="w-12 h-12 mx-auto mb-3" style={{ color: isDragging ? colors.secondary : colors.onSurfaceVariant }} />
                                <p className="font-medium mb-1" style={{ color: isDragging ? colors.secondary : colors.onSurfaceVariant }}>
                                    {isDragging ? 'วางไฟล์ที่นี่!' : 'ลากไฟล์มาวางที่นี่'}
                                </p>
                                <p className="text-sm mb-4" style={{ color: colors.onSurfaceVariant }}>หรือ</p>
                                <button
                                    disabled={isInstalling}
                                    className="px-6 py-2 rounded-xl font-medium disabled:opacity-50"
                                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                >
                                    {isInstalling ? "กำลังติดตั้ง..." : "เลือกไฟล์"}
                                </button>
                            </div>

                            {/* Source Options */}
                            <div className="grid grid-cols-2 gap-3">
                                <div
                                    className="p-3 rounded-xl flex items-center gap-2"
                                    style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}` }}
                                >
                                    <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: "#f16436" }}>
                                        <span className="text-white text-xs font-bold">CF</span>
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium" style={{ color: colors.onSurface }}>CurseForge</div>
                                        <div className="text-xs" style={{ color: colors.onSurfaceVariant }}>.zip - Modpack จาก CurseForge</div>
                                    </div>
                                </div>
                                <div
                                    className="p-3 rounded-xl flex items-center gap-2"
                                    style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}` }}
                                >
                                    <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: "#1bd96a" }}>
                                        <span className="text-white text-xs font-bold">M</span>
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium" style={{ color: colors.onSurface }}>Modrinth</div>
                                        <div className="text-xs" style={{ color: colors.onSurfaceVariant }}>.mrpack - Modpack จาก Modrinth</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Installation Progress Modal */}
                {isInstalling && installProgress && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                        <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: colors.surface }}>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center animate-spin"
                                    style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: colors.secondary }}>
                                        <path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-medium" style={{ color: colors.onSurface }}>
                                        กำลังติดตั้ง Modpack
                                    </h3>
                                    <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                                        {installProgress.message}
                                    </p>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            {installProgress.percent !== undefined && (
                                <div className="mt-4">
                                    <div className="flex justify-between text-sm mb-1" style={{ color: colors.onSurfaceVariant }}>
                                        <span>{installProgress.current || 0} / {installProgress.total || "?"}</span>
                                        <span>{installProgress.percent}%</span>
                                    </div>
                                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{
                                                width: `${installProgress.percent}%`,
                                                backgroundColor: colors.secondary,
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

// ========================================
// Create Instance Modal
// ========================================

interface CreateInstanceModalProps {
    colors: any;
    onClose: () => void;
    onCreated: () => void;
}

function CreateInstanceModal({ colors, onClose, onCreated }: CreateInstanceModalProps) {
    const [name, setName] = useState("");
    const [minecraftVersion, setMinecraftVersion] = useState("");
    const [loader, setLoader] = useState<"vanilla" | "fabric" | "forge" | "neoforge" | "quilt">("vanilla");
    const [gameVersions, setGameVersions] = useState<{ version: string; version_type: string }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showAllVersions, setShowAllVersions] = useState(false);

    useEffect(() => {
        loadGameVersions();
    }, []);

    const loadGameVersions = async () => {
        try {
            const versions = await window.api?.modrinthGetGameVersions?.();
            if (versions) {
                setGameVersions(versions);
                const latest = versions.find((v: { version: string; version_type: string }) => v.version_type === "release");
                if (latest) setMinecraftVersion(latest.version);
            }
        } catch (error) {
            console.error("[CreateInstance] Failed to load versions:", error);
        }
    };

    const handleCreate = async () => {
        if (!name.trim()) {
            toast.error("กรุณาใส่ชื่อ Instance");
            return;
        }
        if (!minecraftVersion) {
            toast.error("กรุณาเลือก Minecraft version");
            return;
        }

        setIsLoading(true);
        try {
            await window.api?.instancesCreate?.({
                name: name.trim(),
                minecraftVersion,
                loader,
            });
            toast.success(`สร้าง ${name.trim()} เรียบร้อย`);
            onCreated();
        } catch (error) {
            toast.error("สร้าง Instance ไม่สำเร็จ");
        } finally {
            setIsLoading(false);
        }
    };

    const filteredVersions = showAllVersions
        ? gameVersions
        : gameVersions.filter((v) => v.version_type === "release");

    const loaders = [
        {
            id: "vanilla", name: "Vanilla", icon: (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
            )
        },
        {
            id: "fabric", name: "Fabric", icon: (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 4h4v4H4V4m6 0h4v4h-4V4m6 0h4v4h-4V4M4 10h4v4H4v-4m6 0h4v4h-4v-4m6 0h4v4h-4v-4M4 16h4v4H4v-4m6 0h4v4h-4v-4m6 0h4v4h-4v-4z" />
                </svg>
            )
        },
        {
            id: "forge", name: "Forge", icon: (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
                </svg>
            )
        },
        {
            id: "neoforge", name: "NeoForge", icon: (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm6 9.09c0 4-2.55 7.7-6 8.83-3.45-1.13-6-4.82-6-8.83V6.31l6-2.12 6 2.12v4.78z" />
                </svg>
            )
        },
        {
            id: "quilt", name: "Quilt", icon: (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2 4v16h20V4H2zm2 2h7v5H4V6zm0 12v-5h7v5H4zm16 0h-7v-5h7v5zm0-7h-7V6h7v5z" />
                </svg>
            )
        },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-2xl p-6 relative" style={{ backgroundColor: colors.surface }}>
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20"
                    style={{ color: colors.onSurfaceVariant }}
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                </button>

                <h2 className="text-xl font-bold mb-6" style={{ color: colors.onSurface }}>สร้าง Instance ใหม่</h2>

                {/* Name Input */}
                <div className="mb-4">
                    <label className="block text-sm mb-2" style={{ color: colors.onSurfaceVariant }}>ชื่อ Instance</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="My Instance"
                        className="w-full px-4 py-3 rounded-xl border"
                        style={{ backgroundColor: colors.surfaceContainer, borderColor: colors.outline, color: colors.onSurface }}
                    />
                </div>

                {/* Minecraft Version */}
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm" style={{ color: colors.onSurfaceVariant }}>Minecraft Version</label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: colors.onSurfaceVariant }}>
                            <input
                                type="checkbox"
                                checked={showAllVersions}
                                onChange={(e) => setShowAllVersions(e.target.checked)}
                                className="w-4 h-4"
                            />
                            แสดงทั้งหมด
                        </label>
                    </div>
                    <select
                        value={minecraftVersion}
                        onChange={(e) => setMinecraftVersion(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border"
                        style={{ backgroundColor: colors.surfaceContainer, borderColor: colors.outline, color: colors.onSurface }}
                    >
                        {filteredVersions.map((v) => (
                            <option key={v.version} value={v.version}>
                                {v.version} {v.version_type !== "release" ? `(${v.version_type})` : ""}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Loader Selection */}
                <div className="mb-6">
                    <label className="block text-sm mb-2" style={{ color: colors.onSurfaceVariant }}>Mod Loader</label>
                    <div className="grid grid-cols-5 gap-2">
                        {loaders.map((l) => (
                            <button
                                key={l.id}
                                onClick={() => setLoader(l.id as any)}
                                className="flex flex-col items-center py-2 rounded-xl text-center transition-all"
                                style={{
                                    backgroundColor: loader === l.id ? colors.secondary : colors.surfaceContainerHighest,
                                    color: loader === l.id ? "#1a1a1a" : colors.onSurface,
                                }}
                            >
                                {l.icon}
                                <div className="text-xs mt-1">{l.name}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Create Button */}
                <button
                    onClick={handleCreate}
                    disabled={isLoading}
                    className="w-full py-3 rounded-xl font-medium transition-all hover:scale-[1.02] disabled:opacity-50"
                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                >
                    {isLoading ? "กำลังสร้าง..." : "สร้าง Instance"}
                </button>
            </div>
        </div>
    );
}
