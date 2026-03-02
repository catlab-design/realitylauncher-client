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
import { runBulkDelete, type DeleteResult } from "../../../lib/bulkDelete";


interface ModsListProps {
    colors: any;
    instanceId: string;
    mods: ModInfo[];
    isLoading: boolean;
    onToggle: (filename: string) => void;
    onDelete: (filename: string, options?: { silent?: boolean }) => Promise<DeleteResult>;
    onRefresh: () => void;
    onAddMod: () => void;
    lockedMods: Set<string>;
    onToggleLock?: (filename: string) => void;
    onBulkLock?: (filenames: string[], lock: boolean) => void;
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
    onBulkLock,
    isServerManaged,
    minecraftVersion,
    loader,
    instanceName = ""
}: ModsListProps) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(1);
    const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(new Set());
    const [showLockInfo, setShowLockInfo] = useState(() => {
        try {
            const saved = localStorage.getItem('hideModLockBanner');
            return saved !== 'true';
        } catch {
            return true;
        }
    });

    const handleHideBanner = () => {
        playClick();
        setShowLockInfo(false);
        try {
            localStorage.setItem('hideModLockBanner', 'true');
        } catch (e) {}
    };

    const handleShowBanner = () => {
        playClick();
        setShowLockInfo(true);
        try {
            localStorage.removeItem('hideModLockBanner');
        } catch (e) {}
    };


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
            await runBulkDelete(filenames, async (filename, options) => {
                return onDelete(filename, options);
            });
            
            setSelectedFilenames(new Set());
            onRefresh();
        }
    };

    const handleBulkLock = async (lock: boolean) => {
        const filenames = Array.from(selectedFilenames);
        if (filenames.length === 0 || !onBulkLock) return;
        
        playClick();
        await onBulkLock(filenames, lock);
        setSelectedFilenames(new Set());
        onRefresh();
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

                    {isServerManaged && !showLockInfo && (
                        <button
                            onClick={handleShowBanner}
                            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:bg-white/10 active:scale-95 shrink-0"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            title={t('mod_lock_banner_title' as any)}
                        >
                            <i className="fa-solid fa-question text-sm"></i>
                        </button>
                    )}
                </div>
            </div>

            {/* Lock Info Banner for Server Managed Instances */}
            {isServerManaged && showLockInfo && (
                <div className="group relative flex items-center gap-3 p-3 lg:p-4 mb-4 rounded-xl border-l-4 pr-32"
                     style={{ 
                         backgroundColor: `${colors.secondary}15`, 
                         borderColor: colors.secondary,
                         color: colors.onSurface
                     }}>
                    <div className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center shrink-0">
                        <Icons.Lock className="w-4 h-4" style={{ color: "#000000" }} />
                    </div>
                    <div className="text-sm">
                        <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-bold">{t('mod_lock_banner_title' as any)}</p>
                            <button 
                                onClick={() => alert('เลือกไฟล์ที่ต้องการ (Checkbox) ด้านล่าง\nจากนั้นปุ่มดำเนินการ "ล็อก" และ "ปลดล็อก" จะปรากฏขึ้นบริเวณแถบเครื่องมือด้านบน')}
                                className="px-2 py-0.5 rounded bg-black/10 hover:bg-black/20 flex items-center gap-1.5 transition-all"
                                title="วิธีใช้งานระบบล็อกไฟล์"
                            >
                                <i className="fa-solid fa-question text-[10px] text-black opacity-70"></i>
                                <span className="text-[10px] font-bold text-black opacity-80">วิธีใช้งาน</span>
                            </button>
                        </div>
                        <p className="opacity-80">
                            {(() => {
                                const desc = t('mod_lock_banner_desc' as any);
                                if (desc.includes('{icon}')) {
                                    const parts = desc.split('{icon}');
                                    return (
                                        <>
                                            {parts[0]}
                                            <i className="fa-solid fa-question text-[10px] inline-block mx-0.5 text-black"></i>
                                            {parts[1]}
                                        </>
                                    );
                                }
                                return desc;
                            })()}
                        </p>
                    </div>

                    <button
                        onClick={handleHideBanner}
                        className="absolute top-1/2 -translate-y-1/2 right-3 px-5 py-2.5 rounded-2xl flex items-center gap-2 transition-all bg-black/5 hover:bg-black/10 shrink-0 border border-black/10"
                        title={t('hide' as any)}
                    >
                        <i className="fa-solid fa-question text-xs opacity-70 text-black"></i>
                        <span className="text-sm font-bold text-black opacity-90">{t('hide' as any)}</span>
                    </button>
                </div>
            )}

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
                    className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 md:gap-3 px-4 py-2.5 md:px-6 rounded-full shadow-2xl backdrop-blur-xl border animate-float"
                    style={{ 
                        backgroundColor: `${colors.surfaceContainerHighest}e6`, 
                        borderColor: colors.outlineVariant || 'rgba(128,128,128,0.2)' 
                    }}
                >
                    <span className="font-bold whitespace-nowrap text-sm md:text-base mr-1" style={{ color: colors.onSurface }}>
                        {selectedFilenames.size} {t('selected' as any)}
                    </span>

                    <div className="h-6 w-px mx-1 md:mx-2" style={{ backgroundColor: colors.outlineVariant || 'rgba(128,128,128,0.2)' }} />

                    {(() => {
                        const selectedMods = mods.filter(m => selectedFilenames.has(m.filename));
                        const hasEnabledMods = selectedMods.some(m => m.enabled);
                        const hasDisabledMods = selectedMods.some(m => !m.enabled);

                        return (
                            <>
                                {hasDisabledMods && (
                                    <button
                                        onClick={() => handleBulkToggle(true)}
                                        className="px-3 py-1.5 md:px-4 md:py-2 rounded-2xl text-xs md:text-sm font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
                                        style={{ backgroundColor: colors.surface, color: colors.onSurface, border: `1px solid ${colors.outlineVariant || 'rgba(128,128,128,0.1)'}` }}
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <path d="M9 12l2 2 4-4"></path>
                                        </svg>
                                        <span className="hidden sm:inline">{t('action_enable' as any)}</span>
                                    </button>
                                )}

                                {hasEnabledMods && (
                                    <button
                                        onClick={() => handleBulkToggle(false)}
                                        className="px-3 py-1.5 md:px-4 md:py-2 rounded-2xl text-xs md:text-sm font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
                                        style={{ backgroundColor: colors.surface, color: colors.onSurfaceVariant, border: `1px solid ${colors.outlineVariant || 'rgba(128,128,128,0.1)'}` }}
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                                        </svg>
                                        <span className="hidden sm:inline">{t('action_disable' as any)}</span>
                                    </button>
                                )}
                            </>
                        );
                    })()}

                    {isServerManaged && onBulkLock && (
                        <>
                            <div className="h-6 w-px mx-1 hidden md:block" style={{ backgroundColor: colors.outlineVariant || 'rgba(128,128,128,0.2)' }} />
                            <button
                                onClick={() => handleBulkLock(true)}
                                className="px-3 py-1.5 md:px-4 md:py-2 rounded-2xl text-xs md:text-sm font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
                                style={{ backgroundColor: colors.secondary, color: "#000000" }}
                            >
                                <Icons.Lock className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                <span className="hidden sm:inline">{t('lock' as any)}</span>
                            </button>
                            <button
                                onClick={() => handleBulkLock(false)}
                                className="px-3 py-1.5 md:px-4 md:py-2 rounded-2xl text-xs md:text-sm font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
                                style={{ backgroundColor: 'transparent', color: colors.onSurfaceVariant, border: `1px solid ${colors.outlineVariant || 'rgba(128,128,128,0.3)'}` }}
                            >
                                <Icons.Unlock className="w-3.5 h-3.5 md:w-4 md:h-4 opacity-70" />
                                <span className="hidden sm:inline">{t('unlock' as any)}</span>
                            </button>
                        </>
                    )}

                    <div className="h-6 w-px mx-1 hidden md:block" style={{ backgroundColor: colors.outlineVariant || 'rgba(128,128,128,0.2)' }} />

                    <button
                        onClick={handleBulkDelete}
                        className="px-3 py-1.5 md:px-4 md:py-2 rounded-2xl text-xs md:text-sm font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
                        style={{ backgroundColor: "#ff4d6d", color: "#1a1a1a" }}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                        <span className="hidden sm:inline">{t('action_remove' as any)}</span>
                    </button>
                    
                    <button
                        onClick={() => setSelectedFilenames(new Set())}
                        className="w-8 h-8 md:w-10 md:h-10 ml-1 rounded-full flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                        title={t('cancel_selection' as any)}
                    >
                        <Icons.Close className="w-4 h-4 md:w-5 md:h-5" style={{ color: colors.onSurfaceVariant }} />
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
