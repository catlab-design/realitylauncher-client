import React, { useEffect, useState, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import { Icons } from "../ui/Icons";
import modrinthIcon from "../../assets/modrinth.svg";
import curseforgeIcon from "../../assets/curseforge.svg";

// ========================================
// Constants
// ========================================

const SEARCH_DEBOUNCE_MS = 300;

// Content source constants
const CONTENT_SOURCES = {
    MODRINTH: "modrinth",
    CURSEFORGE: "curseforge",
} as const;

type ContentSource = typeof CONTENT_SOURCES[keyof typeof CONTENT_SOURCES];

// ========================================
// Types
// ========================================

type ProjectType = "modpack" | "mod" | "resourcepack" | "datapack" | "shader";

interface ModrinthProject {
    slug: string;
    title: string;
    description: string;
    categories: string[];
    downloads: number;
    icon_url: string | null;
    project_id: string;
    author: string;
    versions: string[];
    follows: number;
    client_side?: string;
    server_side?: string;
}

interface ExploreProps {
    colors: any;
}

interface GameInstance {
    id: string;
    name: string;
    minecraftVersion: string;
    loader: string;
    loaderVersion?: string;
}

interface ModVersion {
    id: string;
    name: string;
    version_number: string;
    game_versions: string[];
    loaders: string[];
    files?: { filename: string; primary: boolean; url: string }[];
}

interface InstanceCompatibility {
    instance: GameInstance;
    compatible: boolean;
    reason?: string;
    bestVersion?: ModVersion;
}

// ========================================
// Helpers
// ========================================

/**
 * Get valid file extensions for content type
 */
function getValidExtensionsForType(projectType: ProjectType): string[] {
    switch (projectType) {
        case "mod":
            return [".jar"];
        case "shader":
            return [".zip"];
        case "resourcepack":
            return [".zip"];
        case "datapack":
            return [".zip"];
        case "modpack":
            return [".mrpack", ".zip"];
        default:
            return [".jar", ".zip"];
    }
}

/**
 * Check if version has valid files for the content type
 */
function hasValidFilesForType(version: ModVersion, projectType: ProjectType): boolean {
    if (!version.files || version.files.length === 0) {
        // If no files info, allow it (backend will handle)
        return true;
    }
    const validExtensions = getValidExtensionsForType(projectType);
    return version.files.some(f =>
        validExtensions.some(ext => f.filename.toLowerCase().endsWith(ext))
    );
}

function formatNumber(num: number): string {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
    return num.toString();
}

const PROJECT_TABS: { id: ProjectType; label: string; icon: React.ComponentType<any> }[] = [
    { id: "modpack", label: "Modpacks", icon: Icons.Box },
    { id: "mod", label: "Mods", icon: Icons.Box },
    { id: "resourcepack", label: "Resource", icon: Icons.Box },
    { id: "datapack", label: "Data", icon: Icons.Box },
    { id: "shader", label: "Shaders", icon: Icons.Box },
];

const SORT_OPTIONS = [
    { value: "relevance", label: "Relevance" },
    { value: "downloads", label: "Downloads" },
    { value: "follows", label: "Follows" },
    { value: "newest", label: "Newest" },
    { value: "updated", label: "Recently Updated" },
];

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
    const [installProgress, setInstallProgress] = useState<{ stage: string; message: string; percent?: number } | null>(null);

    // Modpack version selection state
    const [showModpackVersionModal, setShowModpackVersionModal] = useState(false);
    const [modpackVersions, setModpackVersions] = useState<ModVersion[]>([]);
    const [selectedModpack, setSelectedModpack] = useState<ModrinthProject | null>(null);
    const [isLoadingVersions, setIsLoadingVersions] = useState(false);
    const [versionFilter, setVersionFilter] = useState("");

    // Content version selection state (for mods/resourcepacks/shaders)
    const [showContentVersionModal, setShowContentVersionModal] = useState(false);
    const [selectedInstanceForDownload, setSelectedInstanceForDownload] = useState<GameInstance | null>(null);
    const [contentVersionFilter, setContentVersionFilter] = useState("");

    // Preview state
    const [previewProject, setPreviewProject] = useState<ModrinthProject | null>(null);

    // Debounce timer ref for search
    const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

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

    // Load on mount and when filters change
    useEffect(() => {
        loadProjects();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectType, sortBy, page, viewCount, contentSource]);

    const loadProjects = async () => {
        setIsLoading(true);
        try {
            if (contentSource === CONTENT_SOURCES.MODRINTH) {
                // Modrinth API
                const result = await window.api?.modrinthSearch?.({
                    query: searchQuery,
                    projectType: projectType,
                    sortBy: sortBy,
                    limit: viewCount,
                    offset: (page - 1) * viewCount,
                });

                if (result?.hits) {
                    setResults(result.hits);
                    setTotalHits(result.total_hits || 0);
                }
            } else {
                // CurseForge API
                const result = await window.api?.curseforgeSearch?.({
                    query: searchQuery,
                    projectType: projectType,
                    sortBy: sortBy,
                    pageSize: viewCount,
                    index: (page - 1) * viewCount,
                });

                if (result?.data) {
                    // Normalize CurseForge data to match Modrinth format
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
                    }));
                    setResults(normalized);
                    setTotalHits(result.pagination?.totalCount || 0);
                }
            }
        } catch (error) {
            console.error("[Explore] Load failed:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Update preview when results change
    useEffect(() => {
        if (!results || results.length === 0) {
            setPreviewProject(null);
            return;
        }
        if (!previewProject) {
            setPreviewProject(results[0]);
            return;
        }
        const stillExists = results.some((p) => p.project_id === previewProject.project_id);
        if (!stillExists) setPreviewProject(results[0]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [results]);

    const handleSearch = () => {
        setPage(1);
        loadProjects();
    };

    // Debounced search - for live search while typing
    const handleDebouncedSearch = useCallback((query: string) => {
        setSearchQuery(query);

        // Clear existing debounce timer
        if (searchDebounceRef.current) {
            clearTimeout(searchDebounceRef.current);
        }

        // Set new debounce timer
        searchDebounceRef.current = setTimeout(() => {
            setPage(1);
            loadProjects();
        }, SEARCH_DEBOUNCE_MS);
    }, [projectType, sortBy, viewCount, contentSource]);

    // Smart version matching helper - handles wildcards and ranges
    const matchesVersion = (modVersion: string, instanceVersion: string): boolean => {
        if (modVersion === instanceVersion) return true;

        if (modVersion.endsWith('.x')) {
            const prefix = modVersion.slice(0, -1);
            return instanceVersion.startsWith(prefix);
        }

        const rangeMatch = modVersion.match(/^([\d.]+)[–-]([\d.]+)$/);
        if (rangeMatch) {
            const [, start, end] = rangeMatch;
            const instanceParts = instanceVersion.split('.').map(Number);
            const startParts = start.split('.').map(Number);
            const endParts = end.split('.').map(Number);

            const compareVersions = (a: number[], b: number[]): number => {
                for (let i = 0; i < Math.max(a.length, b.length); i++) {
                    const av = a[i] || 0;
                    const bv = b[i] || 0;
                    if (av !== bv) return av - bv;
                }
                return 0;
            };

            return compareVersions(instanceParts, startParts) >= 0 &&
                compareVersions(instanceParts, endParts) <= 0;
        }

        return false;
    };

    // Check instance compatibility helper
    const checkCompatibility = (instance: GameInstance, versions: ModVersion[]): InstanceCompatibility => {
        const instanceLoader = instance.loader?.toLowerCase() || "vanilla";
        const instanceVersion = instance.minecraftVersion;

        for (const version of versions) {
            const versionLoaders = version.loaders.map(l => l.toLowerCase());
            const versionGameVersions = version.game_versions;

            const versionMatch = versionGameVersions.some(v => matchesVersion(v, instanceVersion));

            const isResourceContent = projectType === "resourcepack" || projectType === "shader" || projectType === "datapack";
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

    // Open modpack version selection modal
    const handleInstallModpack = async (project: ModrinthProject) => {
        setSelectedModpack(project);
        setIsLoadingVersions(true);
        setShowModpackVersionModal(true);
        setModpackVersions([]);
        setVersionFilter("");

        try {
            let versions: any[] = [];

            if (contentSource === CONTENT_SOURCES.CURSEFORGE) {
                // Use CurseForge API
                const result = await window.api?.curseforgeGetFiles?.(project.project_id);
                if (result?.data) {
                    versions = result.data.map((f: any) => ({
                        id: f.id.toString(),
                        name: f.displayName,
                        version_number: f.fileName,
                        game_versions: f.gameVersions || [],
                        loaders: f.sortableGameVersions?.filter((v: any) => !v.gameVersion.match(/^\d/)).map((v: any) => v.gameVersionName) || [],
                    }));
                }
            } else {
                // Use Modrinth API
                const result = await window.api?.modrinthGetVersions?.(project.project_id);
                if (result) {
                    versions = result.map((v: any) => ({
                        id: v.id,
                        name: v.name,
                        version_number: v.version_number,
                        game_versions: v.game_versions || [],
                        loaders: v.loaders || [],
                    }));
                }
            }

            if (!versions || versions.length === 0) {
                toast.error("ไม่พบเวอร์ชันที่ดาวน์โหลดได้");
                setShowModpackVersionModal(false);
                return;
            }

            setModpackVersions(versions);
        } catch (error: any) {
            toast.error(error?.message || "โหลดข้อมูลไม่สำเร็จ");
            setShowModpackVersionModal(false);
        } finally {
            setIsLoadingVersions(false);
        }
    };

    // Install selected modpack version
    const handleInstallModpackVersion = async (versionId: string) => {
        setShowModpackVersionModal(false);
        setIsInstallingModpack(true);
        setInstallProgress({ stage: "downloading", message: "กำลังดาวน์โหลด modpack..." });

        try {
            const result = await window.api?.modpackInstallFromModrinth?.(versionId);

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
            setSelectedModpack(null);
        }
    };

    // Add to instance with compatibility check
    const handleAddToInstance = async (project: ModrinthProject) => {
        setSelectedProject(project);
        setIsCheckingCompatibility(true);
        setShowInstanceModal(true);
        setInstanceCompatibility([]);

        try {
            let modVers: ModVersion[] = [];

            if (contentSource === CONTENT_SOURCES.CURSEFORGE) {
                // Use CurseForge API
                const result = await window.api?.curseforgeGetFiles?.(project.project_id);
                if (!result?.data || result.data.length === 0) {
                    toast.error("ไม่พบเวอร์ชันที่ดาวน์โหลดได้");
                    setShowInstanceModal(false);
                    return;
                }

                modVers = result.data.map((f: any) => ({
                    id: f.id.toString(),
                    name: f.displayName,
                    version_number: f.fileName,
                    game_versions: f.gameVersions || [],
                    loaders: f.sortableGameVersions?.filter((v: any) => !v.gameVersion.match(/^\d/)).map((v: any) => v.gameVersionName) || [],
                    files: [{
                        filename: f.fileName,
                        primary: true,
                        url: f.downloadUrl || "",
                    }],
                })).filter((v: ModVersion) => hasValidFilesForType(v, projectType));
            } else {
                // Use Modrinth API
                const versions = await window.api?.modrinthGetVersions?.(project.project_id);
                if (!versions || versions.length === 0) {
                    toast.error("ไม่พบเวอร์ชันที่ดาวน์โหลดได้");
                    setShowInstanceModal(false);
                    return;
                }

                modVers = versions.map((v: any) => ({
                    id: v.id,
                    name: v.name,
                    version_number: v.version_number,
                    game_versions: v.game_versions || [],
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

    const handleDownloadToInstance = async (instanceId: string, versionId?: string) => {
        if (!selectedProject) return;

        setIsDownloading(true);
        try {
            let useVersionId = versionId;
            if (!useVersionId) {
                const compatibility = instanceCompatibility.find(c => c.instance.id === instanceId);
                if (compatibility?.bestVersion) {
                    useVersionId = compatibility.bestVersion.id;
                } else if (modVersions.length > 0) {
                    useVersionId = modVersions[0].id;
                } else {
                    toast.error("ไม่พบเวอร์ชันที่เหมาะสม");
                    return;
                }
            }

            const result = await window.api?.contentDownloadToInstance?.({
                projectId: selectedProject.project_id,
                versionId: useVersionId,
                instanceId,
                contentType: projectType === "modpack" ? "mod" : projectType,
            });

            if (result?.ok) {
                toast.success(`เพิ่ม ${selectedProject.title} เรียบร้อย`);
                setShowInstanceModal(false);
                setSelectedProject(null);
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

    const totalPages = Math.ceil(totalHits / viewCount);

    const PrimaryAction = ({ project }: { project: ModrinthProject }) => {
        if (projectType === "modpack") {
            return (
                <button
                    onClick={() => handleInstallModpack(project)}
                    disabled={isInstallingModpack}
                    className="w-full px-3 py-2 rounded-md text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                >
                    <i className="fa-solid fa-download text-[10px]"></i>
                    ติดตั้งเป็น Instance ใหม่
                </button>
            );
        }

        return (
            <button
                onClick={() => handleAddToInstance(project)}
                className="w-full px-3 py-2 rounded-md text-xs font-medium flex items-center justify-center gap-2"
                style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
            >
                <i className="fa-solid fa-plus text-[10px]"></i>
                เพิ่มลง Instance
            </button>
        );
    };


    return (
        <div className="space-y-4">
            {/* Instance Selection Modal with Compatibility */}
            {showInstanceModal && selectedProject && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="w-full max-w-md rounded-2xl p-6 relative" style={{ backgroundColor: colors.surface }}>
                        <button
                            onClick={() => { setShowInstanceModal(false); setSelectedProject(null); setInstanceCompatibility([]); }}
                            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20"
                            style={{ color: colors.onSurfaceVariant }}
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                            </svg>
                        </button>

                        <h3 className="text-lg font-semibold mb-1" style={{ color: colors.onSurface }}>
                            เลือก Instance
                        </h3>
                        <p className="text-sm mb-4" style={{ color: colors.onSurfaceVariant }}>
                            เพิ่ม "{selectedProject.title}" ไปยัง Instance ไหน?
                        </p>

                        {isCheckingCompatibility ? (
                            <div className="p-6 text-center rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                                <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full mx-auto mb-2" style={{ color: colors.secondary }} />
                                <p style={{ color: colors.onSurfaceVariant }}>กำลังตรวจสอบความเข้ากัน...</p>
                            </div>
                        ) : instances.length === 0 ? (
                            <div className="p-6 text-center rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                                <p style={{ color: colors.onSurfaceVariant }}>ไม่มี Instance กรุณาสร้างก่อน</p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {instanceCompatibility.map(({ instance, compatible, reason, bestVersion }) => (
                                    <button
                                        key={instance.id}
                                        onClick={() => {
                                            if (compatible) {
                                                setSelectedInstanceForDownload(instance);
                                                setContentVersionFilter("");
                                                setShowContentVersionModal(true);
                                            }
                                        }}
                                        disabled={isDownloading || !compatible}
                                        className={`w-full p-3 rounded-xl text-left transition-all ${compatible ? 'hover:scale-[1.01]' : 'opacity-60 cursor-not-allowed'}`}
                                        style={{
                                            backgroundColor: colors.surfaceContainer,
                                            borderLeft: `4px solid ${compatible ? '#22c55e' : '#ef4444'}`,
                                        }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="font-medium flex items-center gap-2" style={{ color: colors.onSurface }}>
                                                    {instance.name}
                                                    {compatible && (
                                                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}>
                                                            ✓ รองรับ
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                                                    {instance.minecraftVersion} • {instance.loader}
                                                </div>
                                            </div>
                                            {!compatible && (
                                                <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#ef444420', color: '#ef4444' }}>
                                                    {reason}
                                                </span>
                                            )}
                                            {compatible && bestVersion && (
                                                <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                                    v{bestVersion.version_number}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {isDownloading && (
                            <div className="mt-4 text-center" style={{ color: colors.onSurfaceVariant }}>
                                กำลังดาวน์โหลด...
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Content Version Selection Modal (for mods/resourcepacks/shaders) */}
            {showContentVersionModal && selectedProject && selectedInstanceForDownload && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="w-full max-w-lg rounded-2xl p-6 relative" style={{ backgroundColor: colors.surface }}>
                        <button
                            onClick={() => {
                                setShowContentVersionModal(false);
                                setSelectedInstanceForDownload(null);
                                setContentVersionFilter("");
                            }}
                            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20"
                            style={{ color: colors.onSurfaceVariant }}
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                            </svg>
                        </button>

                        <h3 className="text-lg font-semibold mb-1" style={{ color: colors.onSurface }}>
                            เลือกเวอร์ชัน
                        </h3>
                        <p className="text-sm mb-2" style={{ color: colors.onSurfaceVariant }}>
                            {selectedProject.title}
                        </p>
                        <p className="text-xs mb-4 px-2 py-1 rounded inline-block" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>
                            → {selectedInstanceForDownload.name} ({selectedInstanceForDownload.minecraftVersion})
                        </p>

                        {/* Version Search */}
                        <div className="relative mb-3">
                            <input
                                type="text"
                                placeholder="ค้นหาเวอร์ชัน..."
                                value={contentVersionFilter}
                                onChange={(e) => setContentVersionFilter(e.target.value)}
                                className="w-full px-4 py-2 pl-10 rounded-xl border text-sm"
                                style={{
                                    backgroundColor: colors.surfaceContainer,
                                    borderColor: colors.outline,
                                    color: colors.onSurface,
                                }}
                            />
                            <Icons.Search
                                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
                                style={{ color: colors.onSurfaceVariant }}
                            />
                        </div>

                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {modVersions
                                .filter((v) => {
                                    // Filter by instance compatibility first
                                    const instanceVersion = selectedInstanceForDownload.minecraftVersion;
                                    const instanceLoader = selectedInstanceForDownload.loader?.toLowerCase() || "vanilla";

                                    const versionMatch = v.game_versions.some(gv => matchesVersion(gv, instanceVersion));
                                    const isResourceContent = projectType === "resourcepack" || projectType === "shader" || projectType === "datapack";
                                    const loaderMatch = isResourceContent ||
                                        instanceLoader === "vanilla" ||
                                        v.loaders.length === 0 ||
                                        v.loaders.map(l => l.toLowerCase()).includes(instanceLoader) ||
                                        (instanceLoader === "quilt" && v.loaders.map(l => l.toLowerCase()).includes("fabric"));

                                    if (!versionMatch || !loaderMatch) return false;

                                    // Then apply search filter
                                    if (!contentVersionFilter.trim()) return true;
                                    const query = contentVersionFilter.toLowerCase();
                                    return (
                                        v.name.toLowerCase().includes(query) ||
                                        v.version_number.toLowerCase().includes(query) ||
                                        v.game_versions.some(gv => gv.toLowerCase().includes(query)) ||
                                        v.loaders.some(l => l.toLowerCase().includes(query))
                                    );
                                })
                                .map((version) => (
                                    <button
                                        key={version.id}
                                        onClick={() => {
                                            handleDownloadToInstance(selectedInstanceForDownload.id, version.id);
                                            setShowContentVersionModal(false);
                                            setShowInstanceModal(false);
                                            setSelectedInstanceForDownload(null);
                                        }}
                                        disabled={isDownloading}
                                        className="w-full p-3 rounded-xl text-left transition-all hover:scale-[1.01] disabled:opacity-50"
                                        style={{ backgroundColor: colors.surfaceContainer }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="font-medium" style={{ color: colors.onSurface }}>
                                                    {version.name || version.version_number}
                                                </div>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {version.game_versions.slice(0, 3).map((gv) => (
                                                        <span key={gv} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>
                                                            {gv}
                                                        </span>
                                                    ))}
                                                    {version.game_versions.length > 3 && (
                                                        <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                                            +{version.game_versions.length - 3}
                                                        </span>
                                                    )}
                                                    {version.loaders.map((loader) => (
                                                        <span key={loader} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}>
                                                            {loader}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: colors.secondary }}>
                                                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                                            </svg>
                                        </div>
                                    </button>
                                ))}
                            {modVersions.filter((v) => {
                                const instanceVersion = selectedInstanceForDownload.minecraftVersion;
                                return v.game_versions.some(gv => matchesVersion(gv, instanceVersion));
                            }).length === 0 && (
                                    <div className="p-4 text-center rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                                        <p style={{ color: colors.onSurfaceVariant }}>ไม่พบเวอร์ชันที่รองรับ {selectedInstanceForDownload.minecraftVersion}</p>
                                    </div>
                                )}
                        </div>

                        {isDownloading && (
                            <div className="mt-4 text-center" style={{ color: colors.onSurfaceVariant }}>
                                กำลังดาวน์โหลด...
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modpack Version Selection Modal */}
            {showModpackVersionModal && selectedModpack && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="w-full max-w-lg rounded-2xl p-6 relative" style={{ backgroundColor: colors.surface }}>
                        <button
                            onClick={() => { setShowModpackVersionModal(false); setSelectedModpack(null); setVersionFilter(""); }}
                            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20"
                            style={{ color: colors.onSurfaceVariant }}
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                            </svg>
                        </button>

                        <h3 className="text-lg font-semibold mb-1" style={{ color: colors.onSurface }}>
                            เลือกเวอร์ชัน
                        </h3>
                        <p className="text-sm mb-4" style={{ color: colors.onSurfaceVariant }}>
                            {selectedModpack.title}
                        </p>

                        {/* Version Search */}
                        <div className="relative mb-3">
                            <input
                                type="text"
                                placeholder="ค้นหาเวอร์ชัน (เช่น 1.20, Fabric)..."
                                value={versionFilter}
                                onChange={(e) => setVersionFilter(e.target.value)}
                                className="w-full px-4 py-2 pl-10 rounded-xl border text-sm"
                                style={{
                                    backgroundColor: colors.surfaceContainer,
                                    borderColor: colors.outline,
                                    color: colors.onSurface,
                                }}
                            />
                            <Icons.Search
                                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
                                style={{ color: colors.onSurfaceVariant }}
                            />
                        </div>

                        {isLoadingVersions ? (
                            <div className="p-6 text-center rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                                <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full mx-auto mb-2" style={{ color: colors.secondary }} />
                                <p style={{ color: colors.onSurfaceVariant }}>กำลังโหลดเวอร์ชัน...</p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-80 overflow-y-auto">
                                {modpackVersions
                                    .filter((v) => {
                                        if (!versionFilter.trim()) return true;
                                        const query = versionFilter.toLowerCase();
                                        return (
                                            v.name.toLowerCase().includes(query) ||
                                            v.version_number.toLowerCase().includes(query) ||
                                            v.game_versions.some(gv => gv.toLowerCase().includes(query)) ||
                                            v.loaders.some(l => l.toLowerCase().includes(query))
                                        );
                                    })
                                    .map((version) => (
                                        <button
                                            key={version.id}
                                            onClick={() => handleInstallModpackVersion(version.id)}
                                            disabled={isInstallingModpack}
                                            className="w-full p-3 rounded-xl text-left transition-all hover:scale-[1.01] disabled:opacity-50"
                                            style={{ backgroundColor: colors.surfaceContainer }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="font-medium" style={{ color: colors.onSurface }}>
                                                        {version.name || version.version_number}
                                                    </div>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {version.game_versions.slice(0, 3).map((gv) => (
                                                            <span key={gv} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>
                                                                {gv}
                                                            </span>
                                                        ))}
                                                        {version.game_versions.length > 3 && (
                                                            <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                                                +{version.game_versions.length - 3}
                                                            </span>
                                                        )}
                                                        {version.loaders.map((loader) => (
                                                            <span key={loader} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}>
                                                                {loader}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: colors.secondary }}>
                                                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                                                </svg>
                                            </div>
                                        </button>
                                    ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Toolbar */}
            <div className="rounded-lg" style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}30` }}>
                {/* Top row: Title + Search */}
                <div className="px-4 py-3 flex items-center gap-4 border-b" style={{ borderColor: colors.outline + "30" }}>
                    <div className="flex items-center gap-3 min-w-0">
                        <i className="fa-solid fa-compass" style={{ color: colors.secondary }}></i>
                        <span className="font-medium text-sm" style={{ color: colors.onSurface }}>สำรวจคอนเทนต์</span>
                    </div>
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder={`ค้นหา ${projectType === "modpack" ? "Modpacks" : projectType === "mod" ? "Mods" : projectType}...`}
                            value={searchQuery}
                            onChange={(e) => handleDebouncedSearch(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                            className="w-full px-3 py-1.5 pl-8 rounded-md text-sm"
                            style={{
                                backgroundColor: colors.surface,
                                border: `1px solid ${colors.outline}40`,
                                color: colors.onSurface,
                            }}
                        />
                        <i className="fa-solid fa-search text-xs absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: colors.onSurfaceVariant }}></i>
                    </div>

                    {/* Source buttons */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => { setContentSource(CONTENT_SOURCES.MODRINTH); setPage(1); }}
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
                            onClick={() => { setContentSource(CONTENT_SOURCES.CURSEFORGE); setPage(1); }}
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
                        {PROJECT_TABS.map((tab) => {
                            const active = projectType === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => { setProjectType(tab.id); setPage(1); }}
                                    className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                                    style={{
                                        backgroundColor: active ? colors.secondary : "transparent",
                                        color: active ? "#1a1a1a" : colors.onSurfaceVariant,
                                    }}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex-1" />

                    {/* Filters */}
                    <div className="flex items-center gap-2">
                        <select
                            value={sortBy}
                            onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                            className="px-2 py-1 rounded-md text-xs"
                            style={{
                                backgroundColor: colors.surface,
                                border: `1px solid ${colors.outline}40`,
                                color: colors.onSurface,
                            }}
                        >
                            {SORT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>

                        <select
                            value={viewCount}
                            onChange={(e) => { setViewCount(Number(e.target.value)); setPage(1); }}
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
                                    onClick={() => setPage(Math.max(1, page - 1))}
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
                                    onClick={() => setPage(Math.min(totalPages, page + 1))}
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


            {/* Main Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mt-3">
                {/* List */}
                <div className="lg:col-span-7 xl:col-span-8">
                    <div className="rounded-lg overflow-hidden" style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}30` }}>
                        <div className="px-3 py-2 flex items-center justify-between border-b" style={{ borderColor: colors.outline + "30" }}>
                            <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                {totalHits.toLocaleString()} รายการ
                            </span>
                            {isLoading && (
                                <i className="fa-solid fa-spinner fa-spin text-xs" style={{ color: colors.secondary }}></i>
                            )}
                        </div>


                        {isLoading ? (
                            <div className="p-6 text-center" style={{ color: colors.onSurfaceVariant }}>
                                <i className="fa-solid fa-spinner fa-spin mb-2" style={{ color: colors.secondary }}></i>
                                <p className="text-xs">กำลังโหลด...</p>
                            </div>
                        ) : results.length === 0 ? (
                            <div className="p-6 text-center" style={{ color: colors.onSurfaceVariant }}>
                                <i className="fa-solid fa-box-open mb-2 text-lg"></i>
                                <p className="text-xs">ไม่พบผลลัพธ์</p>
                            </div>
                        ) : (
                            <div>
                                {results.map((project, idx) => {
                                    const active = previewProject?.project_id === project.project_id;
                                    return (
                                        <button
                                            key={project.project_id}
                                            onClick={() => setPreviewProject(project)}
                                            className="w-full text-left px-3 py-2 flex items-center gap-3 transition-colors"
                                            style={{
                                                backgroundColor: active ? colors.surfaceContainerHighest : "transparent",
                                                borderBottom: idx < results.length - 1 ? `1px solid ${colors.outline}20` : undefined,
                                            }}
                                        >
                                            {/* Icon */}
                                            <div
                                                className="w-9 h-9 rounded-md bg-cover bg-center flex-shrink-0 flex items-center justify-center"
                                                style={{
                                                    backgroundImage: project.icon_url ? `url(${project.icon_url})` : undefined,
                                                    backgroundColor: colors.surfaceContainerHighest,
                                                }}
                                            >
                                                {!project.icon_url && <i className="fa-solid fa-cube text-sm" style={{ color: colors.onSurfaceVariant }}></i>}
                                            </div>

                                            {/* Main */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium truncate" style={{ color: colors.onSurface }}>
                                                        {project.title}
                                                    </span>
                                                    <span className="text-[10px] truncate" style={{ color: colors.onSurfaceVariant }}>
                                                        {project.author}
                                                    </span>
                                                </div>
                                                <p className="text-xs truncate" style={{ color: colors.onSurfaceVariant }}>
                                                    {project.description}
                                                </p>
                                            </div>

                                            {/* Downloads */}
                                            <div className="hidden sm:flex items-center gap-1 text-[10px] flex-shrink-0" style={{ color: colors.onSurfaceVariant }}>
                                                <i className="fa-solid fa-download text-[8px]"></i>
                                                <span>{formatNumber(project.downloads)}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}


                        {/* Bottom Pagination */}
                        {!isLoading && results.length > 0 && totalPages > 1 && (
                            <div className="p-4 flex items-center justify-center gap-2 border-t" style={{ borderColor: colors.outline }}>
                                <button
                                    onClick={() => setPage(Math.max(1, page - 1))}
                                    disabled={page === 1}
                                    className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-all"
                                    style={{ backgroundColor: colors.surface, color: colors.onSurface, border: `1px solid ${colors.outline}` }}
                                >
                                    ‹ ก่อนหน้า
                                </button>
                                <span className="px-3 py-2 text-sm" style={{ color: colors.onSurfaceVariant }}>
                                    หน้า {page} / {totalPages}
                                </span>
                                <button
                                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                                    disabled={page >= totalPages}
                                    className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-all"
                                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                >
                                    หน้าถัดไป
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Preview Panel */}
                <div className="lg:col-span-5 xl:col-span-4">
                    <div className="rounded-lg p-4 sticky top-4" style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}30` }}>
                        {!previewProject ? (
                            <div className="p-6 text-center" style={{ color: colors.onSurfaceVariant }}>
                                <i className="fa-solid fa-eye mb-2"></i>
                                <p className="text-xs">เลือกรายการเพื่อดูรายละเอียด</p>
                            </div>
                        ) : (
                            <>
                                {/* Header */}
                                <div className="flex items-start gap-3">
                                    <div
                                        className="w-12 h-12 rounded-lg bg-cover bg-center flex-shrink-0 flex items-center justify-center"
                                        style={{
                                            backgroundImage: previewProject.icon_url ? `url(${previewProject.icon_url})` : undefined,
                                            backgroundColor: colors.surfaceContainerHighest,
                                        }}
                                    >
                                        {!previewProject.icon_url && <i className="fa-solid fa-cube text-lg" style={{ color: colors.onSurfaceVariant }}></i>}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium truncate" style={{ color: colors.onSurface }}>
                                            {previewProject.title}
                                        </p>
                                        <p className="text-xs truncate" style={{ color: colors.onSurfaceVariant }}>
                                            by {previewProject.author}
                                        </p>
                                    </div>
                                </div>

                                {/* Description */}
                                <p className="mt-3 text-xs leading-relaxed line-clamp-3" style={{ color: colors.onSurfaceVariant }}>
                                    {previewProject.description || "—"}
                                </p>

                                {/* Stats row */}
                                <div className="mt-3 flex items-center gap-4">
                                    <div className="flex items-center gap-1.5 text-xs" style={{ color: colors.onSurfaceVariant }}>
                                        <i className="fa-solid fa-download text-[10px]"></i>
                                        <span>{formatNumber(previewProject.downloads)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs" style={{ color: colors.onSurfaceVariant }}>
                                        <i className="fa-solid fa-heart text-[10px]"></i>
                                        <span>{formatNumber(previewProject.follows)}</span>
                                    </div>
                                </div>

                                {/* Categories */}
                                {previewProject.categories?.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-1">
                                        {previewProject.categories.slice(0, 5).map((cat) => (
                                            <span
                                                key={cat}
                                                className="px-1.5 py-0.5 rounded text-[10px]"
                                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}
                                            >
                                                {cat}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Primary Action */}
                                <div className="mt-4">
                                    <PrimaryAction project={previewProject} />
                                </div>

                                {/* Install Progress */}
                                {(isInstallingModpack || installProgress) && projectType === "modpack" && (
                                    <div className="mt-3 rounded-md p-3" style={{ backgroundColor: colors.surface }}>
                                        <div className="flex items-center gap-2">
                                            <i className="fa-solid fa-spinner fa-spin text-xs" style={{ color: colors.secondary }}></i>
                                            <span className="text-xs" style={{ color: colors.onSurface }}>
                                                {installProgress?.message || "กำลังติดตั้ง..."}
                                            </span>
                                        </div>
                                        {typeof installProgress?.percent === "number" && (
                                            <div className="mt-2">
                                                <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                                    <div
                                                        className="h-full transition-all"
                                                        style={{
                                                            width: `${Math.max(0, Math.min(100, installProgress.percent))}%`,
                                                            backgroundColor: colors.secondary,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Tip for non-modpack */}
                                {projectType !== "modpack" && (
                                    <div className="mt-3 rounded-md p-2 flex items-start gap-2" style={{ backgroundColor: colors.surface }}>
                                        <i className="fa-solid fa-lightbulb text-[10px] mt-0.5" style={{ color: colors.secondary }}></i>
                                        <p className="text-[10px] leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
                                            เลือก Instance แล้วระบบจะหาเวอร์ชันที่เข้ากันได้ให้อัตโนมัติ
                                        </p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
