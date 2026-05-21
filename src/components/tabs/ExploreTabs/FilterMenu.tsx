// ========================================
// FilterMenu — a single "ตัวกรอง" trigger that opens one popover containing
// Sort / Category / Loader / Version / Environment stacked in a single column.
// Each section supports multi-select (Sort stays single-select).
// ========================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "../../../hooks/useTranslation";
import type { TranslationKey } from "../../../i18n/translations";
import { CATEGORIES, LOADERS, ENVIRONMENTS, MC_VERSIONS, SORT_OPTIONS } from "./filterOptions";
import { FilterPopoverItem } from "./FilterPopover";
import { playClick } from "../../../lib/sounds";

interface FilterMenuProps {
    colors: any;
    sortBy: string;
    mcVersionFilters: string[];
    loaderFilters: string[];
    categoryFilters: string[];
    environmentFilters: string[];
    onSortChange: (s: string) => void;
    onMcVersionFiltersChange: (v: string[]) => void;
    onLoaderFiltersChange: (l: string[]) => void;
    onCategoryFiltersChange: (c: string[]) => void;
    onEnvironmentFiltersChange: (e: string[]) => void;
    showCategoryFilter?: boolean;
    showEnvironmentFilter?: boolean;
    showLoaderFilter?: boolean;
    showVersionFilter?: boolean;
}

// Section header used inside a column. Title only — sections are always expanded since
// the panel is wide enough to fit everything.
function SectionTitle({ colors, label }: { colors: any; label: string }) {
    return (
        <div
            className="px-1 pb-1.5 mb-1 text-[10px] font-black uppercase tracking-[0.18em] border-b"
            style={{ color: colors.onSurfaceVariant, borderColor: colors.outline + "20" }}
        >
            {label}
        </div>
    );
}

// Helper that toggles a value in/out of a multi-select array.
function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
}

export function FilterMenu({
    colors,
    sortBy,
    mcVersionFilters,
    loaderFilters,
    categoryFilters,
    environmentFilters,
    onSortChange,
    onMcVersionFiltersChange,
    onLoaderFiltersChange,
    onCategoryFiltersChange,
    onEnvironmentFiltersChange,
    showCategoryFilter = true,
    showEnvironmentFilter = true,
    showLoaderFilter = true,
    showVersionFilter = true,
}: FilterMenuProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [versionSearch, setVersionSearch] = useState("");
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointer = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const filteredVersions = useMemo(() => {
        if (!versionSearch.trim()) return MC_VERSIONS;
        const q = versionSearch.trim();
        return MC_VERSIONS.filter(v => v.includes(q));
    }, [versionSearch]);

    // Count active filter values (not categories). Sort doesn't count as a filter unless changed
    // from default "relevance".
    const activeCount =
        (sortBy && sortBy !== "relevance" ? 1 : 0) +
        categoryFilters.length +
        loaderFilters.length +
        mcVersionFilters.length +
        environmentFilters.length;

    const clearAll = () => {
        playClick();
        onSortChange("relevance");
        onCategoryFiltersChange([]);
        onLoaderFiltersChange([]);
        onMcVersionFiltersChange([]);
        onEnvironmentFiltersChange([]);
    };

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => { playClick(); setOpen(o => !o); }}
                className="min-h-11 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-[0.98] relative"
                style={{
                    backgroundColor: colors.surface,
                    color: colors.onSurface,
                    border: `1px solid ${activeCount > 0 ? colors.secondary + "55" : colors.outline + "30"}`,
                }}
                aria-expanded={open ? "true" : "false"}
                aria-haspopup="dialog"
            >
                <i className="fa-solid fa-filter text-xs" style={{ color: colors.onSurfaceVariant }} />
                <span className="whitespace-nowrap">{t("filter" as TranslationKey)}</span>
                {activeCount > 0 && (
                    <span
                        className="text-[10px] font-black px-1.5 py-0.5 rounded-md min-w-[18px] text-center"
                        style={{ backgroundColor: colors.secondary, color: "#000" }}
                    >
                        {activeCount}
                    </span>
                )}
                <i className={`fa-solid fa-chevron-down text-[9px] transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        // Single column. right-0 keeps the panel inside the toolbar bounds since
                        // this trigger sits in the middle/right area.
                        className="absolute z-50 mt-2 right-0 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl overflow-hidden"
                        style={{
                            backgroundColor: colors.surface,
                            border: `1px solid ${colors.outline}55`,
                            boxShadow: "0 24px 48px -16px rgba(0,0,0,0.4), 0 8px 16px -4px rgba(0,0,0,0.2)",
                        }}
                    >
                        {/* Header */}
                        <div
                            className="px-4 py-2.5 flex items-center justify-between border-b"
                            style={{ borderColor: colors.outline + "30" }}
                        >
                            <span className="text-sm font-bold" style={{ color: colors.onSurface }}>
                                {t("filter" as TranslationKey)}
                            </span>
                            {activeCount > 0 && (
                                <button
                                    type="button"
                                    onClick={clearAll}
                                    className="text-[11px] font-bold px-2 py-0.5 rounded-md transition-colors hover:brightness-110"
                                    style={{ color: colors.secondary, backgroundColor: colors.secondary + "18" }}
                                >
                                    {t("clear_all_filters" as TranslationKey)}
                                </button>
                            )}
                        </div>

                        {/* Single column body */}
                        <div className="p-3 max-h-[65vh] overflow-y-auto">
                            <div className="mb-4">
                                <SectionTitle colors={colors} label={t("sort_by" as TranslationKey)} />
                                <div className="flex flex-col gap-0.5">
                                    {SORT_OPTIONS.map(opt => (
                                        <FilterPopoverItem
                                            key={opt.value}
                                            colors={colors}
                                            active={sortBy === opt.value}
                                            onClick={() => onSortChange(opt.value)}
                                        >
                                            {t(opt.labelKey as TranslationKey)}
                                        </FilterPopoverItem>
                                    ))}
                                </div>
                            </div>

                            {showCategoryFilter && (
                                <div className="mb-4">
                                    <SectionTitle colors={colors} label={t("category" as TranslationKey)} />
                                    <div className="flex flex-col gap-0.5">
                                        {CATEGORIES.map(cat => {
                                            const active = categoryFilters.includes(cat.id);
                                            return (
                                                <FilterPopoverItem
                                                    key={cat.id}
                                                    colors={colors}
                                                    active={active}
                                                    onClick={() => onCategoryFiltersChange(toggle(categoryFilters, cat.id))}
                                                    icon={<i className={`${cat.icon} text-xs opacity-70`} />}
                                                >
                                                    {t(`category.${cat.id}` as TranslationKey)}
                                                </FilterPopoverItem>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {showLoaderFilter && (
                                <div className="mb-4">
                                    <SectionTitle colors={colors} label={t("loader" as TranslationKey)} />
                                    <div className="flex flex-col gap-0.5">
                                        {LOADERS.map(loader => {
                                            const active = loaderFilters.includes(loader.id);
                                            return (
                                                <FilterPopoverItem
                                                    key={loader.id}
                                                    colors={colors}
                                                    active={active}
                                                    accent={loader.color}
                                                    onClick={() => onLoaderFiltersChange(toggle(loaderFilters, loader.id))}
                                                    icon={
                                                        loader.svg
                                                            ? <img src={loader.svg} alt="" className="w-3.5 h-3.5 object-contain" />
                                                            : <i className={`${loader.icon} text-xs`} style={{ color: loader.color, opacity: active ? 1 : 0.7 }} />
                                                    }
                                                >
                                                    {t(`loader.${loader.id}` as TranslationKey)}
                                                </FilterPopoverItem>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {showVersionFilter && (
                                <div className="mb-4">
                                    <SectionTitle colors={colors} label={t("game_version" as TranslationKey)} />
                                    <div className="relative mb-2">
                                        <input
                                            type="text"
                                            placeholder={t("search_versions_short" as TranslationKey)}
                                            value={versionSearch}
                                            onChange={(e) => setVersionSearch(e.target.value)}
                                            className="w-full px-3 py-1.5 pl-7 rounded-lg text-xs outline-none"
                                            style={{
                                                backgroundColor: colors.surfaceContainer,
                                                border: `1px solid ${colors.outline}30`,
                                                color: colors.onSurface,
                                            }}
                                        />
                                        <i
                                            className="fa-solid fa-search text-[9px] absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40"
                                            style={{ color: colors.onSurface }}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-0.5 max-h-44 overflow-y-auto">
                                        {filteredVersions.map(v => {
                                            const active = mcVersionFilters.includes(v);
                                            return (
                                                <FilterPopoverItem
                                                    key={v}
                                                    colors={colors}
                                                    active={active}
                                                    onClick={() => onMcVersionFiltersChange(toggle(mcVersionFilters, v))}
                                                >
                                                    {v}
                                                </FilterPopoverItem>
                                            );
                                        })}
                                        {filteredVersions.length === 0 && (
                                            <p className="text-[11px] text-center py-2 opacity-50" style={{ color: colors.onSurfaceVariant }}>
                                                {t("no_results")}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {showEnvironmentFilter && (
                                <div>
                                    <SectionTitle colors={colors} label={t("environment" as TranslationKey)} />
                                    <div className="flex flex-col gap-0.5">
                                        {ENVIRONMENTS.map(env => {
                                            const active = environmentFilters.includes(env.id);
                                            return (
                                                <FilterPopoverItem
                                                    key={env.id}
                                                    colors={colors}
                                                    active={active}
                                                    onClick={() => onEnvironmentFiltersChange(toggle(environmentFilters, env.id))}
                                                    icon={<i className={`${env.icon} text-xs opacity-70`} />}
                                                >
                                                    {t(`environment.${env.id}` as TranslationKey)}
                                                </FilterPopoverItem>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
