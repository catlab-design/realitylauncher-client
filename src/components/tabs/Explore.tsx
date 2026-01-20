// ========================================
// Explore Component - Refactored
// ========================================

import React, { useEffect, useState, useRef, useCallback } from "react";
import toast from "react-hot-toast";

// Local components
import {
    // Types
    CONTENT_SOURCES,
    type ContentSource,
    type ProjectType,
    type ModrinthProject,
    type GameInstance,
    type ModVersion,
    type InstanceCompatibility,
    type InstallProgress,
    type ExploreProps,
    // Helpers
    hasValidFilesForType,
    matchesVersion,
    // Constants
    SEARCH_DEBOUNCE_MS,
    // Components
    InstanceSelectModal,
    VersionSelectModal,
    ExploreToolbar,
    ProjectList,
    ProjectPreview,
} from "./ExploreTabs";

// ========================================
// Component
// ========================================

export function Explore({ colors }: ExploreProps) {
    // Content source state
    const [contentSource, setContentSource] = useState<ContentSource>(CONTENT_SOURCES.MODRINTH);

    // Main state
    const [projectType, setProjectType] = useState<ProjectType>("modpack");
    const [searchQuery, setSearchQuery] = useState("");
    const [results, setResults] = useState<ModrinthProject[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [sortBy, setSortBy] = useState("relevance");
    const [page, setPage] = useState(1);
    const [totalHits, setTotalHits] = useState(0);
    const [viewCount, setViewCount] = useState(20);

    // Instance selection state
    const [instances, setInstances] = useState<GameInstance[]>([]);
    const [isLoadingInstances, setIsLoadingInstances] = useState(false);
    const [selectedProject, setSelectedProject] = useState<ModrinthProject | null>(null);
    const [showInstanceModal, setShowInstanceModal] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    // Compatibility checking state
    const [modVersions, setModVersions] = useState<ModVersion[]>([]);
    const [instanceCompatibility, setInstanceCompatibility] = useState<InstanceCompatibility[]>([]);
    const [isCheckingCompatibility, setIsCheckingCompatibility] = useState(false);

    // Modpack installation state
    const [isInstallingModpack, setIsInstallingModpack] = useState(false);
    const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);

    // Version selection state
    const [showVersionModal, setShowVersionModal] = useState(false);
    const [versionModalVersions, setVersionModalVersions] = useState<ModVersion[]>([]);
    const [versionModalTitle, setVersionModalTitle] = useState("");
    const [versionModalProject, setVersionModalProject] = useState<ModrinthProject | null>(null);
    const [versionModalTarget, setVersionModalTarget] = useState<"modpack" | "content">("modpack");
    const [isLoadingVersions, setIsLoadingVersions] = useState(false);

    // Content version selection state
    const [selectedInstanceForDownload, setSelectedInstanceForDownload] = useState<GameInstance | null>(null);

    // Preview state
    const [previewProject, setPreviewProject] = useState<ModrinthProject | null>(null);

    // Debounce timer ref for search
    const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

    // ========================================
    // Effects
    // ========================================

    // Load instances on mount
    useEffect(() => {
        loadInstances();
    }, []);

    // Listen for modpack install progress
    useEffect(() => {
        const cleanup = window.api?.onModpackInstallProgress?.((progress) => {
            setInstallProgress(progress);
        });
        return () => cleanup?.();
    }, []);

    // Load on mount and when filters change
    useEffect(() => {
        loadProjects();
    }, [projectType, sortBy, page, viewCount, contentSource]);

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
    // Data Loading
    // ========================================

    const loadInstances = async () => {
        setIsLoadingInstances(true);
        try {
            const list = await window.api?.instancesList?.();
            if (list) setInstances(list);
        } catch (error) {
            console.error("[Explore] Load instances failed:", error);
            toast.error("โหลดรายการ Instance ไม่สำเร็จ");
        } finally {
            setIsLoadingInstances(false);
        }
    };

    const fetchFullProjectDetails = async (project: ModrinthProject) => {
        // Only fetch if Modrinth
        if (contentSource !== CONTENT_SOURCES.MODRINTH) return;

        if (!project.project_id) return;

        try {
            const fullProject = await window.api?.modrinthGetProject?.(project.project_id);

            if (fullProject) {
                // Normalize Modrinth data (camelCase -> snake_case fallback)
                // API usually returns snake_case, but we check both just in case
                const normalized: ModrinthProject = {
                    slug: fullProject.slug,
                    title: fullProject.title,
                    description: fullProject.description,
                    categories: fullProject.categories || fullProject.displayCategories || fullProject.display_categories || [],
                    downloads: fullProject.downloads,
                    icon_url: fullProject.icon_url || fullProject.iconUrl || null,
                    project_id: fullProject.id || fullProject.projectId || fullProject.project_id,
                    // Preserve existing author as full details usually don't include it (or include "Unknown" from native)
                    author: project.author && project.author !== "Unknown" ? project.author : (fullProject.author || "Unknown"),
                    versions: fullProject.versions || [],
                    game_versions: fullProject.gameVersions || fullProject.game_versions || [],
                    loaders: fullProject.loaders || [],
                    follows: fullProject.follows || 0,
                    client_side: fullProject.clientSide || fullProject.client_side,
                    server_side: fullProject.serverSide || fullProject.server_side,
                    gallery: fullProject.gallery || [],
                    // Preserve existing featured_gallery to prevent flash
                    featured_gallery: project.featured_gallery || fullProject.featured_gallery || fullProject.featuredGallery || null,
                };

                // Update Preview if matched
                setPreviewProject(prev => {
                    if (prev && prev.project_id === normalized.project_id) {
                        return normalized;
                    }
                    return prev;
                });

                // Update List Results to show icon/colors
                setResults(prev => prev.map(p =>
                    p.project_id === normalized.project_id ? normalized : p
                ));
            }
        } catch (error) {
            console.error("[Explore] Failed to fetch full project details:", error);
        }
    };

    const handleSelectProject = (project: ModrinthProject) => {
        setPreviewProject(project);
        fetchFullProjectDetails(project);
    };

    const loadProjects = async () => {
        setIsLoading(true);
        try {
            if (contentSource === CONTENT_SOURCES.MODRINTH) {
                const result = await window.api?.modrinthSearch?.({
                    query: searchQuery,
                    projectType: projectType,
                    sortBy: sortBy,
                    limit: viewCount,
                    offset: (page - 1) * viewCount,
                });

                if (result?.hits) {
                    // Normalize Modrinth data (handle both camelCase from Native and snake_case from JS)
                    const normalized: ModrinthProject[] = result.hits.map((mr: any) => ({
                        slug: mr.slug,
                        title: mr.title,
                        description: mr.description,
                        categories: mr.categories || mr.displayCategories || mr.display_categories || [],
                        downloads: mr.downloads,
                        icon_url: mr.iconUrl || mr.icon_url || null,
                        project_id: mr.projectId || mr.project_id,
                        author: mr.author || "Unknown",
                        versions: mr.versions || [],
                        game_versions: mr.gameVersions || mr.game_versions || [],
                        loaders: mr.loaders || [],
                        follows: mr.follows || 0,
                        client_side: mr.clientSide || mr.client_side,
                        server_side: mr.serverSide || mr.server_side,
                        gallery: mr.gallery?.map((url: string) => ({
                            url,
                            featured: false,
                            created: "",
                            ordering: 0
                        })) || [],
                        featured_gallery: mr.featuredGallery || mr.featured_gallery || null,
                    }));
                    setResults(normalized);
                    setTotalHits(result.totalHits || 0);
                }
            } else {
                const result = await window.api?.curseforgeSearch?.({
                    query: searchQuery,
                    projectType: projectType,
                    sortBy: sortBy,
                    pageSize: viewCount,
                    index: (page - 1) * viewCount,
                });

                if (result?.data) {
                    const normalized: ModrinthProject[] = result.data.map((cf: any) => ({
                        slug: cf.slug || cf.id.toString(),
                        title: cf.name,
                        description: cf.summary,
                        categories: cf.categories?.map((c: any) => c.name) || [],
                        downloads: cf.downloadCount,
                        icon_url: cf.logo?.url || null,
                        project_id: cf.id.toString(),
                        author: cf.authors?.[0]?.name || "Unknown",
                        versions: cf.latestFiles?.flatMap((f: any) => f.gameVersions) || [],
                        follows: cf.thumbsUpCount || 0,
                        client_side: "required",
                        server_side: "optional",
                        gallery: cf.screenshots?.map((s: any) => ({
                            url: s.url,
                            featured: false,
                            created: "",
                            ordering: 0
                        })) || [],
                        featured_gallery: cf.screenshots?.[0]?.url || null,
                    }));
                    setResults(normalized);
                    setTotalHits(result.pagination?.totalCount || 0);
                }
            }
        } catch (error) {
            console.error("[Explore] Load failed:", error);
            toast.error("โหลดข้อมูลไม่สำเร็จ: " + (error instanceof Error ? error.message : String(error)));
        } finally {
            setIsLoading(false);
        }
    };

    // ========================================
    // Search Handlers
    // ========================================

    const handleSearch = () => {
        setPage(1);
        loadProjects();
    };

    const handleDebouncedSearch = useCallback((query: string) => {
        setSearchQuery(query);
        if (searchDebounceRef.current) {
            clearTimeout(searchDebounceRef.current);
        }
        searchDebounceRef.current = setTimeout(() => {
            setPage(1);
            loadProjects();
        }, SEARCH_DEBOUNCE_MS);
    }, [projectType, sortBy, viewCount, contentSource]);

    // ========================================
    // Compatibility Checking
    // ========================================

    const checkCompatibility = (instance: GameInstance, versions: ModVersion[]): InstanceCompatibility => {
        const instanceLoader = instance.loader?.toLowerCase() || "vanilla";
        const instanceVersion = instance.minecraftVersion;
        const isResourceContent = projectType === "resourcepack" || projectType === "shader" || projectType === "datapack";

        // Vanilla instances cannot install mods
        if (instanceLoader === "vanilla" && projectType === "mod") {
            return { instance, compatible: false, reason: "ไม่รองรับ mod" };
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
            return { instance, compatible: false, reason: `ไม่รองรับ ${instanceVersion}` };
        }

        const allLoaders = new Set(versions.flatMap(v => v.loaders.map(l => l.toLowerCase())));
        if (instanceLoader !== "vanilla" && allLoaders.size > 0 && !allLoaders.has(instanceLoader)) {
            return { instance, compatible: false, reason: `ไม่รองรับ ${instance.loader}` };
        }

        return { instance, compatible: false, reason: "ไม่รองรับ" };
    };

    // ========================================
    // Modpack Installation
    // ========================================

    const handleInstallModpack = async (project: ModrinthProject) => {
        setVersionModalProject(project);
        setVersionModalTitle("เลือกเวอร์ชัน");
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
                        name: v.name,
                        version_number: v.versionNumber,
                        game_versions: v.gameVersions || [],
                        loaders: v.loaders || [],
                    }));
                }
            }

            if (!versions || versions.length === 0) {
                toast.error(`ไม่พบเวอร์ชันที่ดาวน์โหลดได้สำหรับ ${project.title}`);
                setShowVersionModal(false);
                return;
            }

            // Validate versions have valid IDs
            const validVersions = versions.filter(v => v.id && v.id.trim() !== "");
            if (validVersions.length === 0) {
                toast.error("ไม่พบเวอร์ชันที่ถูกต้องสำหรับการติดตั้ง");
                setShowVersionModal(false);
                return;
            }

            setVersionModalVersions(validVersions);
        } catch (error: any) {
            toast.error(error?.message || "โหลดข้อมูลไม่สำเร็จ");
            setShowVersionModal(false);
        } finally {
            setIsLoadingVersions(false);
        }
    };

    const handleInstallModpackVersion = async (versionId: string) => {
        setShowVersionModal(false);
        setIsInstallingModpack(true);
        setInstallProgress({ stage: "downloading", message: "กำลังดาวน์โหลด modpack..." });

        try {
            if (!versionId || versionId.trim() === "") {
                throw new Error("ไม่พบ ID เวอร์ชันที่ถูกต้อง");
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
                toast.success(`ติดตั้ง ${result.instance.name} เรียบร้อย!`);
                loadInstances();
            } else {
                toast.error(result?.error || "ติดตั้งไม่สำเร็จ");
            }
        } catch (error: any) {
            toast.error(error?.message || "เกิดข้อผิดพลาด");
        } finally {
            setIsInstallingModpack(false);
            setInstallProgress(null);
            setVersionModalProject(null);
        }
    };

    // ========================================
    // Add to Instance
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
                    toast.error("ไม่พบเวอร์ชันที่ดาวน์โหลดได้");
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
                    toast.error("ไม่พบเวอร์ชันที่ดาวน์โหลดได้");
                    setShowInstanceModal(false);
                    return;
                }

                modVers = versions.map((v: any) => ({
                    id: v.id,
                    name: v.name,
                    version_number: v.versionNumber,
                    game_versions: v.gameVersions || [],
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
            toast.error("ตรวจสอบความเข้ากันไม่สำเร็จ");
        } finally {
            setIsCheckingCompatibility(false);
        }
    };

    const handleSelectInstanceForContent = (instance: GameInstance) => {
        if (modVersions.length === 0) {
            toast.error("ไม่พบเวอร์ชันที่เข้ากันได้");
            return;
        }

        if (!selectedProject) {
            toast.error("ไม่พบโปรเจกต์ที่เลือก");
            return;
        }

        setShowInstanceModal(false);
        setSelectedInstanceForDownload(instance);
        setVersionModalVersions(modVersions);
        setVersionModalTitle("เลือกเวอร์ชัน");
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
                toast.success(`เพิ่ม ${selectedProject.title} เรียบร้อย`);
                setSelectedProject(null);
                setSelectedInstanceForDownload(null);
                setInstanceCompatibility([]);
            } else {
                toast.error(result?.error || "ดาวน์โหลดไม่สำเร็จ");
            }
        } catch (error: any) {
            toast.error(error?.message || "เกิดข้อผิดพลาด");
        } finally {
            setIsDownloading(false);
        }
    };

    // ========================================
    // Computed Values
    // ========================================

    const totalPages = Math.ceil(totalHits / viewCount);

    // ========================================
    // Render
    // ========================================

    return (
        <div className="space-y-4">
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

            {/* Toolbar */}
            <ExploreToolbar
                colors={colors}
                contentSource={contentSource}
                projectType={projectType}
                searchQuery={searchQuery}
                sortBy={sortBy}
                viewCount={viewCount}
                page={page}
                totalPages={totalPages}
                onContentSourceChange={(source) => { setContentSource(source); setPage(1); }}
                onProjectTypeChange={(type) => { setProjectType(type); setPage(1); }}
                onSearchChange={handleDebouncedSearch}
                onSearchSubmit={handleSearch}
                onSortChange={(sort) => { setSortBy(sort); setPage(1); }}
                onViewCountChange={(count) => { setViewCount(count); setPage(1); }}
                onPageChange={setPage}
            />

            {/* Main Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
                {/* List */}
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
                    />
                </div>

                {/* Preview Panel */}
                <div className="lg:col-span-4 xl:col-span-3">
                    <ProjectPreview
                        colors={colors}
                        project={previewProject}
                        projectType={projectType}
                        isInstallingModpack={isInstallingModpack}
                        installProgress={installProgress}
                        onInstallModpack={handleInstallModpack}
                        onAddToInstance={handleAddToInstance}
                        isLoading={isLoading}
                    />
                </div>
            </div>
        </div>
    );
}
