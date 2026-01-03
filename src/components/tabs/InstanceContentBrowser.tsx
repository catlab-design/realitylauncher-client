/**
 * InstanceContentBrowser - Full-screen modal for browsing and installing content to a specific instance
 * Filters by instance's MC version and loader, supports Mods, Resource Packs, Shaders, and Datapacks
 */

import { useState, useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import type { GameInstance } from "../../types/launcher";

// Import icons
import modrinthIcon from "../../assets/modrinth.svg";
import curseforgeIcon from "../../assets/curseforge.svg";

// ========================================
// Types
// ========================================

type ContentType = "mod" | "resourcepack" | "shader" | "datapack";
type ContentSource = "modrinth" | "curseforge";

interface ModrinthProject {
    project_id: string;
    title: string;
    description: string;
    author: string;
    icon_url?: string;
    downloads: number;
    follows: number;
    categories: string[];
}

interface ModVersion {
    id: string;
    name: string;
    version_number: string;
    game_versions: string[];
    loaders: string[];
    files: { filename: string; primary: boolean; url: string }[];
}

interface InstallProgress {
    message: string;
    percent?: number;
}

interface InstanceContentBrowserProps {
    instance: GameInstance;
    contentType: ContentType;
    colors: any;
    onClose: () => void;
    onInstalled: () => void;
}

// ========================================
// Constants
// ========================================

const SORT_OPTIONS = [
    { value: "relevance", label: "เกี่ยวข้อง" },
    { value: "downloads", label: "ดาวน์โหลดมาก" },
    { value: "follows", label: "ติดตามมาก" },
    { value: "newest", label: "ใหม่สุด" },
    { value: "updated", label: "อัปเดตล่าสุด" },
];

const CONTENT_TABS: { type: ContentType; label: string; icon: string }[] = [
    { type: "mod", label: "Mods", icon: "fa-cube" },
    { type: "resourcepack", label: "Resource Packs", icon: "fa-palette" },
    { type: "datapack", label: "Data Packs", icon: "fa-database" },
    { type: "shader", label: "Shaders", icon: "fa-sun" },
];

// ========================================
// Component
// ========================================

export function InstanceContentBrowser({
    instance,
    contentType: initialContentType,
    colors,
    onClose,
    onInstalled,
}: InstanceContentBrowserProps) {
    // Content type state (switchable via tabs)
    const [contentType, setContentType] = useState<ContentType>(initialContentType);

    // Search state
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [contentSource, setContentSource] = useState<ContentSource>("modrinth");
    const [sortBy, setSortBy] = useState("relevance");
    const [page, setPage] = useState(1);
    const [viewCount, setViewCount] = useState(20);

    // Results state
    const [results, setResults] = useState<ModrinthProject[]>([]);
    const [totalHits, setTotalHits] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    // Install state
    const [installingProjectId, setInstallingProjectId] = useState<string | null>(null);
    const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);

    // Debounce search
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    const handleDebouncedSearch = useCallback((value: string) => {
        setSearchQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setDebouncedQuery(value);
            setPage(1);
        }, 400);
    }, []);

    // Search projects
    const searchProjects = useCallback(async () => {
        setIsLoading(true);
        try {
            if (contentSource === "curseforge") {
                // CurseForge API
                const result = await window.api?.curseforgeSearch?.({
                    query: debouncedQuery,
                    projectType: contentType,
                    gameVersion: instance.minecraftVersion,
                    sortBy: sortBy === "downloads" ? "downloads" : sortBy === "updated" ? "updated" : "relevance",
                    pageSize: viewCount,
                    index: (page - 1) * viewCount,
                });

                if (result?.data) {
                    const mapped = result.data.map((p) => ({
                        project_id: p.id.toString(),
                        title: p.name,
                        description: p.summary,
                        author: p.authors?.[0]?.name || "Unknown",
                        icon_url: p.logo?.url,
                        downloads: p.downloadCount,
                        follows: p.thumbsUpCount || 0,
                        categories: p.categories?.map((c) => c.name) || [],
                    }));
                    setResults(mapped);
                    setTotalHits(result.pagination?.totalCount || mapped.length);
                    setTotalPages(Math.ceil((result.pagination?.totalCount || mapped.length) / viewCount));
                } else {
                    setResults([]);
                    setTotalHits(0);
                    setTotalPages(0);
                }
            } else {
                // Modrinth API - use parameters matching the type definition
                const result = await window.api?.modrinthSearch?.({
                    query: debouncedQuery,
                    projectType: contentType,
                    gameVersion: instance.minecraftVersion,
                    loader: contentType === "mod" && instance.loader !== "vanilla" ? instance.loader : undefined,
                    sortBy: sortBy,
                    limit: viewCount,
                    offset: (page - 1) * viewCount,
                });

                if (result?.hits) {
                    const mapped = result.hits.map((p: any) => ({
                        project_id: p.project_id || p.slug,
                        title: p.title,
                        description: p.description,
                        author: p.author,
                        icon_url: p.icon_url,
                        downloads: p.downloads,
                        follows: p.follows,
                        categories: p.categories || [],
                    }));
                    setResults(mapped);
                    setTotalHits(result.total_hits || mapped.length);
                    setTotalPages(Math.ceil((result.total_hits || mapped.length) / viewCount));
                } else {
                    setResults([]);
                    setTotalHits(0);
                    setTotalPages(0);
                }
            }
        } catch (error) {
            console.error("[ContentBrowser] Search error:", error);
            toast.error("ค้นหาไม่สำเร็จ");
        } finally {
            setIsLoading(false);
        }
    }, [debouncedQuery, contentSource, contentType, sortBy, page, viewCount, instance]);

    // Search on mount and when params change
    useEffect(() => {
        searchProjects();
    }, [searchProjects]);

    // Install content to instance
    const handleInstall = async (project: ModrinthProject) => {
        setInstallingProjectId(project.project_id);
        setInstallProgress({ message: "กำลังดึงข้อมูลเวอร์ชัน..." });

        try {
            // Get versions
            let bestVersionId: string | null = null;

            if (contentSource === "curseforge") {
                const cfResult = await window.api?.curseforgeGetFiles?.(project.project_id);
                if (cfResult?.data && cfResult.data.length > 0) {
                    // Find best matching version
                    const compatible = cfResult.data.find((f: any) =>
                        f.gameVersions?.includes(instance.minecraftVersion) &&
                        (contentType !== "mod" || !instance.loader || instance.loader === "vanilla" ||
                            f.sortableGameVersions?.some((v: any) => v.gameVersionName?.toLowerCase() === instance.loader)
                        )
                    );
                    const chosen = compatible || cfResult.data[0];
                    bestVersionId = chosen.id.toString();
                }
            } else {
                const versions = await window.api?.modrinthGetVersions?.(project.project_id);
                if (versions && versions.length > 0) {
                    // Find best matching version
                    const compatible = versions.find((v: any) =>
                        v.game_versions?.includes(instance.minecraftVersion) &&
                        (contentType !== "mod" || !instance.loader || instance.loader === "vanilla" ||
                            v.loaders?.includes(instance.loader)
                        )
                    );
                    bestVersionId = (compatible || versions[0]).id;
                }
            }

            if (!bestVersionId) {
                toast.error("ไม่พบเวอร์ชันที่เข้ากันได้");
                return;
            }

            setInstallProgress({ message: "กำลังดาวน์โหลด...", percent: 0 });

            // Download to instance
            const dlResult = await window.api?.contentDownloadToInstance?.({
                projectId: project.project_id,
                versionId: bestVersionId,
                instanceId: instance.id,
                contentType: contentType,
            });

            if (dlResult?.ok) {
                toast.success(`ติดตั้ง ${project.title} สำเร็จ`);
                onInstalled();
            } else {
                toast.error(dlResult?.error || "ติดตั้งไม่สำเร็จ");
            }
        } catch (error: any) {
            console.error("[ContentBrowser] Install error:", error);
            toast.error(error?.message || "เกิดข้อผิดพลาด");
        } finally {
            setInstallingProjectId(null);
            setInstallProgress(null);
        }
    };

    const formatNumber = (num: number): string => {
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
        return num.toString();
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: colors.surface }}>
            {/* Title Bar with Logo */}
            <div className="flex items-center h-10 px-4 drag-region" style={{ backgroundColor: colors.secondary }}>
                <div className="flex items-center gap-2 no-drag">
                    <img src="./r.svg" alt="Reality Launcher" className="w-8 h-8 rounded-lg" />
                    <span className="font-semibold" style={{ color: "#1a1a1a" }}>Reality</span>
                </div>
            </div>

            {/* Header Row: Back + Search + Source Toggle */}
            <div className="flex items-center gap-4 px-6 py-3 border-b" style={{ borderColor: colors.outline + "30" }}>
                {/* Back Button */}
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 text-sm transition-colors hover:opacity-80"
                    style={{ color: colors.onSurfaceVariant }}
                >
                    <i className="fa-solid fa-arrow-left text-xs"></i>
                    กลับ
                </button>

                {/* Search Bar - Center */}
                <div className="flex-1 flex justify-center">
                    <div className="relative w-full max-w-lg">
                        <input
                            type="text"
                            placeholder="ค้นหา..."
                            value={searchQuery}
                            onChange={(e) => handleDebouncedSearch(e.target.value)}
                            className="w-full px-4 py-2 pl-9 rounded-lg text-sm"
                            style={{
                                backgroundColor: colors.surfaceContainerHighest,
                                color: colors.onSurface,
                                border: `1px solid ${colors.outline}30`,
                            }}
                        />
                        <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: colors.onSurfaceVariant }}></i>
                    </div>
                </div>

                {/* Source Toggle - Right */}
                <div className="flex items-center gap-1 p-1 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                    <button
                        onClick={() => { setContentSource("modrinth"); setPage(1); }}
                        className="px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                        style={{
                            backgroundColor: contentSource === "modrinth" ? "#1bd96a" : "transparent",
                            color: contentSource === "modrinth" ? "#000" : colors.onSurfaceVariant,
                        }}
                    >
                        <img src={modrinthIcon.src} alt="" className="w-4 h-4" />
                        Modrinth
                    </button>
                    <button
                        onClick={() => { setContentSource("curseforge"); setPage(1); }}
                        className="px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                        style={{
                            backgroundColor: contentSource === "curseforge" ? "#f16436" : "transparent",
                            color: contentSource === "curseforge" ? "#fff" : colors.onSurfaceVariant,
                        }}
                    >
                        <img src={curseforgeIcon.src} alt="" className="w-4 h-4" />
                        CurseForge
                    </button>
                </div>
            </div>

            {/* Header Row 2: Tabs + Sort + Pagination */}
            <div className="flex items-center justify-between px-6 py-2 border-b" style={{ borderColor: colors.outline + "20" }}>
                {/* Category Tabs */}
                <div className="flex items-center gap-1">
                    {CONTENT_TABS.map((tab) => (
                        <button
                            key={tab.type}
                            onClick={() => { setContentType(tab.type); setPage(1); setSearchQuery(""); setDebouncedQuery(""); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                            style={{
                                backgroundColor: contentType === tab.type ? colors.secondary : "transparent",
                                color: contentType === tab.type ? "#1a1a1a" : colors.onSurfaceVariant,
                            }}
                        >
                            <i className={`fa-solid ${tab.icon} text-[10px]`}></i>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Sort + Pagination */}
                <div className="flex items-center gap-2">
                    <select
                        value={sortBy}
                        onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                        className="px-3 py-1.5 rounded-lg text-xs"
                        style={{
                            backgroundColor: colors.surfaceContainerHighest,
                            color: colors.onSurface,
                            border: `1px solid ${colors.outline}30`,
                        }}
                    >
                        {SORT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>

                    <select
                        value={viewCount}
                        onChange={(e) => { setViewCount(Number(e.target.value)); setPage(1); }}
                        className="px-2 py-1.5 rounded-lg text-xs"
                        style={{
                            backgroundColor: colors.surfaceContainerHighest,
                            color: colors.onSurface,
                            border: `1px solid ${colors.outline}30`,
                        }}
                    >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                    </select>

                    {/* Pagination */}
                    {totalPages > 0 && (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage(Math.max(1, page - 1))}
                                disabled={page === 1}
                                className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-40"
                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                                <i className="fa-solid fa-chevron-left text-xs"></i>
                            </button>
                            <span className="text-xs px-2" style={{ color: colors.onSurfaceVariant }}>
                                {page}/{totalPages}
                            </span>
                            <button
                                onClick={() => setPage(Math.min(totalPages, page + 1))}
                                disabled={page >= totalPages}
                                className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-40"
                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                                <i className="fa-solid fa-chevron-right text-xs"></i>
                            </button>
                        </div>
                    )}

                    {/* Results count */}
                    <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                        {totalHits.toLocaleString()} รายการ
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <i className="fa-solid fa-spinner fa-spin text-2xl mb-2" style={{ color: colors.secondary }}></i>
                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>กำลังโหลด...</p>
                        </div>
                    </div>
                ) : results.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <i className="fa-solid fa-box-open text-3xl mb-3" style={{ color: colors.onSurfaceVariant }}></i>
                            <p className="font-medium" style={{ color: colors.onSurface }}>ไม่พบผลลัพธ์</p>
                            <p className="text-sm mt-1" style={{ color: colors.onSurfaceVariant }}>
                                ลองค้นหาด้วยคำอื่น หรือเปลี่ยนแหล่งที่มา
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {results.map((project) => {
                                const isInstalling = installingProjectId === project.project_id;
                                return (
                                    <div
                                        key={project.project_id}
                                        className="rounded-lg p-4 transition-colors"
                                        style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}20` }}
                                    >
                                        <div className="flex items-start gap-3">
                                            {/* Icon */}
                                            <div
                                                className="w-12 h-12 rounded-lg bg-cover bg-center flex-shrink-0 flex items-center justify-center"
                                                style={{
                                                    backgroundImage: project.icon_url ? `url(${project.icon_url})` : undefined,
                                                    backgroundColor: colors.surfaceContainerHighest,
                                                }}
                                            >
                                                {!project.icon_url && <i className="fa-solid fa-cube" style={{ color: colors.onSurfaceVariant }}></i>}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium truncate" style={{ color: colors.onSurface }}>
                                                    {project.title}
                                                </p>
                                                <p className="text-xs truncate" style={{ color: colors.onSurfaceVariant }}>
                                                    by {project.author}
                                                </p>
                                            </div>
                                        </div>

                                        <p className="text-xs mt-2 line-clamp-2" style={{ color: colors.onSurfaceVariant }}>
                                            {project.description}
                                        </p>

                                        {/* Stats + Install */}
                                        <div className="flex items-center justify-between mt-3">
                                            <div className="flex items-center gap-3 text-xs" style={{ color: colors.onSurfaceVariant }}>
                                                <span className="flex items-center gap-1">
                                                    <i className="fa-solid fa-download text-[10px]"></i>
                                                    {formatNumber(project.downloads)}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <i className="fa-solid fa-heart text-[10px]"></i>
                                                    {formatNumber(project.follows)}
                                                </span>
                                            </div>

                                            <button
                                                onClick={() => handleInstall(project)}
                                                disabled={isInstalling || installingProjectId !== null}
                                                className="w-8 h-8 rounded-md text-sm flex items-center justify-center disabled:opacity-50"
                                                style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                                title="Add"
                                            >
                                                {isInstalling ? (
                                                    <i className="fa-solid fa-spinner fa-spin"></i>
                                                ) : (
                                                    <i className="fa-solid fa-plus"></i>
                                                )}
                                            </button>
                                        </div>

                                        {/* Progress bar */}
                                        {isInstalling && installProgress && (
                                            <div className="mt-3">
                                                <p className="text-xs mb-1" style={{ color: colors.onSurfaceVariant }}>
                                                    {installProgress.message}
                                                </p>
                                                {installProgress.percent !== undefined && (
                                                    <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                                        <div
                                                            className="h-full transition-all"
                                                            style={{

                                                                width: `${installProgress.percent}%`,
                                                                backgroundColor: colors.secondary,
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Bottom Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 mt-6 pb-4">
                                <button
                                    onClick={() => setPage(Math.max(1, page - 1))}
                                    disabled={page === 1}
                                    className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-40"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                >
                                    <i className="fa-solid fa-chevron-left text-xs"></i>
                                </button>

                                <button
                                    onClick={() => setPage(1)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                                    style={{
                                        backgroundColor: page === 1 ? colors.secondary : colors.surfaceContainerHighest,
                                        color: page === 1 ? "#1a1a1a" : colors.onSurface,
                                    }}
                                >
                                    1
                                </button>

                                {totalPages >= 2 && (
                                    <button
                                        onClick={() => setPage(2)}
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                                        style={{
                                            backgroundColor: page === 2 ? colors.secondary : colors.surfaceContainerHighest,
                                            color: page === 2 ? "#1a1a1a" : colors.onSurface,
                                        }}
                                    >
                                        2
                                    </button>
                                )}

                                {totalPages > 3 && (
                                    <>
                                        <span className="text-xs px-1" style={{ color: colors.onSurfaceVariant }}>...</span>
                                        <button
                                            onClick={() => setPage(totalPages)}
                                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                                            style={{
                                                backgroundColor: page === totalPages ? colors.secondary : colors.surfaceContainerHighest,
                                                color: page === totalPages ? "#1a1a1a" : colors.onSurface,
                                            }}
                                        >
                                            {totalPages}
                                        </button>
                                    </>
                                )}

                                {totalPages === 3 && (
                                    <button
                                        onClick={() => setPage(3)}
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                                        style={{
                                            backgroundColor: page === 3 ? colors.secondary : colors.surfaceContainerHighest,
                                            color: page === 3 ? "#1a1a1a" : colors.onSurface,
                                        }}
                                    >
                                        3
                                    </button>
                                )}

                                <button
                                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                                    disabled={page >= totalPages}
                                    className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-40"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                >
                                    <i className="fa-solid fa-chevron-right text-xs"></i>
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
