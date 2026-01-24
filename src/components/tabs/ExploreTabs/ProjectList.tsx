// ========================================
// Project List Component
// ========================================

import React from "react";
import { useTranslation } from "../../../hooks/useTranslation";
import type { ModrinthProject } from "./types";
import { ProjectCard } from "./ProjectCard";
import { Icons } from "../../ui/Icons";

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
}: ProjectListProps) {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col h-full gap-4">
            {/* Header Stats */}
            {!isLoading && (
                <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-medium" style={{ color: colors.onSurfaceVariant }}>
                        {t('items_count').replace('{count}', ((totalHits && totalHits > 0) ? totalHits : results.length).toLocaleString())}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>
                        {t('page_of').replace('{page}', String(page)).replace('{totalPages}', String(Math.max(1, totalPages)))}
                    </span>
                </div>
            )}

            {/* Grid Content */}
            {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                    {Array.from({ length: viewCount }).map((_, i) => (
                        <div
                            key={i}
                            className="rounded-xl overflow-hidden p-4 flex gap-4 animate-skeleton-wave"
                            style={{
                                backgroundColor: `${colors.surfaceContainer}60`,
                                border: `1px solid ${colors.outline}15`,
                                animationDelay: `${Math.min(i * 30, 150)}ms`
                            }}
                        >
                            {/* Icon skeleton with shimmer */}
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
                        <Icons.Box className="w-8 h-8 opacity-50" style={{ color: colors.onSurfaceVariant }} />
                    </div>
                    <h3 className="text-sm font-medium mb-1" style={{ color: colors.onSurface }}>{t('no_results')}</h3>
                    <p className="text-xs opacity-70">{t('try_change_filters')}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 pb-4">
                    {results.map((project, index) => (
                        <div
                            key={project.project_id}
                            className="animate-card-appear"
                            style={{ animationDelay: `${Math.min(index * 20, 150)}ms` }}
                        >
                            <ProjectCard
                                colors={colors}
                                project={project}
                                isActive={previewProjectId === project.project_id}
                                onClick={() => onSelectProject(project)}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination - Bottom */}
            {!isLoading && results.length > 0 && totalPages > 1 && (
                <div className="flex justify-center mt-6 pb-2">
                    <div className="flex items-center gap-2 p-1 rounded-lg"
                        style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}20` }}>

                        <button
                            onClick={() => {
                                onPageChange(Math.max(1, page - 1));
                                // Scroll to top of list
                                document.querySelector('.lg\\:col-span-8')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            disabled={page === 1}
                            className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-40 hover:bg-white/5 transition-colors flex items-center gap-1.5"
                            style={{ color: colors.onSurface }}
                        >
                            <i className="fa-solid fa-chevron-left text-[10px]"></i>
                                {t('previous' as any)}
                        </button>

                        <div className="px-3 min-w-[80px] text-center" style={{ color: colors.onSurfaceVariant }}>
                            <span className="text-xs font-bold" style={{ color: colors.onSurface }}>{page}</span>
                            <span className="text-[10px] opacity-70 mx-1">/</span>
                            <span className="text-xs opacity-70">{totalPages}</span>
                        </div>

                        <button
                            onClick={() => {
                                onPageChange(Math.min(totalPages, page + 1));
                                // Scroll to top of list
                                document.querySelector('.lg\\:col-span-8')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            disabled={page >= totalPages}
                            className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-40 hover:bg-white/5 transition-colors flex items-center gap-1.5"
                            style={{ color: colors.onSurface }}
                        >
                            {t('next' as any)}
                            <i className="fa-solid fa-chevron-right text-[10px]"></i>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
