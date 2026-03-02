// ========================================
// Project Detail Page - Full page view
// Inspired by Modrinth App project detail
// ========================================

import React, { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { useTranslation } from "../../../hooks/useTranslation";
import type { ModrinthProject, ProjectVersion, ProjectType, InstallProgress } from "./types";
import { formatNumber } from "./helpers";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { Icons } from "../../ui/Icons";
import { playClick } from "../../../lib/sounds";
import bannerImage from "../../../assets/banner.png";
import fabricIcon from "../../../assets/fabric.svg";
import forgeIcon from "../../../assets/forge.svg";
import neoforgeIcon from "../../../assets/neoforge.svg";
import quiltIcon from "../../../assets/quilt.svg";
import modrinthIcon from "../../../assets/modrinth.svg";
import curseforgeIcon from "../../../assets/curseforge.svg";
import datapackIcon from "../../../assets/modpack_icon.png";

interface ProjectDetailPageProps {
    colors: any;
    project: ModrinthProject;
    projectType: ProjectType;
    contentSource: "modrinth" | "curseforge";
    isInstallingModpack: boolean;
    installProgress: InstallProgress | null;
    onBack: () => void;
    onInstallModpack: (project: ModrinthProject) => void;
    onAddToInstance: (project: ModrinthProject) => void;
    onInstallVersion: (project: ModrinthProject, versionId: string) => void;
}

type DetailTab = "description" | "versions" | "gallery";

// Format file size
function formatSize(bytes: number): string {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
}

// Format date
function formatDate(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return dateStr;
    }
}

// Format relative time
function formatRelativeTime(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return "today";
        if (diffDays === 1) return "yesterday";
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    } catch {
        return dateStr;
    }
}

export function ProjectDetailPage({
    colors,
    project,
    projectType,
    contentSource,
    isInstallingModpack,
    installProgress,
    onBack,
    onInstallModpack,
    onAddToInstance,
    onInstallVersion,
}: ProjectDetailPageProps) {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<DetailTab>("description");
    const [versions, setVersions] = useState<ProjectVersion[]>([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [versionsPage, setVersionsPage] = useState(1);
    const [versionFilter, setVersionFilter] = useState("");
    const [channelFilter, setChannelFilter] = useState<"all" | "release" | "beta" | "alpha">("all");
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const [bodyHtml, setBodyHtml] = useState<string>("");
    const [bodyLoading, setBodyLoading] = useState(false);
    const VERSIONS_PER_PAGE = 20;

    const accentColor = colors.secondary;
    const [fullProject, setFullProject] = useState<ModrinthProject | null>(null);

    // Use either fullProject if fetched, or fallback to the initial project from props
    const currentProject = fullProject || project;

    // Fetch full project details if possible (to get more accurate links/versions)
    useEffect(() => {
        let isMounted = true;

        const fetchFullDetail = async () => {
            if (project.source === "curseforge" && project.project_id) {
                try {
                    const cfId = parseInt(project.project_id);
                    const res = await (window.api as any)?.curseforgeGetProject?.(cfId);
                    if (res?.data && isMounted) {
                        const cf = res.data;
                        const KNOWN_LOADERS = ["fabric", "forge", "neoforge", "quilt"];
                        const gvs = new Set<string>();
                        const lds = new Set<string>();

                        const files = cf.latestFiles || cf.latest_files || [];
                        if (files && Array.isArray(files)) {
                            for (const file of files) {
                                if (file.gameVersions) {
                                    for (const gv of file.gameVersions) {
                                        const lower = gv.toLowerCase();
                                        if (KNOWN_LOADERS.includes(lower)) lds.add(lower);
                                        else if (gv && !gv.toLowerCase().includes("client") && !gv.toLowerCase().includes("server")) gvs.add(gv);
                                    }
                                }
                            }
                        }

                        if (cf.gameVersions && Array.isArray(cf.gameVersions)) {
                            for (const gv of cf.gameVersions) {
                                const lower = gv.toLowerCase();
                                if (KNOWN_LOADERS.includes(lower)) lds.add(lower);
                                else if (gv && !gv.toLowerCase().includes("client") && !gv.toLowerCase().includes("server")) gvs.add(gv);
                            }
                        }

                        setFullProject({
                            ...project,
                            game_versions: gvs.size > 0 ? Array.from(gvs) : project.game_versions,
                            loaders: lds.size > 0 ? Array.from(lds) : project.loaders,
                            source_url: cf.links?.sourceUrl || project.source_url,
                            wiki_url: cf.links?.wikiUrl || project.wiki_url,
                            issues_url: cf.links?.issuesUrl || project.issues_url,
                            discord_url: cf.links?.discordUrl || project.discord_url,
                        });
                    }
                } catch (err) {
                    console.error("Failed to fetch full CF details:", err);
                }
            }
        };

        fetchFullDetail();
        return () => { isMounted = false; };
    }, [project.project_id]);

    // Helper to get URL from raw image item
    const getImageUrl = (item: any, isThumbnail = true) => {
        if (!item) return null;
        if (typeof item === 'string') return item;
        
        // Modrinth provides 'url' (compressed) and 'raw_url' (original high-res)
        if (isThumbnail) {
            return item.url || item.rawUrl || item.raw_url || null;
        } else {
            return item.raw_url || item.rawUrl || item.url || null;
        }
    };

    const heroImage = (() => {
        const raw = project.featured_gallery || (project.gallery && project.gallery.length > 0 ? project.gallery[0] : null);
        return getImageUrl(raw) || bannerImage.src;
    })();

    // Fetch full body (description) when tab switches
    useEffect(() => {
        if (activeTab === "description" && project.body) {
            setBodyHtml(project.body);
        } else if (activeTab === "description" && !project.body) {
            fetchBody();
        }
    }, [activeTab, project.project_id]);

    // Fetch versions when tab switches
    useEffect(() => {
        if (activeTab === "versions" && versions.length === 0) {
            fetchVersions();
        }
    }, [activeTab]);

    const fetchBody = async () => {
        setBodyLoading(true);
        try {
            if (contentSource === "modrinth") {
                const fullProject = await (window.api as any)?.modrinthGetProject?.(project.project_id);
                if (fullProject?.body) {
                    setBodyHtml(fullProject.body);
                }
            } else {
                const result = await (window.api as any)?.curseforgeGetDescription?.(project.project_id);
                console.log("[ProjectDetail] CurseForge description result:", result);
                if (result?.data) {
                    setBodyHtml(result.data);
                }
            }
        } catch (error) {
            console.error("[ProjectDetail] Failed to fetch body:", error);
        } finally {
            setBodyLoading(false);
        }
    };

    const fetchVersions = async () => {
        setVersionsLoading(true);
        try {
            let vers: ProjectVersion[] = [];
            if (contentSource === "modrinth") {
                const result = await (window.api as any)?.modrinthGetVersions?.(project.project_id);
                if (result) {
                    vers = result.map((v: any) => ({
                        id: v.id,
                        name: v.name || v.versionNumber || v.version_number || "",
                        version_number: v.versionNumber || v.version_number || v.name || "",
                        game_versions: v.gameVersions || v.game_versions || [],
                        loaders: v.loaders || [],
                        version_type: v.versionType || v.version_type || "release",
                        downloads: v.downloads || 0,
                        date_published: v.datePublished || v.date_published || "",
                        files: (v.files || []).map((f: any) => ({
                            filename: f.filename,
                            size: f.size || 0,
                            primary: f.primary || false,
                            url: f.url || "",
                        })),
                        changelog: v.changelog || "",
                    }));
                }
            } else {
                const result = await (window.api as any)?.curseforgeGetFiles?.(project.project_id);
                if (result?.data) {
                    const KNOWN_LOADERS = ["fabric", "forge", "neoforge", "quilt"];
                    vers = result.data.map((f: any) => {
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
                            name: f.displayName || f.fileName,
                            version_number: f.displayName || f.fileName,
                            game_versions: gameVersions,
                            loaders,
                            version_type: f.releaseType === 2 ? "beta" : f.releaseType === 3 ? "alpha" : "release",
                            downloads: f.downloadCount || 0,
                            date_published: f.fileDate || "",
                            files: [{
                                filename: f.fileName,
                                size: f.fileLength || 0,
                                primary: true,
                                url: f.downloadUrl || "",
                            }],
                        };
                    });
                }
            }
            setVersions(vers);
        } catch (error) {
            console.error("[ProjectDetail] Failed to fetch versions:", error);
        } finally {
            setVersionsLoading(false);
        }
    };

    // Filtered and paginated versions
    const filteredVersions = versions.filter(v => {
        if (channelFilter !== "all" && v.version_type !== channelFilter) return false;
        if (versionFilter) {
            const q = versionFilter.toLowerCase();
            if (!v.name.toLowerCase().includes(q) &&
                !v.version_number.toLowerCase().includes(q) &&
                !v.game_versions.some(gv => gv.toLowerCase().includes(q))) {
                return false;
            }
        }
        return true;
    });
    const totalVersionPages = Math.max(1, Math.ceil(filteredVersions.length / VERSIONS_PER_PAGE));
    const paginatedVersions = filteredVersions.slice(
        (versionsPage - 1) * VERSIONS_PER_PAGE,
        versionsPage * VERSIONS_PER_PAGE
    );

    const handleAction = () => {
        if (projectType === "modpack") {
            onInstallModpack(project);
        } else {
            onAddToInstance(project);
        }
    };

    const tabs: { id: DetailTab; label: string; icon: string }[] = [
        { id: "description", label: t('description' as any) || "Description", icon: "fa-solid fa-file-lines" },
        { id: "versions", label: t('versions' as any) || "Versions", icon: "fa-solid fa-code-branch" },
    ];

    if (project.gallery && project.gallery.length > 0) {
        tabs.push({ id: "gallery", label: t('gallery') || "Gallery", icon: "fa-solid fa-images" });
    }

    return (
        <>
            {/* Image Preview Modal */}
            {selectedImageIndex !== null && project?.gallery && (
                <ImagePreviewModal
                    colors={colors}
                    imageUrl={getImageUrl(project.gallery[selectedImageIndex], false) || ""}
                    onClose={() => setSelectedImageIndex(null)}
                    onNext={() => {
                        if (project.gallery && selectedImageIndex !== null && selectedImageIndex < project.gallery.length - 1) {
                            setSelectedImageIndex(selectedImageIndex + 1);
                        }
                    }}
                    onPrev={() => {
                        if (project.gallery && selectedImageIndex !== null && selectedImageIndex > 0) {
                            setSelectedImageIndex(selectedImageIndex - 1);
                        }
                    }}
                    hasNext={project.gallery ? selectedImageIndex < project.gallery.length - 1 : false}
                    hasPrev={selectedImageIndex > 0}
                    preloadUrls={[
                        selectedImageIndex < project.gallery.length - 1 ? getImageUrl(project.gallery[selectedImageIndex + 1], false) : undefined,
                        selectedImageIndex > 0 ? getImageUrl(project.gallery[selectedImageIndex - 1], false) : undefined
                    ].filter(Boolean) as string[]}
                    imageIndex={selectedImageIndex}
                    totalImages={project.gallery ? project.gallery.length : 0}
                />
            )}

            <div className="space-y-0">
                {/* Hero Header */}
                <div className="relative h-52 w-full rounded-t-2xl overflow-hidden bg-cover bg-center"
                    style={{
                        backgroundImage: `url(${heroImage})`,
                        backgroundColor: colors.surfaceContainerHighest,
                    }}>
                    <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-transparent" />

                    {/* Back Button */}
                    <button
                        onClick={() => { playClick(); onBack(); }}
                        className="absolute top-4 left-4 z-20 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold backdrop-blur-md transition-all hover:scale-105 active:scale-95 shadow-lg group"
                        style={{
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            color: '#fff',
                            border: '1px solid rgba(255,255,255,0.15)',
                        }}
                    >
                        <i className="fa-solid fa-arrow-left text-xs transition-transform group-hover:-translate-x-1" style={{ color: accentColor }} />
                        {t('back')}
                    </button>

                    {/* Project Info Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 flex items-end gap-5 z-10">
                        {/* Icon */}
                        <div className="w-20 h-20 rounded-2xl shadow-2xl overflow-hidden shrink-0 border-2 border-white/10"
                            style={{ backgroundColor: colors.surfaceContainerHighest }}>
                            {project.icon_url ? (
                                <img src={project.icon_url} alt={project.title} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Icons.Box className="w-8 h-8 opacity-50" style={{ color: '#fff' }} />
                                </div>
                            )}
                        </div>

                        {/* Title & Meta */}
                        <div className="flex-1 min-w-0">
                            <h1 className="text-3xl font-bold text-white mb-1.5 truncate drop-shadow-xl">
                                {currentProject.title}
                            </h1>
                            <div className="flex items-center gap-4 text-sm text-white/80 flex-wrap font-medium">
                                <span className="flex items-center gap-2">
                                    <img 
                                        src={contentSource === "modrinth" ? (modrinthIcon as any).src : (curseforgeIcon as any).src} 
                                        className="w-4 h-4 object-contain" 
                                        alt={contentSource} 
                                    />
                                    {t('by')} <span className="font-bold text-white">{currentProject.author}</span>
                                </span>
                                <span className="opacity-30">•</span>
                                <span className="flex items-center gap-2">
                                    <i className="fa-solid fa-download text-xs" style={{ color: accentColor }} />
                                    {formatNumber(currentProject.downloads)}
                                </span>
                                {currentProject.follows > 0 && (
                                    <>
                                        <span className="opacity-30">•</span>
                                        <span className="flex items-center gap-2">
                                            <i className="fa-solid fa-heart text-xs" style={{ color: "#f43f5e" }} />
                                            {formatNumber(currentProject.follows)}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Install Button */}
                        <div className="shrink-0">
                            {isInstallingModpack || installProgress ? (
                                <div className="px-6 py-3 rounded-xl flex items-center gap-3 backdrop-blur-md"
                                    style={{ backgroundColor: 'rgba(0,0,0,0.5)', border: `1px solid ${accentColor}` }}>
                                    <i className="fa-solid fa-spinner fa-spin" style={{ color: accentColor }} />
                                    <span className="text-sm text-white font-medium">
                                        {installProgress?.message || t('processing')}
                                    </span>
                                </div>
                            ) : (
                                <button
                                    onClick={() => { playClick(); handleAction(); }}
                                    className="px-6 py-3 rounded-xl text-sm font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center gap-2 active:scale-95"
                                    style={{ backgroundColor: accentColor, color: "#000" }}
                                >
                                    <i className={`fa-solid ${projectType === "modpack" ? "fa-download" : "fa-plus"}`} />
                                    {projectType === "modpack" ? (t('install_as_new_instance')) : (t('add_to_instance'))}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Categories Strip */}
                {currentProject.categories && currentProject.categories.length > 0 && (
                    <div className="px-7 py-3.5 flex items-center gap-2.5 flex-wrap rounded-b-none"
                        style={{ backgroundColor: colors.surfaceContainer, borderBottom: `1px solid ${colors.outline}15` }}>
                        {currentProject.categories.map((cat) => (
                            <span key={cat}
                                className="px-3 py-1.5 rounded-lg text-[11px] uppercase font-black tracking-widest shadow-sm"
                                style={{ backgroundColor: `${accentColor}20`, color: colors.onSurface, border: `1px solid ${accentColor}25` }}>
                                {cat}
                            </span>
                        ))}
                    </div>
                )}

                {/* Tabs */}
                <div className="flex items-center gap-1 px-6 py-2"
                    style={{ backgroundColor: colors.surfaceContainer, borderBottom: `1px solid ${colors.outline}15` }}>
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => { playClick(); setActiveTab(tab.id); }}
                            className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 relative"
                            style={{
                                color: activeTab === tab.id ? '#000' : colors.onSurfaceVariant,
                                backgroundColor: activeTab === tab.id ? accentColor : 'transparent',
                            }}
                        >
                            <i className={`${tab.icon} text-xs`} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area with Sidebar */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden rounded-b-2xl">
                    {/* Main Content */}
                    <div className="lg:col-span-9 p-7" style={{ backgroundColor: `${colors.surface}` }}>
                        {/* Description Tab */}
                        {activeTab === "description" && (
                            <div className="animate-fade-in">
                                {bodyLoading ? (
                                    <div className="space-y-3 animate-pulse">
                                        {Array.from({ length: 8 }).map((_, i) => (
                                            <div key={i} className="h-4 rounded-md"
                                                style={{
                                                    backgroundColor: `${colors.surfaceContainerHighest}60`,
                                                    width: `${60 + Math.random() * 40}%`
                                                }} />
                                        ))}
                                    </div>
                                ) : bodyHtml ? (
                                    <div
                                        className="prose prose-invert prose-base max-w-4xl mx-auto markdown-body"
                                        style={{ color: colors.onSurface }}
                                    >
                                        <style dangerouslySetInnerHTML={{ __html: `
                                            .markdown-body img { 
                                                display: inline-block !important; 
                                                margin: 0 !important;
                                                vertical-align: middle;
                                                max-width: 100%;
                                                height: auto;
                                            }
                                            .markdown-body center * {
                                                text-align: center !important;
                                            }
                                            .markdown-body p:has(a img) {
                                                display: flex;
                                                flex-wrap: wrap;
                                                justify-content: center;
                                                align-items: center;
                                                gap: 0.5rem;
                                            }
                                            .markdown-body p:has(a img) br {
                                                display: none;
                                            }
                                        `}} />
                                        <ReactMarkdown
                                            rehypePlugins={[rehypeRaw]}
                                            remarkPlugins={[remarkGfm, remarkBreaks]}
                                            components={{
                                                h1: ({ node, ...props }: any) => {
                                                    const align = node?.properties?.align || props.align;
                                                    return <h1 className={`text-3xl font-bold mb-6 mt-10 first:mt-0 ${align === 'center' ? 'w-full block text-center!' : ''}`} style={{ color: colors.onSurface, textAlign: align || 'inherit' }} {...props} />;
                                                },
                                                h2: ({ node, ...props }: any) => {
                                                    const align = node?.properties?.align || props.align;
                                                    return <h2 className={`text-2xl font-bold mb-4 mt-8 ${align === 'center' ? 'w-full block text-center!' : ''}`} style={{ color: colors.onSurface, textAlign: align || 'inherit' }} {...props} />;
                                                },
                                                h3: ({ node, ...props }: any) => {
                                                    const align = node?.properties?.align || props.align;
                                                    return <h3 className={`text-xl font-semibold mb-3 mt-6 ${align === 'center' ? 'w-full block text-center!' : ''}`} style={{ color: colors.onSurface, textAlign: align || 'inherit' }} {...props} />;
                                                },
                                                p: ({ node, ...props }: any) => {
                                                    const align = node?.properties?.align || props.align;
                                                    return <p className={`mb-4 leading-relaxed text-base ${align === 'center' ? 'w-full block text-center!' : ''}`} style={{ color: `${colors.onSurface}cc`, textAlign: align || 'inherit' }} {...props} />;
                                                },
                                                a: ({ node, href, children, ...props }: any) => (
                                                    <a 
                                                        className="underline decoration-2 underline-offset-4 hover:text-white transition-colors" 
                                                        href={href || "#"} 
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            if (href && (href.startsWith('http') || href.startsWith('https'))) {
                                                                (window as any).api?.openExternal?.(href);
                                                            }
                                                        }}
                                                        style={{ color: colors.secondary, cursor: 'pointer' }} 
                                                        {...props}
                                                    >
                                                        {children}
                                                    </a>
                                                ),
                                                ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 mb-4 space-y-2" style={{ color: `${colors.onSurface}cc` }} {...props} />,
                                                ol: ({ node, ...props }: any) => <ol className="list-decimal pl-5 mb-4 space-y-2" style={{ color: `${colors.onSurface}cc` }} {...props} />,
                                                li: ({ node, ...props }: any) => <li className="text-base leading-relaxed" style={{ color: `${colors.onSurface}cc` }} {...props} />,
                                                img: ({ node, ...props }: any) => (
                                                    <img
                                                        className="max-w-full rounded-lg shadow-md border border-white/5"
                                                        alt={props.alt || ''}
                                                        loading="lazy"
                                                        {...props}
                                                    />
                                                ),
                                                blockquote: ({ node, ...props }: any) => (
                                                    <blockquote className="border-l-4 pl-6 py-2 my-6 text-base italic rounded-r-md" style={{ backgroundColor: `${colors.surfaceContainerHighest}30`, borderColor: accentColor, color: `${colors.onSurface}99` }} {...props} />
                                                ),
                                                div: ({ node, ...props }: any) => {
                                                    const align = node?.properties?.align || props.align;
                                                    return <div className={align === 'center' ? 'w-full block text-center!' : ''} style={{ textAlign: align || 'inherit' }} {...props} />;
                                                },
                                                span: ({ node, ...props }: any) => <span {...props} />,
                                                center: ({ node, ...props }: any) => <div className="w-full block text-center!" style={{ textAlign: 'center', width: '100%', display: 'block' }} {...props} />,
                                                iframe: ({ node, width, height, ...props }: any) => (
                                                    <iframe 
                                                        className="w-full rounded-xl shadow-lg border border-white/10 my-6" 
                                                        style={{ aspectRatio: '16/9', height: 'auto' }}
                                                        {...props} 
                                                    />
                                                ),
                                                code: ({ node, inline, className, children, ...props }: any) => (
                                                    <code
                                                        className={`${inline !== false && !className ? 'px-2 py-0.5 rounded-md' : 'block p-4 rounded-2xl overflow-x-auto my-6'} text-sm font-mono`}
                                                        style={{
                                                            backgroundColor: `${colors.surfaceContainerHighest}`,
                                                            color: '#34d399',
                                                        }}
                                                        {...props}
                                                    >
                                                        {children}
                                                    </code>
                                                ),
                                                hr: ({ node, ...props }: any) => <hr className="my-10 border-white/5" {...props} />,
                                                strong: ({ node, ...props }: any) => <strong className="font-bold text-white" {...props} />,
                                                table: ({ node, ...props }: any) => (
                                                    <div className="overflow-x-auto my-6 rounded-xl border border-white/10">
                                                        <table className="w-full text-sm border-collapse" style={{ color: colors.onSurface }} {...props} />
                                                    </div>
                                                ),
                                                th: ({ node, ...props }: any) => <th className="px-4 py-3 text-left text-xs font-bold border-b" style={{ backgroundColor: `${colors.surfaceContainerHighest}40`, borderColor: `${colors.outline}30`, color: colors.onSurface }} {...props} />,
                                                td: ({ node, ...props }: any) => <td className="px-4 py-3 text-xs border-b" style={{ borderColor: `${colors.outline}15`, color: `${colors.onSurface}cc` }} {...props} />,
                                            }}
                                        >
                                            {bodyHtml}
                                        </ReactMarkdown>
                                    </div>
                                ) : (
                                    <div className="py-8">
                                        <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: colors.onSurface }}>
                                            {project.description}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Versions Tab */}
                        {activeTab === "versions" && (
                            <div className="animate-fade-in space-y-4">
                                {/* Filters Bar */}
                                <div className="flex items-center gap-3 flex-wrap">
                                    {/* Search versions */}
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1 min-w-[200px] transition-all focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-black"
                                        style={{ 
                                            backgroundColor: colors.surfaceContainerHighest, 
                                            border: `1px solid ${colors.outline}20`,
                                            '--tw-ring-color': `${accentColor}40` 
                                        } as any}>
                                        <i className="fa-solid fa-search text-xs" style={{ color: accentColor }} />
                                        <input
                                            type="text"
                                            placeholder={t('search_versions' as any) || "Filter versions..."}
                                            value={versionFilter}
                                            onChange={(e) => { setVersionFilter(e.target.value); setVersionsPage(1); }}
                                            className="bg-transparent outline-none text-sm w-full"
                                            style={{ color: colors.onSurface }}
                                        />
                                    </div>

                                    {/* Channel filter */}
                                    <div className="flex items-center gap-1 rounded-xl p-1"
                                        style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                        {(["all", "release", "beta", "alpha"] as const).map((ch) => (
                                            <button
                                                key={ch}
                                                onClick={() => { playClick(); setChannelFilter(ch); setVersionsPage(1); }}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize"
                                                style={{
                                                    backgroundColor: channelFilter === ch ? accentColor : 'transparent',
                                                    color: channelFilter === ch ? "#000" : colors.onSurfaceVariant,
                                                }}
                                            >
                                                {ch === "all" ? (t('all' as any) || "All") : ch}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Pagination Controls */}
                                    {!versionsLoading && totalVersionPages > 1 && (
                                        <div className="flex items-center gap-1 p-1 rounded-xl ml-auto"
                                            style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                            <button
                                                onClick={() => { playClick(); setVersionsPage(p => Math.max(1, p - 1)); }}
                                                disabled={versionsPage === 1}
                                                className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30 transition-colors hover:bg-white/5"
                                                style={{ color: accentColor }}
                                            >
                                                <i className="fa-solid fa-chevron-left text-[10px]" />
                                            </button>
                                            <span className="text-[11px] px-2 font-bold tabular-nums" style={{ color: accentColor }}>
                                                {versionsPage} / {totalVersionPages}
                                            </span>
                                            <button
                                                onClick={() => { playClick(); setVersionsPage(p => Math.min(totalVersionPages, p + 1)); }}
                                                disabled={versionsPage >= totalVersionPages}
                                                className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30 transition-colors hover:bg-white/5"
                                                style={{ color: accentColor }}
                                            >
                                                <i className="fa-solid fa-chevron-right text-[10px]" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Versions Table */}
                                {versionsLoading ? (
                                    <div className="space-y-3 animate-pulse">
                                        {Array.from({ length: 6 }).map((_, i) => (
                                            <div key={i} className="h-14 rounded-xl"
                                                style={{ backgroundColor: `${colors.surfaceContainerHighest}40` }} />
                                        ))}
                                    </div>
                                ) : paginatedVersions.length === 0 ? (
                                    <div className="text-center py-12 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                                        <Icons.Box className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: colors.onSurfaceVariant }} />
                                        <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                                            {t('no_versions_found' as any) || "No versions found"}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="rounded-xl overflow-hidden border" style={{ borderColor: `${colors.outline}15` }}>
                                        {/* Table Header */}
                                        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-[11px] font-bold uppercase tracking-wider"
                                            style={{ backgroundColor: colors.surfaceContainer, color: colors.onSurfaceVariant }}>
                                            <div className="col-span-4">{t('name' as any) || "Name"}</div>
                                            <div className="col-span-2">{t('game_version' as any) || "Game version"}</div>
                                            <div className="col-span-2">{t('platforms' as any) || "Platforms"}</div>
                                            <div className="col-span-2">{t('published' as any) || "Published"}</div>
                                            <div className="col-span-1 text-right">{t('downloads' as any) || "Downloads"}</div>
                                            <div className="col-span-1" />
                                        </div>

                                        {/* Version Rows */}
                                        {paginatedVersions.map((v, i) => (
                                            <div key={v.id}
                                                className="grid grid-cols-12 gap-2 items-center px-4 py-3.5 transition-colors hover:bg-white/3 group"
                                                style={{
                                                    borderTop: i > 0 ? `1px solid ${colors.outline}10` : 'none',
                                                    backgroundColor: i % 2 === 0 ? 'transparent' : `${colors.surfaceContainer}30`,
                                                }}>
                                                {/* Name */}
                                                <div className="col-span-4 flex items-center gap-3 min-w-0">
                                                    <div className={`w-2 h-2 rounded-full shrink-0 ${v.version_type === 'release' ? 'bg-emerald-400' : v.version_type === 'beta' ? 'bg-amber-400' : 'bg-red-400'}`} />
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold truncate" style={{ color: colors.onSurface }}>
                                                            {v.version_number}
                                                        </p>
                                                        {v.name !== v.version_number && (
                                                            <p className="text-[11px] truncate opacity-60" style={{ color: colors.onSurfaceVariant }}>
                                                                {v.name}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Game Version */}
                                                <div className="col-span-2 text-xs" style={{ color: colors.onSurfaceVariant }}>
                                                    <span className="truncate block">{v.game_versions.slice(0, 3).join(", ")}{v.game_versions.length > 3 ? "..." : ""}</span>
                                                </div>

                                                {/* Loaders */}
                                                <div className="col-span-2 flex items-center gap-1.5 flex-wrap">
                                                    {v.loaders.slice(0, 3).map((l) => {
                                                        const loaderId = l.toLowerCase();
                                                        let icon = null;
                                                        let color = accentColor;
                                                        
                                                        if (loaderId.includes('fabric')) { icon = fabricIcon; color = '#ffb000'; }
                                                        else if (loaderId.includes('neoforge')) { icon = neoforgeIcon; color = '#f59e0b'; }
                                                        else if (loaderId.includes('forge')) { icon = forgeIcon; color = '#df9f28'; }
                                                        else if (loaderId.includes('quilt')) { icon = quiltIcon; color = '#e8a2c8'; }
                                                        else if (loaderId.includes('datapack')) { icon = datapackIcon; }
                                                        
                                                        return (
                                                            <span key={l} className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
                                                                style={{ backgroundColor: `${color}15`, color: color, border: `1px solid ${color}20` }}>
                                                                {icon ? (
                                                                    <img src={(icon as any).src || icon} className="w-2.5 h-2.5 object-contain" alt={l} />
                                                                ) : (
                                                                    <i className="fa-solid fa-box text-[9px]" />
                                                                )}
                                                                {l}
                                                            </span>
                                                        );
                                                    })}
                                                </div>

                                                {/* Published */}
                                                <div className="col-span-2 text-xs" style={{ color: colors.onSurfaceVariant }}>
                                                    {formatRelativeTime(v.date_published)}
                                                </div>

                                                {/* Downloads */}
                                                <div className="col-span-1 text-right text-xs" style={{ color: colors.onSurfaceVariant }}>
                                                    {formatNumber(v.downloads)}
                                                </div>

                                                {/* Actions */}
                                                <div className="col-span-1 flex justify-end gap-1">
                                                    <button
                                                        onClick={() => { playClick(); onInstallVersion(project, v.id); }}
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all opacity-60 hover:opacity-100 group-hover:opacity-80 active:scale-90"
                                                        style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
                                                        title={t('install' as any) || "Install"}
                                                    >
                                                        <i className="fa-solid fa-download text-xs" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Gallery Tab */}
                        {activeTab === "gallery" && project.gallery && (
                            <div className="animate-fade-in">
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                    {project.gallery.map((img, idx) => {
                                        const url = getImageUrl(img);
                                        return (
                                            <div key={idx}
                                                className="relative aspect-video rounded-xl overflow-hidden border cursor-pointer group"
                                                style={{ borderColor: `${colors.outline}15` }}
                                                onClick={() => setSelectedImageIndex(idx)}
                                            >
                                                <img src={url || ""} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                    <i className="fa-solid fa-expand text-white text-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                                {typeof img === 'object' && img.title && (
                                                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-linear-to-t from-black/70 to-transparent">
                                                        <p className="text-xs text-white truncate">{img.title}</p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Sidebar */}
                    <div className="lg:col-span-3 p-7 space-y-8 border-l flex flex-col"
                        style={{ backgroundColor: colors.surfaceContainer, borderColor: `${colors.outline}15` }}>

                        {/* Compatibility */}
                        <div>
                            <h4 className="text-sm font-black uppercase tracking-[0.25em] mb-6 flex items-center gap-3" style={{ color: colors.onSurface }}>
                                <span className="w-1 h-4 rounded-full" style={{ backgroundColor: accentColor }} />
                                {t('compatibility' as any) || "Compatibility"}
                            </h4>

                            <div className="space-y-6">
                                {/* MC Versions */}
                                {currentProject.game_versions && currentProject.game_versions.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold opacity-60 mb-3 uppercase tracking-[0.05em]" style={{ color: colors.onSurfaceVariant }}>
                                            Minecraft: Java Edition
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {currentProject.game_versions.slice().reverse().slice(0, 15).map((v) => (
                                                <span key={v} className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:bg-white/10 hover:scale-105 cursor-default shadow-sm border"
                                                    style={{ backgroundColor: `${accentColor}10`, color: colors.onSurface, borderColor: `${accentColor}25` }}>
                                                    {v}
                                                </span>
                                            ))}
                                            {currentProject.game_versions.length > 15 && (
                                                <span className="px-3 py-1.5 rounded-xl text-xs font-bold opacity-50"
                                                    style={{ color: colors.onSurfaceVariant }}>
                                                    +{currentProject.game_versions.length - 15}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Loaders */}
                                {currentProject.loaders && currentProject.loaders.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold opacity-60 mb-3 uppercase tracking-[0.05em]" style={{ color: colors.onSurfaceVariant }}>
                                            {t('platforms' as any) || "Platforms"}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {currentProject.loaders.map((l) => {
                                                const loaderId = l.toLowerCase();
                                                let icon = null;
                                                let color = accentColor;
                                                
                                                if (loaderId.includes('fabric')) { icon = fabricIcon; color = '#ffb000'; }
                                                else if (loaderId.includes('neoforge')) { icon = neoforgeIcon; color = '#f59e0b'; }
                                                else if (loaderId.includes('forge')) { icon = forgeIcon; color = '#df9f28'; }
                                                else if (loaderId.includes('quilt')) { icon = quiltIcon; color = '#e8a2c8'; }
                                                else if (loaderId.includes('datapack')) { icon = datapackIcon; }
                                                
                                                return (
                                                    <span key={l} className="px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all hover:brightness-110 shadow-lg shadow-black/10"
                                                        style={{ backgroundColor: `${color}15`, color: colors.onSurface, border: `1px solid ${color}30` }}>
                                                        {icon ? (
                                                            <img src={(icon as any).src || icon} className="w-3.5 h-3.5 object-contain" alt={l} />
                                                        ) : (
                                                            <i className="fa-solid fa-box text-[10px]" style={{ color }} />
                                                        )}
                                                        {l}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Client/Server */}
                                {(currentProject.client_side || currentProject.server_side) && (
                                    <div>
                                        <p className="text-xs font-bold opacity-60 mb-3 uppercase tracking-[0.05em]" style={{ color: colors.onSurfaceVariant }}>
                                            {t('supported_environments' as any) || "Environments"}
                                        </p>
                                        <div className="flex flex-wrap gap-2.5">
                                            {currentProject.client_side && (
                                                <span className="px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-sm border"
                                                    style={{ backgroundColor: `${colors.surfaceContainerHighest}`, color: colors.onSurface, borderColor: `${colors.outline}20` }}>
                                                    <i className="fa-solid fa-desktop text-xs" />
                                                    {currentProject.client_side === "required" ? "Client-side" : currentProject.client_side === "optional" ? "Client (optional)" : currentProject.client_side}
                                                </span>
                                            )}
                                            {currentProject.server_side && (
                                                <span className="px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-sm border"
                                                    style={{ backgroundColor: `${colors.surfaceContainerHighest}`, color: colors.onSurface, borderColor: `${colors.outline}20` }}>
                                                    <i className="fa-solid fa-server text-xs" />
                                                    {currentProject.server_side === "required" ? "Server-side" : currentProject.server_side === "optional" ? "Server (optional)" : currentProject.server_side}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Links */}
                        {(currentProject.source_url || currentProject.wiki_url || currentProject.discord_url || currentProject.issues_url) && (
                            <div>
                                <h4 className="text-sm font-black uppercase tracking-[0.25em] mb-6 flex items-center gap-3" style={{ color: colors.onSurface }}>
                                    <span className="w-1 h-4 rounded-full" style={{ backgroundColor: accentColor }} />
                                    {t('links' as any) || "Links"}
                                </h4>
                                <div className="space-y-3">
                                    {currentProject.issues_url && (
                                        <a href={currentProject.issues_url} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-4 text-sm font-bold hover:translate-x-1.5 transition-all group"
                                            style={{ color: colors.onSurface }}>
                                            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border transition-all group-hover:scale-110" 
                                                style={{ backgroundColor: `#f43f5e15`, borderColor: `#f43f5e25` }}>
                                                <i className="fa-solid fa-bug text-sm" style={{ color: '#f43f5e' }} />
                                            </div>
                                            <span className="flex-1 truncate opacity-70 group-hover:opacity-100">Report issues</span>
                                            <i className="fa-solid fa-arrow-up-right-from-square text-[10px] opacity-0 group-hover:opacity-40" />
                                        </a>
                                    )}
                                    {currentProject.source_url && (
                                        <a href={currentProject.source_url} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-4 text-sm font-bold hover:translate-x-1.5 transition-all group"
                                            style={{ color: colors.onSurface }}>
                                            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border transition-all group-hover:scale-110" 
                                                style={{ backgroundColor: `#6366f115`, borderColor: `#6366f125` }}>
                                                <i className="fa-solid fa-code text-sm" style={{ color: '#6366f1' }} />
                                            </div>
                                            <span className="flex-1 truncate opacity-70 group-hover:opacity-100">View source</span>
                                            <i className="fa-solid fa-arrow-up-right-from-square text-[10px] opacity-0 group-hover:opacity-40" />
                                        </a>
                                    )}
                                    {currentProject.wiki_url && (
                                        <a href={currentProject.wiki_url} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-4 text-sm font-bold hover:translate-x-1.5 transition-all group"
                                            style={{ color: colors.onSurface }}>
                                            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border transition-all group-hover:scale-110" 
                                                style={{ backgroundColor: `#f59e0b15`, borderColor: `#f59e0b25` }}>
                                                <i className="fa-solid fa-book text-sm" style={{ color: '#f59e0b' }} />
                                            </div>
                                            <span className="flex-1 truncate opacity-70 group-hover:opacity-100">Visit wiki</span>
                                            <i className="fa-solid fa-arrow-up-right-from-square text-[10px] opacity-0 group-hover:opacity-40" />
                                        </a>
                                    )}
                                    {currentProject.discord_url && (
                                        <a href={currentProject.discord_url} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-4 text-sm font-bold hover:translate-x-1.5 transition-all group"
                                            style={{ color: colors.onSurface }}>
                                            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border transition-all group-hover:scale-110" 
                                                style={{ backgroundColor: `#5865f215`, borderColor: `#5865f225` }}>
                                                <i className="fa-brands fa-discord text-sm" style={{ color: '#5865f2' }} />
                                            </div>
                                            <span className="flex-1 truncate opacity-70 group-hover:opacity-100">Join Discord</span>
                                            <i className="fa-solid fa-arrow-up-right-from-square text-[10px] opacity-0 group-hover:opacity-40" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Creators */}
                        {((currentProject.team_members && currentProject.team_members.length > 0) || currentProject.author) && (
                            <div>
                                <h4 className="text-sm font-black uppercase tracking-[0.25em] mb-6 flex items-center gap-3" style={{ color: colors.onSurface }}>
                                    <span className="w-1 h-4 rounded-full" style={{ backgroundColor: accentColor }} />
                                    {t('creators' as any) || "Creators"}
                                </h4>
                                <div className="space-y-4">
                                    {(currentProject.team_members && currentProject.team_members.length > 0 ? currentProject.team_members : [{ user: { username: currentProject.author }, role: "Author" }]).map((member, idx) => (
                                        <div key={idx} className="flex items-center gap-4 group">
                                            <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 shadow-lg border-2 border-transparent group-hover:border-white/20 transition-all"
                                                style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                                {member.user.avatar_url ? (
                                                    <img src={member.user.avatar_url} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <i className="fa-solid fa-user text-lg opacity-40" style={{ color: colors.onSurfaceVariant }} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-black truncate group-hover:text-white transition-colors tracking-wide" style={{ color: colors.onSurface }}>
                                                    {member.user.username}
                                                </p>
                                                <p className="text-xs font-bold capitalize opacity-40 tracking-widest" style={{ color: colors.onSurfaceVariant }}>
                                                    {member.role}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Project Info */}
                        <div className="pt-8 border-t space-y-4" style={{ borderColor: `${accentColor}15` }}>
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black opacity-50 uppercase tracking-[0.25em]" style={{ color: colors.onSurface }}>ID</span>
                                <span className="text-sm font-mono font-bold opacity-70" style={{ color: colors.onSurface }}>{currentProject.project_id}</span>
                            </div>
                            {currentProject.license && (
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black opacity-50 uppercase tracking-[0.25em]" style={{ color: colors.onSurface }}>
                                        {t('license' as any) || "License"}
                                    </span>
                                    <span className="text-sm font-black" style={{ color: colors.onSurface }}>
                                        {currentProject.license.name || currentProject.license.id}
                                    </span>
                                </div>
                            )}
                            {currentProject.date_created && (
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black opacity-50 uppercase tracking-[0.25em]" style={{ color: colors.onSurface }}>
                                        {t('created' as any) || "Created"}
                                    </span>
                                    <span className="text-sm font-bold opacity-70" style={{ color: colors.onSurface }}>
                                        {formatDate(currentProject.date_created)}
                                    </span>
                                </div>
                            )}
                            {currentProject.date_modified && (
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black opacity-50 uppercase tracking-[0.25em]" style={{ color: colors.onSurface }}>
                                        {t('updated' as any) || "Updated"}
                                    </span>
                                    <span className="text-sm font-bold opacity-70" style={{ color: colors.onSurface }}>
                                        {formatDate(currentProject.date_modified)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
