// ========================================
// Explore Component - Refactored
// ========================================

import React, { useEffect, useState, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "../../hooks/useTranslation";

import {
    CONTENT_SOURCES,
    type ContentSource,
    type ProjectType,
    type ModrinthProject,
    type GameInstance,
    type ModVersion,
    type InstanceCompatibility,
    type InstallProgress,
    type ExploreProps,
    hasValidFilesForType,
    matchesVersion,
    SEARCH_DEBOUNCE_MS,
    InstanceSelectModal,
    VersionSelectModal,
    ExploreToolbar,
    ProjectList,
    ProjectPreview,
    ProjectDetailPage,
    ConfirmInstallDialog,
    normalizeModrinthFull,
    normalizeCurseforgeFull,
    normalizeModrinthSearchHit,
    normalizeCurseforgeSearchHit,
} from "./ExploreTabs";

// ========================================
// ========================================

export function Explore({ colors, config }: ExploreProps) {
    const { t } = useTranslation(config?.language);
    const [contentSource, setContentSource] = useState<ContentSource>(CONTENT_SOURCES.MODRINTH);

    const [projectType, setProjectType] = useState<ProjectType>("modpack");
    const [searchQuery, setSearchQuery] = useState("");
    const [results, setResults] = useState<ModrinthProject[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [sortBy, setSortBy] = useState("relevance");
    const [page, setPage] = useState(1);
    const [totalHits, setTotalHits] = useState(0);
    const [viewCount, setViewCount] = useState(20);

    // Total pages (derived) - use totalHits when available, otherwise fallback to result length
    const totalPages = Math.max(1, Math.ceil((totalHits || results.length) / viewCount));

    const [instances, setInstances] = useState<GameInstance[]>([]);
    const [isLoadingInstances, setIsLoadingInstances] = useState(false);
    const [selectedProject, setSelectedProject] = useState<ModrinthProject | null>(null);
    const [showInstanceModal, setShowInstanceModal] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    const [modVersions, setModVersions] = useState<ModVersion[]>([]);
    const [instanceCompatibility, setInstanceCompatibility] = useState<InstanceCompatibility[]>([]);
    const [isCheckingCompatibility, setIsCheckingCompatibility] = useState(false);

    const [isInstallingModpack, setIsInstallingModpack] = useState(false);
    const [installingProjectId, setInstallingProjectId] = useState<string | null>(null);
    const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);

    const [showVersionModal, setShowVersionModal] = useState(false);
    const [versionModalVersions, setVersionModalVersions] = useState<ModVersion[]>([]);
    const [versionModalTitle, setVersionModalTitle] = useState("");
    const [versionModalProject, setVersionModalProject] = useState<ModrinthProject | null>(null);
    const [versionModalTarget, setVersionModalTarget] = useState<"modpack" | "content">("modpack");
    const [isLoadingVersions, setIsLoadingVersions] = useState(false);

    // Content version selection state
    const [selectedInstanceForDownload, setSelectedInstanceForDownload] = useState<GameInstance | null>(null);

    const [previewProject, setPreviewProject] = useState<ModrinthProject | null>(null);

    const [detailProject, setDetailProject] = useState<ModrinthProject | null>(null);

    // Filter state — arrays so each filter category supports multi-select. Modrinth handles
    // multi-value as OR within the same facet group; CurseForge's API is single-value only so
    // we degrade gracefully (see loadProjects).
    const [mcVersionFilters, setMcVersionFilters] = useState<string[]>([]);
    const [loaderFilters, setLoaderFilters] = useState<string[]>([]);
    const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
    const [environmentFilters, setEnvironmentFilters] = useState<string[]>([]);

    // Debounce timer ref for search
    const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
    // Debounce timer ref for filter changes (prevents rapid-fire API calls)
    const filterDebounceRef = useRef<NodeJS.Timeout | null>(null);
    // Race-condition guard for search requests. Each loadProjects call increments this;
    // only the latest request may update results or show error toasts.
    const searchTokenRef = useRef(0);
    // Cached parameters of the last successful fetch to prevent redundant API calls
    const lastFetchedParamsRef = useRef<{
        query: string;
        page: number;
        projectType: string;
        sortBy: string;
        viewCount: number;
        contentSource: string;
        mcVersionFilters: string[];
        loaderFilters: string[];
        categoryFilters: string[];
        environmentFilters: string[];
    } | null>(null);
    // Race-condition guard for project-detail fetches (preview/list).
    // Each fetchFullProjectDetails increments this; only the latest reply may update state.
    const fetchTokenRef = useRef(0);
    // Latest in-flight project_id whose preview was requested. Used to drop stale responses.
    const activePreviewIdRef = useRef<string | null>(null);

    // Confirm-install modal state (U1)
    const [pendingInstall, setPendingInstall] = useState<{ project: ModrinthProject; duplicate: boolean } | null>(null);

    // ========================================
    // Data Loading (must be defined before effects that use them)
    // ========================================

    const loadInstances = useCallback(async () => {
        setIsLoadingInstances(true);
        try {
            const list = await window.api?.instancesList?.();
            if (list) setInstances(list);
        } catch (error) {
            console.error("[Explore] Load instances failed:", error);
            toast.error(t('load_instances_failed'));
        } finally {
            setIsLoadingInstances(false);
        }
    }, [t]);

    // ========================================
    // ========================================

    // Load instances on mount
    useEffect(() => {
        loadInstances();
    }, [loadInstances]);

    // Listen for modpack install progress
    useEffect(() => {
        const cleanup = window.api?.onModpackInstallProgress?.((progress) => {
            setInstallProgress(progress);
        });
        return () => cleanup?.();
    }, []);

    // Load on mount and when filters change — debounce to avoid rapid-fire API calls
    // (e.g. toggling multiple filter checkboxes quickly causes HTTP 520/525 from Cloudflare).
    const isFirstLoadRef = useRef(true);
    useEffect(() => {
        if (isFirstLoadRef.current) {
            isFirstLoadRef.current = false;
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
    }, [projectType, sortBy, page, viewCount, contentSource, mcVersionFilters, loaderFilters, categoryFilters, environmentFilters]);

    // Reset preview/detail when switching source or project type (B8)
    useEffect(() => {
        setPreviewProject(null);
        setDetailProject(null);
        activePreviewIdRef.current = null;
    }, [contentSource, projectType]);

    // Auto-select first item when results change. Track the id we just promoted so we
    // don't re-promote it on every fetch tick (avoid B4 loop).
    const lastAutoSelectedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!results || results.length === 0) {
            setPreviewProject(null);
            lastAutoSelectedRef.current = null;
            return;
        }
        const previewId = previewProject?.project_id ?? null;
        const stillExists = previewId && results.some((p) => p.project_id === previewId);
        if (!stillExists) {
            const first = results[0];
            if (lastAutoSelectedRef.current !== first.project_id) {
                lastAutoSelectedRef.current = first.project_id;
                handleSelectProject(first);
            }
        }
    }, [results]);

    const fetchFullProjectDetails = async (project: ModrinthProject) => {
        if (!project.project_id) return;

        // Token-based race guard (B3). Each call gets a new token; only the latest may apply.
        const myToken = ++fetchTokenRef.current;
        const myProjectId = project.project_id;
        activePreviewIdRef.current = myProjectId;
        const isStale = () =>
            fetchTokenRef.current !== myToken || activePreviewIdRef.current !== myProjectId;

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
            const final = normalized;
            // Only patch in place — don't replace the row if the user has clicked away.
            setPreviewProject(prev => (prev && prev.project_id === final.project_id ? final : prev));
            setResults(prev => prev.map(p => (p.project_id === final.project_id ? final : p)));
        } catch (error) {
            console.error("[Explore] Failed to fetch full project details:", error);
        }
    };

    const handleSelectProject = (project: ModrinthProject) => {
        // Two-click navigation: first click = sidebar preview, second click on same project = full detail page (U2)
        if (previewProject?.project_id === project.project_id) {
            handleOpenDetail(project);
        } else {
            activePreviewIdRef.current = project.project_id;
            setPreviewProject(project);
            fetchFullProjectDetails(project);
        }
    };

    const loadProjects = async (query?: string, overridePage?: number, force = false) => {
        const activeQuery = query !== undefined ? query : searchQuery;
        const activePage = overridePage !== undefined ? overridePage : page;

        const params = {
            query: activeQuery,
            page: activePage,
            projectType,
            sortBy,
            viewCount,
            contentSource,
            mcVersionFilters,
            loaderFilters,
            categoryFilters,
            environmentFilters
        };

        if (
            !force &&
            lastFetchedParamsRef.current &&
            lastFetchedParamsRef.current.query === params.query &&
            lastFetchedParamsRef.current.page === params.page &&
            lastFetchedParamsRef.current.projectType === params.projectType &&
            lastFetchedParamsRef.current.sortBy === params.sortBy &&
            lastFetchedParamsRef.current.viewCount === params.viewCount &&
            lastFetchedParamsRef.current.contentSource === params.contentSource &&
            JSON.stringify(lastFetchedParamsRef.current.mcVersionFilters) === JSON.stringify(params.mcVersionFilters) &&
            JSON.stringify(lastFetchedParamsRef.current.loaderFilters) === JSON.stringify(params.loaderFilters) &&
            JSON.stringify(lastFetchedParamsRef.current.categoryFilters) === JSON.stringify(params.categoryFilters) &&
            JSON.stringify(lastFetchedParamsRef.current.environmentFilters) === JSON.stringify(params.environmentFilters)
        ) {
            return;
        }

        lastFetchedParamsRef.current = params;

        const myToken = ++searchTokenRef.current;
        setIsLoading(true);
        try {
            if (contentSource === CONTENT_SOURCES.MODRINTH) {
                // Build facets: each inner array is OR within a category; outer arrays are AND'd.
                // E.g. selecting Fabric + Forge -> [["categories:fabric","categories:forge"]].
                const extraFacets: string[][] = [];
                if (categoryFilters.length) extraFacets.push(categoryFilters.map(c => `categories:${c}`));
                if (loaderFilters.length) extraFacets.push(loaderFilters.map(l => `categories:${l}`));
                if (mcVersionFilters.length) extraFacets.push(mcVersionFilters.map(v => `versions:${v}`));
                if (environmentFilters.includes("client")) {
                    extraFacets.push(["client_side:required", "client_side:optional"]);
                }
                if (environmentFilters.includes("server")) {
                    extraFacets.push(["server_side:required", "server_side:optional"]);
                }

                const result = await window.api?.modrinthSearch?.({
                    query: activeQuery,
                    projectType: projectType,
                    sortBy: sortBy,
                    limit: viewCount,
                    offset: (activePage - 1) * viewCount,
                    // gameVersion/loader on the helper are AND-only single values — leave them
                    // empty when we have selections; the full OR list goes through `facets`.
                    facets: extraFacets.length > 0 ? JSON.stringify(extraFacets) : undefined,
                });

                // Stale request — a newer loadProjects has been fired; discard this result.
                if (searchTokenRef.current !== myToken) return;

                if (result?.hits) {
                    const normalized: ModrinthProject[] = result.hits.map((mr: any) =>
                        normalizeModrinthSearchHit(mr, t('unknown'))
                    );
                    setResults(normalized);
                    // Modrinth sometimes returns 'total_hits' (snake_case) or 'totalHits' depending on the source
                    setTotalHits(result.total_hits ?? result.totalHits ?? 0);
                }
            } else {
                // Map loader string to CurseForge numeric modLoaderType
                const modLoaderMapping: Record<string, number> = {
                    'forge': 1,
                    'fabric': 4,
                    'quilt': 5,
                    'neoforge': 6
                };

                // CurseForge search only supports a single gameVersion + single modLoaderType, so
                // we take the first selection from each array. The user keeps the multi-select UX;
                // we just degrade quietly on the CF side.
                const cfLoader = loaderFilters[0];
                const cfVersion = mcVersionFilters[0];
                const result = await window.api?.curseforgeSearch?.({
                    query: activeQuery,
                    projectType: projectType,
                    sortBy: sortBy,
                    pageSize: viewCount,
                    index: (activePage - 1) * viewCount,
                    gameVersion: cfVersion || undefined,
                    modLoaderType: cfLoader ? modLoaderMapping[cfLoader.toLowerCase()] : undefined,
                });

                // Stale request — discard.
                if (searchTokenRef.current !== myToken) return;

                if (result?.data) {
                    const normalized: ModrinthProject[] = result.data.map((cf: any) =>
                        normalizeCurseforgeSearchHit(cf, t('unknown'))
                    );
                    setResults(normalized);
                    setTotalHits(result.pagination?.totalCount || 0);
                }
            }
        } catch (error) {
            // Only show error for the latest request — stale requests fail silently.
            if (searchTokenRef.current !== myToken) return;
            console.error("[Explore] Load failed:", error);
            toast.error(t('load_data_failed'));
        } finally {
            // Only clear loading for the latest request.
            if (searchTokenRef.current === myToken) {
                setIsLoading(false);
            }
        }
    };

    // ========================================
    // ========================================

    const handleSearch = () => {
        setPage(1);
        loadProjects(searchQuery, 1, true);
    };

    // Track the last query we actually sent so we skip no-op refetches when the user
    // types and erases the same characters back to where it was (U7).
    const lastSentQueryRef = useRef("");
    const handleDebouncedSearch = useCallback((query: string) => {
        setSearchQuery(query);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => {
            if (query === lastSentQueryRef.current) return;
            lastSentQueryRef.current = query;
            setPage(1);
            loadProjects(query, 1);
        }, SEARCH_DEBOUNCE_MS);
    }, [projectType, sortBy, viewCount, contentSource, mcVersionFilters, loaderFilters, categoryFilters, environmentFilters]);

    // ========================================
    // ========================================

    const checkCompatibility = (instance: GameInstance, versions: ModVersion[]): InstanceCompatibility => {
        const instanceLoader = instance.loader?.toLowerCase() || "vanilla";
        const instanceVersion = instance.minecraftVersion;
        const isResourceContent = projectType === "resourcepack" || projectType === "shader" || projectType === "datapack";

        // Vanilla instances cannot install mods
        if (instanceLoader === "vanilla" && projectType === "mod") {
            return { instance, compatible: false, reason: t('not_support_mod') };
        }

        for (const version of versions) {
            const versionLoaders = version.loaders.map(l => l.toLowerCase());
            const versionGameVersions = version.game_versions;

            const versionMatch = versionGameVersions.some(v => matchesVersion(v, instanceVersion));

            const loaderMatch = isResourceContent ||
                instanceLoader === "vanilla" ||
                versionLoaders.length === 0 ||
                versionLoaders.includes(instanceLoader) ||
                versionLoaders.includes("minecraft") ||
                (instanceLoader === "quilt" && versionLoaders.includes("fabric"));

            if (versionMatch && loaderMatch) {
                return { instance, compatible: true, bestVersion: version };
            }
        }

        const allGameVersions = versions.flatMap(v => v.game_versions);
        const anyVersionMatches = allGameVersions.some(v => matchesVersion(v, instanceVersion));

        if (!anyVersionMatches) {
            return { instance, compatible: false, reason: t('not_supported_version' as any).replace('{version}', instanceVersion) };
        }

        const allLoaders = new Set(versions.flatMap(v => v.loaders.map(l => l.toLowerCase())));
        if (instanceLoader !== "vanilla" && allLoaders.size > 0 && !allLoaders.has(instanceLoader)) {
            return { instance, compatible: false, reason: t('not_supported_loader' as any).replace('{loader}', instance.loader || '') };
        }

        return { instance, compatible: false, reason: t('not_supported') };
    };

    // ========================================
    // ========================================

    const handleInstallModpack = async (project: ModrinthProject) => {
        // Concurrent-install guard (U4): block while another modpack install is in flight.
        if (isInstallingModpack) {
            toast.error(t('install_in_progress_warn'));
            return;
        }
        // Duplicate-install warning (U3): if an existing instance was created from this
        // project_id (we don't persist that mapping yet, so fall back to name match) ask
        // the user to confirm. Always show a confirm dialog on first install too (U1).
        const duplicate = instances.some(
            (inst) => inst.name === project.title || inst.name.startsWith(project.title + " ")
        );
        setPendingInstall({ project, duplicate });
    };

    // Open the version-selection modal for a modpack install. Called from the confirm
    // dialog after the user explicitly accepts.
    const beginInstallModpack = async (project: ModrinthProject) => {
        setPendingInstall(null);
        setVersionModalProject(project);
        setVersionModalTitle(t('select_version'));
        setVersionModalTarget("modpack");
        setIsLoadingVersions(true);
        setShowVersionModal(true);
        setVersionModalVersions([]);

        try {
            let versions: ModVersion[] = [];

            if (contentSource === CONTENT_SOURCES.CURSEFORGE) {
                const result = await window.api?.curseforgeGetFiles?.(project.project_id);
                if (result?.data) {
                    const KNOWN_LOADERS = ["fabric", "forge", "neoforge", "quilt"];
                    versions = result.data.map((f: any) => {
                        // Extract loaders and game versions from gameVersions array
                        const loaders: string[] = [];
                        const gameVersions: string[] = [];

                        if (f.gameVersions) {
                            for (const gv of f.gameVersions) {
                                const lower = gv?.toLowerCase();
                                if (KNOWN_LOADERS.includes(lower)) {
                                    if (!loaders.includes(lower)) {
                                        loaders.push(lower);
                                    }
                                } else if (gv) {
                                    gameVersions.push(gv);
                                }
                            }
                        }

                        // Also check sortableGameVersions if available
                        if (f.sortableGameVersions) {
                            for (const sv of f.sortableGameVersions) {
                                const name = sv.gameVersionName?.toLowerCase();
                                if (name && KNOWN_LOADERS.includes(name) && !loaders.includes(name)) {
                                    loaders.push(name);
                                }
                            }
                        }

                        return {
                            id: f.id.toString(),
                            name: f.displayName,
                            version_number: f.displayName || f.fileName,
                            game_versions: gameVersions,
                            loaders: loaders,
                        };
                    });
                }
            } else {
                const result = await window.api?.modrinthGetVersions?.(project.project_id);
                if (result) {
                    versions = result.map((v: any) => ({
                        id: v.id,
                        name: v.name || v.versionNumber || v.version_number || "",
                        version_number: v.versionNumber || v.version_number || v.name || "",
                        game_versions: v.gameVersions || v.game_versions || [],
                        loaders: v.loaders || [],
                    }));
                }
            }

            if (!versions || versions.length === 0) {
                toast.error(t('no_downloadable_version'));
                setShowVersionModal(false);
                return;
            }

            // Validate versions have valid IDs
            const validVersions = versions.filter(v => v.id && v.id.trim() !== "");
            if (validVersions.length === 0) {
                toast.error(t('no_valid_version'));
                setShowVersionModal(false);
                return;
            }

            setVersionModalVersions(validVersions);
        } catch (error: any) {
            toast.error(error?.message || t('load_data_failed'));
            setShowVersionModal(false);
        } finally {
            setIsLoadingVersions(false);
        }
    };

    const handleInstallModpackVersion = async (versionId: string) => {
        setShowVersionModal(false);
        setIsInstallingModpack(true);
        setInstallingProjectId(versionModalProject?.project_id || null);
        setInstallProgress({ stage: "downloading", message: t('downloading_modpack_dot') });

        try {
            if (!versionId || versionId.trim() === "") {
                throw new Error(t('no_valid_version_id'));
            }

            let result;
            if (contentSource === CONTENT_SOURCES.CURSEFORGE) {
                result = await window.api?.modpackInstallFromCurseforge?.(
                    versionModalProject?.project_id || "",
                    versionId
                );
            } else {
                result = await window.api?.modpackInstallFromModrinth?.(versionId);
            }

            if (result?.ok && result.instance) {
                toast.success(t('install_complete'));
                loadInstances();
            } else {
                toast.error(t('install_failed_server'));
            }
        } catch (error: any) {
            toast.error(error?.message || t('error_occurred'));
        } finally {
            setIsInstallingModpack(false);
            setInstallProgress(null);
            setInstallingProjectId(null);
            setVersionModalProject(null);
        }
    };

    // ========================================
    // ========================================

    const handleAddToInstance = async (project: ModrinthProject) => {
        setSelectedProject(project);
        setIsCheckingCompatibility(true);
        setShowInstanceModal(true);
        setInstanceCompatibility([]);

        try {
            let modVers: ModVersion[] = [];

            if (contentSource === CONTENT_SOURCES.CURSEFORGE) {
                const result = await window.api?.curseforgeGetFiles?.(project.project_id);
                if (!result?.data || result.data.length === 0) {
                    toast.error(t('no_downloadable_version'));
                    setShowInstanceModal(false);
                    return;
                }

                const KNOWN_LOADERS = ["fabric", "forge", "neoforge", "quilt"];
                modVers = result.data.map((f: any) => {
                    // Extract loaders and game versions from gameVersions array
                    // CurseForge mixes them together like ["1.20.1", "Fabric", "Forge"]
                    const loaders: string[] = [];
                    const gameVersions: string[] = [];

                    if (f.gameVersions) {
                        for (const gv of f.gameVersions) {
                            const lower = gv?.toLowerCase();
                            if (KNOWN_LOADERS.includes(lower)) {
                                if (!loaders.includes(lower)) {
                                    loaders.push(lower);
                                }
                            } else if (gv) {
                                // It's a game version (like "1.20.1")
                                gameVersions.push(gv);
                            }
                        }
                    }

                    // Also check sortableGameVersions if available
                    if (f.sortableGameVersions) {
                        for (const sv of f.sortableGameVersions) {
                            const name = sv.gameVersionName?.toLowerCase();
                            if (name && KNOWN_LOADERS.includes(name) && !loaders.includes(name)) {
                                loaders.push(name);
                            }
                        }
                    }

                    return {
                        id: f.id.toString(),
                        name: f.displayName,
                        version_number: f.displayName || f.fileName,
                        game_versions: gameVersions,
                        loaders: loaders,
                        files: [{
                            filename: f.fileName,
                            primary: true,
                            url: f.downloadUrl || "",
                        }],
                    };
                }).filter((v: ModVersion) => hasValidFilesForType(v, projectType));
            } else {
                const versions = await window.api?.modrinthGetVersions?.(project.project_id);
                if (!versions || versions.length === 0) {
                    toast.error(t('no_downloadable_version'));
                    setShowInstanceModal(false);
                    return;
                }

                modVers = versions.map((v: any) => ({
                    id: v.id,
                    name: v.name || v.versionNumber || v.version_number || "",
                    version_number: v.versionNumber || v.version_number || v.name || "",
                    game_versions: v.gameVersions || v.game_versions || [],
                    loaders: v.loaders || [],
                    files: v.files?.map((f: any) => ({
                        filename: f.filename,
                        primary: f.primary,
                        url: f.url,
                    })) || [],
                })).filter((v: ModVersion) => hasValidFilesForType(v, projectType));
            }

            setModVersions(modVers);

            const compatibility = instances.map(instance => checkCompatibility(instance, modVers));
            compatibility.sort((a, b) => {
                if (a.compatible && !b.compatible) return -1;
                if (!a.compatible && b.compatible) return 1;
                return a.instance.name.localeCompare(b.instance.name);
            });

            setInstanceCompatibility(compatibility);
        } catch (error) {
            console.error("[Explore] Error checking compatibility:", error);
            toast.error(t('compatibility_check_failed'));
        } finally {
            setIsCheckingCompatibility(false);
        }
    };

    const handleSelectInstanceForContent = (instance: GameInstance) => {
        if (modVersions.length === 0) {
            toast.error(t('no_compatible_version'));
            return;
        }

        if (!selectedProject) {
            toast.error(t('project_not_found'));
            return;
        }

        setShowInstanceModal(false);
        setSelectedInstanceForDownload(instance);
        setVersionModalVersions(modVersions);
        setVersionModalTitle(t('select_version'));
        setVersionModalTarget("content");
        setVersionModalProject(selectedProject);

        setTimeout(() => {
            setShowVersionModal(true);
        }, 100);
    };

    const handleDownloadToInstance = async (versionId: string) => {
        if (!selectedProject || !selectedInstanceForDownload) return;

        setIsDownloading(true);
        setShowVersionModal(false);
        setShowInstanceModal(false);

        try {
            const result = await window.api?.contentDownloadToInstance?.({
                projectId: selectedProject.project_id,
                versionId: versionId,
                instanceId: selectedInstanceForDownload.id,
                contentType: projectType === "modpack" ? "mod" : projectType,
                contentSource: contentSource,
            });

            if (result?.ok) {
                toast.success(t('install_complete'));
                
                // Automatically lock the newly downloaded mod to prevent accidental deletion during sync
                const actualContentType = projectType === "modpack" ? "mod" : projectType;
                if (result.filename && (actualContentType === "mod" || actualContentType === "resourcepack")) {
                    try {
                        await window.api?.instanceLockMods?.(selectedInstanceForDownload.id, [result.filename], true);
                    } catch (e) {
                        console.error("[Explore] Auto-lock failed:", e);
                    }
                }

                setSelectedProject(null);
                setSelectedInstanceForDownload(null);
                setInstanceCompatibility([]);
            } else {
                toast.error(t('download_failed'));
            }
        } catch (error: any) {
            toast.error(error?.message || t('error_occurred'));
        } finally {
            setIsDownloading(false);
        }
    };

    // ========================================
    // ========================================

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
                // Team is a separate Modrinth endpoint and optional — don't block the page on it.
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
            } else if (contentSource === CONTENT_SOURCES.CURSEFORGE) {
                const result = await window.api?.curseforgeGetProject?.(project.project_id);
                if (!result?.data) return;
                const descResult = await (window.api as any)?.curseforgeGetDescription?.(project.project_id);
                setDetailProject(normalizeCurseforgeFull(result.data, project, t('unknown'), descResult?.data));
            }
        } catch (error) {
            console.error("[Explore] Failed to fetch full project for detail:", error);
        }
    };

    const handleInstallVersionFromDetail = (project: ModrinthProject, versionId: string) => {
        // For modpacks: direct install
        if (projectType === "modpack") {
            handleInstallModpackVersion(versionId);
        } else {
            // For content: need to select instance first
            setSelectedProject(project);
            handleAddToInstance(project);
        }
    };

    // ========================================
    // (Computed earlier near state declarations: const totalPages = Math.max(1, Math.ceil((totalHits || results.length) / viewCount)); )
    // ========================================

    // ========================================
    // ========================================

    return (
        <div className="space-y-4">
            {/* Confirm-install modal (U1, U3) */}
            {pendingInstall && (
                <ConfirmInstallDialog
                    colors={colors}
                    project={pendingInstall.project}
                    duplicate={pendingInstall.duplicate}
                    onCancel={() => setPendingInstall(null)}
                    onConfirm={() => beginInstallModpack(pendingInstall.project)}
                />
            )}

            {/* Instance Selection Modal */}
            {showInstanceModal && selectedProject && (
                <InstanceSelectModal
                    colors={colors}
                    selectedProjectTitle={selectedProject.title}
                    instances={instances}
                    instanceCompatibility={instanceCompatibility}
                    isCheckingCompatibility={isCheckingCompatibility}
                    isDownloading={isDownloading}
                    onClose={() => {
                        setShowInstanceModal(false);
                        setSelectedProject(null);
                        setInstanceCompatibility([]);
                    }}
                    onSelectInstance={handleSelectInstanceForContent}
                />
            )}

            {/* Version Selection Modal */}
            {showVersionModal && versionModalProject && (
                <VersionSelectModal
                    colors={colors}
                    title={versionModalTitle}
                    projectTitle={versionModalProject.title}
                    versions={versionModalVersions}
                    isLoading={isLoadingVersions}
                    isDownloading={isDownloading || isInstallingModpack}
                    targetInstance={versionModalTarget === "content" ? selectedInstanceForDownload || undefined : undefined}
                    projectType={projectType}
                    onClose={() => {
                        setShowVersionModal(false);
                        setVersionModalProject(null);
                        setSelectedInstanceForDownload(null);
                    }}
                    onSelectVersion={(versionId) => {
                        if (versionModalTarget === "modpack") {
                            handleInstallModpackVersion(versionId);
                        } else {
                            handleDownloadToInstance(versionId);
                        }
                    }}
                />
            )}

            {/* Detail Page View */}
            {detailProject ? (
                <ProjectDetailPage
                    colors={colors}
                    project={detailProject}
                    projectType={projectType}
                    contentSource={contentSource}
                    isInstallingModpack={isInstallingModpack}
                    installProgress={installProgress}
                    onBack={() => setDetailProject(null)}
                    onInstallModpack={handleInstallModpack}
                    onAddToInstance={handleAddToInstance}
                    onInstallVersion={handleInstallVersionFromDetail}
                />
            ) : (
                <>
                    {/* Toolbar */}
                    <ExploreToolbar
                        colors={colors}
                        contentSource={contentSource}
                        projectType={projectType}
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
                        onProjectTypeChange={(type) => { setProjectType(type); setPage(1); }}
                        onSearchChange={handleDebouncedSearch}
                        onSearchSubmit={handleSearch}
                        onViewCountChange={(count) => { setViewCount(count); setPage(1); }}
                        onPageChange={setPage}
                        onSortChange={(s) => { setSortBy(s); setPage(1); }}
                        onMcVersionFiltersChange={(v) => { setMcVersionFilters(v); setPage(1); }}
                        onLoaderFiltersChange={(l) => { setLoaderFilters(l); setPage(1); }}
                        onCategoryFiltersChange={(c) => { setCategoryFilters(c); setPage(1); }}
                        onEnvironmentFiltersChange={(e) => { setEnvironmentFilters(e); setPage(1); }}
                        showCategoryFilter={projectType === "mod" || projectType === "modpack"}
                        showEnvironmentFilter={projectType === "mod"}
                        hideFilterMenu={showInstanceModal || showVersionModal}
                    />

                    {/* Main layout: list + preview (sidebar removed, list now takes ~2/3) */}
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
                                installProgress={installProgress}
                            />
                        </div>

                        <div className="lg:col-span-4 xl:col-span-3">
                            <ProjectPreview
                                colors={colors}
                                project={previewProject}
                                projectType={projectType}
                                isInstallingModpack={isInstallingModpack}
                                installProgress={installProgress}
                                onInstallModpack={handleInstallModpack}
                                onAddToInstance={handleAddToInstance}
                                // Only show preview skeleton during the initial search load — not
                                // every time fetchFullProjectDetails patches the row (U19).
                                isLoading={isLoading && !previewProject}
                                showFollows={contentSource === CONTENT_SOURCES.MODRINTH}
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
