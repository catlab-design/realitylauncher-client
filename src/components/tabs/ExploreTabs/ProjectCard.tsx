// ========================================
// Project Card Component
// ========================================

import React, { useState } from "react";
import { useTranslation } from "../../../hooks/useTranslation";
import type { ModrinthProject } from "./types";
import { formatNumber } from "./helpers";
import { playClick } from "../../../lib/sounds";
import { Icons } from "../../ui/Icons";

interface ProjectCardProps {
    colors: any;
    project: ModrinthProject;
    isActive: boolean;
    onClick: () => void;
}

export function ProjectCard({ colors, project, isActive, onClick }: ProjectCardProps) {
    const [isHovered, setIsHovered] = useState(false);
    const { t } = useTranslation();

    // Convert integer color to hex string if available
    const accentColor = project.color
        ? `#${project.color.toString(16).padStart(6, '0')}`
        : colors.secondary;

    return (
        <button
            onClick={() => { playClick(); onClick(); }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="group relative w-full text-left rounded-xl overflow-hidden transition-all duration-300"
            style={{
                backgroundColor: isActive ? `${colors.primary}15` : `${colors.surfaceContainer}60`, // Glassmorphism base
                border: `1px solid ${isActive ? colors.primary : colors.outline + "20"}`,
                transform: isHovered ? "translateY(-2px)" : "none",
                boxShadow: isHovered
                    ? `0 8px 20px -6px ${colors.shadow}40`
                    : "none",
                backdropFilter: "blur(12px)",
            }}
        >
            {/* Accent Glow on Hover */}
            <div
                className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none"
                style={{
                    background: `radial-gradient(circle at center, ${accentColor}, transparent 70%)`
                }}
            />

            <div className="p-4 flex items-start gap-4 reltive z-10">
                {/* Icon */}
                <div
                    className="w-12 h-12 rounded-xl bg-cover bg-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow overflow-hidden"
                    style={{
                        backgroundImage: project.icon_url ? `url('${project.icon_url}')` : undefined,
                        backgroundColor: colors.surfaceContainerHighest,
                        border: `1px solid ${colors.outline}10`
                    }}
                >
                    {project.icon_url ? (
                        <img src={project.icon_url} alt={project.title} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Icons.Box className="w-5 h-5" style={{ color: colors.onSurfaceVariant }} />
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                        <h3 className="text-sm font-semibold truncate pr-2 transition-colors"
                            style={{ color: isActive ? colors.primary : colors.onSurface }}>
                            {project.title}
                        </h3>
                    </div>

                    <p className="text-[11px] truncate mb-2" style={{ color: colors.onSurfaceVariant }}>
                        {t('by')} <span style={{ color: colors.onSurface }}>{project.author}</span>
                    </p>

                    <p className="text-[11px] line-clamp-2 leading-relaxed h-[34px] mb-3 opacity-80"
                        style={{ color: colors.onSurfaceVariant }}>
                        {project.description}
                    </p>

                    {/* Stats Badges */}
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium"
                            style={{ backgroundColor: `${colors.secondary}15`, color: colors.onSurface }}>
                            <i className="fa-solid fa-download text-[9px]" style={{ color: colors.secondary }}></i>
                            {formatNumber(project.downloads)}
                        </span>

                        {project.categories && project.categories.length > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-medium truncate max-w-[80px]"
                                style={{ backgroundColor: `${colors.surfaceContainerHighest}80`, color: colors.onSurfaceVariant }}>
                                {project.categories[0]}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </button>
    );
}
