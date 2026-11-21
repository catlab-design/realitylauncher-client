import React, { useRef } from "react";
import { useTranslation } from "../../../hooks/useTranslation";
import type { ModrinthProject, InstallProgress } from "./types";
import { ProjectCard } from "./ProjectCard";
import { Icons } from "../../ui/Icons";
import { motion } from "framer-motion";
import { useMotionPreset } from "../../../lib/motion";

interface ProjectListProps {
    colors: any;
    results: ModrinthProject[];
    totalHits: number;
    isLoading: boolean;
    previewProjectId: string | null;
    page: number;
    totalPages: number;
    viewCount: number;
    onSelectProject: (project: ModrinthProject) => void;
    onPageChange: (page: number) => void;
    installingProjectId?: string | null;
    installProgress?: InstallProgress | null;
    layout?: "grid" | "list";
}

export function ProjectList({
    colors,
    results,
    totalHits,
    isLoading,
    previewProjectId,
    page,
    totalPages,
    viewCount,
    onSelectProject,
    onPageChange,
    installingProjectId,
    installProgress,
    layout = "grid",
}: ProjectListProps) {
    const { t } = useTranslation();
    const m = useMotionPreset();
    const containerRef = useRef<HTMLDivElement>(null);

    const handlePageChange = (newPage: number) => {
        onPageChange(newPage);
        if (containerRef.current) {
            containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <div ref={containerRef} className="flex flex-col h-full gap-4">
            {!isLoading && (
                <div className="flex items-center justify-between px-1">
                    <span className="text-sm font-medium" style={{ color: colors.onSurfaceVariant }}>
                        {t('items_count').replace('{count}', ((totalHits && totalHits > 0) ? totalHits : results.length).toLocaleString())}
                    </span>
                    <span className="text-[13px] font-medium"
                        style={{ color: colors.onSurfaceVariant }}>
                        {t('page_of').replace('{page}', String(page)).replace('{totalPages}', String(Math.max(1, totalPages)))}
                    </span>
                </div>
            )}

            {isLoading ? (
                <div className={layout === "list" ? "flex flex-col gap-0.5" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3"}>
                    {Array.from({ length: viewCount }).map((_, i) => (
                        <div
                            key={i}
                            className="rounded-2xl overflow-hidden p-4 flex gap-4 animate-skeleton-wave"
                            style={{
                                backgroundColor: colors.surfaceContainer,
                                animationDelay: `${Math.min(i * 30, 150)}ms`
                            }}
                        >
                            <div className="w-16 h-16 rounded-xl shrink-0 overflow-hidden relative"
                                style={{ backgroundColor: colors.surfaceContainerHighest }}>
                            </div>
                            <div className="flex-1 space-y-2">
                                <div className="h-4 rounded overflow-hidden relative" style={{ width: `${60 + (i % 3) * 15}%`, backgroundColor: colors.surfaceContainerHighest }}>
                                </div>
                                <div className="h-3 rounded overflow-hidden relative" style={{ width: `${40 + (i % 4) * 10}%`, backgroundColor: colors.surfaceContainerHighest }}>
                                </div>
                                <div className="h-3 rounded overflow-hidden relative mt-2" style={{ width: '100%', backgroundColor: colors.surfaceContainerHighest }}>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : results.length === 0 ? (
                <motion.div variants={m.scaleIn} {...m.states} className="flex-1 flex flex-col items-center justify-center p-12 text-center rounded-2xl"
                    style={{ backgroundColor: colors.surfaceContainer, color: colors.onSurfaceVariant }}>
                    <Icons.Search className="w-10 h-10 mb-4" style={{ color: colors.onSurfaceVariant }} />
                    <h3 className="text-lg font-bold mb-1" style={{ color: colors.onSurface }}>{t('no_results')}</h3>
                    <p className="text-sm">{t('try_change_filters')}</p>
                </motion.div>
            ) : (
                <motion.div
                    key={`${layout}-${page}`}
                    variants={m.fadeIn}
                    {...m.states}
                    className={layout === "list" ? "flex flex-col gap-0.5 pb-4" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 pb-4"}
                >
                    {results.map((project, index) => (
                        <motion.div
                            key={project.project_id}
                            variants={layout === "grid" ? m.showcaseItem : undefined}
                            custom={index}
                        >
                            <ProjectCard
                                colors={colors}
                                project={project}
                                isActive={previewProjectId === project.project_id}
                                onClick={() => onSelectProject(project)}
                                isInstalling={installingProjectId === project.project_id}
                                installProgress={installProgress}
                                layout={layout}
                            />
                        </motion.div>
                    ))}
                </motion.div>
            )}

            {!isLoading && results.length > 0 && totalPages > 1 && (
                <div className="flex justify-center mt-6 pb-2">
                    <div className="flex items-center gap-2 p-1 rounded-xl"
                        style={{ backgroundColor: colors.surfaceContainerHighest }}>

                        <button
                            onClick={() => handlePageChange(Math.max(1, page - 1))}
                            disabled={page === 1}
                            className="px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-40 hover:bg-white/5 pressable flex items-center gap-1.5"
                            style={{ color: colors.onSurface }}
                        >
                            <i className="fa-solid fa-chevron-left text-xs"></i>
                                {t('previous' as any)}
                        </button>

                        <div className="px-3 min-w-[80px] text-center" style={{ color: colors.onSurfaceVariant }}>
                            <span className="text-sm font-bold" style={{ color: colors.onSurface }}>{page}</span>
                            <span className="text-sm mx-1">/</span>
                            <span className="text-sm">{totalPages}</span>
                        </div>

                        <button
                            onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                            disabled={page >= totalPages}
                            className="px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-40 hover:bg-white/5 pressable flex items-center gap-1.5"
                            style={{ color: colors.onSurface }}
                        >
                            {t('next' as any)}
                            <i className="fa-solid fa-chevron-right text-xs"></i>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
