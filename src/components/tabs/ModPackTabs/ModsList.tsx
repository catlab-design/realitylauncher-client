// ========================================
// Mods List Component
// ========================================

import React, { useState, useEffect } from "react";
import { Icons } from "../../ui/Icons";
import { Skeleton } from "../../ui/Skeleton";
import { LazyModItem } from "./LazyModItem";
import { formatSize } from "./helpers";
import type { ModInfo } from "./types";
import { playClick } from "../../../lib/sounds";
import { useTranslation } from "../../../hooks/useTranslation";

interface ModsListProps {
    colors: any;
    instanceId: string;
    mods: ModInfo[];
    isLoading: boolean;
    onToggle: (filename: string) => void;
    onDelete: (filename: string) => void;
    onRefresh: () => void;
    onAddMod: () => void;
    lockedMods: Set<string>;
    onToggleLock?: (filename: string) => void;
    isServerManaged?: boolean;
}

const MODS_PER_PAGE = 20;

export function ModsList({
    colors,
    instanceId,
    mods,
    isLoading,
    onToggle,
    onDelete,
    onRefresh,
    onAddMod,
    lockedMods,
    onToggleLock,
    isServerManaged,
}: ModsListProps) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(1);
    const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(new Set());

    const handleToggleSelection = (filename: string) => {
        setSelectedFilenames(prev => {
            const next = new Set(prev);
            if (next.has(filename)) next.delete(filename);
            else next.add(filename);
            return next;
        });
    };

    const handleSelectAll = (filteredMods: ModInfo[]) => {
        if (selectedFilenames.size === filteredMods.length && filteredMods.length > 0) {
            setSelectedFilenames(new Set());
        } else {
            setSelectedFilenames(new Set(filteredMods.map(m => m.filename)));
        }
    };

    const handleBulkToggle = async (enabled: boolean) => {
        const filenames = Array.from(selectedFilenames);
        if (filenames.length === 0) return;

        playClick();
        
        // Use Promise.all to toggle all selected mods concurrently
        const togglePromises = filenames.map(async (filename) => {
            const mod = mods.find(m => m.filename === filename);
            if (mod && mod.enabled !== enabled) {
                return onToggle(filename);
            }
            return Promise.resolve();
        });
        
        await Promise.all(togglePromises);
        
        setSelectedFilenames(new Set());
        onRefresh();
    };

    const handleBulkDelete = async () => {
        const filenames = Array.from(selectedFilenames);
        if (filenames.length === 0) return;

        // Simple confirmation
        if (confirm(`${t('confirm_delete_multiple' as any).replace('{count}', String(filenames.length))}`)) {
            playClick();
            const deletePromises = filenames.map(async (filename) => {
                return onDelete(filename);
            });
            await Promise.all(deletePromises);
            
            setSelectedFilenames(new Set());
            onRefresh();
        }
    };

    // Reset page when search changes
    useEffect(() => {
        setPage(1);
    }, [searchQuery]);

    const filteredMods = mods.filter(mod =>
        mod.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mod.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalPages = Math.ceil(filteredMods.length / MODS_PER_PAGE);
    const paginatedMods = filteredMods.slice(
        (page - 1) * MODS_PER_PAGE,
        page * MODS_PER_PAGE
    );

    return (
        <>
            {/* Header Controls - Unified Row */}
            <div className="flex items-center justify-between mb-4">
                {/* Left Side: Title OR Pagination OR Selection Info */}
                <div className="flex items-center gap-4">
                    {selectedFilenames.size > 0 ? (
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => handleSelectAll(filteredMods)}
                                className="w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer border-2"
                                style={{
                                    backgroundColor: selectedFilenames.size === filteredMods.length ? colors.secondary : "transparent",
                                    borderColor: selectedFilenames.size === filteredMods.length ? colors.secondary : colors.onSurfaceVariant
                                }}
                            >
                                {selectedFilenames.size === filteredMods.length ? (
                                    <Icons.Check className="w-3.5 h-3.5" style={{ color: "#1a1a1a" }} />
                                ) : (
                                    selectedFilenames.size > 0 && <div className="w-2 h-0.5 rounded-full bg-current" />
                                )}
                            </button>
                            <span className="font-bold" style={{ color: colors.secondary }}>
                                {selectedFilenames.size} {t('selected' as any)}
                            </span>

                            <div className="h-4 w-px bg-white/10 mx-1" />

                            <button
                                onClick={() => handleBulkToggle(true)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:bg-white/10 flex items-center gap-1.5"
                                style={{ color: colors.onSurface }}
                            >
                                <div className="w-2 h-2 rounded-full bg-green-500" />
                                {t('enable_all' as any)}
                            </button>

                            <button
                                onClick={() => handleBulkToggle(false)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:bg-white/10 flex items-center gap-1.5"
                                style={{ color: colors.onSurface }}
                            >
                                <div className="w-2 h-2 rounded-full bg-red-500" />
                                {t('disable_all' as any)}
                            </button>

                            <button
                                onClick={handleBulkDelete}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:bg-red-500/20 flex items-center gap-1.5"
                                style={{ color: "#ef4444" }}
                            >
                                <Icons.Trash className="w-3.5 h-3.5" />
                                {t('delete' as any)}
                            </button>
                        </div>
                    ) : (
                        totalPages > 1 ? (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => { playClick(); setPage(p => Math.max(1, p - 1)); }}
                                    disabled={page === 1}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40 hover:bg-white/5"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                >
                                    <i className="fa-solid fa-chevron-left text-xs"></i>
                                    {t('previous')}
                                </button>

                                <span className="px-4 py-2 rounded-xl text-sm font-bold" style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}>
                                    {page} / {totalPages}
                                </span>

                                <button
                                    onClick={() => { playClick(); setPage(p => Math.min(totalPages, p + 1)); }}
                                    disabled={page === totalPages}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40 hover:bg-white/5"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                >
                                    {t('next')}
                                    <i className="fa-solid fa-chevron-right text-xs"></i>
                                </button>
                            </div>
                        ) : (
                            <h3 className="text-lg font-medium" style={{ color: colors.onSurface }}>
                                {t('mods')} {isLoading ? "" : `(${mods.length})`}
                            </h3>
                        )
                    )}
                </div>

                {/* Right Side: Actions (Search, Install, Refresh) */}
                <div className="flex items-center gap-2">
                    {/* Search */}
                    <div
                        className="flex items-center gap-2 px-4 py-2 rounded-xl transition-colors focus-within:ring-1 focus-within:ring-white/20"
                        style={{ backgroundColor: colors.surfaceContainerHighest }}
                    >
                        <i className="fa-solid fa-search text-sm" style={{ color: colors.onSurfaceVariant }}></i>
                        <input
                            type="text"
                            placeholder={t('search_mod_count' as any).replace('{count}', String(mods.length))}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent outline-none text-sm w-56 placeholder:opacity-70"
                            style={{ color: colors.onSurface }}
                        />
                    </div>

                    <button
                        onClick={() => { playClick(); onAddMod(); }}
                        className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all hover:opacity-90 active:scale-95 shadow-lg"
                        style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                    >
                        <i className="fa-solid fa-plus text-xs"></i>
                        {t('install_mod' as any)}
                    </button>

                    <button
                        onClick={() => { playClick(); onRefresh(); }}
                        disabled={isLoading}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 active:scale-95'}`}
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                        title={t('refresh')}
                    >
                        <i className={`fa-solid fa-rotate-right text-sm ${isLoading ? 'fa-spin' : ''}`}></i>
                    </button>
                </div>
            </div>

            {/* Content Area */}
            {filteredMods.length === 0 && !isLoading ? (
                <div className="text-center py-12 rounded-2xl" style={{ backgroundColor: colors.surfaceContainer }}>
                    <Icons.Box className="w-12 h-12 mx-auto mb-3" style={{ color: colors.onSurfaceVariant, opacity: 0.5 }} />
                    <p className="font-medium" style={{ color: colors.onSurfaceVariant }}>
                        {searchQuery ? t('no_mods_search' as any) : t('no_mods_instance' as any)}
                    </p>
                    <p className="text-sm mt-1" style={{ color: colors.onSurfaceVariant }}>
                        {t('drag_jar_hint' as any)}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {(isLoading ? Array.from({ length: Math.min(paginatedMods.length > 0 ? paginatedMods.length : 12, 20) }) : paginatedMods).map((mod, index) => (
                        <ModListItemWrapper
                            key={isLoading ? `skeleton-${index}` : ((mod as ModInfo)?.filename || `unknown-${index}`)}
                            index={index}
                            isLoading={isLoading}
                            colors={colors}
                        >
                            <LazyModItem
                                mod={mod as ModInfo}
                                instanceId={instanceId}
                                colors={colors}
                                formatSize={formatSize}
                                onToggle={onToggle}
                                onDelete={onDelete}
                                isLocked={lockedMods.has((mod as ModInfo)?.filename)}
                                onToggleLock={onToggleLock}
                                isServerManaged={isServerManaged}
                                index={index}
                                isSelected={selectedFilenames.has((mod as ModInfo)?.filename)}
                                onToggleSelection={handleToggleSelection}
                            />
                        </ModListItemWrapper>
                    ))}
                </div>
            )}

            {/* Bottom Pagination */}
            {!isLoading && totalPages > 1 && (
                <div className="flex justify-center mt-6 animate-fade-in" style={{ animationDelay: '300ms' }}>
                    <div className="flex items-center gap-2 p-1.5 rounded-2xl"
                            style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}20` }}>

                            <button
                                onClick={() => {
                                    playClick();
                                    setPage(p => Math.max(1, p - 1));
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                disabled={page === 1}
                                className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-white/5 transition-colors flex items-center gap-2"
                                style={{ color: colors.onSurface }}
                            >
                                <i className="fa-solid fa-chevron-left text-xs"></i>
                                {t('previous')}
                            </button>

                            <div className="px-4 min-w-[90px] text-center" style={{ color: colors.onSurfaceVariant }}>
                                <span className="text-sm font-bold" style={{ color: colors.onSurface }}>{page}</span>
                                <span className="text-xs opacity-70 mx-1">/</span>
                                <span className="text-sm opacity-70">{totalPages}</span>
                            </div>

                            <button
                                onClick={() => {
                                    playClick();
                                    setPage(p => Math.min(totalPages, p + 1));
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                disabled={page === totalPages}
                                className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-white/5 transition-colors flex items-center gap-2"
                                style={{ color: colors.onSurface }}
                            >
                                {t('next')}
                                <i className="fa-solid fa-chevron-right text-xs"></i>
                            </button>
                        </div>
                    </div>
                )}
        </>
    );
}

// Wrapper component to handle sequential reveal state safely
// Wrapper component to handle sequential reveal state safely via CSS
function ModListItemWrapper({
    index,
    isLoading,
    colors,
    children,
}: {
    index: number;
    isLoading: boolean;
    colors: any;
    children: React.ReactNode;
}) {
    if (isLoading) {
        return (
            <div
                className="flex items-center gap-4 p-4 rounded-xl"
                style={{ backgroundColor: colors.surfaceContainer }}
            >
                <Skeleton className="w-10 h-10 rounded-lg" colors={colors} />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" colors={colors} />
                    <Skeleton className="h-3 w-1/4" colors={colors} />
                </div>
                <Skeleton className="w-12 h-6 rounded-full" colors={colors} />
                <Skeleton className="w-10 h-10 rounded-lg" colors={colors} />
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            {children}
        </div>
    );
}
