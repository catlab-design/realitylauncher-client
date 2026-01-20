// ========================================
// Generic Content List Component
// (for resourcepacks, shaders, datapacks)
// ========================================

import React, { useState, useEffect } from "react";
import { Icons } from "../../ui/Icons";
import { Skeleton } from "../../ui/Skeleton";
import { formatSize } from "./helpers";
import type { ContentItem, DatapackItem } from "./types";
import { playClick } from "../../../lib/sounds";

interface ContentListProps {
    colors: any;
    items: ContentItem[] | DatapackItem[];
    isLoading: boolean;
    contentType: "resourcepack" | "shader" | "datapack";
    emptyMessage: string;
    onToggle: (filename: string, worldName?: string) => void;
    onDelete: (filename: string, worldName?: string) => void;
    onAddContent: () => void;
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
}: ContentListProps) {
    const labels = {
        resourcepack: { title: "Resource Packs", addLabel: "ติดตั้ง Resource Pack" },
        shader: { title: "Shaders", addLabel: "ติดตั้ง Shader" },
        datapack: { title: "Datapacks", addLabel: "ติดตั้ง Datapack" },
    };

    const isDatapack = contentType === "datapack";

    return (
        <>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium" style={{ color: colors.onSurface }}>
                    {labels[contentType].title} {isLoading ? "" : `(${items.length})`}
                </h3>
                <button
                    onClick={() => { playClick(); onAddContent(); }}
                    className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all hover:opacity-90"
                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                >
                    <i className="fa-solid fa-plus text-xs"></i>
                    {labels[contentType].addLabel}
                </button>
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
                    {(isLoading ? Array.from({ length: items.length > 0 ? items.length : 5 }) : items).map((item, index) => {
                        let content = null;
                        let key = `skeleton-${index}`;

                        if (item) {
                            // Real Item Logic
                            const currentItem = item as ContentItem & Partial<DatapackItem>;
                            key = isDatapack ? `${currentItem.worldName || 'unknown'}/${currentItem.filename}` : currentItem.filename;

                            content = (
                                <div
                                    className="flex items-center gap-4 p-4 rounded-xl transition-all animate-fade-in"
                                    style={{
                                        backgroundColor: colors.surfaceContainer,
                                        opacity: currentItem.enabled ? 1 : 0.6
                                    }}
                                >
                                    {/* Icon */}
                                    <div
                                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                                        style={{ backgroundColor: colors.surfaceContainerHighest }}
                                    >
                                        {currentItem.icon ? (
                                            <img src={currentItem.icon} alt={currentItem.name} className="w-full h-full rounded-lg object-cover" />
                                        ) : (
                                            <Icons.Box className="w-5 h-5" style={{ color: colors.onSurfaceVariant }} />
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate" style={{ color: colors.onSurface }}>
                                            {currentItem.name}
                                        </p>
                                        <p className="text-xs truncate" style={{ color: colors.onSurfaceVariant }}>
                                            {isDatapack && currentItem.worldName && `${currentItem.worldName} • `}
                                            {formatSize(currentItem.size)}
                                        </p>
                                    </div>

                                    {/* Toggle switch */}
                                    <button
                                        onClick={() => { playClick(); onToggle(currentItem.filename, isDatapack ? currentItem.worldName : undefined); }}
                                        className="relative w-12 h-6 rounded-full transition-colors"
                                        style={{ backgroundColor: currentItem.enabled ? colors.secondary : colors.surfaceContainerHighest }}
                                        title={currentItem.enabled ? "ปิด" : "เปิด"}
                                    >
                                        <div
                                            className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow"
                                            style={{ left: currentItem.enabled ? "calc(100% - 20px)" : "4px" }}
                                        />
                                    </button>

                                    {/* Delete button */}
                                    <button
                                        onClick={() => { playClick(); onDelete(currentItem.filename, isDatapack ? currentItem.worldName : undefined); }}
                                        className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/20"
                                        style={{ color: "#ef4444" }}
                                        title="ลบ"
                                    >
                                        <Icons.Trash className="w-5 h-5" />
                                    </button>
                                </div>
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
        </>
    );
}

// Wrapper component to handle sequential reveal state safely
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
    const [isRevealed, setIsRevealed] = useState(false);

    useEffect(() => {
        if (!isLoading) {
            const timer = setTimeout(() => {
                setIsRevealed(true);
            }, index * 50);
            return () => clearTimeout(timer);
        } else {
            setIsRevealed(false);
        }
    }, [isLoading, index]);

    const showSkeleton = isLoading || !isRevealed;

    if (showSkeleton) {
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

