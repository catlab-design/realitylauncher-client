// ========================================
// Explore Toolbar - Search, Filters, Tabs
// ========================================

import React, { useState } from "react";
import { useTranslation } from "../../../hooks/useTranslation";
import type { TranslationKey } from "../../../i18n/translations";
import modrinthIcon from "../../../assets/modrinth.svg";
import curseforgeIcon from "../../../assets/curseforge.svg";
import { motion, AnimatePresence } from "framer-motion";
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
    // Filters
    mcVersionFilter: string;
    loaderFilter: string;
    // Handlers
    onContentSourceChange: (source: ContentSource) => void;
    onProjectTypeChange: (type: ProjectType) => void;
    onSearchChange: (query: string) => void;
    onSearchSubmit: () => void;
    onSortChange: (sort: string) => void;
    onViewCountChange: (count: number) => void;
    onPageChange: (page: number) => void;
    onMcVersionFilterChange: (version: string) => void;
    onLoaderFilterChange: (loader: string) => void;
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
    mcVersionFilter,
    loaderFilter,
    onContentSourceChange,
    onProjectTypeChange,
    onSearchChange,
    onSearchSubmit,
    onSortChange,
    onViewCountChange,
    onPageChange,
    onMcVersionFilterChange,
    onLoaderFilterChange,
}: ExploreToolbarProps) {
    const { t } = useTranslation();
    const [showFilters, setShowFilters] = useState(false);
    const currentTab = PROJECT_TABS.find((p) => p.id === projectType);
    const projectTypeLabel = currentTab ? t(currentTab.labelKey as TranslationKey) : (projectType === "mod" ? t('mods' as TranslationKey) : projectType);
    const hasActiveFilter = !!(mcVersionFilter || loaderFilter);

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
                    {(() => {
                        const isDark = colors.surface?.startsWith('#') && parseInt(colors.surface.slice(1, 3), 16) < 128;
                        const isModrinthActive = contentSource === CONTENT_SOURCES.MODRINTH;
                        const isCurseForgeActive = contentSource === CONTENT_SOURCES.CURSEFORGE;

                        return (
                            <>
                                <button
                                    onClick={() => { playClick(); onContentSourceChange(CONTENT_SOURCES.MODRINTH); }}
                                    className="px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all relative group"
                                    style={{
                                        color: isModrinthActive ? "#000" : colors.onSurfaceVariant,
                                    }}
                                >
                                    {isModrinthActive && (
                                        <motion.div
                                            layoutId="explore-source-indicator"
                                            className="absolute inset-0 rounded-md shadow-sm"
                                            style={{ backgroundColor: "#1bd96a" }}
                                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                        />
                                    )}
                                    <img 
                                        src={modrinthIcon.src} 
                                        alt="" 
                                        className={`w-4 h-4 z-10 relative transition-transform ${isModrinthActive ? '' : 'opacity-80'}`} 
                                        style={{ filter: (!isModrinthActive && isDark) ? 'invert(1)' : 'none' }} 
                                    />
                                    <span className="z-10 relative">Modrinth</span>
                                </button>
                                <button
                                    onClick={() => { playClick(); onContentSourceChange(CONTENT_SOURCES.CURSEFORGE); }}
                                    className="px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all relative group"
                                    style={{
                                        color: isCurseForgeActive ? "#fff" : colors.onSurfaceVariant,
                                    }}
                                >
                                    {isCurseForgeActive && (
                                        <motion.div
                                            layoutId="explore-source-indicator"
                                            className="absolute inset-0 rounded-md shadow-sm"
                                            style={{ backgroundColor: "#f16436" }}
                                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                        />
                                    )}
                                    <img 
                                        src={curseforgeIcon.src} 
                                        alt="" 
                                        className={`w-4 h-4 z-10 relative transition-transform ${isCurseForgeActive ? '' : 'opacity-80'}`} 
                                        style={{ filter: (isCurseForgeActive || (!isCurseForgeActive && isDark)) ? 'invert(1)' : 'none' }} 
                                    />
                                    <span className="z-10 relative">CurseForge</span>
                                </button>
                            </>
                        );
                    })()}
                </div>
            </div>

            {/* Bottom row: Tabs + Filter toggle + View Count + Pagination */}
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
                                className="px-2.5 py-0.5 rounded-lg text-xs font-medium transition-all relative group flex items-center gap-2 whitespace-nowrap"
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

                <div className="flex items-center gap-2">
                    {/* View Count Select */}
                    <select
                        value={viewCount}
                        onChange={(e) => { playClick(); onViewCountChange(Number(e.target.value)); }}
                        className="px-2 py-0.5 rounded-lg text-[11px] transition-all outline-none focus:ring-1"
                        style={{
                            backgroundColor: colors.surface,
                            border: `1px solid ${colors.outline}30`,
                            color: colors.onSurface,
                            ["--tw-shadow" as any]: "0 1px 2px 0 rgb(0 0 0 / 0.05)"
                        }}
                    >
                        {[10, 20, 50].map((n) => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>

                    {/* Filter toggle button with Popup */}
                    <div className="relative">
                        <button
                            onClick={() => { playClick(); setShowFilters(!showFilters); }}
                            className="px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-all relative hover:brightness-95 active:scale-95"
                            style={{
                                backgroundColor: (showFilters || hasActiveFilter) ? colors.secondary + '15' : colors.surfaceContainerLow,
                                border: `1px solid ${colors.outline}30`,
                                color: colors.onSurface,
                            }}
                        >
                            <i className="fa-solid fa-sliders text-[10px] text-current"></i>
                            <span>{t('filter' as any)}</span>
                            {hasActiveFilter && (
                                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            )}
                        </button>

                        <AnimatePresence>
                            {showFilters && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute right-0 mt-2 p-3 rounded-lg shadow-xl z-50 flex flex-col gap-3 min-w-[180px]"
                                    style={{ 
                                        backgroundColor: colors.surfaceContainerHigh, 
                                        border: `1px solid ${colors.outline}30`,
                                        backdropFilter: 'blur(8px)'
                                    }}
                                >
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold uppercase opacity-50 px-1" style={{ color: colors.onSurface }}>{t('minecraft_version' as any)}</label>
                                        <select
                                            value={mcVersionFilter}
                                            onChange={(e) => { playClick(); onMcVersionFilterChange(e.target.value); }}
                                            className="px-2 py-1.5 rounded-md text-xs w-full outline-none focus:ring-1"
                                            style={{
                                                backgroundColor: colors.surface,
                                                border: `1px solid ${colors.outline}30`,
                                                color: colors.onSurface,
                                            }}
                                        >
                                            <option value="">{t('all_mc_versions' as TranslationKey) !== 'all_mc_versions' ? t('all_mc_versions' as TranslationKey) : 'All Versions'}</option>
                                            {['1.21.5', '1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.20', '1.19.4', '1.19.2', '1.18.2', '1.17.1', '1.16.5', '1.15.2', '1.14.4', '1.12.2', '1.8.9', '1.7.10'].map(v => (
                                                <option key={v} value={v}>{v}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold uppercase opacity-50 px-1" style={{ color: colors.onSurface }}>{t('loader' as any)}</label>
                                        <select
                                            value={loaderFilter}
                                            onChange={(e) => { playClick(); onLoaderFilterChange(e.target.value); }}
                                            className="px-2 py-1.5 rounded-md text-xs w-full outline-none focus:ring-1"
                                            style={{
                                                backgroundColor: colors.surface,
                                                border: `1px solid ${colors.outline}30`,
                                                color: colors.onSurface,
                                            }}
                                        >
                                            <option value="">{t('all_loaders' as TranslationKey) !== 'all_loaders' ? t('all_loaders' as TranslationKey) : 'All Loaders'}</option>
                                            <option value="fabric">Fabric</option>
                                            <option value="forge">Forge</option>
                                            <option value="neoforge">NeoForge</option>
                                            <option value="quilt">Quilt</option>
                                        </select>
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-bold uppercase opacity-50 px-1" style={{ color: colors.onSurface }}>{t('sort_by' as any)}</label>
                                        <select
                                            value={sortBy}
                                            onChange={(e) => { playClick(); onSortChange(e.target.value); }}
                                            className="px-2 py-1.5 rounded-md text-xs w-full outline-none focus:ring-1"
                                            style={{
                                                backgroundColor: colors.surface,
                                                border: `1px solid ${colors.outline}30`,
                                                color: colors.onSurface,
                                            }}
                                        >
                                            {SORT_OPTIONS.map((opt) => (
                                                <option key={opt.value} value={opt.value}>{t(opt.labelKey as TranslationKey)}</option>
                                            ))}
                                        </select>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Pagination */}
                    {totalPages > 0 && (
                        <div className="flex items-center gap-1 ml-1">
                            <button
                                onClick={() => { playClick(); onPageChange(Math.max(1, page - 1)); }}
                                disabled={page === 1}
                                className="w-[26px] h-[26px] rounded-lg flex items-center justify-center disabled:opacity-40 text-xs transition-all hover:bg-black/5"
                                style={{ backgroundColor: colors.surface, color: colors.onSurface, border: `1px solid ${colors.outline}20` }}
                            >
                                <i className="fa-solid fa-chevron-left text-[9px]"></i>
                            </button>
                            <span className="text-[11px] font-medium px-1.5" style={{ color: colors.onSurfaceVariant }}>
                                {page}/{totalPages}
                            </span>
                            <button
                                onClick={() => { playClick(); onPageChange(Math.min(totalPages, page + 1)); }}
                                disabled={page >= totalPages}
                                className="w-[26px] h-[26px] rounded-lg flex items-center justify-center disabled:opacity-40 text-xs transition-all hover:bg-black/5"
                                style={{ backgroundColor: colors.surface, color: colors.onSurface, border: `1px solid ${colors.outline}20` }}
                            >
                                <i className="fa-solid fa-chevron-right text-[9px]"></i>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

}

