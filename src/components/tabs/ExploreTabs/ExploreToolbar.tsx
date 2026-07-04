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
import { PROJECT_TABS } from "./constants";
import { playClick } from "../../../lib/sounds";
import { FilterMenu } from "./FilterMenu";

interface ExploreToolbarProps {
    colors: any;
    contentSource: ContentSource;
    projectType: ProjectType;
    searchQuery: string;
    viewCount: number;
    page: number;
    totalPages: number;
    // Filter state — drives the inline FilterMenu trigger. Multi-select arrays.
    sortBy: string;
    mcVersionFilters: string[];
    loaderFilters: string[];
    categoryFilters: string[];
    environmentFilters: string[];
    onContentSourceChange: (source: ContentSource) => void;
    onProjectTypeChange: (type: ProjectType) => void;
    onSearchChange: (query: string) => void;
    onSearchSubmit: () => void;
    onViewCountChange: (count: number) => void;
    onPageChange: (page: number) => void;
    onSortChange: (s: string) => void;
    onMcVersionFiltersChange: (v: string[]) => void;
    onLoaderFiltersChange: (l: string[]) => void;
    onCategoryFiltersChange: (c: string[]) => void;
    onEnvironmentFiltersChange: (e: string[]) => void;
    /** Hide the category section (e.g. resource packs). */
    showCategoryFilter?: boolean;
    /** Hide the environment section (e.g. modpacks). */
    showEnvironmentFilter?: boolean;
    /** Hide the filter menu entirely (e.g. when adding content to an instance). */
    hideFilterMenu?: boolean;
}

export function ExploreToolbar({
    colors,
    contentSource,
    projectType,
    searchQuery,
    viewCount,
    page,
    totalPages,
    sortBy,
    mcVersionFilters,
    loaderFilters,
    categoryFilters,
    environmentFilters,
    onContentSourceChange,
    onProjectTypeChange,
    onSearchChange,
    onSearchSubmit,
    onViewCountChange,
    onPageChange,
    onSortChange,
    onMcVersionFiltersChange,
    onLoaderFiltersChange,
    onCategoryFiltersChange,
    onEnvironmentFiltersChange,
    showCategoryFilter = true,
    showEnvironmentFilter = true,
    hideFilterMenu = false,
}: ExploreToolbarProps) {
    const { t } = useTranslation();
    const currentTab = PROJECT_TABS.find((p) => p.id === projectType);
    const projectTypeLabel = currentTab ? t(currentTab.labelKey as TranslationKey) : (projectType === "mod" ? t('mods' as TranslationKey) : projectType);
    const hasActiveFilter = !!(mcVersionFilters.length || loaderFilters.length || categoryFilters.length || environmentFilters.length);

    return (
        <div
            className="rounded-2xl"
            style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}30` }}
        >
            {/* Top row: Title + Search */}
            <div
                className="px-3 py-3 sm:px-4 flex flex-col md:flex-row md:items-center gap-3 border-b"
                style={{ borderColor: colors.outline + "30" }}
            >
                <div className="flex items-center gap-3 min-w-0 md:w-[150px]">
                    <span
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: colors.secondary + "20", color: colors.secondary }}
                    >
                        <i className="fa-solid fa-compass text-sm"></i>
                    </span>
                    <span className="font-semibold text-base tracking-tight" style={{ color: colors.onSurface }}>{t('explore')}</span>
                </div>
                <div className="flex-1 relative min-w-[220px]">
                    <input
                        type="text"
                        placeholder={
                            t('search_placeholder').replace('{type}', projectTypeLabel)
                        }
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
                        className="w-full min-h-11 px-4 py-2.5 pl-11 rounded-xl text-[15px] outline-none transition-all focus:ring-2"
                        style={{
                            backgroundColor: colors.surface,
                            border: `1px solid ${colors.outline}40`,
                            color: colors.onSurface,
                            ["--tw-ring-color" as any]: colors.secondary + "55",
                        }}
                    />
                    <i className="fa-solid fa-search text-sm absolute left-4 top-1/2 -translate-y-1/2" style={{ color: colors.onSurfaceVariant }}></i>
                </div>

                {/* Single "ตัวกรอง" trigger — opens a popover with all 4 filter sections. Hidden when adding content to instance. */}
                {!hideFilterMenu && (
                    <FilterMenu
                        colors={colors}
                        sortBy={sortBy}
                        mcVersionFilters={mcVersionFilters}
                        loaderFilters={loaderFilters}
                        categoryFilters={categoryFilters}
                        environmentFilters={environmentFilters}
                        onSortChange={onSortChange}
                        onMcVersionFiltersChange={onMcVersionFiltersChange}
                        onLoaderFiltersChange={onLoaderFiltersChange}
                        onCategoryFiltersChange={onCategoryFiltersChange}
                        onEnvironmentFiltersChange={onEnvironmentFiltersChange}
                        showCategoryFilter={showCategoryFilter}
                        showEnvironmentFilter={showEnvironmentFilter}
                    />
                )}

                {/* Source buttons */}
                <div className="grid grid-cols-2 gap-2 w-full sm:w-auto md:min-w-[260px]">
                    {(() => {
                        const isDark = colors.surface?.startsWith('#') && parseInt(colors.surface.slice(1, 3), 16) < 128;
                        const isModrinthActive = contentSource === CONTENT_SOURCES.MODRINTH;
                        const isCurseForgeActive = contentSource === CONTENT_SOURCES.CURSEFORGE;

                        return (
                            <>
                                <button
                                    onClick={() => { playClick(); onContentSourceChange(CONTENT_SOURCES.MODRINTH); }}
                                    className="min-h-11 px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] whitespace-nowrap"
                                    style={{
                                        color: isModrinthActive ? "#000" : colors.onSurfaceVariant,
                                        border: `1px solid ${isModrinthActive ? "transparent" : colors.outline + "25"}`,
                                        backgroundColor: isModrinthActive ? "#1bd96a" : colors.surface,
                                    }}
                                >
                                    <img
                                        src={modrinthIcon.src}
                                        alt=""
                                        className={`w-4 h-4 ${isModrinthActive ? '' : 'opacity-80'}`}
                                        style={{ filter: (!isModrinthActive && isDark) ? 'invert(1)' : 'none' }}
                                    />
                                    <span>Modrinth</span>
                                </button>
                                <button
                                    onClick={() => { playClick(); onContentSourceChange(CONTENT_SOURCES.CURSEFORGE); }}
                                    className="min-h-11 px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] whitespace-nowrap"
                                    style={{
                                        color: isCurseForgeActive ? "#fff" : colors.onSurfaceVariant,
                                        border: `1px solid ${isCurseForgeActive ? "transparent" : colors.outline + "25"}`,
                                        backgroundColor: isCurseForgeActive ? "#f16436" : colors.surface,
                                    }}
                                >
                                    <img
                                        src={curseforgeIcon.src}
                                        alt=""
                                        className={`w-4 h-4 ${isCurseForgeActive ? '' : 'opacity-80'}`}
                                        style={{ filter: (isCurseForgeActive || (!isCurseForgeActive && isDark)) ? 'invert(1)' : 'none' }}
                                    />
                                    <span>CurseForge</span>
                                </button>
                            </>
                        );
                    })()}
                </div>
            </div>

            {/* Bottom row: Tabs + Sort + View Count + Pagination */}
            <div className="px-3 py-3 sm:px-4 flex flex-col lg:flex-row lg:items-center gap-3">
                {/* Type tabs */}
                <div className="overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-2 min-w-max">
                    {PROJECT_TABS.map((tab) => {
                        const active = projectType === tab.id;
                        const TabIcon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => { playClick(); onProjectTypeChange(tab.id); }}
                                className="min-h-10 px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 whitespace-nowrap active:scale-[0.98]"
                                style={{
                                    color: active ? "#1a1a1a" : colors.onSurfaceVariant,
                                    border: `1px solid ${active ? "transparent" : colors.outline + "20"}`,
                                    backgroundColor: active ? colors.secondary : colors.surface,
                                }}
                            >
                                <TabIcon className="w-3.5 h-3.5" />
                                <span>{t(tab.labelKey as TranslationKey)}</span>
                            </button>
                        );
                    })}
                </div>
                </div>

                <div className="hidden lg:block flex-1" />

                <div className="flex items-center justify-between lg:justify-end gap-2 flex-wrap">
                    {/* Small "Filtered" indicator — chips/per-filter clear live in FilterBar now. */}
                    {hasActiveFilter && (
                        <span
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1.5"
                            style={{ backgroundColor: colors.secondary + "18", color: colors.secondary }}
                        >
                            <i className="fa-solid fa-filter text-[9px]" />
                            {t("filters" as TranslationKey)}
                        </span>
                    )}

                    {/* View Count Select */}
                    <label className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: colors.onSurfaceVariant }}>
                        <span className="hidden xl:inline">{t("items_per_page" as TranslationKey)}</span>
                        <select
                            aria-label={t("items_per_page" as TranslationKey)}
                            title={t("items_per_page" as TranslationKey)}
                            value={viewCount}
                            onChange={(e) => { playClick(); onViewCountChange(Number(e.target.value)); }}
                            className="min-h-10 px-3 py-2 rounded-xl text-sm font-semibold transition-all outline-none focus:ring-2"
                            style={{
                                backgroundColor: colors.surface,
                                border: `1px solid ${colors.outline}30`,
                                color: colors.onSurface,
                                ["--tw-ring-color" as any]: colors.secondary + "55",
                            }}
                        >
                            {[10, 20, 50].map((n) => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                    </label>

                    {/* Pagination */}
                    {totalPages > 0 && (
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                aria-label="Previous page"
                                title="Previous page"
                                onClick={() => { playClick(); onPageChange(Math.max(1, page - 1)); }}
                                disabled={page === 1}
                                className="min-w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-40 text-xs transition-all hover:bg-black/5 active:scale-[0.98]"
                                style={{ backgroundColor: colors.surface, color: colors.onSurface, border: `1px solid ${colors.outline}20` }}
                            >
                                <i className="fa-solid fa-chevron-left text-[9px]"></i>
                            </button>
                            <span className="min-h-10 px-3 rounded-xl text-sm font-semibold flex items-center" style={{ color: colors.onSurfaceVariant, backgroundColor: colors.surface }}>
                                {page}/{totalPages}
                            </span>
                            <button
                                type="button"
                                aria-label="Next page"
                                title="Next page"
                                onClick={() => { playClick(); onPageChange(Math.min(totalPages, page + 1)); }}
                                disabled={page >= totalPages}
                                className="min-w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-40 text-xs transition-all hover:bg-black/5 active:scale-[0.98]"
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

