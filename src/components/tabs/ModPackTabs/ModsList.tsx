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
    minecraftVersion?: string;
    loader?: string;
    instanceName?: string;
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
    minecraftVersion,
    loader,
    instanceName = ""
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
            <div className="flex items-center justify-between gap-4 mb-4 w-full overflow-x-auto no-scrollbar pb-1">
                {/* Left Side: Select All & Title OR Pagination */}
                <div className="flex items-center gap-4 shrink-0">
                    <button
                        onClick={() => handleSelectAll(filteredMods)}
                        className="w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer border-2"
                        style={{
                            backgroundColor: selectedFilenames.size === filteredMods.length && filteredMods.length > 0 ? colors.secondary : "transparent",
                            borderColor: selectedFilenames.size === filteredMods.length && filteredMods.length > 0 ? colors.secondary : colors.onSurfaceVariant
                        }}
                        title={t('select_all' as any) || "Select All"}
                    >
                        {selectedFilenames.size === filteredMods.length && filteredMods.length > 0 ? (
                            <Icons.Check className="w-3.5 h-3.5" style={{ color: "#1a1a1a" }} />
                        ) : (
                            selectedFilenames.size > 0 && <div className="w-2 h-0.5 rounded-full bg-current" style={{ backgroundColor: colors.secondary }} />
                        )}
                    </button>

                    {totalPages > 1 ? (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => { playClick(); setPage(p => Math.max(1, p - 1)); }}
                                disabled={page === 1}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40 hover:bg-white/5 whitespace-nowrap"
                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                                <i className="fa-solid fa-chevron-left text-xs"></i>
                                {t('previous')}
                            </button>

                            <span className="px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap" style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}>
                                {page} / {totalPages}
                            </span>

                            <button
                                onClick={() => { playClick(); setPage(p => Math.min(totalPages, p + 1)); }}
                                disabled={page === totalPages}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40 hover:bg-white/5 whitespace-nowrap"
                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                                {t('next')}
                                <i className="fa-solid fa-chevron-right text-xs"></i>
                            </button>
                        </div>
                    ) : (
                        <h3 className="text-lg font-medium whitespace-nowrap" style={{ color: colors.onSurface }}>
                            {t('mods')} {isLoading ? "" : `(${mods.length})`}
                        </h3>
                    )}
                </div>

                {/* Right Side: Actions (Search, Install, Refresh) */}
                <div className="flex items-center gap-2 shrink-0 max-w-full overflow-hidden">
                    {/* Search */}
                    <div
                        className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl transition-colors focus-within:ring-1 focus-within:ring-white/20 min-w-0 flex-1 lg:flex-none"
                        style={{ backgroundColor: colors.surfaceContainerHighest }}
                    >
                        <i className="fa-solid fa-search text-sm shrink-0" style={{ color: colors.onSurfaceVariant }}></i>
                        <input
                            type="text"
                            placeholder={t('search_mod_count' as any).replace('{count}', String(mods.length))}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent outline-none text-sm w-full lg:w-48 placeholder:opacity-70 min-w-0"
                            style={{ color: colors.onSurface }}
                        />
                    </div>

                    <button
                        onClick={() => { playClick(); onAddMod(); }}
                        className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all hover:opacity-90 active:scale-95 shadow-lg shrink-0"
                        style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                    >
                        <i className="fa-solid fa-plus text-xs"></i>
                        <span className="hidden sm:inline">{t('install_mod' as any)}</span>
                    </button>

                    <button
                        onClick={() => { playClick(); onRefresh(); }}
                        disabled={isLoading}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 active:scale-95'}`}
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

                        </div>
                    </div>
                )}

            {/* Floating Selection Bar */}
            {selectedFilenames.size > 0 && (
                <div 
                    className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 md:gap-4 px-4 py-3 md:px-6 rounded-full shadow-2xl backdrop-blur-md border animate-float"
                    style={{ 
                        backgroundColor: `${colors.surfaceContainerHighest}f0`, 
                        borderColor: colors.outlineVariant || 'rgba(255,255,255,0.1)' 
                    }}
                >
                    <span className="font-bold whitespace-nowrap text-sm md:text-base" style={{ color: "#1a1a1a" }}>
                        {selectedFilenames.size} {t('selected' as any)}
                    </span>

                    <div className="h-6 w-px bg-white/20 mx-1" />

                    {(() => {
                        const selectedMods = mods.filter(m => selectedFilenames.has(m.filename));
                        const hasEnabledMods = selectedMods.some(m => m.enabled);
                        const hasDisabledMods = selectedMods.some(m => !m.enabled);

                        return (
                            <>
                                {hasDisabledMods && (
                                    <button
                                        onClick={() => handleBulkToggle(true)}
                                        className="px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-xs md:text-sm font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 shadow-sm"
                                        style={{ backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <path d="M9 12l2 2 4-4"></path>
                                        </svg>
                                        <span className="hidden sm:inline">Enable</span>
                                    </button>
                                )}

                                {hasEnabledMods && (
                                    <button
                                        onClick={() => handleBulkToggle(false)}
                                        className="px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-xs md:text-sm font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 shadow-sm"
                                        style={{ backgroundColor: colors.surfaceContainer, color: colors.onSurfaceVariant }}
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                                        </svg>
                                        <span className="hidden sm:inline">Disable</span>
                                    </button>
                                )}
                            </>
                        );
                    })()}

                    <button
                        onClick={handleBulkDelete}
                        className="px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-xs md:text-sm font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 shadow-sm"
                        style={{ backgroundColor: "#ff4d6d", color: "#1a1a1a" }}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                        <span className="hidden sm:inline">Remove</span>
                    </button>
                    
                    <button
                        onClick={() => setSelectedFilenames(new Set())}
                        className="w-8 h-8 md:w-10 md:h-10 ml-2 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
                        title="Cancel Selection"
                    >
                        <Icons.Close className="w-4 h-4 md:w-5 md:h-5 text-white/70" />
                    </button>
                </div>
            )}


        </>
    );
}

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
        <div 
            className="animate-fade-in opacity-0"
            style={{ 
                animationDelay: `${index * 50}ms`,
                animationFillMode: 'forwards'
            }}
        >
            {children}
        </div>
    );
}
