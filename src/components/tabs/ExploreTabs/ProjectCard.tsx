import React, { useState } from "react";
import { useTranslation } from "../../../hooks/useTranslation";
import type { ModrinthProject, InstallProgress } from "./types";
import { formatNumber } from "./helpers";
import { playClick } from "../../../lib/sounds";
import { Icons } from "../../ui/Icons";
import { AnimatePresence, motion } from "framer-motion";
import { useMotionPreset } from "../../../lib/motion";

interface ProjectCardProps {
    colors: any;
    project: ModrinthProject;
    isActive: boolean;
    onClick: () => void;
    isInstalling?: boolean;
    installProgress?: InstallProgress | null;
    /** "grid" = card (default), "list" = compact row. */
    layout?: "grid" | "list";
}

export function ProjectCard({ colors, project, isActive, onClick, isInstalling, installProgress, layout = "grid" }: ProjectCardProps) {
    const [isHovered, setIsHovered] = useState(false);
    const { t } = useTranslation();
    const m = useMotionPreset();


    // Accent used by the grid card's hover glow.
    const accentColor = project.color
        ? `#${project.color.toString(16).padStart(6, '0')}`
        : colors.secondary;

    if (layout === "list") {
        return (
            <button
                onClick={() => { playClick(); onClick(); }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className="relative w-full text-left rounded-xl overflow-hidden transition-colors"
                style={{
                    backgroundColor: isActive ? colors.surfaceContainerHighest : isHovered ? colors.surfaceContainer : "transparent",
                }}
            >
                <AnimatePresence>
                {isInstalling && (
                    <motion.div key="installing" variants={m.fadeIn} {...m.states} className="absolute inset-0 z-20 flex items-center justify-center gap-3 bg-black/45 backdrop-blur-[2px]">
                        <i className="fa-solid fa-spinner fa-spin text-lg" style={{ color: colors.secondary }}></i>
                        <span className="text-sm font-semibold text-white">{installProgress?.message || "Installing..."}</span>
                        {installProgress?.percent !== undefined && (
                            <div className="w-28 h-1.5 rounded-full overflow-hidden bg-white/20">
                                <div className="h-full w-full rounded-full transition-transform duration-300 ease-out" style={{ transform: `translateX(${Math.min(100, Math.max(0, installProgress.percent)) - 100}%)`, backgroundColor: colors.secondary }} />
                            </div>
                        )}
                    </motion.div>
                )}
                </AnimatePresence>

                <div className="flex items-center gap-4 px-3 py-3 min-h-20">
                    <div className="w-14 h-14 rounded-xl shrink-0 overflow-hidden" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                        {project.icon_url ? (
                            <img src={project.icon_url} alt={project.title} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <Icons.Box className="w-7 h-7" style={{ color: colors.onSurfaceVariant }} />
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 min-w-0">
                            <h3 className="text-base font-bold truncate" style={{ color: colors.onSurface }}>{project.title}</h3>
                            <span className="text-sm truncate shrink-0 max-w-[40%]" style={{ color: colors.onSurfaceVariant }}>
                                {t('by')} <span className="font-semibold" style={{ color: colors.onSurface }}>{project.author}</span>
                            </span>
                        </div>
                        <p className="text-sm mt-1 line-clamp-1" style={{ color: colors.onSurfaceVariant }}>{project.description}</p>
                    </div>

                    <div className="hidden md:flex items-center gap-2 shrink-0">
                        {project.categories && project.categories.length > 0 && (
                            <span className="h-7 px-2.5 inline-flex items-center rounded-lg text-xs font-medium capitalize truncate max-w-32"
                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>
                                {project.categories[0]}
                            </span>
                        )}
                        <span className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold tabular-nums"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}>
                            <i className="fa-solid fa-download text-[11px]" style={{ color: colors.onSurfaceVariant }}></i>
                            {formatNumber(project.downloads)}
                        </span>
                    </div>
                </div>
            </button>
        );
    }

    return (
        <motion.button
            {...(isActive ? { whileTap: m.hoverLift.whileTap } : m.hoverLift)}
            onClick={() => { playClick(); onClick(); }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="group relative w-full text-left rounded-2xl overflow-hidden transition-[background-color,box-shadow] duration-200"
            style={{
                backgroundColor: isActive ? colors.surfaceContainerHighest : colors.surfaceContainer,
                boxShadow: isActive ? `inset 0 0 0 2px ${colors.secondary}` : "none",
            }}
        >
            <div
                className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none"
                style={{
                    background: `radial-gradient(circle at center, ${accentColor}, transparent 70%)`
                }}
            />

            <AnimatePresence>
            {isInstalling && (
                <motion.div key="installing" variants={m.fadeIn} {...m.states} className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px]">
                    <div className="flex flex-col items-center gap-2 p-3 rounded-lg"
                         style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}30` }}>
                        <i className="fa-solid fa-spinner fa-spin text-lg" style={{ color: colors.secondary }}></i>
                        <span className="text-sm font-medium" style={{ color: colors.onSurface }}>
                            {installProgress?.message || "Installing..."}
                        </span>
                        {installProgress?.percent !== undefined && (
                            <div className="w-24 h-1 rounded-full overflow-hidden" style={{ backgroundColor: `${colors.onSurface}10` }}>
                                <div
                                    className="h-full w-full rounded-full transition-transform duration-300 ease-out"
                                    style={{
                                        transform: `translateX(${Math.min(100, Math.max(0, installProgress.percent)) - 100}%)`,
                                        backgroundColor: colors.secondary
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
            </AnimatePresence>

            <div className="p-4 flex items-start gap-4 relative z-10">
                <div
                    className="w-16 h-16 rounded-xl shrink-0 overflow-hidden"
                    style={{ backgroundColor: colors.surfaceContainerHighest }}
                >
                    {project.icon_url ? (
                        <img src={project.icon_url} alt={project.title} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Icons.Box className="w-7 h-7" style={{ color: colors.onSurfaceVariant }} />
                        </div>
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                        <h3 className="text-base font-bold truncate pr-2"
                            style={{ color: colors.onSurface }}>
                            {project.title}
                        </h3>
                    </div>

                    <p className="text-[13px] truncate mb-1.5" style={{ color: colors.onSurfaceVariant }}>
                        {t('by')} <span className="font-semibold" style={{ color: colors.onSurface }}>{project.author}</span>
                    </p>

                    <p className="text-[13px] line-clamp-2 leading-5 h-10 mb-3"
                        style={{ color: colors.onSurfaceVariant }}>
                        {project.description}
                    </p>

                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}>
                            <i className="fa-solid fa-download text-[11px]" style={{ color: colors.onSurfaceVariant }}></i>
                            {formatNumber(project.downloads)}
                        </span>

                        {project.categories && project.categories.length > 0 && (
                            <span className="inline-flex items-center h-7 px-2.5 rounded-lg text-xs font-medium truncate max-w-32 capitalize"
                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>
                                {project.categories[0]}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </motion.button>
    );
}
