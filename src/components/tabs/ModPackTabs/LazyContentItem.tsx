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
}

export function LazyContentItem({
    item,
    category,
    colors,
    onToggle,
    onDelete,
    index = 0,
    isLoading = false
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
            className="flex items-center gap-4 p-4 rounded-xl transition-all"
            style={{
                backgroundColor: colors.surfaceContainer,
                opacity: currentItem.enabled ? 1 : 0.6
            }}
        >
            {/* Icon */}
            <div
                className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden transition-colors"
                style={{ backgroundColor: colors.surfaceContainerHighest }}
            >
                {iconUrl ? (
                    <img
                        src={iconUrl}
                        alt={cleanName(currentItem.name)}
                        className="w-full h-full rounded-lg object-cover"
                    />
                ) : (
                    <Icons.Box className={`w-5 h-5 ${isIconLoading ? 'animate-pulse' : ''}`} style={{ color: colors.onSurfaceVariant }} />
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="font-medium truncate" style={{ color: colors.onSurface }}>
                    {cleanName(currentItem.name)}
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
                title={currentItem.enabled ? t('disable') : t('enable')}
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
                title={t('delete')}
            >
                <Icons.Trash className="w-5 h-5" />
            </button>
        </div>
    );
}
