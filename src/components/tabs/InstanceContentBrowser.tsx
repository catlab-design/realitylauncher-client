import { useState, useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import type { GameInstance, LauncherConfig } from "../../types/launcher";
import { playClick } from "../../lib/sounds";
import { useTranslation } from "../../hooks/useTranslation";

import {
    type ModrinthProject,
    type ModVersion,
    type ContentSource,
    type ProjectType,
    type InstallProgress,
    CONTENT_SOURCES,
    SEARCH_DEBOUNCE_MS,
    matchesVersion,
    ExploreToolbar,
    ProjectList,
    ProjectPreview,
    ProjectDetailPage,
    normalizeModrinthFull,
    normalizeCurseforgeFull,
    normalizeModrinthSearchHit,
    normalizeCurseforgeSearchHit,
} from "./ExploreTabs";
import { Icons } from "../ui/Icons";

type ContentType = "mod" | "resourcepack" | "shader" | "datapack";

interface InstanceContentBrowserProps {
    instance: GameInstance;
    contentType: ContentType;
    colors: any;
    config?: LauncherConfig;
    onClose: () => void;
    onInstalled: () => void;
    onUpdate?: (id: string, updates: Partial<GameInstance>) => void;
}

const CONTENT_TYPES: ContentType[] = ["mod", "resourcepack", "datapack", "shader"];

const getAvailableTypes = (loader: string): ContentType[] =>
    loader === "vanilla" ? CONTENT_TYPES.filter((type) => type !== "mod") : CONTENT_TYPES;

// ---------------------------------------------------------------------------
// Cache (same approach as Explore): search pages and full project details, kept
// for the app session so reopening the browser, paging back, or re-selecting a
// project is instant.
// ---------------------------------------------------------------------------

/** A cached page shows instantly; it is refetched in the background once older than this. */
const SEARCH_FRESH_MS = 2 * 60 * 1000;
/** Older than this, a cached page is ignored and loaded normally. */
const SEARCH_MAX_AGE_MS = 30 * 60 * 1000;
const SEARCH_CACHE_LIMIT = 60;

type SearchParams = {
    query: string;
    page: number;
    contentType: ContentType;
    sortBy: string;
    viewCount: number;
    contentSource: ContentSource;
    mcVersionFilters: string[];
    loaderFilters: string[];
    categoryFilters: string[];
    environmentFilters: string[];
};
type SearchCacheEntry = { results: ModrinthProject[]; totalHits: number; at: number };
const searchCache = new Map<string, SearchCacheEntry>();
const projectDetailCache = new Map<string, ModrinthProject>();

const searchKey = (params: SearchParams) => JSON.stringify(params);

function rememberSearch(key: string, entry: SearchCacheEntry) {
    searchCache.delete(key);
    searchCache.set(key, entry);
    while (searchCache.size > SEARCH_CACHE_LIMIT) {
        const oldest = searchCache.keys().next().value;
        if (oldest === undefined) break;
        searchCache.delete(oldest);
    }
}

const initialSearchParams = (contentType: ContentType): SearchParams => ({
    query: "",
    page: 1,
    contentType,
    sortBy: "relevance",
    viewCount: 20,
    contentSource: CONTENT_SOURCES.MODRINTH,
    mcVersionFilters: [],
    loaderFilters: [],
    categoryFilters: [],
    environmentFilters: [],
});

const freshCached = (key: string) => {
    const hit = searchCache.get(key);
    return hit && Date.now() - hit.at < SEARCH_MAX_AGE_MS ? hit : undefined;
};

export function InstanceContentBrowser({
    instance,
    contentType: initialContentType,
    colors,
    config,
    onClose,
    onInstalled,
    onUpdate,
}: InstanceContentBrowserProps) {
    const { t } = useTranslation(config?.language);

    // Results layout: shared with the Install page (remembered on this machine).
    const [listLayout, setListLayout] = useState<"grid" | "list">(() => {
        try {
            return localStorage.getItem("exploreLayout") === "list" ? "list" : "grid";
        } catch {
            return "grid";
        }
    });
    const changeListLayout = (next: "grid" | "list") => {
        setListLayout(next);
        try { localStorage.setItem("exploreLayout", next); } catch {}
    };

    const [contentType, setContentType] = useState<ContentType>(initialContentType);
    const [contentSource, setContentSource] = useState<ContentSource>(CONTENT_SOURCES.MODRINTH);

    const [mcVersionFilters, setMcVersionFilters] = useState<string[]>([]);
    const [loaderFilters, setLoaderFilters] = useState<string[]>([]);
    const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
    const [environmentFilters, setEnvironmentFilters] = useState<string[]>([]);

    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState("relevance");
    const [page, setPage] = useState(1);
    const [viewCount, setViewCount] = useState(20);

    const [results, setResults] = useState<ModrinthProject[]>(
        () => freshCached(searchKey(initialSearchParams(initialContentType)))?.results || []
    );
    const [totalHits, setTotalHits] = useState(
        () => freshCached(searchKey(initialSearchParams(initialContentType)))?.totalHits || 0
    );
    const [isLoading, setIsLoading] = useState(false);

    const [previewProject, setPreviewProject] = useState<ModrinthProject | null>(null);

    const [isInstalling, setIsInstalling] = useState(false);
    const [selectedProject, setSelectedProject] = useState<ModrinthProject | null>(null);
    const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
    const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());

    const [detailProject, setDetailProject] = useState<ModrinthProject | null>(null);
    const [isInstallingVersion, setIsInstallingVersion] = useState(false);
    const [installVersionProgress, setInstallVersionProgress] = useState<InstallProgress | null>(null);

    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchTokenRef = useRef(0);
    const lastFetchedKeyRef = useRef<string | null>(null);
    const fetchTokenRef = useRef(0);
    const activePreviewIdRef = useRef<string | null>(null);

    const totalPages = Math.max(1, Math.ceil((totalHits || results.length) / viewCount));

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
            const names = new Set<string>();
            for (const item of items) {
                const filename = (item.filename || "").toLowerCase().replace(/\.jar$|\.zip$/, "");
                const name = (item.name || "").toLowerCase();
                if (filename) names.add(filename);
                if (name) names.add(name);
                if (name) names.add(name.replace(/\s+/g, "-"));
            }
            setInstalledNames(names);
        } catch (error) {
            console.error("[ContentBrowser] Load installed content error:", error);
        }
    }, [instance.id, contentType]);

    const normalizeForMatch = (str: string): string => {
        return str.toLowerCase()
            .replace(/[^a-z0-9]/g, "")
            .trim();
    };

    const isProjectInstalled = useCallback((project: ModrinthProject): boolean => {
        if (installedIds.has(project.project_id)) return true;

        const projectTitle = normalizeForMatch(project.title || "");
        const projectSlug = project.slug ? normalizeForMatch(project.slug) : "";

        for (const name of installedNames) {
            const normalizedName = normalizeForMatch(name);
            if (!normalizedName) continue;
            if (projectTitle && normalizedName.includes(projectTitle) || projectTitle.includes(normalizedName)) {
                return true;
            }
            if (projectSlug && (normalizedName.includes(projectSlug) || projectSlug.includes(normalizedName))) {
                return true;
            }
        }
        return false;
    }, [installedIds, installedNames]);

    useEffect(() => {
        loadInstalledContent();
    }, [loadInstalledContent]);

    const loadProjects = async (query?: string, overridePage?: number, force = false) => {
        const params: SearchParams = {
            query: query !== undefined ? query : searchQuery,
            page: overridePage !== undefined ? overridePage : page,
            contentType,
            sortBy,
            viewCount,
            contentSource,
            mcVersionFilters,
            loaderFilters,
            categoryFilters,
            environmentFilters,
        };
        const cacheKey = searchKey(params);
        if (!force && lastFetchedKeyRef.current === cacheKey) return;
        lastFetchedKeyRef.current = cacheKey;

        const cached = searchCache.get(cacheKey);
        const cacheAge = cached ? Date.now() - cached.at : Infinity;
        if (cached && cacheAge < SEARCH_MAX_AGE_MS) {
            searchTokenRef.current++; // drop any slower in-flight request
            setResults(cached.results);
            setTotalHits(cached.totalHits);
            setIsLoading(false);
            if (cacheAge < SEARCH_FRESH_MS) return;
        }

        const myToken = ++searchTokenRef.current;
        // A stale cached page stays on screen while it refreshes; only a miss shows the skeleton.
        if (!(cached && cacheAge < SEARCH_MAX_AGE_MS)) setIsLoading(true);
        try {
            if (contentSource === CONTENT_SOURCES.CURSEFORGE) {
                const modLoaderMapping: Record<string, number> = {
                    'forge': 1,
                    'fabric': 4,
                    'quilt': 5,
                    'neoforge': 6
                };

                // CurseForge only takes a single game version + loader: use the first selection.
                const cfVersion = mcVersionFilters[0];
                const cfLoader = loaderFilters[0];
                const result = await window.api?.curseforgeSearch?.({
                    query: params.query,
                    projectType: contentType,
                    gameVersion: cfVersion || undefined,
                    modLoaderType: cfLoader ? modLoaderMapping[cfLoader.toLowerCase()] : undefined,
                    sortBy: sortBy === "downloads" ? "downloads" : sortBy === "updated" ? "updated" : "relevance",
                    pageSize: viewCount,
                    index: (params.page - 1) * viewCount,
                });

                if (searchTokenRef.current !== myToken) return;

                if (result?.data) {
                    const mapped: ModrinthProject[] = result.data.map((cf: any) =>
                        normalizeCurseforgeSearchHit(cf, t('unknown'))
                    );
                    const hits = result.pagination?.totalCount || mapped.length;
                    setResults(mapped);
                    setTotalHits(hits);
                    rememberSearch(cacheKey, { results: mapped, totalHits: hits, at: Date.now() });
                }
            } else {
                const facets: string[][] = [];
                if (mcVersionFilters.length) facets.push(mcVersionFilters.map(v => `versions:${v}`));
                if (loaderFilters.length) facets.push(loaderFilters.map(l => `categories:${l}`));
                if (categoryFilters.length) facets.push(categoryFilters.map(c => `categories:${c}`));
                if (environmentFilters.includes("client")) {
                    facets.push(["client_side:required", "client_side:optional"]);
                }
                if (environmentFilters.includes("server")) {
                    facets.push(["server_side:required", "server_side:optional"]);
                }

                const result = await window.api?.modrinthSearch?.({
                    query: params.query,
                    projectType: contentType,
                    sortBy: sortBy,
                    limit: viewCount,
                    offset: (params.page - 1) * viewCount,
                    facets: facets.length > 0 ? JSON.stringify(facets) : undefined,
                });

                // Stale request: discard.
                if (searchTokenRef.current !== myToken) return;

                if (result?.hits) {
                    const mapped: ModrinthProject[] = result.hits.map((mr: any) =>
                        normalizeModrinthSearchHit(mr, t('unknown'))
                    );
                    const hits = result.total_hits ?? result.totalHits ?? 0;
                    setResults(mapped);
                    setTotalHits(hits);
                    rememberSearch(cacheKey, { results: mapped, totalHits: hits, at: Date.now() });
                }
            }
        } catch (error) {
            // Only show error for the latest request; stale requests fail silently.
            if (searchTokenRef.current !== myToken) return;
            console.error("[ContentBrowser] Search error:", error);
            toast.error(t("search_failed"));
        } finally {
            if (searchTokenRef.current === myToken) {
                setIsLoading(false);
            }
        }
    };

    const isFirstFilterLoadRef = useRef(true);
    useEffect(() => {
        if (isFirstFilterLoadRef.current) {
            isFirstFilterLoadRef.current = false;
            loadProjects();
            return;
        }
        if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
        filterDebounceRef.current = setTimeout(() => {
            loadProjects();
        }, 350);
        return () => {
            if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
        };
    }, [contentSource, contentType, sortBy, page, viewCount, mcVersionFilters, loaderFilters, categoryFilters, environmentFilters]);

    // A different catalogue: drop the old preview/detail (the first new result is auto-selected).
    useEffect(() => {
        setPreviewProject(null);
        setDetailProject(null);
        activePreviewIdRef.current = null;
    }, [contentSource, contentType]);

    // Always show something: when nothing (or a vanished item) is previewed, preview the first result.
    useEffect(() => {
        if (!results || results.length === 0) {
            setPreviewProject(null);
            return;
        }
        const previewId = previewProject?.project_id ?? null;
        const stillExists = previewId && results.some((p) => p.project_id === previewId);
        if (!stillExists) handleSelectProject(results[0]);
    }, [results, previewProject]);

    const fetchFullProjectDetails = async (project: ModrinthProject) => {
        if (!project.project_id) return;

        const myToken = ++fetchTokenRef.current;
        const myProjectId = project.project_id;
        activePreviewIdRef.current = myProjectId;
        const isStale = () =>
            fetchTokenRef.current !== myToken || activePreviewIdRef.current !== myProjectId;

        const cacheKey = `${contentSource}:${project.project_id}`;
        const cachedDetail = projectDetailCache.get(cacheKey);
        if (cachedDetail) {
            setPreviewProject(prev => (prev && prev.project_id === cachedDetail.project_id ? cachedDetail : prev));
            setResults(prev => prev.map(p => (p.project_id === cachedDetail.project_id ? cachedDetail : p)));
            return;
        }

        try {
            let normalized: ModrinthProject | null = null;
            if (contentSource === CONTENT_SOURCES.MODRINTH) {
                const fullProject = await window.api?.modrinthGetProject?.(project.project_id);
                if (isStale()) return;
                if (fullProject) normalized = normalizeModrinthFull(fullProject, project, t('unknown'));
            } else if (contentSource === CONTENT_SOURCES.CURSEFORGE) {
                const result = await window.api?.curseforgeGetProject?.(project.project_id);
                if (isStale()) return;
                if (result?.data) normalized = normalizeCurseforgeFull(result.data, project, t('unknown'));
            }
            if (!normalized) return;
            projectDetailCache.set(cacheKey, normalized);
            const final = normalized;
            setPreviewProject(prev => (prev && prev.project_id === final.project_id ? final : prev));
            setResults(prev => prev.map(p => (p.project_id === final.project_id ? final : p)));
        } catch (err) {
            console.error("[ContentBrowser] Failed to fetch full project details:", err);
        }
    };

    const handleSearch = () => {
        setPage(1);
        loadProjects(searchQuery, 1, true);
    };

    const lastSentQueryRef = useRef("");
    const handleDebouncedSearch = (query: string) => {
        setSearchQuery(query);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => {
            if (query === lastSentQueryRef.current) return;
            lastSentQueryRef.current = query;
            setPage(1);
            loadProjects(query, 1);
        }, SEARCH_DEBOUNCE_MS);
    };

    const handleSelectProject = (project: ModrinthProject) => {
        if (previewProject?.project_id === project.project_id) {
            handleOpenDetail(project);
        } else {
            activePreviewIdRef.current = project.project_id;
            setPreviewProject(project);
            fetchFullProjectDetails(project);
        }
    };

    const handleOpenDetail = (project: ModrinthProject) => {
        setDetailProject(project);
        fetchFullProjectForDetail(project);
    };

    const fetchFullProjectForDetail = async (project: ModrinthProject) => {
        try {
            if (contentSource === CONTENT_SOURCES.MODRINTH) {
                const fullProject = await window.api?.modrinthGetProject?.(project.project_id);
                if (!fullProject) return;
                const normalized = normalizeModrinthFull(fullProject, project, t('unknown'));
                // Team is a separate Modrinth endpoint and optional: don't block the page on it.
                try {
                    const team = await (window.api as any)?.modrinthGetTeam?.(project.project_id);
                    if (Array.isArray(team)) {
                        normalized.team_members = team.map((m: any) => ({
                            user: {
                                username: m.user?.username || m.user?.name || 'Unknown',
                                avatar_url: m.user?.avatar_url || m.user?.avatarUrl || undefined,
                            },
                            role: m.role || 'Member',
                        }));
                    }
                } catch {/* team fetch is optional */}
                setDetailProject(normalized);
            } else {
                const result = await window.api?.curseforgeGetProject?.(project.project_id);
                if (!result?.data) return;
                const descResult = await (window.api as any)?.curseforgeGetDescription?.(project.project_id);
                setDetailProject(normalizeCurseforgeFull(result.data, project, t('unknown'), descResult?.data));
            }
        } catch (error) {
            console.error("[ContentBrowser] Failed to fetch full project for detail:", error);
        }
    };

    /** Cloud-linked instances: lock a freshly installed file so sync doesn't remove it. */
    const autoLockInstalledFile = async (filename?: string) => {
        if (!instance.cloudId || !filename) return;
        try {
            const lockedMods = new Set(instance.lockedMods || []);
            if (!lockedMods.has(filename)) {
                const lockRes = await (window.api as any)?.instanceToggleLock?.(instance.id, filename);
                if (lockRes?.ok && lockRes.lockedMods && onUpdate) {
                    onUpdate(instance.id, { lockedMods: lockRes.lockedMods });
                }
            }
        } catch (e) {
            console.error("Failed to auto-lock installed file:", e);
        }
    };

    const handleInstallVersionFromDetail = async (project: ModrinthProject, versionId: string) => {
        setIsInstallingVersion(true);
        setInstallVersionProgress({ stage: "downloading", message: "Downloading version..." });

        try {
            const result = await window.api?.contentDownloadToInstance?.({
                projectId: project.project_id,
                versionId: versionId,
                instanceId: instance.id,
                contentType: contentType,
                contentSource: contentSource,
            });

            if (result?.ok) {
                toast.success(t("install_success_name").replace("{name}", project.title));
                setInstalledIds(prev => new Set(prev).add(project.project_id));
                await autoLockInstalledFile(result.filename);
                loadInstalledContent();
                onInstalled();
            } else {
                toast.error(result?.error || t("install_failed"));
            }
        } catch (error: any) {
            toast.error(error?.message || t("error_occurred"));
        } finally {
            setIsInstallingVersion(false);
            setInstallVersionProgress(null);
        }
    };

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

    const handleAddToInstance = async (project: ModrinthProject) => {
        if (contentType === "mod" && instance.loader === "vanilla") {
            toast.error(t("cannot_install_mod_vanilla"));
            return;
        }
        if (isInstalling) return;

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

            const bestVersion = findCompatibleVersion(loadedVersions);

            if (!bestVersion) {
                toast.error(t("no_compatible_version_for").replace("{version}", instance.minecraftVersion).replace("{loader}", instance.loader || "vanilla"));
                return;
            }

            const result = await window.api?.contentDownloadToInstance?.({
                projectId: project.project_id,
                versionId: bestVersion.id,
                instanceId: instance.id,
                contentType: contentType,
                contentSource: contentSource,
            });

            if (result?.ok) {
                toast.success(t("install_success_name").replace("{name}", project.title));
                setInstalledIds(prev => new Set(prev).add(project.project_id));
                await autoLockInstalledFile(result.filename);
                loadInstalledContent();
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

    const installingProjectId = isInstalling ? selectedProject?.project_id ?? null : null;
    const installingProgress: InstallProgress | null = installingProjectId
        ? { stage: "installing", message: t("installing_progress") }
        : null;
    const previewIsInstalling = !!previewProject && installingProjectId === previewProject.project_id;

    const header = (
        <div className="flex items-center gap-2 min-w-0 shrink-0 md:mr-3">
            <button
                type="button"
                onClick={() => { playClick(); onClose(); }}
                className="h-11 -ml-3 px-3 rounded-xl text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-colors hover:bg-black/5 active:scale-[0.98]"
                style={{ color: colors.onSurfaceVariant }}
            >
                <Icons.ArrowLeft className="w-4.5 h-4.5" />
                {t("back")}
            </button>
            <h1 className="font-display text-2xl truncate max-w-64" style={{ color: colors.onSurface }} title={instance.name}>
                {instance.name}
            </h1>
            <span
                className="h-7 px-2.5 rounded-lg text-xs font-semibold flex items-center whitespace-nowrap shrink-0"
                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}
            >
                {instance.minecraftVersion} · {instance.loader}
            </span>
        </div>
    );

    return (
        <div className="space-y-4">
            {detailProject ? (
                <ProjectDetailPage
                    colors={colors}
                    project={detailProject}
                    projectType={contentType}
                    contentSource={contentSource}
                    isInstallingModpack={isInstallingVersion}
                    installProgress={installVersionProgress}
                    onBack={() => setDetailProject(null)}
                    onInstallModpack={() => {}}
                    onAddToInstance={handleAddToInstance}
                    onInstallVersion={handleInstallVersionFromDetail}
                />
            ) : (
                <>
                    <ExploreToolbar
                        colors={colors}
                        leading={header}
                        contentSource={contentSource}
                        projectType={contentType}
                        projectTypes={getAvailableTypes(instance.loader)}
                        tabIndicatorLayoutId="instance-content-type-tab-underline"
                        searchQuery={searchQuery}
                        viewCount={viewCount}
                        page={page}
                        totalPages={totalPages}
                        mcVersionFilters={mcVersionFilters}
                        loaderFilters={loaderFilters}
                        categoryFilters={categoryFilters}
                        environmentFilters={environmentFilters}
                        sortBy={sortBy}
                        onContentSourceChange={(source) => { setContentSource(source); setPage(1); }}
                        onProjectTypeChange={(type: ProjectType) => {
                            if (type === "modpack") return;
                            setContentType(type);
                            setPage(1);
                        }}
                        onSearchChange={handleDebouncedSearch}
                        onSearchSubmit={handleSearch}
                        onViewCountChange={(count) => { setViewCount(count); setPage(1); }}
                        onPageChange={setPage}
                        onSortChange={(s) => { setSortBy(s); setPage(1); }}
                        onMcVersionFiltersChange={(v) => { setMcVersionFilters(v); setPage(1); }}
                        onLoaderFiltersChange={(l) => { setLoaderFilters(l); setPage(1); }}
                        onCategoryFiltersChange={(c) => { setCategoryFilters(c); setPage(1); }}
                        onEnvironmentFiltersChange={(e) => { setEnvironmentFilters(e); setPage(1); }}
                        showCategoryFilter={true}
                        showEnvironmentFilter={contentType === "mod"}
                        showLoaderFilter={true}
                        showVersionFilter={true}
                        layout={listLayout}
                        onLayoutChange={changeListLayout}
                    />

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
                        <div className="lg:col-span-8 xl:col-span-9">
                            <ProjectList
                                colors={colors}
                                results={results}
                                totalHits={totalHits}
                                isLoading={isLoading}
                                previewProjectId={previewProject?.project_id || null}
                                page={page}
                                totalPages={totalPages}
                                viewCount={viewCount}
                                onSelectProject={handleSelectProject}
                                onPageChange={setPage}
                                installingProjectId={installingProjectId}
                                installProgress={installingProgress}
                                layout={listLayout}
                            />
                        </div>

                        <div className="lg:col-span-4 xl:col-span-3">
                            <ProjectPreview
                                colors={colors}
                                project={previewProject}
                                projectType={contentType}
                                isInstallingModpack={previewIsInstalling}
                                installProgress={previewIsInstalling ? installingProgress : null}
                                onInstallModpack={() => {}}
                                onAddToInstance={handleAddToInstance}
                                isLoading={isLoading && !previewProject}
                                showFollows={contentSource === CONTENT_SOURCES.MODRINTH}
                                actionLabel={t("install_to_instance_name").replace("{name}", instance.name)}
                                isInstalled={!!previewProject && isProjectInstalled(previewProject)}
                                blockedLabel={contentType === "mod" && instance.loader === "vanilla" ? t("vanilla_no_mod") : undefined}
                                actionDisabled={isInstalling}
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
