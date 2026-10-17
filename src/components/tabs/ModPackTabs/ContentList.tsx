import React, { useState, useEffect } from "react";
import { Portal } from "../../ui/Portal";
import { AnimatePresence, motion } from "framer-motion";
import { useMotionPreset } from "../../../lib/motion";
import { Icons } from "../../ui/Icons";
import { Skeleton } from "../../ui/Skeleton";
import { bulkBarVariants, formatSize } from "./helpers";
import type { ContentItem, DatapackItem } from "./types";
import { playClick } from "../../../lib/sounds";
import { useTranslation } from "../../../hooks/useTranslation";
import { LazyContentItem, CONTENT_ROW_GRID } from "./LazyContentItem";
import { runBulkDelete, type DeleteResult } from "../../../lib/bulkDelete";

function cleanName(name: string = ""): string {
    return name.replace(/§[0-9a-fklmnor]/gi, "")
        .replace(/[\$\|]/g, " ")
        .replace(/[_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

interface ContentListProps {
    colors: any;
    instanceId: string;
    instanceName: string;
    minecraftVersion: string;
    loader: string;
    items: ContentItem[] | DatapackItem[];
    isLoading: boolean;
    contentType: "resourcepack" | "shader" | "datapack";
    emptyMessage: string;
    onToggle: (filename: string, worldName?: string) => void;
    onDelete: (filename: string, worldName?: string, options?: { silent?: boolean }) => Promise<DeleteResult>;
    onAddContent: () => void;
    onRefresh?: () => void;
    onOpenProjectDetail?: (item: ContentItem | DatapackItem) => void;
    onUpdate?: (item: ContentItem | DatapackItem) => void;
    updatingFilenames?: Set<string>;
    onSwitchVersion?: (item: ContentItem | DatapackItem) => void;
}

export function ContentList({
    colors,
    instanceId,
    instanceName,
    minecraftVersion,
    loader,
    items,
    isLoading,
    contentType,
    emptyMessage,
    onToggle,
    onDelete,
    onAddContent,
    onRefresh,
    onOpenProjectDetail,
    onUpdate,
    updatingFilenames,
    onSwitchVersion,
}: ContentListProps) {
    const { t } = useTranslation();
    const m = useMotionPreset();
    const bulkBar = bulkBarVariants(m);
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(1);
    const ITEMS_PER_PAGE = 20;
    const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(new Set());



    useEffect(() => {
        setPage(1);
        setSelectedFilenames(new Set());
    }, [searchQuery, contentType]);

    const filteredItems = items.filter(item =>
        cleanName(item.name).toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
    const paginatedItems = filteredItems.slice(
        (page - 1) * ITEMS_PER_PAGE,
        page * ITEMS_PER_PAGE
    );

    const labels = {
        resourcepack: { title: t('resourcepacks'), addLabel: t('install_resourcepack' as any) },
        shader: { title: t('shaders'), addLabel: t('install_shader' as any) },
        datapack: { title: t('datapacks'), addLabel: t('install_datapack' as any) },
    };

    const isDatapack = contentType === "datapack";

    const handleSelectAll = (currentViewItems: (ContentItem | DatapackItem)[]) => {
        playClick();
        const newSelected = new Set(selectedFilenames);
        if (selectedFilenames.size === currentViewItems.length && currentViewItems.length > 0) {
            newSelected.clear();
        } else {
            currentViewItems.forEach(item => newSelected.add(item.filename));
        }
        setSelectedFilenames(newSelected);
    };

    const handleBulkToggle = (enable: boolean) => {
        playClick();
        Array.from(selectedFilenames).forEach(filename => {
            const item = items.find(i => i.filename === filename);
            if (item && item.enabled !== enable) {
                onToggle(filename, isDatapack ? (item as DatapackItem).worldName : undefined);
            }
        });
        setSelectedFilenames(new Set());
    };

    const handleBulkDelete = async () => {
        if (confirm(`Are you sure you want to delete ${selectedFilenames.size} selected items?`)) {
            playClick();
            const selectedItems = Array.from(selectedFilenames)
                .map((filename) => items.find((item) => item.filename === filename))
                .filter((item): item is ContentItem | DatapackItem => Boolean(item));

            await runBulkDelete(selectedItems, async (item, options) => {
                return onDelete(
                    item.filename,
                    isDatapack ? (item as DatapackItem).worldName : undefined,
                    options,
                );
            });

            setSelectedFilenames(new Set());
        }
    };



    const allSelected = selectedFilenames.size === filteredItems.length && filteredItems.length > 0;

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
                        placeholder={(t('search_content_placeholder' as any) as string).replace('{type}', labels[contentType].title)}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent outline-none text-sm w-full placeholder:opacity-70 min-w-0"
                        style={{ color: colors.onSurface }}
                    />
                </div>

                {/* Bulk actions float at the bottom of the window while items are selected. */}
                <Portal>
                <AnimatePresence>
                {selectedFilenames.size > 0 && (
                    <motion.div
                        key="bulk-action-bar"
                        variants={bulkBar}
                        {...m.states}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 h-16 flex items-center gap-1 pl-6 pr-2.5 rounded-2xl max-w-[calc(100vw-2rem)] overflow-x-auto no-scrollbar shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)]"
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
                            const selectedItems = items.filter(item => selectedFilenames.has(item.filename));
                            const hasEnabledItems = selectedItems.some(item => item.enabled);
                            const hasDisabledItems = selectedItems.some(item => !item.enabled);

                            return (
                                <>
                                    {hasDisabledItems && (
                                        <button
                                            onClick={() => handleBulkToggle(true)}
                                            className="h-11 px-4 rounded-xl text-[15px] font-semibold pressable flex items-center gap-1.5 whitespace-nowrap text-(--ghost-hover-fg) hover:bg-(--ghost-hover-bg)"
                                            title={t('action_enable' as any)}
                                        >
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                                <circle cx="12" cy="12" r="10"></circle>
                                                <path d="M9 12l2 2 4-4"></path>
                                            </svg>
                                            <span className="hidden sm:inline">{t('action_enable' as any)}</span>
                                        </button>
                                    )}

                                    {hasEnabledItems && (
                                        <button
                                            onClick={() => handleBulkToggle(false)}
                                            className="h-11 px-4 rounded-xl text-[15px] font-semibold pressable flex items-center gap-1.5 whitespace-nowrap text-(--ghost-fg) hover:text-(--ghost-hover-fg) hover:bg-(--ghost-hover-bg)"
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

                        <button
                            onClick={handleBulkDelete}
                            className="h-11 px-4 rounded-xl text-[15px] font-semibold pressable flex items-center gap-1.5 whitespace-nowrap text-red-500 hover:bg-red-500/10"
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
                            className="w-11 h-11 rounded-xl flex items-center justify-center pressable shrink-0 text-(--ghost-fg) hover:text-(--ghost-hover-fg) hover:bg-(--ghost-hover-bg)"
                            title={t('cancel_selection' as any)}
                        >
                            <Icons.Close className="w-5 h-5" />
                        </button>
                    </motion.div>
                )}
                </AnimatePresence>
                </Portal>

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

                    <button
                        onClick={() => { playClick(); onRefresh && onRefresh(); }}
                        disabled={isLoading}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0 ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-110 active:scale-95'}`}
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                        title={t('refresh')}
                    >
                        <i className={`fa-solid fa-rotate-right text-sm ${isLoading ? 'fa-spin' : ''}`}></i>
                    </button>

                    <button
                        onClick={() => { playClick(); onAddContent(); }}
                        className="h-10 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all hover:brightness-105 active:scale-95 whitespace-nowrap shrink-0"
                        style={{ backgroundColor: colors.secondary, color: "#111" }}
                        title={labels[contentType].addLabel}
                    >
                        <Icons.Add className="w-4 h-4" />
                        <span className="hidden sm:inline">{labels[contentType].addLabel}</span>
                    </button>
                </div>
            </div>

            {items.length === 0 && !isLoading ? (
                <motion.div variants={m.scaleIn} {...m.states} className="flex flex-col items-center justify-center text-center py-16 px-6">
                    <div
                        className="w-20 h-20 flex items-center justify-center mb-5"
                    >
                        <Icons.PaperBox className="w-16 h-16" style={{ color: colors.onSurfaceVariant }} />
                    </div>
                    <p className="text-lg font-semibold" style={{ color: colors.onSurface }}>
                        {emptyMessage}
                    </p>
                    <button
                        onClick={() => { playClick(); onAddContent(); }}
                        className="mt-5 h-10 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all hover:brightness-105 active:scale-95"
                        style={{ backgroundColor: colors.secondary, color: "#111" }}
                    >
                        <Icons.Add className="w-4 h-4" />
                        {labels[contentType].addLabel}
                    </button>
                </motion.div>
            ) : (
                <div>
                    <div
                        className={`${CONTENT_ROW_GRID} h-9 px-3 text-[13px] font-semibold select-none`}
                        style={{ color: colors.onSurfaceVariant }}
                    >
                        <button
                            onClick={() => handleSelectAll(filteredItems)}
                            className="w-4.5 h-4.5 rounded-md flex items-center justify-center transition-all cursor-pointer border-[1.5px]"
                            style={{
                                backgroundColor: allSelected ? colors.secondary : "transparent",
                                borderColor: allSelected || selectedFilenames.size > 0 ? colors.secondary : colors.onSurfaceVariant,
                            }}
                            title={t('select_all' as any) || "Select All"}
                        >
                            {allSelected ? (
                                <Icons.Check className="w-3.5 h-3.5" style={{ color: "#111" }} />
                            ) : (
                                selectedFilenames.size > 0 && (
                                    <div
                                        className="w-2 h-0.5 rounded-full"
                                        style={{ backgroundColor: colors.secondary }}
                                    />
                                )
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
                        {(isLoading ? Array.from({ length: 5 }) : paginatedItems).map((item, index) => {
                            let key = item ? ((item as any).filename + index) : `skeleton-${index}`;
                            let content = null;

                            if (item) {
                                content = (
                                    <LazyContentItem
                                        item={item as ContentItem | DatapackItem}
                                        category={contentType}
                                        colors={colors}
                                        onToggle={onToggle}
                                        onDelete={onDelete}

                                        index={index}
                                        isSelected={selectedFilenames.has((item as ContentItem).filename)}
                                        onToggleSelection={(filename: string) => {
                                            const next = new Set(selectedFilenames);
                                            if (next.has(filename)) next.delete(filename);
                                            else next.add(filename);
                                            setSelectedFilenames(next);
                                        }}
                                        onOpenProjectDetail={onOpenProjectDetail}
                                        onUpdate={onUpdate}
                                        isUpdating={updatingFilenames?.has((item as ContentItem).filename)}
                                        onSwitchVersion={onSwitchVersion}
                                        instanceMcVersion={minecraftVersion}
                                    />
                                );
                            }

                            return (
                                <ContentListItemWrapper
                                    key={key}
                                    index={index}
                                    isLoading={isLoading}
                                    colors={colors}
                                >
                                    {content}
                                </ContentListItemWrapper>
                            );
                        })}
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
function ContentListItemWrapper({
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
