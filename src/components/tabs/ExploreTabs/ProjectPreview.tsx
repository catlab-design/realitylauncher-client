// ========================================
// Project Preview Panel - Redesigned
// ========================================

import React from "react";
import { useTranslation } from "../../../hooks/useTranslation";
import type { ModrinthProject, ProjectType, InstallProgress } from "./types";
import { formatNumber } from "./helpers";
import { ImagePreviewModal } from "./ImagePreviewModal";
import bannerImage from "../../../assets/banner.png";
import { Icons } from "../../ui/Icons";

interface ProjectPreviewProps {
    colors: any;
    project: ModrinthProject | null;
    projectType: ProjectType;
    isInstallingModpack: boolean;
    installProgress: InstallProgress | null;
    onInstallModpack: (project: ModrinthProject) => void;
    onAddToInstance: (project: ModrinthProject) => void;
    isLoading?: boolean; // Add optional isLoading prop
}

// ========================================
// Image Preview Modal
// ========================================



export function ProjectPreview({
    colors,
    project,
    projectType,
    isInstallingModpack,
    installProgress,
    onInstallModpack,
    onAddToInstance,
    isLoading = false,
}: ProjectPreviewProps) {
    const { t } = useTranslation();
    const [selectedImageIndex, setSelectedImageIndex] = React.useState<number | null>(null);

    // Reset selected image when project changes
    React.useEffect(() => {
        setSelectedImageIndex(null);
    }, [project?.project_id]);

    // Loading Skeleton state
    if (isLoading) {
        return (
            <div className="rounded-2xl overflow-hidden sticky top-4 flex flex-col h-[calc(100vh-2rem)] animate-pulse"
                style={{
                    backgroundColor: colors.surfaceContainer,
                    border: `1px solid ${colors.outline}20`,
                    minHeight: "400px"
                }}>
                {/* Hero Header Skeleton */}
                <div className="relative h-48 w-full shrink-0"
                    style={{ backgroundColor: `${colors.surfaceContainerHighest}` }}>
                    {/* Floating Icon Base */}
                    <div className="absolute -bottom-8 left-6 w-20 h-20 rounded-2xl p-0.5 z-10"
                        style={{ backgroundColor: colors.surface }}>
                        <div className="w-full h-full rounded-[14px]"
                            style={{ backgroundColor: `${colors.surfaceContainerHighest}80` }} />
                    </div>
                </div>

                <div className="pt-10 px-6 pb-6 flex-1 flex flex-col space-y-4">
                    {/* Title & Meta Skeleton */}
                    <div className="space-y-2 mt-2">
                        <div className="h-7 w-3/4 rounded-md" style={{ backgroundColor: `${colors.surfaceContainerHighest}80` }} />
                        <div className="h-4 w-1/2 rounded-md" style={{ backgroundColor: `${colors.surfaceContainerHighest}80` }} />
                    </div>

                    {/* Tags Skeleton */}
                    <div className="flex gap-2">
                        <div className="h-5 w-16 rounded-md" style={{ backgroundColor: `${colors.surfaceContainerHighest}80` }} />
                        <div className="h-5 w-20 rounded-md" style={{ backgroundColor: `${colors.surfaceContainerHighest}80` }} />
                    </div>

                    {/* Button Skeleton */}
                    <div className="h-12 w-full rounded-xl" style={{ backgroundColor: `${colors.surfaceContainerHighest}80` }} />

                    {/* Description Skeleton */}
                    <div className="space-y-2 pt-2">
                        <div className="h-3 w-1/4 mb-2 rounded-md" style={{ backgroundColor: `${colors.surfaceContainerHighest}80` }} />
                        <div className="h-3 w-full rounded-md" style={{ backgroundColor: `${colors.surfaceContainerHighest}80` }} />
                        <div className="h-3 w-full rounded-md" style={{ backgroundColor: `${colors.surfaceContainerHighest}80` }} />
                        <div className="h-3 w-2/3 rounded-md" style={{ backgroundColor: `${colors.surfaceContainerHighest}80` }} />
                    </div>

                    {/* Gallery Skeleton */}
                    <div className="pt-2">
                        <div className="h-3 w-1/4 mb-3 rounded-md" style={{ backgroundColor: `${colors.surfaceContainerHighest}80` }} />
                        <div className="grid grid-cols-2 gap-2">
                            <div className="aspect-video rounded-lg" style={{ backgroundColor: `${colors.surfaceContainerHighest}80` }} />
                            <div className="aspect-video rounded-lg" style={{ backgroundColor: `${colors.surfaceContainerHighest}80` }} />
                        </div>
                    </div>
                </div>
            </div>
        );
    }



    if (!project) {
        return (
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
        );
    }

    const handleAction = () => {
        if (projectType === "modpack") {
            onInstallModpack(project);
        } else {
            onAddToInstance(project);
        }
    };

    // Use featured gallery image or fallback to icon
    const heroImageRaw = project.featured_gallery || (project.gallery && project.gallery.length > 0 ? project.gallery[0] : null);

    // Helper to get URL from raw image item (which could be string or object)
    const getImageUrl = (item: any) => {
        if (!item) return null;
        if (typeof item === 'string') return item;
        // Native module returns camelCase 'rawUrl'
        return item.rawUrl || item.raw_url || item.url || null;
    };

    const heroImage = getImageUrl(heroImageRaw) || bannerImage.src;
    const accentColor = project.color ? `#${project.color.toString(16).padStart(6, '0')}` : colors.primary;

    return (
        <>
            {selectedImageIndex !== null && project?.gallery && (
                <ImagePreviewModal
                    colors={colors}
                    imageUrl={getImageUrl(project.gallery[selectedImageIndex]) || ""}
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
                    preloadUrls={(() => {
                        const urls: string[] = [];
                        if (project.gallery && selectedImageIndex !== null) {
                            // Preload Next
                            if (selectedImageIndex < project.gallery.length - 1) {
                                const next = getImageUrl(project.gallery[selectedImageIndex + 1]);
                                if (next) urls.push(next);
                            }
                            // Preload Prev
                            if (selectedImageIndex > 0) {
                                const prev = getImageUrl(project.gallery[selectedImageIndex - 1]);
                                if (prev) urls.push(prev);
                            }
                        }
                        return urls;
                    })()}
                    imageIndex={selectedImageIndex}
                    totalImages={project.gallery ? project.gallery.length : 0}
                />
            )}

            <div className="rounded-2xl overflow-hidden sticky top-4 flex flex-col shadow-xl max-h-[calc(100vh-2rem)] overflow-y-auto custom-scrollbar"
                style={{
                    backgroundColor: colors.surfaceContainer,
                    border: `1px solid ${colors.outline}20`,
                    minHeight: "400px" // Ensure minimum height
                }}>

                {/* Hero Header */}
                <div className="relative h-48 w-full bg-cover bg-center shrink-0"
                    style={{
                        backgroundColor: colors.surfaceContainerHighest,
                        backgroundImage: heroImage ? `url(${heroImage})` : undefined
                    }}>
                    <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent" />

                    {/* Floating Icon */}
                    <div className="absolute -bottom-8 left-6 w-20 h-20 rounded-2xl shadow-2xl p-0.5 z-10"
                        style={{ backgroundColor: colors.surface }}>
                        <div className="w-full h-full rounded-[14px] bg-cover bg-center overflow-hidden"
                            style={{
                                backgroundImage: project.icon_url ? `url('${project.icon_url}')` : undefined,
                                backgroundColor: colors.surfaceContainerHighest
                            }}>
                            {project.icon_url ? (
                                <img src={project.icon_url} alt={project.title} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Icons.Box className="w-8 h-8 opacity-50" style={{ color: colors.onSurfaceVariant }} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="pt-10 px-6 pb-6 flex-1 flex flex-col">
                    {/* Header Content */}
                    <div className="mb-4">
                        <h2 className="text-xl font-bold mb-1 leading-tight" style={{ color: colors.onSurface }}>
                            {project.title}
                        </h2>
                        <div className="flex items-center gap-2 text-xs" style={{ color: colors.onSurfaceVariant }}>
                            <span>{t('by')} <span className="font-medium" style={{ color: colors.primary }}>{project.author}</span></span>
                            <span>•</span>
                            <div className="flex items-center gap-1">
                                <i className="fa-solid fa-download text-[10px]"></i>
                                {formatNumber(project.downloads)}
                            </div>
                            <span>•</span>
                            <div className="flex items-center gap-1">
                                <i className="fa-solid fa-heart text-[10px]"></i>
                                {formatNumber(project.follows)}
                            </div>
                        </div>
                    </div>

                    {/* Categories */}
                    {project.categories && project.categories.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-5">
                            {project.categories.slice(0, 6).map((cat) => (
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
                        {isInstallingModpack || installProgress ? (
                            <div className="rounded-xl p-4 border border-dashed text-center"
                                style={{ backgroundColor: `${colors.surfaceContainer}40`, borderColor: colors.secondary }}>
                                <div className="flex flex-col items-center gap-2">
                                    <i className="fa-solid fa-spinner fa-spin text-xl mb-1" style={{ color: colors.secondary }}></i>
                                    <span className="text-sm font-medium" style={{ color: colors.onSurface }}>
                                        {installProgress?.message || t('processing')}
                                    </span>
                                    {typeof installProgress?.percent === "number" && (
                                        <div className="w-full h-1.5 rounded-full mt-1 overflow-hidden"
                                            style={{ backgroundColor: `${colors.onSurface}10` }}>
                                            <div className="h-full transition-all duration-300"
                                                style={{ width: `${installProgress.percent}%`, backgroundColor: colors.secondary }} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={handleAction}
                                className="w-full py-3 rounded-xl text-sm font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 active:scale-95"
                                style={{
                                    backgroundColor: colors.secondary,
                                    color: "#1a1a1a" // Ensure contrast on bright buttons
                                }}
                            >
                                {projectType === "modpack" ? (
                                    <>
                                        <i className="fa-solid fa-download"></i>
                                        {t('install_as_new_instance')}
                                    </>
                                ) : (
                                    <>
                                        <i className="fa-solid fa-plus"></i>
                                        {t('add_to_instance')}
                                    </>
                                )}
                            </button>
                        )}
                    </div>

                    {/* Description */}
                    <div className="mb-6">
                        <h4 className="text-xs font-bold uppercase tracking-wider mb-2 opacity-70" style={{ color: colors.onSurfaceVariant }}>
                            {t('about')}
                        </h4>
                        <p className="text-xs leading-relaxed opacity-90 whitespace-pre-line" style={{ color: colors.onSurface }}>
                            {project.description}
                        </p>
                    </div>

                    {/* Gallery Preview (Mini) */}
                    {project.gallery && project.gallery.length > 0 && (
                        <div className="mb-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider mb-2 opacity-70" style={{ color: colors.onSurfaceVariant }}>
                                {t('gallery')}
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                                {project.gallery.slice(0, 4).map((img, idx) => {
                                    const isString = typeof img === 'string';
                                    const url = isString ? img : img.url;
                                    // Native module returns camelCase 'rawUrl'
                                    const rawUrl = isString ? img : (img.rawUrl || img.raw_url || img.url);

                                    return (
                                        <div
                                            key={idx}
                                            className="aspect-video rounded-lg overflow-hidden border cursor-pointer hover:opacity-80 transition-opacity"
                                            style={{ borderColor: `${colors.outline}20` }}
                                            onClick={() => setSelectedImageIndex(idx)}
                                        >
                                            <img
                                                src={url}
                                                alt={t('gallery')}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Footer Info */}
                    <div className="pt-4 mt-auto border-t flex justify-between items-center text-[10px]"
                        style={{ borderColor: `${colors.outline}20`, color: colors.onSurfaceVariant }}>
                        <span>ID: {project.project_id}</span>
                        {project.latest_version && (
                            <span>{t('version_label').replace('{version}', project.latest_version)}</span>
                        )}
                        <span>{project.client_side === "required" ? t('client_required') : t('client_optional')}</span>
                    </div>

                    {/* Supported Versions (Footer/Extra) */}
                    {(project.game_versions || project.loaders) && (
                        <div className="pt-2 text-[10px] opacity-70 flex flex-wrap gap-2" style={{ color: colors.onSurfaceVariant }}>
                            {project.loaders && project.loaders.length > 0 && (
                                <div className="flex gap-1">
                                    <span className="font-bold">{t('loaders_label')}</span>
                                    <span>{project.loaders.join(", ")}</span>
                                </div>
                            )}
                            {project.game_versions && project.game_versions.length > 0 && (
                                <div className="flex gap-1">
                                    <span className="font-bold">{t('versions_label')}</span>
                                    <span>{project.game_versions.slice(0, 5).join(", ")}{project.game_versions.length > 5 ? "..." : ""}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
