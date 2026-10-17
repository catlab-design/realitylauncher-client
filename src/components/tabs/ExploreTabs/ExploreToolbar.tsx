import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../../hooks/useTranslation";
import type { TranslationKey } from "../../../i18n/translations";
import modrinthIcon from "../../../assets/modrinth.svg";
import curseforgeIcon from "../../../assets/curseforge.svg";
import { AnimatePresence, motion } from "framer-motion";
import { CONTENT_SOURCES, type ContentSource, type ProjectType } from "./types";
import { PROJECT_TABS } from "./constants";
import { playClick } from "../../../lib/sounds";
import { FilterMenu } from "./FilterMenu";

const SOURCES: { id: ContentSource; label: string; icon: string; color: string }[] = [
    { id: CONTENT_SOURCES.MODRINTH, label: "Modrinth", icon: modrinthIcon, color: "#1bd96a" },
    { id: CONTENT_SOURCES.CURSEFORGE, label: "CurseForge", icon: curseforgeIcon, color: "#f16436" },
];

/** Monochrome SVG logo painted in its brand colour. */
const BrandMark = ({ src, color }: { src: string; color: string }) => (
    <span
        aria-hidden="true"
        className="w-4.5 h-4.5 shrink-0"
        style={{ backgroundColor: color, maskImage: `url("${src}")`, WebkitMaskImage: `url("${src}")`, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }}
    />
);

interface ExploreToolbarProps {
    colors: any;
    contentSource: ContentSource;
    projectType: ProjectType;
    searchQuery: string;
    viewCount: number;
    page: number;
    totalPages: number;
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
    showCategoryFilter?: boolean;
    showEnvironmentFilter?: boolean;
    hideFilterMenu?: boolean;
    layout?: "grid" | "list";
    onLayoutChange?: (layout: "grid" | "list") => void;
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
    layout = "grid",
    onLayoutChange,
}: ExploreToolbarProps) {
    const { t } = useTranslation();
    const currentTab = PROJECT_TABS.find((p) => p.id === projectType);
    const projectTypeLabel = currentTab ? t(currentTab.labelKey as TranslationKey) : (projectType === "mod" ? t('mods' as TranslationKey) : projectType);
    const hasActiveFilter = !!(mcVersionFilters.length || loaderFilters.length || categoryFilters.length || environmentFilters.length);

    const [sourceOpen, setSourceOpen] = useState(false);
    const sourceRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!sourceOpen) return;
        const onDown = (e: MouseEvent) => {
            if (!sourceRef.current?.contains(e.target as Node)) setSourceOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [sourceOpen]);
    const currentSource = SOURCES.find((s) => s.id === contentSource) ?? SOURCES[0];

    const control = "h-11 rounded-xl text-sm font-semibold flex items-center gap-2 transition hover:brightness-105 active:scale-[0.98]";
    const controlStyle = { backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface };

    return (
        <div className="space-y-4">
            {/* Row 1: title, search, filter, source */}
            <div className="flex flex-col md:flex-row md:items-center gap-3">
                <h1 className="font-display text-2xl shrink-0 md:mr-3" style={{ color: colors.onSurface }}>{t('explore')}</h1>
                <div className="flex-1 relative min-w-[220px]">
                    <i className="fa-solid fa-magnifying-glass text-sm absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: colors.onSurfaceVariant }}></i>
                    <input
                        type="text"
                        placeholder={t('search_placeholder').replace('{type}', projectTypeLabel)}
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onSearchSubmit()}
                        className="w-full h-11 pl-11 pr-4 rounded-xl text-[15px] outline-none"
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    />
                </div>

                <div className="flex items-center gap-2">
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

                    {/* Source picker */}
                    <div ref={sourceRef} className="relative">
                        <button
                            type="button"
                            onClick={() => { playClick(); setSourceOpen((o) => !o); }}
                            className={`${control} pl-3.5 pr-3 min-w-44 justify-between`}
                            style={controlStyle}
                            aria-haspopup="listbox"
                            aria-expanded={sourceOpen ? "true" : "false"}
                        >
                            <span className="flex items-center gap-2.5">
                                <BrandMark src={currentSource.icon} color={currentSource.color} />
                                {currentSource.label}
                            </span>
                            <i className={`fa-solid fa-chevron-down text-xs transition-transform ${sourceOpen ? "rotate-180" : ""}`} style={{ color: colors.onSurfaceVariant }} />
                        </button>
                        <AnimatePresence>
                            {sourceOpen && (
                                <motion.div
                                    role="listbox"
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.12 }}
                                    className="absolute right-0 top-full mt-2 z-50 w-full min-w-52 p-1.5 rounded-xl shadow-[0_16px_40px_-12px_rgba(0,0,0,0.4)]"
                                    style={{ backgroundColor: colors.surfaceContainerHigh }}
                                >
                                    {SOURCES.map((source) => {
                                        const active = source.id === contentSource;
                                        return (
                                            <button
                                                key={source.id}
                                                type="button"
                                                role="option"
                                                aria-selected={active}
                                                onClick={() => { playClick(); setSourceOpen(false); if (!active) onContentSourceChange(source.id); }}
                                                className="w-full h-11 px-3 rounded-lg flex items-center gap-2.5 text-[15px] font-semibold transition-colors hover:bg-black/5"
                                                style={{ backgroundColor: active ? colors.surfaceContainerHighest : undefined, color: colors.onSurface }}
                                            >
                                                <BrandMark src={source.icon} color={source.color} />
                                                <span className="flex-1 text-left">{source.label}</span>
                                                {active && <i className="fa-solid fa-check text-sm" style={{ color: colors.onSurfaceVariant }} />}
                                            </button>
                                        );
                                    })}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Row 2: project type tabs + paging */}
            <div className="flex flex-col lg:flex-row lg:items-end gap-3 border-b" style={{ borderColor: colors.outlineVariant }}>
                <div className="overflow-x-auto no-scrollbar">
                    <div role="tablist" className="flex items-end gap-6 min-w-max">
                        {PROJECT_TABS.map((tab) => {
                            const active = projectType === tab.id;
                            const TabIcon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => { playClick(); onProjectTypeChange(tab.id); }}
                                    role="tab"
                                    aria-selected={active}
                                    className="relative pt-1 pb-3 text-[15px] font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors"
                                    style={{ color: active ? colors.onSurface : colors.onSurfaceVariant }}
                                >
                                    <TabIcon className="w-4.5 h-4.5" />
                                    <span>{t(tab.labelKey as TranslationKey)}</span>
                                    {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full" style={{ backgroundColor: colors.secondary }} />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="hidden lg:block flex-1" />

                <div className="flex items-center justify-between lg:justify-end gap-2 flex-wrap pb-2.5">
                    {hasActiveFilter && (
                        <span
                            className="h-8 px-3 rounded-lg text-[13px] font-semibold flex items-center gap-1.5"
                            style={{ backgroundColor: colors.secondary, color: "#111" }}
                        >
                            <i className="fa-solid fa-filter text-xs" />
                            {t("filters" as TranslationKey)}
                        </span>
                    )}

                    {onLayoutChange && (
                        <div className="h-10 p-1 rounded-xl flex items-center gap-0.5" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                            {([
                                { id: "grid" as const, icon: "fa-table-cells-large", label: "Grid" },
                                { id: "list" as const, icon: "fa-list", label: "List" },
                            ]).map((opt) => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => { playClick(); onLayoutChange(opt.id); }}
                                    title={opt.label}
                                    aria-label={opt.label}
                                    aria-pressed={layout === opt.id}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                                    style={layout === opt.id
                                        ? { backgroundColor: colors.surface, color: colors.onSurface, boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }
                                        : { color: colors.onSurfaceVariant }}
                                >
                                    <i className={`fa-solid ${opt.icon} text-sm`} />
                                </button>
                            ))}
                        </div>
                    )}

                    <label className="flex items-center gap-2 text-sm" style={{ color: colors.onSurfaceVariant }}>
                        <span className="hidden xl:inline">{t("items_per_page" as TranslationKey)}</span>
                        <select
                            aria-label={t("items_per_page" as TranslationKey)}
                            title={t("items_per_page" as TranslationKey)}
                            value={viewCount}
                            onChange={(e) => { playClick(); onViewCountChange(Number(e.target.value)); }}
                            className="h-10 px-3 rounded-xl text-sm font-semibold outline-none"
                            style={controlStyle}
                        >
                            {[10, 20, 50].map((n) => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                    </label>

                    {totalPages > 0 && (
                        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                            <button
                                type="button"
                                aria-label="Previous page"
                                title="Previous page"
                                onClick={() => { playClick(); onPageChange(Math.max(1, page - 1)); }}
                                disabled={page === 1}
                                className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-35 transition-colors hover:bg-black/5"
                                style={{ color: colors.onSurface }}
                            >
                                <i className="fa-solid fa-chevron-left text-xs"></i>
                            </button>
                            <span className="px-2 text-sm font-semibold tabular-nums" style={{ color: colors.onSurface }}>
                                {page}<span style={{ color: colors.onSurfaceVariant }}> / {totalPages}</span>
                            </span>
                            <button
                                type="button"
                                aria-label="Next page"
                                title="Next page"
                                onClick={() => { playClick(); onPageChange(Math.min(totalPages, page + 1)); }}
                                disabled={page >= totalPages}
                                className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-35 transition-colors hover:bg-black/5"
                                style={{ color: colors.onSurface }}
                            >
                                <i className="fa-solid fa-chevron-right text-xs"></i>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
