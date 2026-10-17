import React, { useState, useEffect } from "react";
import { Portal } from "../../ui/Portal";
import { motion } from "framer-motion";
import { Icons } from "../../ui/Icons";
import { Skeleton } from "../../ui/Skeleton";
import { LazyModItem, MOD_ROW_GRID, MOD_ROW_GRID_LOCK } from "./LazyModItem";
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
    onOpenProjectDetail?: (mod: ModInfo) => void;
    onUpdate?: (mod: ModInfo) => void;
    updatingFilenames?: Set<string>;
    onSwitchVersion?: (mod: ModInfo) => void;
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
    instanceName = "",
    onOpenProjectDetail,
    onUpdate,
    updatingFilenames,
    onSwitchVersion,
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

    const allSelected = selectedFilenames.size === filteredMods.length && filteredMods.length > 0;
    const rowGrid = onToggleLock ? MOD_ROW_GRID_LOCK : MOD_ROW_GRID;

    return (
        <div
            style={{
                "--ghost-fg": colors.onSurfaceVariant,
                "--ghost-hover-fg": colors.onSurface,
                "--ghost-hover-bg": colors.surfaceContainerHighest,
                "--search-ring": colors.secondary + "55",
            } as React.CSSProperties}
        >
            {/* Toolbar: search · selection actions · pager · refresh · install */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <div
                    className="h-10 flex items-center gap-2 px-3 rounded-xl min-w-0 flex-1 basis-56 max-w-md transition-shadow focus-within:ring-2 focus-within:ring-(--search-ring)"
                    style={{ backgroundColor: colors.surfaceContainerHighest }}
                >
                    <Icons.Search className="w-4 h-4 shrink-0" style={{ color: colors.onSurfaceVariant }} />
                    <input
                        type="text"
                        placeholder={t('search_mod_count' as any).replace('{count}', String(mods.length))}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent outline-none text-sm w-full placeholder:opacity-70 min-w-0"
                        style={{ color: colors.onSurface }}
                    />
                </div>

                {/* Bulk actions float at the bottom of the window while items are selected. */}
                {selectedFilenames.size > 0 && (
                    <Portal>
                    <div
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 h-16 flex items-center gap-1 pl-6 pr-2.5 rounded-2xl max-w-[calc(100vw-2rem)] overflow-x-auto no-scrollbar shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)] animate-in fade-in slide-in-from-bottom-2 duration-200"
                        // Dark floating bar in every theme; the ghost-button colours are set here because
                        // the portal sits outside the toolbar that normally provides them.
                        style={{
                            backgroundColor: "#1c1c1f",
                            "--ghost-fg": "rgba(255,255,255,0.8)",
                            "--ghost-hover-fg": "#ffffff",
                            "--ghost-hover-bg": "rgba(255,255,255,0.12)",
                        } as React.CSSProperties}
                    >
                        <span className="text-base font-bold whitespace-nowrap mr-3" style={{ color: "#ffffff" }}>
                            {selectedFilenames.size} {t('selected' as any)}
                        </span>

                        {(() => {
                            const selectedMods = mods.filter(m => selectedFilenames.has(m.filename));
                            const hasEnabledMods = selectedMods.some(m => m.enabled);
                            const hasDisabledMods = selectedMods.some(m => !m.enabled);

                            return (
                                <>
                                    {hasDisabledMods && (
                                        <button
                                            onClick={() => handleBulkToggle(true)}
                                            className="h-11 px-4 rounded-xl text-[15px] font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap text-(--ghost-hover-fg) hover:bg-(--ghost-hover-bg)"
                                            title={t('action_enable' as any)}
                                        >
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                                <circle cx="12" cy="12" r="10"></circle>
                                                <path d="M9 12l2 2 4-4"></path>
                                            </svg>
                                            <span className="hidden sm:inline">{t('action_enable' as any)}</span>
                                        </button>
                                    )}

                                    {hasEnabledMods && (
                                        <button
                                            onClick={() => handleBulkToggle(false)}
                                            className="h-11 px-4 rounded-xl text-[15px] font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap text-(--ghost-fg) hover:text-(--ghost-hover-fg) hover:bg-(--ghost-hover-bg)"
                                            title={t('action_disable' as any)}
                                        >
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
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
                                <button
                                    onClick={() => handleBulkLock(true)}
                                    className="h-11 px-4 rounded-xl text-[15px] font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap hover:bg-(--ghost-hover-bg)"
                                    style={{ color: colors.secondary }}
                                    title={t('lock' as any)}
                                >
                                    <Icons.Lock className="w-5 h-5" />
                                    <span className="hidden sm:inline">{t('lock' as any)}</span>
                                </button>
                                <button
                                    onClick={() => handleBulkLock(false)}
                                    className="h-11 px-4 rounded-xl text-[15px] font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap text-(--ghost-fg) hover:text-(--ghost-hover-fg) hover:bg-(--ghost-hover-bg)"
                                    title={t('unlock' as any)}
                                >
                                    <Icons.Unlock className="w-5 h-5" />
                                    <span className="hidden sm:inline">{t('unlock' as any)}</span>
                                </button>
                            </>
                        )}

                        <button
                            onClick={handleBulkDelete}
                            className="h-11 px-4 rounded-xl text-[15px] font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap text-red-500 hover:bg-red-500/10"
                            title={t('action_remove' as any)}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                            <span className="hidden sm:inline">{t('action_remove' as any)}</span>
                        </button>

                        <button
                            onClick={() => setSelectedFilenames(new Set())}
                            className="w-11 h-11 rounded-xl flex items-center justify-center transition-colors shrink-0 text-(--ghost-fg) hover:text-(--ghost-hover-fg) hover:bg-(--ghost-hover-bg)"
                            title={t('cancel_selection' as any)}
                        >
                            <Icons.Close className="w-5 h-5" />
                        </button>
                    </div>
                    </Portal>
                )}

                <div className="flex items-center gap-2 ml-auto shrink-0">
                    {totalPages > 1 && (
                        <div className="h-10 flex items-center gap-0.5 px-1 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                            <button
                                onClick={() => { playClick(); setPage(p => Math.max(1, p - 1)); }}
                                disabled={page === 1}
                                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 text-(--ghost-hover-fg) enabled:hover:bg-(--ghost-hover-bg)"
                                title={t('previous')}
                            >
                                <Icons.ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="px-1.5 text-sm font-medium tabular-nums whitespace-nowrap" style={{ color: colors.onSurface }}>
                                {page} / {totalPages}
                            </span>
                            <button
                                onClick={() => { playClick(); setPage(p => Math.min(totalPages, p + 1)); }}
                                disabled={page === totalPages}
                                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 text-(--ghost-hover-fg) enabled:hover:bg-(--ghost-hover-bg)"
                                title={t('next')}
                            >
                                <Icons.ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {isServerManaged && !showLockInfo && (
                        <button
                            onClick={handleShowBanner}
                            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:brightness-110 active:scale-95 shrink-0"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            title={t('mod_lock_banner_title' as any)}
                        >
                            <i className="fa-solid fa-question text-sm"></i>
                        </button>
                    )}

                    <button
                        onClick={() => { playClick(); onRefresh(); }}
                        disabled={isLoading}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-110 active:scale-95'}`}
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                        title={t('refresh')}
                    >
                        <i className={`fa-solid fa-rotate-right text-sm ${isLoading ? 'fa-spin' : ''}`}></i>
                    </button>

                    <button
                        onClick={() => { playClick(); onAddMod(); }}
                        className="h-10 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all hover:brightness-105 active:scale-95 whitespace-nowrap shrink-0"
                        style={{ backgroundColor: colors.secondary, color: "#111" }}
                        title={t('install_mod' as any)}
                    >
                        <Icons.Add className="w-4 h-4" />
                        <span className="hidden sm:inline">{t('install_mod' as any)}</span>
                    </button>
                </div>
            </div>

            {isServerManaged && showLockInfo && (
                <div
                    className="flex items-center gap-3 p-3 mb-3 rounded-xl"
                    style={{ backgroundColor: `${colors.secondary}14`, color: colors.onSurface }}
                >
                    <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${colors.secondary}26`, color: colors.secondary }}
                    >
                        <Icons.Lock className="w-4 h-4" />
                    </div>
                    <div className="text-sm flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <p className="font-semibold">{t('mod_lock_banner_title' as any)}</p>
                            <button
                                onClick={() => alert('เลือกไฟล์ที่ต้องการ (Checkbox) ด้านล่าง\nจากนั้นปุ่มดำเนินการ "ล็อก" และ "ปลดล็อก" จะปรากฏขึ้นบริเวณแถบเครื่องมือด้านบน')}
                                className="h-6 px-2 rounded-md flex items-center gap-1.5 text-xs font-semibold transition-all hover:brightness-110"
                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}
                                title="วิธีใช้งานระบบล็อกไฟล์"
                            >
                                <i className="fa-solid fa-question text-xs"></i>
                                <span>วิธีใช้งาน</span>
                            </button>
                        </div>
                        <p style={{ color: colors.onSurfaceVariant }}>
                            {(() => {
                                const desc = t('mod_lock_banner_desc' as any);
                                if (desc.includes('{icon}')) {
                                    const parts = desc.split('{icon}');
                                    return (
                                        <>
                                            {parts[0]}
                                            <i className="fa-solid fa-question text-xs inline-block mx-0.5"></i>
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
                        className="h-9 px-3.5 rounded-lg flex items-center gap-2 text-sm font-semibold transition-all hover:brightness-110 shrink-0"
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                        title={t('hide' as any)}
                    >
                        {t('hide' as any)}
                    </button>
                </div>
            )}

            {filteredMods.length === 0 && !isLoading ? (
                <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                    <div
                        className="w-20 h-20 flex items-center justify-center mb-5"
                    >
                        <Icons.PaperBox className="w-16 h-16" style={{ color: colors.onSurfaceVariant }} />
                    </div>
                    <p className="text-lg font-semibold" style={{ color: colors.onSurface }}>
                        {searchQuery ? t('no_mods_search' as any) : t('no_mods_instance' as any)}
                    </p>
                    <p className="text-[13px] mt-1" style={{ color: colors.onSurfaceVariant }}>
                        {t('drag_jar_hint' as any)}
                    </p>
                    <button
                        onClick={() => { playClick(); onAddMod(); }}
                        className="mt-5 h-10 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all hover:brightness-105 active:scale-95"
                        style={{ backgroundColor: colors.secondary, color: "#111" }}
                    >
                        <Icons.Add className="w-4 h-4" />
                        {t('install_mod' as any)}
                    </button>
                </div>
            ) : (
                <div>
                    <div
                        className={`${rowGrid} h-9 px-3 text-[13px] font-semibold select-none`}
                        style={{ color: colors.onSurfaceVariant }}
                    >
                        <button
                            onClick={() => handleSelectAll(filteredMods)}
                            className="w-4.5 h-4.5 rounded-md flex items-center justify-center transition-all cursor-pointer border-[1.5px]"
                            style={{
                                backgroundColor: allSelected ? colors.secondary : "transparent",
                                borderColor: allSelected || selectedFilenames.size > 0 ? colors.secondary : colors.onSurfaceVariant
                            }}
                            title={t('select_all' as any) || "Select All"}
                        >
                            {allSelected ? (
                                <Icons.Check className="w-3.5 h-3.5" style={{ color: "#111" }} />
                            ) : (
                                selectedFilenames.size > 0 && <div className="w-2 h-0.5 rounded-full" style={{ backgroundColor: colors.secondary }} />
                            )}
                        </button>
                        <span className="truncate">{t('name')}</span>
                        <span className="truncate hidden md:block">{t('version')}</span>
                        <span aria-hidden="true" />
                    </div>

                    {/* Rows fade in once when loading ends (one fade for the whole list, not per row). */}
                    <motion.div
                        key={isLoading ? "loading" : "ready"}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="space-y-0.5"
                    >
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
                                    onOpenProjectDetail={onOpenProjectDetail}
                                    onUpdate={onUpdate}
                                    isUpdating={updatingFilenames?.has((mod as ModInfo)?.filename)}
                                    onSwitchVersion={onSwitchVersion}
                                    instanceMcVersion={minecraftVersion}
                                    instanceLoader={loader}
                                />
                            </ModListItemWrapper>
                        ))}
                    </motion.div>
                </div>
            )}

            {!isLoading && totalPages > 1 && (
                <div className="flex justify-center mt-4">
                    <div className="flex items-center gap-1 p-1 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                            <button
                                onClick={() => {
                                    playClick();
                                    setPage(p => Math.max(1, p - 1));
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                disabled={page === 1}
                                className="h-9 px-3 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors flex items-center gap-1.5 text-(--ghost-hover-fg) enabled:hover:bg-(--ghost-hover-bg)"
                            >
                                <Icons.ChevronLeft className="w-4 h-4" />
                                {t('previous')}
                            </button>

                            <div className="px-3 min-w-20 text-center text-sm tabular-nums" style={{ color: colors.onSurfaceVariant }}>
                                <span className="font-semibold" style={{ color: colors.onSurface }}>{page}</span>
                                <span className="mx-1">/</span>
                                <span>{totalPages}</span>
                            </div>

                            <button
                                onClick={() => {
                                    playClick();
                                    setPage(p => Math.min(totalPages, p + 1));
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                disabled={page === totalPages}
                                className="h-9 px-3 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors flex items-center gap-1.5 text-(--ghost-hover-fg) enabled:hover:bg-(--ghost-hover-bg)"
                            >
                                {t('next')}
                                <Icons.ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
        </div>
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
            <div className="min-h-15 flex items-center gap-4 px-3 py-2 rounded-xl">
                <Skeleton className="w-4.5 h-4.5 rounded-md" colors={colors} />
                <Skeleton className="w-10 h-10 rounded-lg" colors={colors} />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" colors={colors} />
                    <Skeleton className="h-3 w-1/4" colors={colors} />
                </div>
                <Skeleton className="w-10 h-6 rounded-full" colors={colors} />
                <Skeleton className="w-8 h-8 rounded-lg" colors={colors} />
            </div>
        );
    }

    return (
        <div>
            {children}
        </div>
    );
}
