/**
 * ContentItem - Component สำหรับแสดง ResourcePack/Shader/Datapack item
 * แบบแยกชิ้นเพื่อจัดการ icon fetching ได้ดีขึ้น และรองรับ animation
 */

import React, { useState, useEffect, useRef } from "react";
import { Icons } from "../../ui/Icons";
import { playClick } from "../../../lib/sounds";
import type { ContentItem, DatapackItem } from "./types";
import { formatSize } from "./helpers";
import { useTranslation } from "../../../hooks/useTranslation";

// ฟังก์ชันลบอักขระพิเศษ (เช่น §, $, |) ออกจากชื่อไฟล์ เพื่อให้แสดงผลอ่านง่าย
function cleanName(name: string = ""): string {
    return name.replace(/§[0-9a-fklmnor]/gi, "")
        .replace(/[\$\|]/g, " ")
        .replace(/[_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

interface LazyContentItemProps {
    item: ContentItem | DatapackItem;
    category: "resourcepack" | "shader" | "datapack";
    colors: any;
    onToggle: (filename: string, worldName?: string) => void;
    onDelete: (filename: string, worldName?: string) => void;
    index?: number;
    isLoading?: boolean;
    isSelected?: boolean;
    onToggleSelection?: (filename: string) => void;

}

export function LazyContentItem({
    item,
    category,
    colors,
    onToggle,
    onDelete,
    index = 0,
    isLoading = false,
    isSelected = false,
    onToggleSelection,

}: LazyContentItemProps) {
    const { t } = useTranslation();
    const [iconUrl, setIconUrl] = useState<string | null>(item.icon || null);
    const [isIconLoading, setIsIconLoading] = useState(false);
    const fetchAttempted = useRef(false);

    const isDatapack = category === "datapack";
    const currentItem = item as ContentItem & Partial<DatapackItem>;

    // Fetch icon logic
    useEffect(() => {
        // ถ้ามี icon อยู่แล้ว หรือเคยลอง fetch ไปแล้ว ไม่ต้องทำอะไร
        if (iconUrl || fetchAttempted.current) return;

        // ถ้าไม่มี ID โปรเจกต์ ก็ไม่ต้อง fetch
        if (!currentItem.modrinthProjectId && !currentItem.curseforgeProjectId) return;

        fetchAttempted.current = true;
        setIsIconLoading(true);

        const fetchIcon = async () => {
            try {
                // Modrinth
                if (currentItem.modrinthProjectId) {
                    const project = await (window.api as any)?.modrinthGetProject?.(currentItem.modrinthProjectId);
                    if (project?.icon_url || project?.iconUrl) {
                        setIconUrl(project.icon_url || project.iconUrl);
                        return;
                    }
                }

                // CurseForge
                if (currentItem.curseforgeProjectId) {
                    const result = await (window.api as any)?.curseforgeGetProject?.(currentItem.curseforgeProjectId);
                    const logo = result?.data?.logo?.url;
                    if (logo) {
                        setIconUrl(logo);
                        return;
                    }
                }
            } catch (err) {
                console.warn("Failed to fetch icon for", currentItem.name, err);
            } finally {
                setIsIconLoading(false);
            }
        };

        fetchIcon();
    }, [currentItem.modrinthProjectId, currentItem.curseforgeProjectId, iconUrl, currentItem.name]);

    return (
        <div
            className="flex items-center gap-3 py-2 px-3 rounded-lg transition-all group"
            style={{
                backgroundColor: isSelected ? colors.secondary + "15" : colors.surfaceContainer,
                opacity: currentItem.enabled ? 1 : 0.6,
                border: isSelected ? `1px solid ${colors.secondary}50` : "1px solid transparent",
                marginBottom: "4px"
            }}
        >
            {/* Checkbox */}
            <div
                onClick={(e) => {
                    e.stopPropagation();
                    playClick();
                    onToggleSelection?.(currentItem.filename);
                }}
                className={`w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer border-2 shrink-0 ${isSelected ? "scale-110" : "opacity-40 group-hover:opacity-100"}`}
                style={{
                    backgroundColor: isSelected ? colors.secondary : "transparent",
                    borderColor: isSelected ? colors.secondary : colors.onSurfaceVariant
                }}
            >
                {isSelected && <Icons.Check className="w-3.5 h-3.5" style={{ color: "#1a1a1a" }} />}
            </div>

            {/* Icon */}
            {iconUrl ? (
                <img
                    src={iconUrl}
                    alt={cleanName(currentItem.name)}
                    className="w-10 h-10 rounded-lg object-cover shrink-0 bg-white"
                />
            ) : (
                <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: colors.surfaceContainerHighest }}
                >
                    <Icons.Box className={`w-5 h-5 ${isIconLoading ? 'animate-pulse' : ''}`} style={{ color: colors.onSurfaceVariant }} />
                </div>
            )}

            {/* Info */}
            <div className="w-[30%] min-w-0 pr-4 shrink-0 flex flex-col justify-center">
                <p className="font-bold text-sm truncate" style={{ color: colors.onSurface }}>
                    {cleanName(currentItem.name)}
                </p>
                <p className="text-xs truncate opacity-70 mt-0.5" style={{ color: colors.onSurfaceVariant }}>
                    {isDatapack && currentItem.worldName && `${currentItem.worldName} • `}
                    {formatSize(currentItem.size)}
                </p>
            </div>

            {/* Version info from pack.mcmeta */}
            <div className="flex-1 min-w-0 pr-4 hidden md:flex flex-col justify-center">
                <p className="text-xs font-medium truncate mb-0.5 flex items-center gap-1.5" style={{ color: colors.onSurface }}>
                    {currentItem.version || "Unknown Version"}

                </p>
                <p className="text-xs truncate opacity-60" style={{ color: colors.onSurfaceVariant }}>
                    {currentItem.filename}
                </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
                {/* Toggle switch */}
                <button
                    onClick={() => { playClick(); onToggle(currentItem.filename, isDatapack ? currentItem.worldName : undefined); }}
                    className="relative w-11 h-6 rounded-full transition-colors shrink-0"
                    style={{ backgroundColor: currentItem.enabled ? colors.secondary : colors.surfaceContainerHighest }}
                    title={currentItem.enabled ? t('disable') : t('enable')}
                >
                    <div
                        className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm"
                        style={{ left: currentItem.enabled ? "calc(100% - 20px)" : "4px" }}
                    />
                </button>

                {/* Delete button */}
                <button
                    onClick={() => { playClick(); onDelete(currentItem.filename, isDatapack ? currentItem.worldName : undefined); }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10 shrink-0"
                    style={{ color: colors.onSurfaceVariant }}
                    title={t('delete')}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
                
                {/* Dots menu (placeholder for layout consistency) */}
                <button
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10 shrink-0"
                    style={{ color: colors.onSurfaceVariant }}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="12" cy="5" r="1"></circle>
                        <circle cx="12" cy="19" r="1"></circle>
                    </svg>
                </button>
            </div>
        </div>
    );
}
