// ========================================
// Explore Toolbar - Search, Filters, Tabs
// ========================================

import React from "react";
import { useTranslation } from "../../../hooks/useTranslation";
import type { TranslationKey } from "../../../i18n/translations";
import modrinthIcon from "../../../assets/modrinth.svg";
import curseforgeIcon from "../../../assets/curseforge.svg";
import { motion } from "framer-motion";
import { CONTENT_SOURCES, type ContentSource, type ProjectType } from "./types";
import { PROJECT_TABS, SORT_OPTIONS } from "./constants";
import { playClick } from "../../../lib/sounds";

interface ExploreToolbarProps {
    colors: any;
    // State
    contentSource: ContentSource;
    projectType: ProjectType;
    searchQuery: string;
    sortBy: string;
    viewCount: number;
    page: number;
    totalPages: number;
    // Handlers
    onContentSourceChange: (source: ContentSource) => void;
    onProjectTypeChange: (type: ProjectType) => void;
    onSearchChange: (query: string) => void;
    onSearchSubmit: () => void;
    onSortChange: (sort: string) => void;
    onViewCountChange: (count: number) => void;
    onPageChange: (page: number) => void;
}

export function ExploreToolbar({
    colors,
    contentSource,
    projectType,
    searchQuery,
    sortBy,
    viewCount,
    page,
    totalPages,
    onContentSourceChange,
    onProjectTypeChange,
    onSearchChange,
    onSearchSubmit,
    onSortChange,
    onViewCountChange,
    onPageChange,
}: ExploreToolbarProps) {
    const { t } = useTranslation();
    const currentTab = PROJECT_TABS.find((p) => p.id === projectType);
    const projectTypeLabel = currentTab ? t(currentTab.labelKey as TranslationKey) : (projectType === "mod" ? t('mods' as TranslationKey) : projectType);
    return (
        <div className="rounded-lg" style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}30` }}>
            {/* Top row: Title + Search */}
            <div className="px-4 py-3 flex items-center gap-4 border-b" style={{ borderColor: colors.outline + "30" }}>
                <div className="flex items-center gap-3 min-w-0">
                    <i className="fa-solid fa-compass" style={{ color: colors.secondary }}></i>
                    <span className="font-medium text-sm" style={{ color: colors.onSurface }}>{t('explore')}</span>
                </div>
                <div className="flex-1 relative">
                    <input
                        type="text"
                        placeholder={
                            t('search_placeholder').replace('{type}', projectTypeLabel)
                        }
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
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
                        onClick={() => { playClick(); onContentSourceChange(CONTENT_SOURCES.MODRINTH); }}
                        className="px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all relative group"
                        style={{
                            color: contentSource === CONTENT_SOURCES.MODRINTH ? "#000" : colors.onSurfaceVariant,
                        }}
                    >
                        {contentSource === CONTENT_SOURCES.MODRINTH && (
                            <motion.div
                                layoutId="explore-source-indicator"
                                className="absolute inset-0 rounded-md shadow-sm"
                                style={{ backgroundColor: "#1bd96a" }}
                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            />
                        )}
                        <img src={modrinthIcon.src} alt="" className="w-4 h-4 z-10 relative" />
                        <span className="z-10 relative">Modrinth</span>
                    </button>
                    <button
                        onClick={() => { playClick(); onContentSourceChange(CONTENT_SOURCES.CURSEFORGE); }}
                        className="px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all relative group"
                        style={{
                            color: contentSource === CONTENT_SOURCES.CURSEFORGE ? "#fff" : colors.onSurfaceVariant,
                        }}
                    >
                        {contentSource === CONTENT_SOURCES.CURSEFORGE && (
                            <motion.div
                                layoutId="explore-source-indicator"
                                className="absolute inset-0 rounded-md shadow-sm"
                                style={{ backgroundColor: "#f16436" }}
                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            />
                        )}
                        <img src={curseforgeIcon.src} alt="" className="w-4 h-4 z-10 relative" />
                        <span className="z-10 relative">CurseForge</span>
                    </button>
                </div>
            </div>

            {/* Bottom row: Tabs + Filters */}
            <div className="px-4 py-2 flex items-center gap-2">
                {/* Type tabs */}
                <div className="flex items-center gap-1">
                    {PROJECT_TABS.map((tab) => {
                        const active = projectType === tab.id;
                        const TabIcon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => { playClick(); onProjectTypeChange(tab.id); }}
                                className="px-3 py-1 rounded-md text-xs font-medium transition-all relative group flex items-center gap-2"
                                style={{
                                    color: active ? "#1a1a1a" : colors.onSurfaceVariant,
                                }}
                            >
                                {active && (
                                    <motion.div
                                        layoutId="explore-tabs-indicator"
                                        className="absolute inset-0 rounded-md"
                                        style={{ backgroundColor: colors.secondary }}
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    />
                                )}
                                <TabIcon className="w-3.5 h-3.5 z-10 relative" />
                                <span className="z-10 relative">{t(tab.labelKey as TranslationKey)}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="flex-1" />

                {/* Filters */}
                <div className="flex items-center gap-2">
                    <select
                        value={sortBy}
                        onChange={(e) => { playClick(); onSortChange(e.target.value); }}
                        className="px-2 py-1 rounded-md text-xs"
                        style={{
                            backgroundColor: colors.surface,
                            border: `1px solid ${colors.outline}40`,
                            color: colors.onSurface,
                        }}
                    >
                        {SORT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{t(opt.labelKey as TranslationKey)}</option>
                        ))}
                    </select>

                    <select
                        value={viewCount}
                        onChange={(e) => { playClick(); onViewCountChange(Number(e.target.value)); }}
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
                                onClick={() => { playClick(); onPageChange(Math.max(1, page - 1)); }}
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
                                onClick={() => { playClick(); onPageChange(Math.min(totalPages, page + 1)); }}
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
    );
}
