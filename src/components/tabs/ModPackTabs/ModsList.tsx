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
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(1);

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
                {/* Left Side: Pagination */}
                {totalPages > 1 ? (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => { playClick(); setPage(p => Math.max(1, p - 1)); }}
                            disabled={page === 1}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40 hover:bg-white/5"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                        >
                            <i className="fa-solid fa-chevron-left text-xs"></i>
                            ก่อนหน้า
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
                            ถัดไป
                            <i className="fa-solid fa-chevron-right text-xs"></i>
                        </button>
                    </div>
                ) : (
                    <div /> // Spacer to keep right side aligned
                )}

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
                            placeholder={`ค้นหา Mod (${mods.length})...`}
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
                        ติดตั้ง Mod
                    </button>

                    <button
                        onClick={() => { playClick(); onRefresh(); }}
                        disabled={isLoading}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 active:scale-95'}`}
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                        title="รีเฟรช"
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
                        {searchQuery ? "ไม่พบ Mod ที่ค้นหา" : "ไม่มี Mod ใน Instance นี้"}
                    </p>
                    <p className="text-sm mt-1" style={{ color: colors.onSurfaceVariant }}>
                        ลากไฟล์ .jar มาที่โฟลเดอร์ mods หรือติดตั้งจาก Explore
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
                            />
                        </ModListItemWrapper>
                    ))}
                </div>
            )}

            {/* Bottom Pagination - Only show if fully loaded and has pages */}
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
                            ก่อนหน้า
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
                            ถัดไป
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
        <div
            className="animate-fade-in"
            style={{
                animationDelay: `${Math.min(index * 15, 150)}ms`,
                animationFillMode: 'backwards'
            }}
        >
            {children}
        </div>
    );
}
