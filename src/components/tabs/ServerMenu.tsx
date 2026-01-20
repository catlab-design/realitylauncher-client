import React, { useState, useEffect } from "react";
import { playClick } from "../../lib/sounds";
import { cn } from "../../lib/utils";
import type { Server } from "../../types/launcher";
import { LiveLog } from "./LiveLog";
import { Icons } from "../ui/Icons";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import toast from "react-hot-toast";

interface Instance {
    id: string;
    name: string;
    description: string | null;
    iconUrl: string | null;
    bannerUrl: string | null;
    minecraftVersion: string | null;
    loaderType: string | null;
    status: string;
    memberType?: string;
    isOwned?: boolean;
    storagePath?: string;
}

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
}

import { JoinInstanceDialog } from "../dialogs/JoinInstanceDialog";

export function ServerMenu({
    servers,
    selectedServer,
    setSelectedServer,
    colors,
    onInstanceSelect,
    session,
    setActiveTab,
    refreshTrigger = 0,
}: ServerMenuProps) {
    const [instances, setInstances] = useState<{ owned: Instance[]; member: Instance[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [showJoinDialog, setShowJoinDialog] = useState(false);
    const [logViewerInstanceId, setLogViewerInstanceId] = useState<string | null>(null);
    const [playingInstances, setPlayingInstances] = useState<Set<string>>(new Set());
    const [launchingId, setLaunchingId] = useState<string | null>(null);
    const [timestamp, setTimestamp] = useState(Date.now());
    const [localInstances, setLocalInstances] = useState<Set<string>>(new Set());

    // Confirm Dialog State
    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        confirmText?: string;
        confirmColor?: string;
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

    // Helper for cache busting
    const getWithTimestamp = (url: string | null | undefined) => {
        if (!url) return "";
        if (url.startsWith("blob:") || url.startsWith("data:")) return url;
        return `${url}${url.includes("?") ? "&" : "?"}t=${timestamp}`;
    };

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
            // Check Token first like ModPack
            const refreshResult = await (window.api as any)?.authRefreshToken?.();
            if (refreshResult && !refreshResult.ok && refreshResult.error) {
                if (refreshResult.error.includes("re-login")) {
                    toast.error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
                    setLaunchingId(null);
                    return;
                }
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
                toast.success(res.message || "กำลังเปิดเกม...");
                setPlayingInstances(prev => new Set(prev).add(instance.id));
            } else {
                toast.error(res?.message || "เปิดเกมไม่สำเร็จ");
                setPlayingInstances(prev => { const s = new Set(prev); s.delete(instance.id); return s; });
            }
        } catch (err: any) {
            toast.error(err.message || "เกิดข้อผิดพลาด");
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

            toast.success("ส่งคำสั่งหยุดเกมแล้ว");
        } catch (error) {
            toast.error("เกิดข้อผิดพลาดในการหยุดเกม");
        }
    };

    const handleOpenFolder = (e: React.MouseEvent, instanceId: string) => {
        e.stopPropagation();
        // Use the correct local instance ID (storagePath if available)
        (window.api as any)?.instancesOpenFolder?.(instanceId);
    };

    useEffect(() => {
        fetchInstances();
    }, [session, refreshTrigger]); // Refetch when session or trigger changes

    const fetchInstances = async () => {
        // Only show full loading state if we don't have data yet
        if (!instances) {
            setLoading(true);
        }

        try {
            const token = session?.apiToken || session?.accessToken;

            // Run both fetches in parallel for faster loading
            const [cloudData, localList] = await Promise.all([
                // 1. Fetch Cloud Instances
                (async () => {
                    if (!token) return { owned: [], member: [] };
                    try {
                        const apiUrl = (window as any).API_URL;
                        const res = await fetch(`${apiUrl}/instances`, {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        if (res.ok) return await res.json();
                    } catch { }
                    return { owned: [], member: [] };
                })(),
                // 2. Fetch Local Instances
                (window.api as any)?.instancesList?.().catch(() => [])
            ]);

            const owned = cloudData.owned || [];
            const member = cloudData.member || [];

            setInstances({ owned, member });

            // Set joined servers (Owned + Member) for flat lookup
            const all = [...owned, ...member];
            const unique = all.filter((v: any, i: number, a: any[]) => a.findIndex(t => t.id === v.id) === i);
            setJoinedServers(unique);

            // Set local instances
            if (localList) {
                setLocalInstances(new Set(localList.map((i: any) => i.id)));
            }

        } catch (e) {
            console.error("Error fetching instances", e);
            setInstances({ owned: [], member: [] });
            setJoinedServers([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchPublicInstances = async (query: string = "") => {
        setIsSearching(true);
        try {
            const token = session?.apiToken || session?.accessToken;
            if (token) {
                const apiUrl = (window as any).API_URL;
                // Assuming /instances/public endpoint
                const url = new URL(`${apiUrl}/instances/public`);
                if (query) url.searchParams.append("q", query);

                const res = await fetch(url.toString(), {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (res.ok) {
                    const data = await res.json();
                    setPublicInstances(data.length ? data : []);
                    // Note: API might return { data: [] } or just [], adjust if needed.
                    // Assuming array for now based on typical pattern or use data.data if it's paginated.
                    if (data && !Array.isArray(data) && Array.isArray(data.data)) {
                        setPublicInstances(data.data);
                    } else if (Array.isArray(data)) {
                        setPublicInstances(data);
                    }
                } else {
                    // Fallback or empty
                    setPublicInstances([]);
                }
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
    // If showPublic is true, display ONLY public instances (or mixed? Usually distinct views are better)
    const displayedInstances = showPublic
        ? publicInstances
        : (instances && (instances.owned.length > 0 || instances.member.length > 0)
            ? [...(instances.owned || []), ...(instances.member || [])]
            : servers);

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
            // 1. Select Server (so ModPack tab knows what to show)
            handleInstanceClick(instance);

            // 2. Switch Tab IMMEDIATELY to show progress
            setActiveTab?.("modpack");

            // 3. Trigger install via IPC
            console.log("[ServerMenu] Calling instancesCloudInstall for:", instance.id);
            toast.success("กำลังเริ่มติดตั้ง...");
            const res = await (window.api as any)?.instancesCloudInstall?.(instance.id);
            console.log("[ServerMenu] Install result:", res);

            if (res?.ok) {
                // Success handled by toast/progress events
            } else {
                const errMsg = res?.error || "ติดตั้งไม่สำเร็จ";
                console.error("[ServerMenu] Install failed:", errMsg);
                if (errMsg.includes("401") || errMsg.includes("Unauthorized")) {
                    toast.error("Session หมดอายุ กรุณา Login ใหม่");
                } else if (errMsg.includes("Not logged in")) {
                    toast.error("กรุณา Login ก่อนใช้งาน");
                } else {
                    toast.error(errMsg);
                }
            }
        } catch (error: any) {
            console.error("[ServerMenu] Install exception:", error);
            toast.error("เกิดข้อผิดพลาดในการติดตั้ง: " + error.message);
        }
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

            <div className="flex justify-between items-center mb-6 gap-4">
                <div className="flex-1">
                    <h2 className="text-2xl font-bold mb-1" style={{ color: colors.onSurface }}>
                        {showPublic ? "สำรวจ Server" : "รายการ Server"}
                    </h2>
                    <p className="text-sm opacity-70" style={{ color: colors.onSurfaceVariant }}>
                        {showPublic ? "ค้นหา Server ที่น่าสนใจจากชุมชน" : "เลือก Server ที่ต้องการเล่น"}
                    </p>
                </div>

                {/* Search Bar */}
                <form onSubmit={handleSearchSubmit} className="flex-1 max-w-sm relative group">
                    <input
                        type="text"
                        placeholder="ค้นหา Server สาธารณะ..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-2 pl-10 rounded-xl outline-none transition-all placeholder:text-gray-500/50 border border-transparent focus:border-white/10"
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    />
                    <Icons.Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" style={{ color: colors.onSurface }} />
                </form>

                {/* Actions */}
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            playClick();
                            setShowPublic(!showPublic);
                            if (!showPublic) {
                                // Reset search when entering public mode? OR keep? 
                                // Let's keep it but maybe fetch all initially.
                            }
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
                        title="สำรวจ Server สาธารณะ"
                    >
                        <Icons.Compass className="w-5 h-5" />
                        <span className="hidden sm:inline">สำรวจ</span>
                    </button>

                    <button
                        onClick={() => { playClick(); setShowJoinDialog(true); }}
                        className="px-4 py-2 rounded-xl flex items-center gap-2 transition-all hover:brightness-110"
                        style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                    >
                        <span>+</span>
                        <span className="hidden sm:inline">ใส่ Key</span>
                    </button>
                </div>
            </div>

            {/* Join Instance Dialog */}
            <JoinInstanceDialog
                isOpen={showJoinDialog}
                onClose={() => setShowJoinDialog(false)}
                onSuccess={() => {
                    fetchInstances();
                    setShowJoinDialog(false);
                }}
                colors={colors}
            />

            {/* Loading / List */}
            {/* Not logged in - Show login prompt */}
            {!session ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                    <div className="w-24 h-24 rounded-3xl flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                        <Icons.Person className="w-12 h-12" style={{ color: colors.primary }} />
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold mb-2" style={{ color: colors.onSurface }}>
                            กรุณาเข้าสู่ระบบ
                        </h3>
                        <p className="mb-4" style={{ color: colors.onSurfaceVariant }}>
                            เชื่อมต่อบัญชี Microsoft เพื่อดู Server ของคุณ
                        </p>
                    </div>
                </div>
            ) : (session.type === "microsoft" && !session.apiToken) ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                    <div className="w-24 h-24 rounded-3xl flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                        <svg className="w-12 h-12" style={{ color: colors.secondary }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold mb-2" style={{ color: colors.onSurface }}>
                            เชื่อมต่อ CatID
                        </h3>
                        <p className="mb-4" style={{ color: colors.onSurfaceVariant }}>
                            กรุณาเชื่อมต่อบัญชี CatID เพื่อเข้าถึง Server ของคุณ
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
            ) : displayedInstances.length === 0 && servers.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 opacity-60">
                    <div className="w-24 h-24 rounded-3xl flex items-center justify-center bg-gray-500/10">
                        {showPublic ? <Icons.Search className="w-12 h-12" /> : <span className="text-4xl text-gray-500">?</span>}
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold mb-2" style={{ color: colors.onSurface }}>
                            {showPublic ? "ไม่พบ Server สาธารณะ" : session?.type === "offline" ? "โหมดออฟไลน์" : "ไม่พบ Server"}
                        </h3>
                        <p style={{ color: colors.onSurfaceVariant }}>
                            {showPublic
                                ? "ไม่พบผลลัพธ์ที่ตรงกับคำค้นหา"
                                : session?.type === "offline"
                                    ? "กรุณาใช้งานบัญชี CatID เพื่อเข้าเล่น"
                                    : <>คุณยังไม่มี Server ในบัญชี<br />ลองขอ Invite Key จากแอดมินดูสิ</>
                            }
                        </p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 overflow-y-auto">
                    {/* Instances List */}
                    {displayedInstances.map((instance: any, index: number) => {
                        // Check if installed
                        const targetId = instance.storagePath || instance.id;
                        const isInstalled = localInstances.has(targetId);

                        return (
                            <div
                                key={instance.id}
                                className="animate-card-appear"
                                style={{ animationDelay: `${Math.min(index * 25, 150)}ms` }}
                            >
                                <div
                                    onClick={() => { playClick(); handleInstanceClick(instance); }}
                                    className="group relative rounded-2xl overflow-hidden cursor-pointer h-48 transition-all hover:shadow-xl hover:scale-[1.01]"
                                    style={{
                                        border: selectedServer?.id === instance.id
                                            ? `2px solid ${colors.primary}`
                                            : "2px solid transparent",
                                    }}
                                >
                                    {/* Full Background Image - Prefer Banner, fallback to Icon */}
                                    <div
                                        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                                        style={{
                                            backgroundImage: instance.bannerUrl
                                                ? `url(${getWithTimestamp(instance.bannerUrl)})`
                                                : instance.iconUrl
                                                    ? `url(${getWithTimestamp(instance.iconUrl)})`
                                                    : undefined,
                                            backgroundColor: (instance.bannerUrl || instance.iconUrl) ? undefined : colors.surfaceContainer,
                                            filter: !isInstalled ? "grayscale(100%) brightness(0.7)" : undefined
                                        }}
                                    >
                                        {(!instance.bannerUrl && !instance.iconUrl) && (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <span className="text-6xl font-bold opacity-10" style={{ color: colors.onSurface }}>
                                                    {instance.name[0]?.toUpperCase()}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Gradient Overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

                                    {/* Logo Icon - Top Left */}
                                    <div className="absolute top-4 left-4 w-12 h-12 rounded-xl bg-black/20 backdrop-blur-md border border-white/10 overflow-hidden shadow-lg z-10">
                                        {instance.iconUrl ? (
                                            <img src={getWithTimestamp(instance.iconUrl)} alt="Icon" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-white/10 text-white font-bold text-lg">
                                                {instance.name[0]?.toUpperCase()}
                                            </div>
                                        )}
                                    </div>

                                    {/* Status & Badges - Top Right */}
                                    <div className="absolute top-3 right-3 flex gap-2">
                                        <span
                                            className={cn(
                                                "w-3 h-3 rounded-full border border-white/20 shadow-sm",
                                                instance.status === "active" ? "bg-green-500" : "bg-red-500"
                                            )}
                                        />
                                        {instance.isOwned && (
                                            <span className="text-[10px] bg-yellow-500/80 text-black px-2 py-0.5 rounded-full font-bold backdrop-blur-sm">
                                                OWNER
                                            </span>
                                        )}
                                        {/* If ShowPublic is on, and instance is NOT owned/member (implicit), maybe show badges? */}
                                        {showPublic && !instance.isOwned && (
                                            <span className="text-[10px] bg-blue-500/80 text-white px-2 py-0.5 rounded-full font-bold backdrop-blur-sm border border-white/20">
                                                PUBLIC
                                            </span>
                                        )}

                                        {!isInstalled && (
                                            <span className="text-[10px] bg-gray-500/80 text-white px-2 py-0.5 rounded-full font-bold backdrop-blur-sm border border-white/20">
                                                ไม่ได้ติดตั้ง
                                            </span>
                                        )}
                                    </div>

                                    {/* Loader Badge - Top Left (Moved below Icon) */}
                                    {instance.loaderType && (
                                        <div className="absolute top-20 left-4">
                                            <span className="text-[10px] bg-black/50 text-white px-2 py-0.5 rounded-full backdrop-blur-md border border-white/10 uppercase tracking-wider">
                                                {instance.loaderType}
                                            </span>
                                        </div>
                                    )}

                                    {/* Content & Actions - Bottom */}
                                    <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end gap-3">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-xl font-bold text-white truncate drop-shadow-md">
                                                {instance.name}
                                            </h3>
                                            <p className="text-sm text-gray-300 truncate drop-shadow-sm">
                                                {instance.description || `Minecraft ${instance.minecraftVersion || ""}`}
                                            </p>
                                        </div>

                                        <div className="flex gap-2 shrink-0">
                                            {(() => {
                                                // Determine membership
                                                const isOwned = joinedServers.some(s => s.id === instance.id && (s as any).isOwned);
                                                const isMember = joinedServers.some(s => s.id === instance.id);

                                                // 1. Not a member -> Show Join
                                                if (!isMember) {
                                                    return (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                playClick();
                                                                setConfirmDialog({
                                                                    isOpen: true,
                                                                    title: "ยืนยันการเข้าร่วม",
                                                                    message: `คุณต้องการเข้าร่วม Server "${instance.name}" หรือไม่?`,
                                                                    confirmText: "เข้าร่วม",
                                                                    confirmColor: colors.primary,
                                                                    onConfirm: async () => {
                                                                        const toastId = toast.loading("กำลังเข้าร่วม...");
                                                                        try {
                                                                            const res = await (window.api as any).instanceJoinPublic(instance.id);
                                                                            if (res?.ok) {
                                                                                toast.success("เข้าร่วมสำเร็จ!", { id: toastId });
                                                                                fetchInstances();     // Refresh local instances
                                                                                setShowPublic(false); // Go back to list
                                                                            } else {
                                                                                toast.error(res?.error || "เข้าร่วมไม่สำเร็จ", { id: toastId });
                                                                            }
                                                                        } catch (err: any) {
                                                                            toast.error("เกิดข้อผิดพลาด: " + err.message, { id: toastId });
                                                                        }
                                                                    }
                                                                });
                                                            }}
                                                            className="h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10"
                                                            style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                                                        >
                                                            <Icons.UserPlus className="w-5 h-5" />
                                                            <span className="font-bold">เข้าร่วม</span>
                                                        </button>
                                                    );
                                                }

                                                // 2. Member (or Owner)
                                                if (isInstalled) {
                                                    // Installed -> Play/Stop/Open Folder
                                                    return (
                                                        <>
                                                            <button
                                                                onClick={(e) => {
                                                                    playClick();
                                                                    if (playingInstances.has(instance.id) || launchingId === instance.id) {
                                                                        handleStopServer(e, instance.id);
                                                                    } else {
                                                                        handlePlayServer(e, instance);
                                                                    }
                                                                }}
                                                                className="h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10"
                                                                style={{
                                                                    backgroundColor: (playingInstances.has(instance.id) || launchingId === instance.id) ? "#ef4444" : "rgba(255,255,255,0.1)",
                                                                    color: "#fff"
                                                                }}
                                                            >
                                                                {launchingId === instance.id ? (
                                                                    <>
                                                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                        <span className="font-bold">โหลด...</span>
                                                                    </>
                                                                ) : playingInstances.has(instance.id) ? (
                                                                    <>
                                                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                                            <path d="M6 6h12v12H6z" />
                                                                        </svg>
                                                                        <span className="font-bold">หยุด</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                                            <path d="M8 5v14l11-7z" />
                                                                        </svg>
                                                                        <span className="font-bold">เล่น</span>
                                                                    </>
                                                                )}
                                                            </button>

                                                            <button
                                                                onClick={(e) => { playClick(); handleOpenFolder(e, instance.id); }}
                                                                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10"
                                                                style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#fff" }}
                                                                title="เปิดโฟลเดอร์"
                                                            >
                                                                <Icons.Folder className="w-5 h-5" />
                                                            </button>

                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    playClick();
                                                                    setLogViewerInstanceId(instance.id);
                                                                }}
                                                                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10"
                                                                style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#fff" }}
                                                                title="Logs / Console"
                                                            >
                                                                <Icons.Terminal className="w-5 h-5" />
                                                            </button>

                                                            {/* Trash Button Removed as per request */}

                                                            {/* Leave Button - HIDDEN FOR OWNER */}
                                                            {
                                                                !isOwned && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            playClick();
                                                                            setConfirmDialog({
                                                                                isOpen: true,
                                                                                title: "ยืนยันการออก",
                                                                                message: `คุณต้องการออกจาก Server "${instance.name}" หรือไม่?`,
                                                                                confirmText: "ออก",
                                                                                confirmColor: "#f97316",
                                                                                onConfirm: async () => {
                                                                                    try {
                                                                                        await (window.api as any).instanceLeave(instance.id);
                                                                                        fetchInstances();
                                                                                    } catch (err) {
                                                                                        console.error("Leave failed", err);
                                                                                        toast.error("ออกไม่สำเร็จ: " + err);
                                                                                    }
                                                                                }
                                                                            });
                                                                        }}
                                                                        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-orange-500/20 active:scale-95 backdrop-blur-md border border-orange-500/30 text-orange-500 hover:text-orange-400"
                                                                        title="ออกจาก Server (Leave)"
                                                                    >
                                                                        <Icons.Logout className="w-5 h-5" />
                                                                    </button>
                                                                )
                                                            }
                                                        </>
                                                    );
                                                } else {
                                                    // Member but Not Installed -> Show Install
                                                    return (
                                                        <>
                                                            <button
                                                                className="h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10"
                                                                style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                                                onClick={(e) => { playClick(); handleInstall(e, instance); }}
                                                            >
                                                                <Icons.Download className="w-5 h-5" />
                                                                <span className="font-bold">ติดตั้ง</span>
                                                            </button>

                                                            {!isOwned && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setConfirmDialog({
                                                                            isOpen: true,
                                                                            title: "ยืนยันการออก",
                                                                            message: `คุณต้องการออกจาก Server "${instance.name}" หรือไม่?`,
                                                                            confirmText: "ออก",
                                                                            confirmColor: "#f97316",
                                                                            onConfirm: async () => {
                                                                                try {
                                                                                    await (window.api as any).instanceLeave(instance.id);
                                                                                    fetchInstances();
                                                                                } catch (err) {
                                                                                    console.error("Leave failed", err);
                                                                                    (window as any).toast?.error("ออกไม่สำเร็จ: " + err);
                                                                                }
                                                                            }
                                                                        });
                                                                    }}
                                                                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-orange-500/20 active:scale-95 backdrop-blur-md border border-orange-500/30 text-orange-500 hover:text-orange-400"
                                                                    title="ออกจาก Server (Leave)"
                                                                >
                                                                    <Icons.Logout className="w-5 h-5" />
                                                                </button>
                                                            )}
                                                        </>
                                                    );
                                                }
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* Only show legacy servers if NOT searching public */}
                    {!showPublic && servers.map((server, index) => (
                        <div
                            key={server.id}
                            className="animate-card-appear"
                            style={{ animationDelay: `${Math.min((displayedInstances.length + index) * 25, 200)}ms` }}
                        >
                            <div
                                onClick={() => setSelectedServer(server)}
                                className="group relative rounded-2xl overflow-hidden cursor-pointer h-48 transition-all hover:shadow-xl hover:scale-[1.01]"
                                style={{
                                    border: selectedServer?.id === server.id
                                        ? `2px solid ${colors.primary}`
                                        : "2px solid transparent",
                                }}
                            >
                                {/* Full Background Image */}
                                <div
                                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                                    style={{ backgroundImage: `url(${getWithTimestamp(server.image || server.bannerUrl)})` }}
                                />

                                {/* Gradient Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

                                {/* Status - Top Right */}
                                <div className="absolute top-3 right-3">
                                    <span
                                        className={cn(
                                            "w-3 h-3 rounded-full border border-white/20 shadow-sm block",
                                            server.status === "online" ? "bg-green-500" : "bg-red-500"
                                        )}
                                    />
                                </div>

                                {/* Content & Actions - Bottom */}
                                <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end gap-3">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-xl font-bold text-white truncate drop-shadow-md">
                                            {server.name}
                                        </h3>
                                        <p className="text-sm text-gray-300 truncate drop-shadow-sm">
                                            {server.description}
                                        </p>
                                    </div>

                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            className="h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10"
                                            style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#fff" }}
                                        >
                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M8 5v14l11-7z" />
                                            </svg>
                                            <span className="font-bold">เล่น</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
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
                colors={colors}
            />
        </div >
    );
}
