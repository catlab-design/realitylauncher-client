// ========================================
// ========================================

import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "../../../hooks/useTranslation";
import type { TranslationKey } from "../../../i18n/translations";
import { Icons } from "../../ui/Icons";
import type { ModVersion, GameInstance, ProjectType } from "./types";
import { matchesVersion } from "./helpers";

interface VersionSelectModalProps {
    colors: any;
    title: string;
    projectTitle: string;
    versions: ModVersion[];
    isLoading: boolean;
    isDownloading?: boolean;
    // For content (non-modpack) — filter by instance compatibility
    targetInstance?: GameInstance;
    projectType?: ProjectType;
    onClose: () => void;
    onSelectVersion: (versionId: string) => void;
}

// CurseForge/Modrinth both expose a release channel field on individual versions;
// for ModVersion (used here for installs) we infer it from the version name as a fallback.
function detectChannel(v: ModVersion): "release" | "beta" | "alpha" {
    const anyV = v as any;
    if (anyV.version_type === "alpha" || anyV.version_type === "beta" || anyV.version_type === "release") {
        return anyV.version_type;
    }
    const blob = `${v.name} ${v.version_number}`.toLowerCase();
    if (/(alpha|nightly|snapshot)/.test(blob)) return "alpha";
    if (/(beta|rc|pre)/.test(blob)) return "beta";
    return "release";
}

export function VersionSelectModal({
    colors,
    title,
    projectTitle,
    versions,
    isLoading,
    isDownloading = false,
    targetInstance,
    projectType,
    onClose,
    onSelectVersion,
}: VersionSelectModalProps) {
    const { t } = useTranslation();
    const [filter, setFilter] = useState("");
    const [channel, setChannel] = useState<"all" | "release" | "beta" | "alpha">("all");

    // Filter versions: instance compatibility (if provided), channel, then free-text search.
    const filteredVersions = useMemo(() => {
        return versions.filter((v) => {
            if (targetInstance) {
                const instanceVersion = targetInstance.minecraftVersion;
                const instanceLoader = targetInstance.loader?.toLowerCase() || "vanilla";
                const versionMatch = v.game_versions.some(gv => matchesVersion(gv, instanceVersion));
                const isResourceContent = projectType === "resourcepack" || projectType === "shader" || projectType === "datapack";
                const loaderMatch = isResourceContent ||
                    instanceLoader === "vanilla" ||
                    v.loaders.length === 0 ||
                    v.loaders.map(l => l.toLowerCase()).includes(instanceLoader) ||
                    (instanceLoader === "quilt" && v.loaders.map(l => l.toLowerCase()).includes("fabric"));
                if (!versionMatch || !loaderMatch) return false;
            }
            if (channel !== "all" && detectChannel(v) !== channel) return false;
            if (filter.trim()) {
                const query = filter.toLowerCase();
                return (
                    v.name.toLowerCase().includes(query) ||
                    v.version_number.toLowerCase().includes(query) ||
                    v.game_versions.some(gv => gv.toLowerCase().includes(query)) ||
                    v.loaders.some(l => l.toLowerCase().includes(query))
                );
            }
            return true;
        });
    }, [versions, targetInstance, projectType, channel, filter]);

    const noCompatibleVersions = targetInstance && filteredVersions.length === 0 && !filter.trim() && channel === "all";

    return createPortal(
        <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50" onClick={onClose}>
            <div className="w-full max-w-lg rounded-2xl p-6 relative" style={{ backgroundColor: colors.surface }} onClick={(e) => e.stopPropagation()}>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t("close")}
                    title={t("close")}
                    className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20"
                    style={{ color: colors.onSurfaceVariant }}
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                </button>

                <h3 className="text-lg font-semibold mb-1" style={{ color: colors.onSurface }}>
                    {title}
                </h3>
                <p className="text-sm mb-2" style={{ color: colors.onSurfaceVariant }}>
                    {projectTitle}
                </p>
                {targetInstance && (
                    <p className="text-xs mb-4 px-2 py-1 rounded inline-block" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>
                        → {targetInstance.name} ({targetInstance.minecraftVersion})
                    </p>
                )}

                {/* Search + channel filter */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <div className="relative flex-1 min-w-[180px]">
                        <input
                            type="text"
                            placeholder={t("search_versions")}
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="w-full px-4 py-2 pl-10 rounded-xl border text-sm"
                            style={{
                                backgroundColor: colors.surfaceContainer,
                                borderColor: colors.outline,
                                color: colors.onSurface,
                            }}
                        />
                        <Icons.Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.onSurfaceVariant }} />
                    </div>
                    <div className="flex items-center gap-1 p-1 rounded-xl" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                        {(["all", "release", "beta", "alpha"] as const).map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setChannel(c)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition-colors"
                                style={{
                                    backgroundColor: channel === c ? colors.secondary : "transparent",
                                    color: channel === c ? "#000" : colors.onSurfaceVariant,
                                }}
                            >
                                {c === "all" ? t("all" as TranslationKey) : c}
                            </button>
                        ))}
                    </div>
                </div>

                {isLoading ? (
                    <div className="p-6 text-center rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                        <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full mx-auto mb-2" style={{ color: colors.secondary }} />
                        <p style={{ color: colors.onSurfaceVariant }}>{t("loading_versions")}</p>
                    </div>
                ) : noCompatibleVersions ? (
                    <div className="p-4 text-center rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                        <p style={{ color: colors.onSurfaceVariant }}>{t("no_compatible_versions").replace("{version}", targetInstance.minecraftVersion)}</p>
                    </div>
                ) : filteredVersions.length === 0 ? (
                    <div className="p-4 text-center rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                        <p style={{ color: colors.onSurfaceVariant }}>{t("no_versions_found" as TranslationKey)}</p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {filteredVersions.map((version) => {
                            const ch = detectChannel(version);
                            const dot = ch === "release" ? "bg-emerald-400" : ch === "beta" ? "bg-amber-400" : "bg-red-400";
                            return (
                                <button
                                    key={version.id}
                                    type="button"
                                    onClick={() => onSelectVersion(version.id)}
                                    disabled={isDownloading}
                                    className="w-full p-3 rounded-xl text-left transition-all hover:scale-[1.01] disabled:opacity-50"
                                    style={{ backgroundColor: colors.surfaceContainer }}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="min-w-0">
                                            <div className="font-medium flex items-center gap-2" style={{ color: colors.onSurface }}>
                                                <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                                                <span className="truncate">{version.name || version.version_number}</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {version.game_versions.slice(0, 3).map((gv) => (
                                                    <span key={gv} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>
                                                        {gv}
                                                    </span>
                                                ))}
                                                {version.game_versions.length > 3 && (
                                                    <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                                        +{version.game_versions.length - 3}
                                                    </span>
                                                )}
                                                {version.loaders.map((loader) => (
                                                    <span key={loader} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "#22c55e20", color: "#22c55e" }}>
                                                        {loader}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <svg className="w-5 h-5 shrink-0 ml-2" viewBox="0 0 24 24" fill="currentColor" style={{ color: colors.secondary }}>
                                            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                                        </svg>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {isDownloading && (
                    <div className="mt-4 text-center" style={{ color: colors.onSurfaceVariant }}>
                        {t("downloading")}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
