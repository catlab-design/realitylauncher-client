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

function normalizeVer(v: string): string {
    return String(v || "")
        .toLowerCase()
        .replace(/^v/, "")
        .split(/[+\-_\s]/)[0]
        .trim();
}

function isSameVersion(a: string, b: string): boolean {
    const na = normalizeVer(a);
    const nb = normalizeVer(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    return na.startsWith(nb) || nb.startsWith(na);
}

// ฟังก์ชันลบอักขระพิเศษ (เช่น §, $, |) ออกจากชื่อไฟล์ เพื่อให้แสดงผลอ่านง่าย
function isInstalledOlderThanLatest(
    versions: Array<{ id?: string | number; version_number?: string; displayName?: string; fileName?: string }>,
    currentVersion: string,
    installedVersionId?: string,
): boolean {
    if (versions.length === 0) return false;
    const latest = versions[0];
    const latestId = latest.id == null ? "" : String(latest.id);
    const latestNumber = String(latest.version_number || latest.displayName || latest.fileName || "");

    const currentIndex = versions.findIndex((version) => {
        const id = version.id == null ? "" : String(version.id);
        const number = String(version.version_number || version.displayName || version.fileName || "");
        return Boolean(installedVersionId && id === installedVersionId) || isSameVersion(number, currentVersion);
    });

    if (currentIndex >= 0) return currentIndex > 0;
    if (installedVersionId && latestId === installedVersionId) return false;
    return !isSameVersion(latestNumber, currentVersion);
}

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
    onOpenProjectDetail?: (item: ContentItem | DatapackItem) => void;
    onUpdate?: (item: ContentItem | DatapackItem) => void;
    isUpdating?: boolean;
    onSwitchVersion?: (item: ContentItem | DatapackItem) => void;
    instanceMcVersion?: string;
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
    onOpenProjectDetail,
    onUpdate,
    isUpdating = false,
    onSwitchVersion,
    instanceMcVersion,
}: LazyContentItemProps) {
    const { t } = useTranslation();
    const [iconUrl, setIconUrl] = useState<string | null>(item.icon || null);
    const [isIconLoading, setIsIconLoading] = useState(false);
    const fetchAttempted = useRef(false);
    const [hasUpdate, setHasUpdate] = useState<boolean | null>(null);

    const isDatapack = category === "datapack";
    const currentItem = item as ContentItem & Partial<DatapackItem>;
    const canOpenProject = Boolean(onOpenProjectDetail);

    const handleOpenProject = () => {
        if (!onOpenProjectDetail) return;
        playClick();
        onOpenProjectDetail(item);
    };

    useEffect(() => {
        setIconUrl(item.icon || null);
    }, [item.icon, currentItem.filename]);

    useEffect(() => {
        fetchAttempted.current = false;
    }, [currentItem.filename, currentItem.modrinthProjectId, currentItem.curseforgeProjectId]);

    // Prefer official project icons when we know the linked project IDs.
    useEffect(() => {
        if (fetchAttempted.current) return;

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
    }, [currentItem.modrinthProjectId, currentItem.curseforgeProjectId, currentItem.filename]);

    useEffect(() => {
        let cancelled = false;
        const currentVersion = (currentItem.version || "").trim();
        const installedVersionId = (currentItem.installedVersionId || "").trim();
        const projectId = currentItem.modrinthProjectId || currentItem.curseforgeProjectId;
        if ((!currentVersion && !installedVersionId) || !projectId) {
            setHasUpdate(null);
            return;
        }
        setHasUpdate(null);
        const run = async () => {
            try {
                let olderThanLatest = false;
                if (currentItem.modrinthProjectId) {
                    const versions = await (window.api as any)?.modrinthGetVersions?.(currentItem.modrinthProjectId);
                    if (Array.isArray(versions)) {
                        const compatibleVersions = versions.filter((v: any) =>
                            !instanceMcVersion || (v.game_versions || []).includes(instanceMcVersion),
                        );
                        olderThanLatest = isInstalledOlderThanLatest(
                            compatibleVersions,
                            currentVersion,
                            installedVersionId,
                        );
                    }
                } else if (currentItem.curseforgeProjectId) {
                    const files = await (window.api as any)?.curseforgeGetFiles?.(
                        currentItem.curseforgeProjectId,
                        instanceMcVersion,
                    );
                    const list = files?.data || files || [];
                    if (Array.isArray(list) && list.length > 0) {
                        olderThanLatest = isInstalledOlderThanLatest(
                            list,
                            currentVersion,
                            installedVersionId,
                        );
                    }
                }
                if (cancelled) return;
                setHasUpdate(olderThanLatest);
            } catch {
                if (!cancelled) setHasUpdate(false);
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [
        currentItem.filename,
        currentItem.version,
        currentItem.installedVersionId,
        currentItem.modrinthProjectId,
        currentItem.curseforgeProjectId,
        instanceMcVersion,
    ]);

    return (
        <div
            role={canOpenProject ? "button" : undefined}
            tabIndex={canOpenProject ? 0 : undefined}
            onClick={handleOpenProject}
            onKeyDown={(e) => {
                if (!canOpenProject) return;
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOpenProject();
                }
            }}
            className={`grid grid-cols-[auto_3rem_minmax(220px,0.9fr)_minmax(260px,1fr)_auto] items-center gap-4 min-h-[64px] px-4 py-3 rounded-xl transition-all group ${canOpenProject ? "cursor-pointer hover:brightness-[0.98]" : ""}`}
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
                    className="w-12 h-12 rounded-xl object-cover shrink-0 bg-white"
                />
            ) : (
                <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: colors.surfaceContainerHighest }}
                >
                    <Icons.Box className={`w-6 h-6 ${isIconLoading ? 'animate-pulse' : ''}`} style={{ color: colors.onSurfaceVariant }} />
                </div>
            )}

            {/* Info */}
            <div className="min-w-0 pr-4 flex flex-col justify-center">
                <p className="font-bold text-[15px] truncate" style={{ color: colors.onSurface }}>
                    {cleanName(currentItem.name)}
                </p>
                <p className="text-xs truncate opacity-70 mt-1" style={{ color: colors.onSurfaceVariant }}>
                    {isDatapack && currentItem.worldName && `${currentItem.worldName} - `}
                    {formatSize(currentItem.size)}
                </p>
            </div>

            {/* Version info from pack.mcmeta */}
            <div className="min-w-0 pr-4 hidden md:flex flex-col justify-center">
                <p className="text-sm font-bold truncate mb-0.5 flex items-center gap-1.5" style={{ color: colors.onSurface }}>
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
                    onClick={(e) => { e.stopPropagation(); playClick(); onToggle(currentItem.filename, isDatapack ? currentItem.worldName : undefined); }}
                    className="relative w-11 h-6 rounded-full transition-colors shrink-0"
                    style={{ backgroundColor: currentItem.enabled ? colors.secondary : colors.surfaceContainerHighest }}
                    title={currentItem.enabled ? t('disable') : t('enable')}
                >
                    <div
                        className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm"
                        style={{ left: currentItem.enabled ? "calc(100% - 20px)" : "4px" }}
                    />
                </button>

                {/* Update OR Switch version (mutually exclusive based on hasUpdate).
                    Placeholder while checking to prevent Switch-to-Update flash. */}
                {(() => {
                    const hasProjectRef = Boolean(currentItem.modrinthProjectId || currentItem.curseforgeProjectId);
                    const stillChecking =
                        hasProjectRef &&
                        hasUpdate === null &&
                        Boolean((currentItem.version || "").trim() || (currentItem.installedVersionId || "").trim());
                    if (stillChecking) {
                        return <div className="w-8 h-8 shrink-0" aria-hidden="true" />;
                    }
                    if (onUpdate && hasUpdate === true) {
                        const handleUpdateClick = (e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            playClick();
                            if (onSwitchVersion) {
                                onSwitchVersion(item);
                                return;
                            }
                            onUpdate(item);
                        };
                        return (
                            <button
                                onClick={handleUpdateClick}
                                disabled={isUpdating && !onSwitchVersion}
                                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10 shrink-0 disabled:opacity-50"
                                style={{ color: "#22c55e" }}
                                title={t('update_to_latest' as any) || "Update to latest"}
                                type="button"
                            >
                                <i className="fa-solid fa-arrow-up text-sm"></i>
                            </button>
                        );
                    }
                    if (onSwitchVersion) {
                        return (
                            <button
                                onClick={(e) => { e.stopPropagation(); playClick(); onSwitchVersion(item); }}
                                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10 shrink-0"
                                style={{ color: colors.onSurfaceVariant }}
                                title={t('switch_version_title' as any) || 'Switch version'}
                                type="button"
                            >
                                <i className="fa-solid fa-right-left text-sm"></i>
                            </button>
                        );
                    }
                    return null;
                })()}

                {/* Delete button */}
                <button
                    onClick={(e) => { e.stopPropagation(); playClick(); onDelete(currentItem.filename, isDatapack ? currentItem.worldName : undefined); }}
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
                    onClick={(e) => e.stopPropagation()}
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
