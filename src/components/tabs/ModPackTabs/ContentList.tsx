// ฟังก์ชันลบอักขระพิเศษ (เช่น §, $, |) ออกจากชื่อไฟล์ เพื่อให้แสดงผลอ่านง่าย
function cleanName(name: string = ""): string {
    // ลบอักขระ Minecraft formatting (§...) และอักขระพิเศษทั่วไป
    return name.replace(/§[0-9a-fklmnor]/gi, "")
        .replace(/[\$\|]/g, " ")
        .replace(/[_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function currentNameForKey(item: { filename?: string; name?: string }) {
    const n = (item.filename || item.name || '').toString();
    return n.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
// ========================================
// Generic Content List Component
// (for resourcepacks, shaders, datapacks)
// ========================================

import React, { useState, useEffect, useRef } from "react";
import { Icons } from "../../ui/Icons";
import { Skeleton } from "../../ui/Skeleton";
import { formatSize } from "./helpers";
import type { ContentItem, DatapackItem } from "./types";
import { playClick } from "../../../lib/sounds";
import { useTranslation } from "../../../hooks/useTranslation";
import { LazyContentItem } from "./LazyContentItem";

interface ContentListProps {
    colors: any;
    items: ContentItem[] | DatapackItem[];
    isLoading: boolean;
    contentType: "resourcepack" | "shader" | "datapack";
    emptyMessage: string;
    onToggle: (filename: string, worldName?: string) => void;
    onDelete: (filename: string, worldName?: string) => void;
    onAddContent: () => void;
    onRefresh?: () => void;
}

export function ContentList({
    colors,
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

    // Reset page when search changes
    useEffect(() => {
        setPage(1);
    }, [searchQuery]);

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



    return (
        <>
            <div className="flex items-center justify-between mb-4">
                {/* Left Side: Title OR Pagination */}
                <div className="flex items-center gap-4">
                    {totalPages > 1 ? (
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
                            {labels[contentType].title} {isLoading ? "" : `(${items.length})`}
                        </h3>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Search */}
                    <div
                        className="flex items-center gap-2 px-4 py-2 rounded-xl transition-colors focus-within:ring-1 focus-within:ring-white/20"
                        style={{ backgroundColor: colors.surfaceContainerHighest }}
                    >
                        <i className="fa-solid fa-search text-sm" style={{ color: colors.onSurfaceVariant }}></i>
                        <input
                            type="text"
                            placeholder={(t('search_content_placeholder' as any) as string).replace('{type}', labels[contentType].title)}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent outline-none text-sm w-40 placeholder:opacity-70"
                            style={{ color: colors.onSurface }}
                        />
                    </div>

                    <button
                        onClick={() => { playClick(); onAddContent(); }}
                        className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all hover:opacity-90"
                        style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                    >
                        <i className="fa-solid fa-plus text-xs"></i>
                        {labels[contentType].addLabel}
                    </button>
                    <button
                        onClick={() => { playClick(); onRefresh && onRefresh(); }}
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
                        let key = `skeleton-${index}`;
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
        <div className="animate-fade-in">
            {children}
        </div>
    );
}


