import React, { useState, useEffect, useRef } from "react";
import { Icons } from "../../ui/Icons";
import { Skeleton } from "../../ui/Skeleton";
import { formatSize } from "./helpers";
import type { ContentItem, DatapackItem } from "./types";
import { playClick } from "../../../lib/sounds";
import { useTranslation } from "../../../hooks/useTranslation";
import { LazyContentItem } from "./LazyContentItem";
import { runBulkDelete, type DeleteResult } from "../../../lib/bulkDelete";

// ฟังก์ชันลบอักขระพิเศษ (เช่น §, $, |) ออกจากชื่อไฟล์ เพื่อให้แสดงผลอ่านง่าย
function cleanName(name: string = ""): string {
    // ลบอักขระ Minecraft formatting (§...) และอักขระพิเศษทั่วไป
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
}: ContentListProps) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(1);
    const ITEMS_PER_PAGE = 20;
    const [selectedFilenames, setSelectedFilenames] = useState<Set<string>>(new Set());



    // Reset page when search changes
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



    return (
        <>
            <div className="flex items-center justify-between gap-4 mb-4 w-full overflow-x-auto no-scrollbar pb-1">
                {/* Left Side: Title OR Pagination OR Selection Info */}
                <div className="flex items-center gap-4 shrink-0">
                    {selectedFilenames.size > 0 ? (
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => handleSelectAll(filteredItems)}
                                className="w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer border-2"
                                style={{
                                    backgroundColor: selectedFilenames.size === filteredItems.length ? colors.secondary : "transparent",
                                    borderColor: selectedFilenames.size === filteredItems.length ? colors.secondary : colors.onSurfaceVariant
                                }}
                            >
                                {selectedFilenames.size === filteredItems.length ? (
                                    <Icons.Check className="w-3.5 h-3.5" style={{ color: "#1a1a1a" }} />
                                ) : (
                                    selectedFilenames.size > 0 && <div className="w-2 h-0.5 rounded-full bg-current" />
                                )}
                            </button>
                            <span className="font-bold whitespace-nowrap" style={{ color: colors.secondary }}>
                                {selectedFilenames.size} {t('selected' as any)}
                            </span>

                            <div className="h-4 w-px bg-white/10 mx-1" />

                            {(() => {
                                const selectedItems = items.filter(m => selectedFilenames.has(m.filename));
                                const hasEnabledItems = selectedItems.some(m => m.enabled);
                                const hasDisabledItems = selectedItems.some(m => !m.enabled);

                                return (
                                    <>
                                        {hasDisabledItems && (
                                            <button
                                                onClick={() => handleBulkToggle(true)}
                                                className="px-3.5 py-1.5 rounded-xl text-sm font-bold transition-all hover:opacity-80 flex items-center gap-2 whitespace-nowrap shadow-sm"
                                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                            >
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                                    <circle cx="12" cy="12" r="10"></circle>
                                                    <path d="M9 12l2 2 4-4"></path>
                                                </svg>
                                                Enable
                                            </button>
                                        )}

                                        {hasEnabledItems && (
                                            <button
                                                onClick={() => handleBulkToggle(false)}
                                                className="px-3.5 py-1.5 rounded-xl text-sm font-bold transition-all hover:opacity-80 flex items-center gap-2 whitespace-nowrap shadow-sm"
                                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}
                                            >
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                                    <circle cx="12" cy="12" r="10"></circle>
                                                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                                                </svg>
                                                Disable
                                            </button>
                                        )}
                                    </>
                                );
                            })()}

                            <button
                                onClick={handleBulkDelete}
                                className="px-3.5 py-1.5 rounded-xl text-sm font-bold transition-all hover:opacity-80 flex items-center gap-2 whitespace-nowrap shadow-sm"
                                style={{ backgroundColor: "#ff4d6d", color: "#1a1a1a" }}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    <line x1="10" y1="11" x2="10" y2="17"></line>
                                    <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                                Remove
                            </button>
                        </div>
                    ) : (
                        totalPages > 1 ? (
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
                                {labels[contentType].title} {isLoading ? "" : `(${items.length})`}
                            </h3>
                        )
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0 max-w-full overflow-hidden">
                    {/* Search */}
                    <div
                        className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-xl transition-colors focus-within:ring-1 focus-within:ring-white/20 min-w-0 flex-1 lg:flex-none"
                        style={{ backgroundColor: colors.surfaceContainerHighest }}
                    >
                        <i className="fa-solid fa-search text-sm shrink-0" style={{ color: colors.onSurfaceVariant }}></i>
                        <input
                            type="text"
                            placeholder={(t('search_content_placeholder' as any) as string).replace('{type}', labels[contentType].title)}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent outline-none text-sm w-full lg:w-48 placeholder:opacity-70 min-w-0"
                            style={{ color: colors.onSurface }}
                        />
                    </div>

                    <button
                        onClick={() => { playClick(); onAddContent(); }}
                        className="px-3.5 lg:px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all hover:opacity-90 whitespace-nowrap shrink-0"
                        style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                    >
                        <i className="fa-solid fa-plus text-xs"></i>
                        <span className="hidden sm:inline">{labels[contentType].addLabel}</span>
                    </button>
                    <button
                        onClick={() => { playClick(); onRefresh && onRefresh(); }}
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
            {items.length === 0 && !isLoading ? (
                <div className="text-center py-12 rounded-2xl" style={{ backgroundColor: colors.surfaceContainer }}>
                    <Icons.Box className="w-12 h-12 mx-auto mb-3" style={{ color: colors.onSurfaceVariant, opacity: 0.5 }} />
                    <p className="font-medium" style={{ color: colors.onSurfaceVariant }}>
                        {emptyMessage}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {(isLoading ? Array.from({ length: 5 }) : paginatedItems).map((item, index) => {
                        let key = item ? ((item as any).filename + index) : `skeleton-${index}`;
                        let content = null;

                        if (item) {
                            // Real Item Logic
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
