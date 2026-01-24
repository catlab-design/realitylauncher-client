/**
 * InstanceContentBrowser - Browse and install content to a specific instance
 * Uses same design as Explore page, pre-filtered by instance's MC version and loader
 */

import { useState, useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import type { GameInstance, LauncherConfig } from "../../types/launcher";
import { playClick } from "../../lib/sounds";
import { useTranslation } from "../../hooks/useTranslation";

// Icons for content sources
import modrinthIcon from "../../assets/modrinth.svg";
import curseforgeIcon from "../../assets/curseforge.svg";

// Import shared components from ExploreTabs
import {
    type ModrinthProject,
    type ModVersion,
    type ContentSource,
    CONTENT_SOURCES,
    matchesVersion,
    ProjectCard,
    ImagePreviewModal,
    normalizeImageUrl,
} from "./ExploreTabs";
import { Icons } from "../ui/Icons";
import bannerImage from "../../assets/banner.png";

type ContentType = "mod" | "resourcepack" | "shader" | "datapack";

interface InstanceContentBrowserProps {
    instance: GameInstance;
    contentType: ContentType;
    colors: any;
    config?: LauncherConfig;
    onClose: () => void;
    onInstalled: () => void;
}

// ========================================
// Constants
// ========================================

const SORT_OPTIONS = [
    { value: "relevance", labelKey: "sort.relevance" },
    { value: "downloads", labelKey: "sort.downloads" },
    { value: "follows", labelKey: "sort.follows" },
    { value: "newest", labelKey: "sort.newest" },
    { value: "updated", labelKey: "sort.updated" },
];

const CONTENT_TABS: { type: ContentType; labelKey: string }[] = [
    { type: "mod", labelKey: "mods" },
    { type: "resourcepack", labelKey: "resourcepacks" },
    { type: "datapack", labelKey: "datapacks" },
    { type: "shader", labelKey: "shaders" },
];

// Filter tabs based on instance loader
const getAvailableTabs = (loader: string) => {
    if (loader === "vanilla") {
        // Vanilla doesn't support mods
        return CONTENT_TABS.filter(tab => tab.type !== "mod");
    }
    return CONTENT_TABS;
};

// ========================================
// Component
// ========================================

export function InstanceContentBrowser({
    instance,
    contentType: initialContentType,
    colors,
    config,
    onClose,
    onInstalled,
}: InstanceContentBrowserProps) {
    const { t } = useTranslation(config?.language);
    // Content state
    const [contentType, setContentType] = useState<ContentType>(initialContentType);
    const [contentSource, setContentSource] = useState<ContentSource>(CONTENT_SOURCES.MODRINTH);

    // Search state
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState("relevance");
    const [page, setPage] = useState(1);
    const [viewCount, setViewCount] = useState(20);

    // Results state
    const [results, setResults] = useState<ModrinthProject[]>([]);
    const [totalHits, setTotalHits] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    // Preview state
    const [previewProject, setPreviewProject] = useState<ModrinthProject | null>(null);

    // Install state
    const [isInstalling, setIsInstalling] = useState(false);
    const [selectedProject, setSelectedProject] = useState<ModrinthProject | null>(null);
    const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
    const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());

    // Lightbox state
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

    // Helper to get URL from raw image item - normalize to absolute URL when possible
    const getImageUrl = (item: any) => {
        if (!item) return null;
        if (typeof item === 'string') return normalizeImageUrl(item, 'modrinth');

        // Use raw_url (or rawUrl from native) if available (high res), otherwise fallback to url
        // Then normalize the resulting URL
        const candidate = item.rawUrl || item.raw_url || item.url || null;
        return normalizeImageUrl(candidate, 'modrinth');
    };

    // Debounce
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    const totalPages = Math.ceil(totalHits / viewCount);

    // ========================================
    // Data Loading
    // ========================================

    // Fetch full project details for better images (Modrinth only)
    const fetchFullProjectDetails = async (project: ModrinthProject) => {
        // Skip for CurseForge or if we already have gallery objects and high-res icon
        if (contentSource !== CONTENT_SOURCES.MODRINTH) return;

        // If we already have object-type gallery items (contain 'ordering/created'), likely already fetched
        // Check first item type


        try {
            const rawProject = await window.api?.modrinthGetProject?.(project.project_id);
            if (rawProject) {
                // Normalize and merge
                const fullProject: ModrinthProject = {
                    ...project,
                    gallery: rawProject.gallery || [], // Native now returns objects
                    // Preserve existing featured_gallery (from search) to prevent banner reload/flash
                    // Only update if currently null
                    featured_gallery: project.featured_gallery || rawProject.featured_gallery || null,
                    icon_url: rawProject.icon_url || project.icon_url, // Prefer full resolution
                };

                // Update preview if still selected (avoid race condition)
                setPreviewProject(prev => {
                    if (prev && prev.project_id === project.project_id) {
                        return fullProject;
                    }
                    return prev;
                });
            }
        } catch (err) {
            console.error("Failed to fetch full project details:", err);
        }
    };

    // Load installed content names from instance
    const loadInstalledContent = useCallback(async () => {
        try {
            let items: any[] = [];
            switch (contentType) {
                case "mod": {
                    const result = await window.api?.instanceListMods?.(instance.id);
                    items = result?.mods || [];
                    break;
                }
                case "resourcepack": {
                    const result = await window.api?.instanceListResourcepacks?.(instance.id);
                    items = result?.items || [];
                    break;
                }
                case "shader": {
                    const result = await window.api?.instanceListShaders?.(instance.id);
                    items = result?.items || [];
                    break;
                }
                case "datapack": {
                    const result = await window.api?.instanceListDatapacks?.(instance.id);
                    items = result?.items || [];
                    break;
                }
            }
            // Extract names and slugs (lowercase for comparison)
            const names = new Set<string>();
            for (const item of items) {
                const filename = (item.filename || "").toLowerCase().replace(/\.jar$|\.zip$/, "");
                const name = (item.name || "").toLowerCase();
                if (filename) names.add(filename);
                if (name) names.add(name);
                // Also add slug-like version (replace spaces with -)
                if (name) names.add(name.replace(/\s+/g, "-"));
            }
            setInstalledNames(names);
        } catch (error) {
            console.error("[ContentBrowser] Load installed content error:", error);
        }
    }, [instance.id, contentType]);

    // Normalize string for comparison
    const normalizeForMatch = (str: string): string => {
        return str.toLowerCase()
            .replace(/[^a-z0-9]/g, "") // Remove all non-alphanumeric
            .trim();
    };

    // Check if a project is installed (by matching name)
    const isProjectInstalled = useCallback((project: ModrinthProject): boolean => {
        if (installedIds.has(project.project_id)) return true;

        // Normalize project title and slug
        const projectTitle = normalizeForMatch(project.title);
        const projectSlug = project.slug ? normalizeForMatch(project.slug) : "";

        for (const name of installedNames) {
            const normalizedName = normalizeForMatch(name);
            // Check various matches
            if (normalizedName.includes(projectTitle) || projectTitle.includes(normalizedName)) {
                return true;
            }
            if (projectSlug && (normalizedName.includes(projectSlug) || projectSlug.includes(normalizedName))) {
                return true;
            }
        }
        return false;
    }, [installedIds, installedNames]);

    // Load installed content on mount and when content type changes
    useEffect(() => {
        loadInstalledContent();
    }, [loadInstalledContent]);

    const loadProjects = useCallback(async () => {
        setIsLoading(true);
        try {
            if (contentSource === CONTENT_SOURCES.CURSEFORGE) {
                const result = await window.api?.curseforgeSearch?.({
                    query: searchQuery,
                    projectType: contentType,
                    gameVersion: instance.minecraftVersion,
                    sortBy: sortBy === "downloads" ? "downloads" : sortBy === "updated" ? "updated" : "relevance",
                    pageSize: viewCount,
                    index: (page - 1) * viewCount,
                });

                if (result?.data) {
                    const mapped: ModrinthProject[] = result.data.map((cf: any) => ({
                        slug: cf.slug || cf.id.toString(),
                        title: cf.name,
                        description: cf.summary,
                        categories: cf.categories?.map((c: any) => c.name) || [],
                        downloads: cf.downloadCount,
                        icon_url: normalizeImageUrl(cf.logo?.url || null, 'curseforge'),
                        project_id: cf.id.toString(),
                        author: cf.authors?.[0]?.name || "Unknown",
                        versions: cf.latestFiles?.flatMap((f: any) => f.gameVersions) || [],
                        follows: cf.thumbsUpCount || 0,
                        client_side: "required",
                        server_side: "optional",
                        gallery: cf.screenshots?.map((s: any) => s.url) || [],
                        featured_gallery: cf.screenshots?.[0]?.url || null,
                    }));
                    setResults(mapped);
                    setTotalHits(result.pagination?.totalCount || mapped.length);
                }
            } else {
                const result = await window.api?.modrinthSearch?.({
                    query: searchQuery,
                    projectType: contentType,
                    gameVersion: instance.minecraftVersion,
                    loader: contentType === "mod" && instance.loader !== "vanilla" ? instance.loader : undefined,
                    sortBy: sortBy,
                    limit: viewCount,
                    offset: (page - 1) * viewCount,
                });

                if (result?.hits) {
                    const mapped: ModrinthProject[] = result.hits.map((mr: any) => ({
                        slug: mr.slug,
                        title: mr.title,
                        description: mr.description,
                        categories: mr.categories || mr.display_categories || [],
                        downloads: mr.downloads,
                        icon_url: normalizeImageUrl(mr.icon_url || null, 'modrinth'),
                        project_id: mr.project_id,
                        author: mr.author || "Unknown",
                        versions: mr.versions || [],
                        game_versions: mr.game_versions || [],
                        loaders: mr.loaders || [],
                        follows: mr.follows || 0,
                        client_side: mr.client_side,
                        server_side: mr.server_side,
                        gallery: mr.gallery || [],
                        featured_gallery: mr.featured_gallery || null,
                        color: mr.color,
                    }));
                    setResults(mapped);
                    setTotalHits(result.total_hits || 0);
                }
            }
        } catch (error) {
            console.error("[ContentBrowser] Search error:", error);
            toast.error(t("search_failed"));
        } finally {
            setIsLoading(false);
        }
    }, [searchQuery, contentSource, contentType, sortBy, page, viewCount, instance]);

    // Fetch full project details for gallery


    useEffect(() => {
        loadProjects();
    }, [contentSource, contentType, sortBy, page, viewCount]);

    // Update preview when results change
    useEffect(() => {
        if (!results || results.length === 0) {
            setPreviewProject(null);
            return;
        }
        if (!previewProject) {
            handleSelectProject(results[0]);
            return;
        }
        const stillExists = results.some((p) => p.project_id === previewProject.project_id);
        if (!stillExists) handleSelectProject(results[0]);
    }, [results]);

    // ========================================
    // Handlers
    // ========================================

    const handleDebouncedSearch = useCallback((value: string) => {
        setSearchQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setPage(1);
            loadProjects();
        }, 300);
    }, [loadProjects]);

    const handleSelectProject = (project: ModrinthProject) => {
        setPreviewProject(project);
        // Fetch full details in background to upgrade images
        fetchFullProjectDetails(project);
    };

    // Find best compatible version for instance
    const findCompatibleVersion = (versions: ModVersion[]): ModVersion | null => {
        const instanceLoader = instance.loader?.toLowerCase() || "vanilla";
        const instanceVersion = instance.minecraftVersion;
        const isResourceContent = contentType === "resourcepack" || contentType === "shader" || contentType === "datapack";

        for (const version of versions) {
            const versionMatch = version.game_versions.some(gv => matchesVersion(gv, instanceVersion));
            if (!versionMatch) continue;

            // For resource packs/shaders/datapacks, only check MC version
            if (isResourceContent) return version;

            // For mods, check loader compatibility
            if (instanceLoader === "vanilla") return version;
            if (version.loaders.length === 0) return version;

            const vLoaders = version.loaders.map(l => l.toLowerCase());
            if (vLoaders.includes(instanceLoader)) return version;
            if (instanceLoader === "quilt" && vLoaders.includes("fabric")) return version;
        }

        return null;
    };

    // Handle install button click - auto install best compatible version
    const handleAddToInstance = async (project: ModrinthProject) => {
        // Block mod installation on vanilla instances
        if (contentType === "mod" && instance.loader === "vanilla") {
            toast.error(t("cannot_install_mod_vanilla"));
            return;
        }

        setSelectedProject(project);
        setIsInstalling(true);

        try {
            let loadedVersions: ModVersion[] = [];
            const KNOWN_LOADERS = ["fabric", "forge", "neoforge", "quilt"];

            if (contentSource === CONTENT_SOURCES.CURSEFORGE) {
                const result = await window.api?.curseforgeGetFiles?.(project.project_id);
                if (result?.data) {
                    loadedVersions = result.data.map((f: any) => {
                        const loaders: string[] = [];
                        const gameVersions: string[] = [];

                        if (f.gameVersions) {
                            for (const gv of f.gameVersions) {
                                const lower = gv?.toLowerCase();
                                if (KNOWN_LOADERS.includes(lower)) {
                                    if (!loaders.includes(lower)) loaders.push(lower);
                                } else if (gv) {
                                    gameVersions.push(gv);
                                }
                            }
                        }

                        return {
                            id: f.id.toString(),
                            name: f.displayName,
                            version_number: f.displayName || f.fileName,
                            game_versions: gameVersions,
                            loaders: loaders,
                            files: [{ filename: f.fileName, primary: true, url: f.downloadUrl || "" }],
                        };
                    });
                }
            } else {
                const result = await window.api?.modrinthGetVersions?.(project.project_id);
                if (result) {
                    loadedVersions = result.map((v: any) => ({
                        id: v.id,
                        name: v.name,
                        version_number: v.versionNumber || v.version_number,
                        game_versions: v.gameVersions || v.game_versions || [],
                        loaders: v.loaders || [],
                        files: v.files?.map((f: any) => ({
                            filename: f.filename,
                            primary: f.primary,
                            url: f.url,
                        })) || [],
                    }));
                }
            }

            // Find best compatible version automatically
            const bestVersion = findCompatibleVersion(loadedVersions);

            if (!bestVersion) {
                toast.error(t("no_compatible_version_for").replace("{version}", instance.minecraftVersion).replace("{loader}", instance.loader || "vanilla"));
                setIsInstalling(false);
                setSelectedProject(null);
                return;
            }

            // Install directly
            const result = await window.api?.contentDownloadToInstance?.({
                projectId: project.project_id,
                versionId: bestVersion.id,
                instanceId: instance.id,
                contentType: contentType,
                contentSource: contentSource,
            });

            if (result?.ok) {
                toast.success(t("install_success_name").replace("{name}", project.title));
                // Track installed project
                setInstalledIds(prev => new Set(prev).add(project.project_id));
                // Refresh installed content list
                loadInstalledContent();
                // Notify parent but don't close
                onInstalled();
            } else {
                toast.error(result?.error || t("install_failed"));
            }
        } catch (error: any) {
            console.error("[ContentBrowser] Install error:", error);
            toast.error(error?.message || t("error_occurred"));
        } finally {
            setIsInstalling(false);
            setSelectedProject(null);
        }
    };

    // ========================================
    // Render
    // ========================================


    return (
        <div className="fixed top-16 bottom-0 left-20 right-0 z-40 overflow-auto" style={{ backgroundColor: colors.surface }}>
            {selectedImageIndex !== null && previewProject && previewProject.gallery && (
                <ImagePreviewModal
                    colors={colors}
                    imageUrl={getImageUrl(previewProject.gallery[selectedImageIndex]) || ""}
                    onClose={() => setSelectedImageIndex(null)}
                    onNext={() => {
                        if (previewProject?.gallery && selectedImageIndex !== null && selectedImageIndex < previewProject.gallery.length - 1) {
                            setSelectedImageIndex(selectedImageIndex + 1);
                        }
                    }}
                    onPrev={() => {
                        if (previewProject?.gallery && selectedImageIndex !== null && selectedImageIndex > 0) {
                            setSelectedImageIndex(selectedImageIndex - 1);
                        }
                    }}
                    hasNext={previewProject?.gallery ? selectedImageIndex < previewProject.gallery.length - 1 : false}
                    hasPrev={selectedImageIndex > 0}
                    preloadUrls={(() => {
                        const urls: string[] = [];
                        if (previewProject?.gallery && selectedImageIndex !== null) {
                            // Preload Next
                            if (selectedImageIndex < previewProject.gallery.length - 1) {
                                const next = getImageUrl(previewProject.gallery[selectedImageIndex + 1]);
                                if (next) urls.push(next);
                            }
                            // Preload Prev
                            if (selectedImageIndex > 0) {
                                const prev = getImageUrl(previewProject.gallery[selectedImageIndex - 1]);
                                if (prev) urls.push(prev);
                            }
                        }
                        return urls;
                    })()}
                    imageIndex={selectedImageIndex}
                    totalImages={previewProject?.gallery ? previewProject.gallery.length : 0}
                />
            )}
            {/* Content wrapper with padding */}
            <div className="p-6 space-y-4">
                {/* Toolbar */}
                <div className="rounded-lg" style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}30` }}>
                    {/* Top row: Back + Instance Info + Search + Source */}
                    <div className="px-4 py-3 flex items-center gap-4 border-b" style={{ borderColor: colors.outline + "30" }}>
                        <button
                            onClick={() => { playClick(); onClose(); }}
                            className="flex items-center gap-2 text-sm hover:opacity-80"
                            style={{ color: colors.onSurfaceVariant }}
                        >
                            <i className="fa-solid fa-arrow-left"></i>
                            {t('back')}
                        </button>

                        <div className="flex items-center gap-2">
                            <span className="font-medium" style={{ color: colors.onSurface }}>{instance.name}</span>
                            <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>
                                {instance.minecraftVersion} • {instance.loader}
                            </span>
                        </div>

                        {/* Search - flex-1 to fill space */}
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                placeholder={t('search_content_placeholder' as any).replace('{type}', contentType === "mod" ? t('mods') : contentType === "resourcepack" ? t('resourcepacks') : contentType)}
                                value={searchQuery}
                                onChange={(e) => handleDebouncedSearch(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && loadProjects()}
                                className="w-full px-3 py-1.5 pl-8 rounded-md text-sm"
                                style={{
                                    backgroundColor: colors.surface,
                                    border: `1px solid ${colors.outline}40`,
                                    color: colors.onSurface,
                                }}
                            />
                            <i className="fa-solid fa-search text-xs absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: colors.onSurfaceVariant }}></i>
                        </div>

                        {/* Source Toggle - right side */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                                onClick={() => { playClick(); setContentSource(CONTENT_SOURCES.MODRINTH); setPage(1); }}
                                className="px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                                style={{
                                    backgroundColor: contentSource === CONTENT_SOURCES.MODRINTH ? "#1bd96a" : "transparent",
                                    color: contentSource === CONTENT_SOURCES.MODRINTH ? "#000" : colors.onSurfaceVariant,
                                }}
                            >
                                <img src={modrinthIcon.src} alt="" className="w-4 h-4" />
                                Modrinth
                            </button>
                            <button
                                onClick={() => { playClick(); setContentSource(CONTENT_SOURCES.CURSEFORGE); setPage(1); }}
                                className="px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                                style={{
                                    backgroundColor: contentSource === CONTENT_SOURCES.CURSEFORGE ? "#f16436" : "transparent",
                                    color: contentSource === CONTENT_SOURCES.CURSEFORGE ? "#fff" : colors.onSurfaceVariant,
                                }}
                            >
                                <img src={curseforgeIcon.src} alt="" className="w-4 h-4" />
                                CurseForge
                            </button>
                        </div>
                    </div>

                    {/* Bottom row: Tabs + Filters */}
                    <div className="px-4 py-2 flex items-center gap-2">
                        {/* Type tabs */}
                        <div className="flex items-center gap-1">
                            {getAvailableTabs(instance.loader).map((tab) => (
                                <button
                                    key={tab.type}
                                    onClick={() => { playClick(); setContentType(tab.type); setPage(1); }}
                                    className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                                    style={{
                                        backgroundColor: contentType === tab.type ? colors.secondary : "transparent",
                                        color: contentType === tab.type ? "#1a1a1a" : colors.onSurfaceVariant,
                                    }}
                                >
                                    {t(tab.labelKey as any)}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1" />

                        {/* Filters */}
                        <div className="flex items-center gap-2">
                            <select
                                value={sortBy}
                                onChange={(e) => { playClick(); setSortBy(e.target.value); setPage(1); }}
                                className="px-2 py-1 rounded-md text-xs"
                                style={{
                                    backgroundColor: colors.surface,
                                    border: `1px solid ${colors.outline}40`,
                                    color: colors.onSurface,
                                }}
                            >
                                {SORT_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{t(opt.labelKey as any)}</option>
                                ))}
                            </select>

                            <select
                                value={viewCount}
                                onChange={(e) => { playClick(); setViewCount(Number(e.target.value)); setPage(1); }}
                                className="px-2 py-1 rounded-md text-xs"
                                style={{
                                    backgroundColor: colors.surface,
                                    border: `1px solid ${colors.outline}40`,
                                    color: colors.onSurface,
                                }}
                            >
                                {[10, 20, 50].map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>

                            {/* Pagination */}
                            {totalPages > 0 && (
                                <div className="flex items-center gap-1 ml-2">
                                    <button
                                        onClick={() => { playClick(); setPage(Math.max(1, page - 1)); }}
                                        disabled={page === 1}
                                        className="w-6 h-6 rounded flex items-center justify-center disabled:opacity-40 text-xs"
                                        style={{ backgroundColor: colors.surface, color: colors.onSurface }}
                                    >
                                        <i className="fa-solid fa-chevron-left text-[10px]"></i>
                                    </button>
                                    <span className="text-xs px-1.5" style={{ color: colors.onSurfaceVariant }}>
                                        {page}/{totalPages}
                                    </span>
                                    <button
                                        onClick={() => { playClick(); setPage(Math.min(totalPages, page + 1)); }}
                                        disabled={page >= totalPages}
                                        className="w-6 h-6 rounded flex items-center justify-center disabled:opacity-40 text-xs"
                                        style={{ backgroundColor: colors.surface, color: colors.onSurface }}
                                    >
                                        <i className="fa-solid fa-chevron-right text-[10px]"></i>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Content - Grid layout like Explore */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Project List */}
                    <div className="lg:col-span-8 xl:col-span-9">
                        <div className="flex flex-col gap-4">
                            {/* Header Stats */}
                            {!isLoading && (
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-xs font-medium" style={{ color: colors.onSurfaceVariant }}>
                                        {t('results_count' as any).replace('{count}', totalHits.toLocaleString())}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full"
                                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>
                                        Page {page} of {Math.max(1, totalPages)}
                                    </span>
                                </div>
                            )}

                            {/* Grid Content */}
                            {isLoading ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {Array.from({ length: 9 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="rounded-xl overflow-hidden p-4 flex gap-4 animate-skeleton-wave"
                                            style={{
                                                backgroundColor: `${colors.surfaceContainer}60`,
                                                border: `1px solid ${colors.outline}15`,
                                                animationDelay: `${Math.min(i * 30, 150)}ms`
                                            }}
                                        >
                                            {/* Icon skeleton */}
                                            <div className="w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden relative"
                                                style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                                {/* Gradient removed */}
                                            </div>
                                            {/* Text skeleton */}
                                            <div className="flex-1 space-y-2">
                                                <div className="h-4 rounded overflow-hidden relative" style={{ width: `${60 + (i % 3) * 15}%`, backgroundColor: colors.surfaceContainerHighest }}>
                                                    {/* Gradient removed */}
                                                </div>
                                                <div className="h-3 rounded overflow-hidden relative" style={{ width: `${40 + (i % 4) * 10}%`, backgroundColor: colors.surfaceContainerHighest }}>
                                                    {/* Gradient removed */}
                                                </div>
                                                <div className="h-3 rounded overflow-hidden relative mt-2" style={{ width: '100%', backgroundColor: colors.surfaceContainerHighest }}>
                                                    {/* Gradient removed */}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : results.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed"
                                    style={{ borderColor: colors.outline + "40", color: colors.onSurfaceVariant }}>
                                    <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                                        style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                        <i className="fa-solid fa-box-open text-2xl opacity-50"></i>
                                    </div>
                                    <h3 className="text-sm font-medium mb-1" style={{ color: colors.onSurface }}>{t('no_results')}</h3>
                                    <p className="text-xs opacity-70">{t('try_change_filters')}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 pb-4">
                                    {results.map((project, index) => (
                                        <div
                                            key={project.project_id}
                                            className="animate-card-appear"
                                            style={{ animationDelay: `${Math.min(index * 20, 150)}ms` }}
                                        >
                                            <ProjectCard
                                                colors={colors}
                                                project={project}
                                                isActive={previewProject?.project_id === project.project_id}
                                                onClick={() => handleSelectProject(project)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Pagination Bottom */}
                            {totalPages > 1 && (
                                <div className="flex justify-center mt-6">
                                    <div className="flex items-center gap-2 p-1 rounded-lg"
                                        style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}20` }}>

                                        <button
                                            onClick={() => {
                                                playClick();
                                                const newPage = Math.max(1, page - 1);
                                                setPage(newPage);
                                                // Scroll to top of list
                                                document.querySelector('.lg\\:col-span-8')?.scrollIntoView({ behavior: 'smooth' });
                                            }}
                                            disabled={page === 1}
                                            className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-40 hover:bg-white/5 transition-colors flex items-center gap-1.5"
                                            style={{ color: colors.onSurface }}
                                        >
                                            <i className="fa-solid fa-chevron-left text-[10px]"></i>
                                            {t('previous')}
                                        </button>

                                        <div className="px-3 min-w-[80px] text-center" style={{ color: colors.onSurfaceVariant }}>
                                            <span className="text-xs font-bold" style={{ color: colors.onSurface }}>{page}</span>
                                            <span className="text-[10px] opacity-70 mx-1">/</span>
                                            <span className="text-xs opacity-70">{totalPages}</span>
                                        </div>

                                        <button
                                            onClick={() => {
                                                playClick();
                                                const newPage = Math.min(totalPages, page + 1);
                                                setPage(newPage);
                                                // Scroll to top of list
                                                document.querySelector('.lg\\:col-span-8')?.scrollIntoView({ behavior: 'smooth' });
                                            }}
                                            disabled={page >= totalPages}
                                            className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-40 hover:bg-white/5 transition-colors flex items-center gap-1.5"
                                            style={{ color: colors.onSurface }}
                                        >
                                            {t('next')}
                                            <i className="fa-solid fa-chevron-right text-[10px]"></i>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Preview Panel */}
                    <div className="lg:col-span-4 xl:col-span-3">
                        {previewProject ? (
                            <div className="rounded-2xl overflow-hidden sticky top-4 flex flex-col shadow-xl"
                                style={{
                                    backgroundColor: colors.surfaceContainer,
                                    border: `1px solid ${colors.outline}20`,
                                    minHeight: "400px"
                                }}>
                                {/* Hero Header */}
                                <div className="relative h-48 w-full bg-cover bg-center shrink-0"
                                    style={{
                                        backgroundColor: colors.surfaceContainerHighest,
                                        backgroundImage: (() => {
                                            const raw = previewProject.featured_gallery || (previewProject.gallery && previewProject.gallery.length > 0 ? previewProject.gallery[0] : null);
                                            let url = getImageUrl(raw);
                                            if (!url) {
                                                url = bannerImage.src;
                                            }
                                            return `url(${url})`;
                                        })()
                                    }}>
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                                    {/* Installed Badge */}
                                    {isProjectInstalled(previewProject) && (
                                        <div className="absolute top-3 right-3 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1"
                                            style={{ backgroundColor: "#22c55e", color: "#fff" }}>
                                            <i className="fa-solid fa-check"></i>
                                            {t('installed' as any)}
                                        </div>
                                    )}

                                    {/* Floating Icon */}
                                    <div className="absolute -bottom-8 left-6 w-20 h-20 rounded-2xl shadow-2xl p-0.5 z-10"
                                        style={{ backgroundColor: colors.surface }}>
                                        <div className="w-full h-full rounded-[14px] bg-cover bg-center overflow-hidden"
                                            style={{
                                                backgroundImage: previewProject.icon_url ? `url(${previewProject.icon_url})` : undefined,
                                                backgroundColor: colors.surfaceContainerHighest
                                            }}>
                                            {!previewProject.icon_url && (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Icons.Box className="w-10 h-10 opacity-50" style={{ color: colors.onSurfaceVariant }} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-10 px-6 pb-6 flex-1 flex flex-col">
                                    {/* Header Content */}
                                    <div className="mb-4">
                                        <h2 className="text-xl font-bold mb-1 leading-tight" style={{ color: colors.onSurface }}>
                                            {previewProject.title}
                                        </h2>
                                        <div className="flex items-center gap-2 text-xs" style={{ color: colors.onSurfaceVariant }}>
                                            <span>by <span className="font-medium" style={{ color: colors.primary }}>{previewProject.author}</span></span>
                                            <span>•</span>
                                            <div className="flex items-center gap-1">
                                                <i className="fa-solid fa-download text-[10px]"></i>
                                                {previewProject.downloads >= 1000000
                                                    ? `${(previewProject.downloads / 1000000).toFixed(1)}M`
                                                    : previewProject.downloads >= 1000
                                                        ? `${(previewProject.downloads / 1000).toFixed(1)}K`
                                                        : previewProject.downloads}
                                            </div>
                                            <span>•</span>
                                            <div className="flex items-center gap-1">
                                                <i className="fa-solid fa-heart text-[10px]"></i>
                                                {previewProject.follows >= 1000
                                                    ? `${(previewProject.follows / 1000).toFixed(1)}K`
                                                    : previewProject.follows}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Categories */}
                                    {previewProject.categories && previewProject.categories.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mb-5">
                                            {previewProject.categories.slice(0, 6).map((cat) => (
                                                <span key={cat}
                                                    className="px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider"
                                                    style={{ backgroundColor: `${colors.secondary}20`, color: colors.secondary }}>
                                                    {cat}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Action Button */}
                                    <div className="mb-6">
                                        {isProjectInstalled(previewProject) ? (
                                            <div className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                                                style={{ backgroundColor: "#22c55e20", color: "#22c55e" }}>
                                                <i className="fa-solid fa-check"></i>
                                                {t('installed' as any)}
                                            </div>
                                        ) : contentType === "mod" && instance.loader === "vanilla" ? (
                                            <div className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                                                style={{ backgroundColor: "#f59e0b20", color: "#f59e0b" }}>
                                                <i className="fa-solid fa-ban"></i>
                                                {t('vanilla_no_mod' as any)}
                                            </div>
                                        ) : isInstalling && selectedProject?.project_id === previewProject.project_id ? (
                                            <div className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>
                                                <i className="fa-solid fa-spinner fa-spin"></i>
                                                {t('installing_progress' as any)}
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => { playClick(); handleAddToInstance(previewProject); }}
                                                disabled={isInstalling}
                                                className="w-full py-3 rounded-xl text-sm font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                                                style={{
                                                    backgroundColor: colors.secondary,
                                                    color: "#1a1a1a"
                                                }}
                                            >
                                                <i className="fa-solid fa-download"></i>
                                                {t('install')}
                                            </button>
                                        )}
                                    </div>

                                    {/* Description */}
                                    <div className="mb-6 flex-1">
                                        <h4 className="text-xs font-bold uppercase tracking-wider mb-2 opacity-70" style={{ color: colors.onSurfaceVariant }}>
                                            {t('about')}
                                        </h4>
                                        <p className="text-xs leading-relaxed opacity-90 whitespace-pre-line" style={{ color: colors.onSurface }}>
                                            {previewProject.description}
                                        </p>
                                    </div>

                                    {/* Gallery Preview */}
                                    {previewProject.gallery && previewProject.gallery.length > 0 && (
                                        <div className="mb-4">
                                            <h4 className="text-xs font-bold uppercase tracking-wider mb-2 opacity-70" style={{ color: colors.onSurfaceVariant }}>
                                                {t('gallery')}
                                            </h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                {previewProject.gallery.slice(0, 4).map((img, idx) => {
                                                    const isString = typeof img === 'string';
                                                    const url = isString ? img : img.url;
                                                    const rawUrl = isString ? img : (img.raw_url || img.url);

                                                    return (
                                                        <div
                                                            key={idx}
                                                            className="aspect-video rounded-lg overflow-hidden border cursor-pointer hover:opacity-80 transition-opacity"
                                                            style={{ borderColor: `${colors.outline}20` }}
                                                            onClick={() => { playClick(); setSelectedImageIndex(idx); }}
                                                        >
                                                            <img
                                                                src={url}
                                                                alt="Gallery"
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Footer Info */}
                                    <div className="pt-4 mt-auto border-t text-[10px]"
                                        style={{ borderColor: `${colors.outline}20`, color: colors.onSurfaceVariant }}>
                                        <span>ID: {previewProject.project_id}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full rounded-2xl flex flex-col items-center justify-center p-8 text-center sticky top-4 min-h-[400px]"
                                style={{
                                    backgroundColor: `${colors.surfaceContainer}40`,
                                    border: `1px solid ${colors.outline}10`,
                                    backdropFilter: "blur(20px)"
                                }}>
                                <div className="w-20 h-20 rounded-2xl mb-4 flex items-center justify-center"
                                    style={{ backgroundColor: `${colors.surfaceContainerHighest}80` }}>
                                    <i className="fa-solid fa-eye text-3xl opacity-30" style={{ color: colors.onSurfaceVariant }}></i>
                                </div>
                                <h3 className="text-sm font-medium mb-1" style={{ color: colors.onSurface }}>{t('select_item_to_view')}</h3>
                                <p className="text-xs opacity-60 max-w-[200px]" style={{ color: colors.onSurfaceVariant }}>
                                    {t('click_card_left_to_view')}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
