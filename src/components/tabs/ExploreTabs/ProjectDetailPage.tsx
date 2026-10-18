import { useState, useEffect } from "react";
import { useTabActive } from "../../../lib/tabKeepAlive";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { useTranslation } from "../../../hooks/useTranslation";
import type { ModrinthProject, ProjectVersion, ProjectType, InstallProgress } from "./types";
import { formatNumber } from "./helpers";
import { ImagePreviewModal } from "./ImagePreviewModal";
import { Icons } from "../../ui/Icons";
import { playClick } from "../../../lib/sounds";
import { useMotionPreset } from "../../../lib/motion";
import { normalizeModrinthVersion, normalizeCurseforgeVersion } from "./normalizers";
import { useUiStore } from "../../../store/uiStore";
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
    isInstalledProject?: boolean;
    onBack: () => void;
    onInstallModpack: (project: ModrinthProject) => void;
    onAddToInstance: (project: ModrinthProject) => void;
    onInstallVersion: (project: ModrinthProject, versionId: string) => void;
}

type DetailTab = "description" | "versions" | "gallery";



const markdownSanitizeSchema: any = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames || []), "iframe", "video", "source", "center", "details", "summary"],
    attributes: {
        ...defaultSchema.attributes,
        iframe: ["src", "width", "height", "allow", "allowfullscreen", "frameborder", "title"],
        img: [...(defaultSchema.attributes?.img || []), "loading", "style"],
        a: [...(defaultSchema.attributes?.a || []), "target", "rel"],
        "*": [...(defaultSchema.attributes?.["*"] || []), "align", "className", "id"],
    },
    protocols: {
        ...defaultSchema.protocols,
        src: ["http", "https"],
        href: ["http", "https", "mailto"],
    },
};

function _formatSize(bytes: number): string {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
}

function formatDate(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return dateStr;
    }
}

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
    isInstalledProject = false,
    onBack,
    onInstallModpack,
    onAddToInstance,
    onInstallVersion,
}: ProjectDetailPageProps) {
    const { t } = useTranslation();
    const m = useMotionPreset();
    const [activeTab, setActiveTab] = useState<DetailTab>("description");

    // Full-bleed page: the hero runs up under the see-through title bar.
    const setFullBleed = useUiStore((state) => state.setFullBleed);
    const tabActive = useTabActive();
    useEffect(() => {
        if (!tabActive) return;
        setFullBleed(true);
        return () => setFullBleed(false);
    }, [tabActive, setFullBleed]);
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
    const versionControlColor = colors.onSurface === "#ffffff" ? colors.onSurface : "#000";
    const [fullProject, setFullProject] = useState<ModrinthProject | null>(null);

    const currentProject = fullProject || project;

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
        return getImageUrl(raw) || bannerImage;
    })();

    // - When the body was already provided by the parent (preloaded), use it directly.
    // - Otherwise hit the API. Resetting bodyHtml on project change prevents flashing the
    //   previous project's body during a fast back-forth between detail pages (B6).
    useEffect(() => {
        setBodyHtml("");
    }, [project.project_id, contentSource]);
    useEffect(() => {
        if (activeTab !== "description") return;
        if (project.body) {
            setBodyHtml(project.body);
            return;
        }
        if (!bodyHtml) fetchBody();
    }, [activeTab, project.project_id, project.body, contentSource]);

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
                if (result) vers = result.map(normalizeModrinthVersion);
            } else {
                const result = await (window.api as any)?.curseforgeGetFiles?.(project.project_id);
                if (result?.data) vers = result.data.map(normalizeCurseforgeVersion);
            }
            setVersions(vers);
        } catch (error) {
            console.error("[ProjectDetail] Failed to fetch versions:", error);
        } finally {
            setVersionsLoading(false);
        }
    };

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
        if (isInstalledProject) return;
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
            <AnimatePresence>
            {selectedImageIndex !== null && project?.gallery && (
                <ImagePreviewModal
                    key="image-preview"
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
            </AnimatePresence>

            <div className="space-y-0 -mx-6 -mt-3">
                <div className="relative h-80 w-full overflow-hidden bg-cover bg-center"
                    style={{
                        backgroundImage: `url(${heroImage})`,
                        backgroundColor: colors.surfaceContainerHighest,
                    }}>
                    <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-transparent" />

                    <button
                        onClick={() => { playClick(); onBack(); }}
                        className="absolute top-14 left-6 z-20 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold backdrop-blur-md transition-all hover:scale-105 active:scale-95 group"
                        style={{
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            color: '#fff',
                            border: '1px solid rgba(255,255,255,0.15)',
                        }}
                    >
                        <i className="fa-solid fa-arrow-left text-xs transition-transform group-hover:-translate-x-1" style={{ color: accentColor }} />
                        {t('back')}
                    </button>

                    <motion.div
                        variants={m.staggerContainer(0.05)}
                        {...m.states}
                        className="absolute bottom-0 left-0 right-0 p-6 flex items-end gap-5 z-10"
                    >
                        <motion.div
                            variants={m.scaleIn}
                            className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 border-2 border-white/10"
                            style={{ backgroundColor: colors.surfaceContainerHighest }}>
                            {project.icon_url ? (
                                <img src={project.icon_url} alt={project.title} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Icons.Box className="w-8 h-8 opacity-50" style={{ color: '#fff' }} />
                                </div>
                            )}
                        </motion.div>

                        <motion.div variants={m.fadeUp} className="flex-1 min-w-0">
                            <h1 className="font-display text-3xl text-white mb-1.5 truncate">
                                {currentProject.title}
                            </h1>
                            <div className="flex items-center gap-4 text-sm text-white/80 flex-wrap font-medium">
                                <span className="flex items-center gap-2">
                                    {/* Source logo (monochrome SVG) painted in its brand colour. */}
                                    <span
                                        aria-hidden="true"
                                        className="w-4 h-4 shrink-0"
                                        style={(() => {
                                            const src = contentSource === "modrinth" ? modrinthIcon : curseforgeIcon;
                                            const mask = `url("${src}")`;
                                            return {
                                                backgroundColor: contentSource === "modrinth" ? "#1bd96a" : "#f16436",
                                                maskImage: mask, WebkitMaskImage: mask,
                                                maskSize: "contain", WebkitMaskSize: "contain",
                                                maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
                                                maskPosition: "center", WebkitMaskPosition: "center",
                                            };
                                        })()}
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
                        </motion.div>

                        <motion.div variants={m.fadeUp} className="shrink-0">
                            {isInstallingModpack || installProgress ? (
                                <motion.div
                                    variants={m.scaleIn}
                                    initial="hidden"
                                    animate="show"
                                    className="px-6 py-3 rounded-xl flex items-center gap-3 backdrop-blur-md"
                                    style={{ backgroundColor: 'rgba(0,0,0,0.5)', border: `1px solid ${accentColor}` }}>
                                    <i className="fa-solid fa-spinner fa-spin" style={{ color: accentColor }} />
                                    <span className="text-sm text-white font-medium">
                                        {installProgress?.message || t('processing')}
                                    </span>
                                </motion.div>
                            ) : (
                                <motion.button
                                    {...(isInstalledProject ? {} : m.hoverLift)}
                                    onClick={() => { playClick(); handleAction(); }}
                                    className={`px-6 py-3 rounded-xl text-sm font-bold transition-[filter] flex items-center gap-2 ${isInstalledProject ? "cursor-default" : "hover:brightness-105"}`}
                                    style={{ backgroundColor: accentColor, color: "#000" }}
                                >
                                    <i className={`fa-solid ${isInstalledProject ? "fa-check" : projectType === "modpack" ? "fa-download" : "fa-plus"}`} style={{ color: "#000" }} />
                                    {isInstalledProject ? (t('installed' as any) || "ติดตั้งแล้ว") : projectType === "modpack" ? (t('install_as_new_instance')) : (t('add_to_instance'))}
                                </motion.button>
                            )}
                        </motion.div>
                    </motion.div>
                </div>

                {currentProject.categories && currentProject.categories.length > 0 && (
                    <motion.div variants={m.fadeIn} {...m.states} className="px-6 pt-4 pb-1 flex items-center gap-2 flex-wrap"
                        style={{ backgroundColor: colors.surfaceContainer }}>
                        {currentProject.categories.map((cat) => (
                            <span key={cat}
                                className="h-8 px-3 inline-flex items-center rounded-lg text-[13px] font-semibold capitalize"
                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}>
                                {cat}
                            </span>
                        ))}
                    </motion.div>
                )}

                <div className="px-6 py-3"
                    style={{ backgroundColor: colors.surfaceContainer, borderBottom: `1px solid ${colors.outlineVariant}` }}>
                    <div className="inline-flex items-center gap-1 p-1 rounded-xl"
                        style={{ backgroundColor: colors.surfaceContainerHighest }}>
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => { playClick(); setActiveTab(tab.id); }}
                                className="h-9 px-4 rounded-lg text-sm font-semibold pressable flex items-center gap-2 relative isolate"
                                style={{
                                    color: activeTab === tab.id ? '#111' : colors.onSurfaceVariant,
                                }}
                            >
                                {activeTab === tab.id && (
                                    <motion.span
                                        layoutId="project-detail-tab-pill"
                                        transition={m.tabIndicator}
                                        className="absolute inset-0 -z-10 rounded-lg"
                                        style={{ backgroundColor: colors.secondary }}
                                    />
                                )}
                                <i className={`${tab.icon} text-sm`} />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
                    <div className="lg:col-span-9 p-7 min-w-0 overflow-hidden" style={{ backgroundColor: `${colors.surface}` }}>
                        <AnimatePresence mode="wait" initial={false}>
                        <motion.div key={activeTab} variants={m.panelSwap} {...m.states}>
                        {activeTab === "description" && (
                            <div>
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
                                    <motion.div
                                        variants={m.fadeIn}
                                        initial="hidden"
                                        animate="show"
                                        className="max-w-4xl mx-auto markdown-body text-[15px] leading-relaxed"
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
                                            rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]}
                                            remarkPlugins={[remarkGfm, remarkBreaks]}
                                            components={{
                                                h1: ({ node, ...props }: any) => {
                                                    const align = node?.properties?.align || props.align;
                                                    return <h1 className={`text-2xl font-bold mb-4 mt-10 first:mt-0 leading-snug ${align === 'center' ? 'w-full block text-center!' : ''}`} style={{ color: colors.onSurface, textAlign: align || 'inherit' }} {...props} />;
                                                },
                                                h2: ({ node, ...props }: any) => {
                                                    const align = node?.properties?.align || props.align;
                                                    return <h2 className={`text-xl font-bold mb-3 mt-8 first:mt-0 leading-snug ${align === 'center' ? 'w-full block text-center!' : ''}`} style={{ color: colors.onSurface, textAlign: align || 'inherit' }} {...props} />;
                                                },
                                                h3: ({ node, ...props }: any) => {
                                                    const align = node?.properties?.align || props.align;
                                                    return <h3 className={`text-lg font-bold mb-2 mt-6 first:mt-0 leading-snug ${align === 'center' ? 'w-full block text-center!' : ''}`} style={{ color: colors.onSurface, textAlign: align || 'inherit' }} {...props} />;
                                                },
                                                p: ({ node, ...props }: any) => {
                                                    const align = node?.properties?.align || props.align;
                                                    return <p className={`mb-4 leading-relaxed text-[15px] ${align === 'center' ? 'w-full block text-center!' : ''}`} style={{ color: colors.onSurface, textAlign: align || 'inherit' }} {...props} />;
                                                },
                                                a: ({ node, href, children, ...props }: any) => (
                                                    <a 
                                                        className="font-medium underline decoration-2 underline-offset-4 transition-opacity hover:opacity-80"
                                                        href={href || "#"} 
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            if (href && (href.startsWith('http') || href.startsWith('https'))) {
                                                                (window as any).api?.openExternal?.(href);
                                                            }
                                                        }}
                                                        style={{ color: colors.onSurface, textDecorationColor: colors.secondary, cursor: 'pointer' }}
                                                        {...props}
                                                    >
                                                        {children}
                                                    </a>
                                                ),
                                                ul: ({ node, ...props }: any) => <ul className="list-disc pl-6 mb-4 space-y-1.5" style={{ color: colors.onSurface }} {...props} />,
                                                ol: ({ node, ...props }: any) => <ol className="list-decimal pl-6 mb-4 space-y-1.5" style={{ color: colors.onSurface }} {...props} />,
                                                li: ({ node, ...props }: any) => <li className="text-[15px] leading-relaxed" style={{ color: colors.onSurface }} {...props} />,
                                                img: ({ node, ...props }: any) => (
                                                    <img
                                                        className="max-w-full rounded-lg"
                                                        alt={props.alt || ''}
                                                        loading="lazy"
                                                        {...props}
                                                    />
                                                ),
                                                blockquote: ({ node, ...props }: any) => (
                                                    <blockquote className="border-l-4 pl-5 pr-4 py-3 my-6 text-[15px] rounded-r-lg" style={{ backgroundColor: colors.surfaceContainerHighest, borderColor: colors.secondary, color: colors.onSurfaceVariant }} {...props} />
                                                ),
                                                div: ({ node, ...props }: any) => {
                                                    const align = node?.properties?.align || props.align;
                                                    return <div className={align === 'center' ? 'w-full block text-center!' : ''} style={{ textAlign: align || 'inherit' }} {...props} />;
                                                },
                                                span: ({ node, ...props }: any) => <span {...props} />,
                                                center: ({ node, ...props }: any) => <div className="w-full block text-center!" style={{ textAlign: 'center', width: '100%', display: 'block' }} {...props} />,
                                                iframe: ({ node, width, height, ...props }: any) => (
                                                    <iframe 
                                                        className="w-full rounded-xl my-6"
                                                        style={{ aspectRatio: '16/9', height: 'auto' }}
                                                        {...props} 
                                                    />
                                                ),
                                                code: ({ node, inline, className, children, ...props }: any) => (
                                                    <code
                                                        className={`${inline !== false && !className ? 'px-1.5 py-0.5 rounded-md' : 'block p-4 rounded-xl my-6 whitespace-pre-wrap break-words'} text-[13px] font-mono`}
                                                        style={{
                                                            backgroundColor: colors.surfaceContainerHighest,
                                                            color: colors.onSurface,
                                                        }}
                                                        {...props}
                                                    >
                                                        {children}
                                                    </code>
                                                ),
                                                pre: ({ node, ...props }: any) => (
                                                    <pre className="my-6 max-w-full whitespace-pre-wrap break-words text-[13px] leading-relaxed" style={{ color: colors.onSurface }} {...props} />
                                                ),
                                                hr: ({ node, ...props }: any) => <hr className="my-8 border-0 h-px" style={{ backgroundColor: colors.outlineVariant }} {...props} />,
                                                strong: ({ node, ...props }: any) => <strong className="font-bold" style={{ color: colors.onSurface }} {...props} />,
                                                table: ({ node, ...props }: any) => (
                                                    <div className="overflow-x-auto my-6 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                                                        <table className="w-full text-sm border-collapse" style={{ color: colors.onSurface }} {...props} />
                                                    </div>
                                                ),
                                                th: ({ node, ...props }: any) => <th className="px-4 py-3 text-left text-[13px] font-semibold border-b" style={{ backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant, color: colors.onSurface }} {...props} />,
                                                td: ({ node, ...props }: any) => <td className="px-4 py-3 text-sm border-b" style={{ borderColor: colors.outlineVariant, color: colors.onSurface }} {...props} />,
                                            }}
                                        >
                                            {/^\s*</.test(bodyHtml) ? bodyHtml.replace(/^[ \t]+/gm, "") : bodyHtml}
                                        </ReactMarkdown>
                                    </motion.div>
                                ) : (
                                    <div className="py-8">
                                        <p className="max-w-4xl mx-auto text-[15px] leading-relaxed whitespace-pre-line" style={{ color: colors.onSurface }}>
                                            {project.description}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === "versions" && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <div className="flex items-center gap-2.5 h-10 px-3.5 rounded-xl flex-1 min-w-50 transition-all focus-within:ring-2"
                                        style={{
                                            backgroundColor: colors.surfaceContainerHighest,
                                            '--tw-ring-color': `${accentColor}60`
                                        } as any}>
                                        <i className="fa-solid fa-search text-sm" style={{ color: colors.onSurfaceVariant }} />
                                        <input
                                            type="text"
                                            placeholder={t('search_versions' as any) || "Filter versions..."}
                                            value={versionFilter}
                                            onChange={(e) => { setVersionFilter(e.target.value); setVersionsPage(1); }}
                                            className="bg-transparent outline-none text-sm w-full"
                                            style={{ color: colors.onSurface }}
                                        />
                                    </div>

                                    <div className="flex items-center gap-1 rounded-xl p-1"
                                        style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                        {(["all", "release", "beta", "alpha"] as const).map((ch) => (
                                            <button
                                                key={ch}
                                                onClick={() => { playClick(); setChannelFilter(ch); setVersionsPage(1); }}
                                                className="h-8 px-3 rounded-lg text-[13px] font-semibold pressable capitalize relative isolate"
                                                style={{
                                                    color: channelFilter === ch ? "#111" : colors.onSurfaceVariant,
                                                }}
                                            >
                                                {channelFilter === ch && (
                                                    <motion.span
                                                        layoutId="project-detail-channel-pill"
                                                        transition={m.tabIndicator}
                                                        className="absolute inset-0 -z-10 rounded-lg"
                                                        style={{ backgroundColor: accentColor }}
                                                    />
                                                )}
                                                {ch === "all" ? (t('all' as any) || "All") : ch}
                                            </button>
                                        ))}
                                    </div>

                                    {!versionsLoading && totalVersionPages > 1 && (
                                        <div className="flex items-center gap-1 p-1 rounded-xl ml-auto"
                                            style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                            <button
                                                onClick={() => { playClick(); setVersionsPage(p => Math.max(1, p - 1)); }}
                                                disabled={versionsPage === 1}
                                                aria-label="Previous page"
                                                className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30 transition-opacity hover:opacity-70"
                                                style={{ color: versionControlColor }}
                                            >
                                                <i className="fa-solid fa-chevron-left text-xs" />
                                            </button>
                                            <span className="text-sm px-2 font-semibold tabular-nums" style={{ color: versionControlColor }}>
                                                {versionsPage} / {totalVersionPages}
                                            </span>
                                            <button
                                                onClick={() => { playClick(); setVersionsPage(p => Math.min(totalVersionPages, p + 1)); }}
                                                disabled={versionsPage >= totalVersionPages}
                                                aria-label="Next page"
                                                className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30 transition-opacity hover:opacity-70"
                                                style={{ color: versionControlColor }}
                                            >
                                                <i className="fa-solid fa-chevron-right text-xs" />
                                            </button>
                                        </div>
                                    )}
                                </div>

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
                                    <motion.div
                                        key={`${channelFilter}-${versionFilter}-${versionsPage}`}
                                        variants={m.fadeIn}
                                        initial="hidden"
                                        animate="show"
                                        className="rounded-xl overflow-hidden"
                                        style={{ backgroundColor: colors.surfaceContainer }}
                                    >
                                        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-[13px] font-semibold"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>
                                            <div className="col-span-4">{t('name' as any) || "Name"}</div>
                                            <div className="col-span-2">{t('game_version' as any) || "Game version"}</div>
                                            <div className="col-span-2">{t('platforms' as any) || "Platforms"}</div>
                                            <div className="col-span-2">{t('published' as any) || "Published"}</div>
                                            <div className="col-span-1 text-right">{t('downloads' as any) || "Downloads"}</div>
                                            <div className="col-span-1" />
                                        </div>

                                        {paginatedVersions.map((v, i) => (
                                            <div key={v.id}
                                                className="grid grid-cols-12 gap-2 items-center px-4 py-3 transition-colors group"
                                                style={{
                                                    borderTop: i > 0 ? `1px solid ${colors.outlineVariant}` : 'none',
                                                    backgroundColor: 'transparent',
                                                }}>
                                                <div className="col-span-4 flex items-center gap-3 min-w-0">
                                                    <div className={`w-2 h-2 rounded-full shrink-0 ${v.version_type === 'release' ? 'bg-emerald-400' : v.version_type === 'beta' ? 'bg-amber-400' : 'bg-red-400'}`} />
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold truncate" style={{ color: colors.onSurface }}>
                                                            {v.version_number}
                                                        </p>
                                                        {v.name !== v.version_number && (
                                                            <p className="text-xs truncate" style={{ color: colors.onSurfaceVariant }}>
                                                                {v.name}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="col-span-2 text-sm" style={{ color: colors.onSurfaceVariant }}>
                                                    <span className="truncate block">{v.game_versions.slice(0, 3).join(", ")}{v.game_versions.length > 3 ? "..." : ""}</span>
                                                </div>

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
                                                            <span key={l} className="h-6 px-2 rounded-md text-xs font-semibold capitalize flex items-center gap-1.5"
                                                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}>
                                                                {icon ? (
                                                                    <img src={(icon as any).src || icon} className="w-3.5 h-3.5 object-contain" alt={l} />
                                                                ) : (
                                                                    <i className="fa-solid fa-box text-xs" style={{ color }} />
                                                                )}
                                                                {l}
                                                            </span>
                                                        );
                                                    })}
                                                </div>

                                                <div className="col-span-2 text-sm" style={{ color: colors.onSurfaceVariant }}>
                                                    {formatRelativeTime(v.date_published)}
                                                </div>

                                                <div className="col-span-1 text-right text-sm tabular-nums" style={{ color: colors.onSurfaceVariant }}>
                                                    {formatNumber(v.downloads)}
                                                </div>

                                                <div className="col-span-1 flex justify-end gap-1">
                                                    <button
                                                        onClick={() => { playClick(); onInstallVersion(project, v.id); }}
                                                        className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:brightness-95 active:scale-90"
                                                        style={{ backgroundColor: colors.surfaceContainerHighest, color: versionControlColor }}
                                                        title={t('install' as any) || "Install"}
                                                    >
                                                        <i className="fa-solid fa-download text-xs" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </motion.div>
                                )}
                            </div>
                        )}

                        {activeTab === "gallery" && project.gallery && (
                            <div>
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                    {project.gallery.map((img, idx) => {
                                        const url = getImageUrl(img);
                                        return (
                                            <div key={idx}
                                                className="relative aspect-video rounded-xl overflow-hidden cursor-pointer group"
                                                style={{ backgroundColor: colors.surfaceContainerHighest }}
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
                        </motion.div>
                        </AnimatePresence>
                    </div>

                    <motion.div
                        variants={m.fadeUp}
                        {...m.states}
                        className="lg:col-span-3 p-6 space-y-7 flex flex-col"
                        style={{ backgroundColor: colors.surfaceContainer }}>

                        <div>
                            <h4 className="text-base font-bold mb-4" style={{ color: colors.onSurface }}>
                                {t('compatibility' as any) || "Compatibility"}
                            </h4>

                            <div className="space-y-5">
                                {currentProject.game_versions && currentProject.game_versions.length > 0 && (
                                    <div>
                                        <p className="text-[13px] font-semibold mb-2" style={{ color: colors.onSurfaceVariant }}>
                                            Minecraft: Java Edition
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {currentProject.game_versions.slice().reverse().slice(0, 15).map((v) => (
                                                <span key={v} className="h-8 px-3 inline-flex items-center rounded-lg text-[13px] font-semibold cursor-default"
                                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}>
                                                    {v}
                                                </span>
                                            ))}
                                            {currentProject.game_versions.length > 15 && (
                                                <span className="h-8 px-2 inline-flex items-center text-[13px] font-semibold"
                                                    style={{ color: colors.onSurfaceVariant }}>
                                                    +{currentProject.game_versions.length - 15}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {currentProject.loaders && currentProject.loaders.length > 0 && (
                                    <div>
                                        <p className="text-[13px] font-semibold mb-2" style={{ color: colors.onSurfaceVariant }}>
                                            {t('platforms' as any) || "Platforms"}
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
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
                                                    <span key={l} className="h-8 px-3 rounded-lg text-[13px] font-semibold capitalize flex items-center gap-2"
                                                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}>
                                                        {icon ? (
                                                            <img src={(icon as any).src || icon} className="w-4 h-4 object-contain" alt={l} />
                                                        ) : (
                                                            <i className="fa-solid fa-box text-xs" style={{ color }} />
                                                        )}
                                                        {l}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {(currentProject.client_side || currentProject.server_side) && (
                                    <div>
                                        <p className="text-[13px] font-semibold mb-2" style={{ color: colors.onSurfaceVariant }}>
                                            {t('supported_environments' as any) || "Environments"}
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {currentProject.client_side && (
                                                <span className="h-8 px-3 rounded-lg text-[13px] font-semibold flex items-center gap-2"
                                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}>
                                                    <i className="fa-solid fa-desktop text-xs" style={{ color: colors.onSurfaceVariant }} />
                                                    {currentProject.client_side === "required" ? "Client-side" : currentProject.client_side === "optional" ? "Client (optional)" : currentProject.client_side}
                                                </span>
                                            )}
                                            {currentProject.server_side && (
                                                <span className="h-8 px-3 rounded-lg text-[13px] font-semibold flex items-center gap-2"
                                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}>
                                                    <i className="fa-solid fa-server text-xs" style={{ color: colors.onSurfaceVariant }} />
                                                    {currentProject.server_side === "required" ? "Server-side" : currentProject.server_side === "optional" ? "Server (optional)" : currentProject.server_side}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {(currentProject.source_url || currentProject.wiki_url || currentProject.discord_url || currentProject.issues_url) && (
                            <div>
                                <h4 className="text-base font-bold mb-3" style={{ color: colors.onSurface }}>
                                    {t('links' as any) || "Links"}
                                </h4>
                                <div className="space-y-0.5">
                                    {currentProject.issues_url && (
                                        <a href={currentProject.issues_url} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-3 h-10 px-3 -mx-3 rounded-lg text-sm font-medium transition-colors group hover:bg-black/5"
                                            style={{ color: colors.onSurface }}>
                                            <div className="w-5 flex items-center justify-center shrink-0">
                                                <i className="fa-solid fa-bug text-sm" style={{ color: '#f43f5e' }} />
                                            </div>
                                            <span className="flex-1 truncate">Report issues</span>
                                            <i className="fa-solid fa-arrow-up-right-from-square text-xs opacity-40 group-hover:opacity-80" style={{ color: colors.onSurfaceVariant }} />
                                        </a>
                                    )}
                                    {currentProject.source_url && (
                                        <a href={currentProject.source_url} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-3 h-10 px-3 -mx-3 rounded-lg text-sm font-medium transition-colors group hover:bg-black/5"
                                            style={{ color: colors.onSurface }}>
                                            <div className="w-5 flex items-center justify-center shrink-0">
                                                <i className="fa-solid fa-code text-sm" style={{ color: '#6366f1' }} />
                                            </div>
                                            <span className="flex-1 truncate">View source</span>
                                            <i className="fa-solid fa-arrow-up-right-from-square text-xs opacity-40 group-hover:opacity-80" style={{ color: colors.onSurfaceVariant }} />
                                        </a>
                                    )}
                                    {currentProject.wiki_url && (
                                        <a href={currentProject.wiki_url} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-3 h-10 px-3 -mx-3 rounded-lg text-sm font-medium transition-colors group hover:bg-black/5"
                                            style={{ color: colors.onSurface }}>
                                            <div className="w-5 flex items-center justify-center shrink-0">
                                                <i className="fa-solid fa-book text-sm" style={{ color: '#f59e0b' }} />
                                            </div>
                                            <span className="flex-1 truncate">Visit wiki</span>
                                            <i className="fa-solid fa-arrow-up-right-from-square text-xs opacity-40 group-hover:opacity-80" style={{ color: colors.onSurfaceVariant }} />
                                        </a>
                                    )}
                                    {currentProject.discord_url && (
                                        <a href={currentProject.discord_url} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-3 h-10 px-3 -mx-3 rounded-lg text-sm font-medium transition-colors group hover:bg-black/5"
                                            style={{ color: colors.onSurface }}>
                                            <div className="w-5 flex items-center justify-center shrink-0">
                                                <i className="fa-brands fa-discord text-sm" style={{ color: '#5865f2' }} />
                                            </div>
                                            <span className="flex-1 truncate">Join Discord</span>
                                            <i className="fa-solid fa-arrow-up-right-from-square text-xs opacity-40 group-hover:opacity-80" style={{ color: colors.onSurfaceVariant }} />
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}

                        {((currentProject.team_members && currentProject.team_members.length > 0) || currentProject.author) && (
                            <div>
                                <h4 className="text-base font-bold mb-3" style={{ color: colors.onSurface }}>
                                    {t('creators' as any) || "Creators"}
                                </h4>
                                <div className="space-y-3">
                                    {(currentProject.team_members && currentProject.team_members.length > 0 ? currentProject.team_members : [{ user: { username: currentProject.author }, role: "Author" }]).map((member, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => {
                                                playClick();
                                                const name = encodeURIComponent(member.user.username);
                                                // Creator's public profile on the source site.
                                                const url = contentSource === "modrinth"
                                                    ? `https://modrinth.com/user/${name}`
                                                    : `https://www.curseforge.com/members/${name}`;
                                                (window as any).api?.openExternal?.(url);
                                            }}
                                            title={member.user.username}
                                            className="group w-full flex items-center gap-3 p-1.5 -mx-1.5 rounded-xl text-left transition-colors hover:bg-black/5"
                                        >
                                            <div className="w-10 h-10 rounded-full overflow-hidden shrink-0"
                                                style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                                {member.user.avatar_url ? (
                                                    <img src={member.user.avatar_url} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <i className="fa-solid fa-user text-base" style={{ color: colors.onSurfaceVariant }} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold truncate group-hover:underline" style={{ color: colors.onSurface }}>
                                                    {member.user.username}
                                                </p>
                                                <p className="text-[13px] capitalize truncate" style={{ color: colors.onSurfaceVariant }}>
                                                    {member.role}
                                                </p>
                                            </div>
                                            <i className="fa-solid fa-arrow-up-right-from-square text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: colors.onSurfaceVariant }} />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="pt-6 border-t space-y-3" style={{ borderColor: colors.outlineVariant }}>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-[13px] font-semibold" style={{ color: colors.onSurfaceVariant }}>ID</span>
                                <span className="text-[13px] font-mono truncate" style={{ color: colors.onSurface }}>{currentProject.project_id}</span>
                            </div>
                            {currentProject.license && (
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[13px] font-semibold" style={{ color: colors.onSurfaceVariant }}>
                                        {t('license' as any) || "License"}
                                    </span>
                                    <span className="text-[13px] font-medium" style={{ color: colors.onSurface }}>
                                        {currentProject.license.name || currentProject.license.id}
                                    </span>
                                </div>
                            )}
                            {currentProject.date_created && (
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[13px] font-semibold" style={{ color: colors.onSurfaceVariant }}>
                                        {t('created' as any) || "Created"}
                                    </span>
                                    <span className="text-[13px] font-medium" style={{ color: colors.onSurface }}>
                                        {formatDate(currentProject.date_created)}
                                    </span>
                                </div>
                            )}
                            {currentProject.date_modified && (
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[13px] font-semibold" style={{ color: colors.onSurfaceVariant }}>
                                        {t('updated' as any) || "Updated"}
                                    </span>
                                    <span className="text-[13px] font-medium" style={{ color: colors.onSurface }}>
                                        {formatDate(currentProject.date_modified)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            </div>
        </>
    );
}
