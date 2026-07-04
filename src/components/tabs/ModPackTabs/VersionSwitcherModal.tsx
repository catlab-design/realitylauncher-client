import React, { useEffect, useMemo, useState } from "react";
import { Icons } from "../../ui/Icons";
import { Portal } from "../../ui/Portal";
import { playClick } from "../../../lib/sounds";
import { useTranslation } from "../../../hooks/useTranslation";

export type VersionSwitcherSource = "modrinth" | "curseforge";

export interface VersionEntry {
    id: string;
    versionNumber: string;
    versionType: "release" | "beta" | "alpha" | "unknown";
    gameVersions: string[];
    loaders: string[];
    datePublished?: string;
    changelog?: string;
}

interface VersionSwitcherModalProps {
    colors: any;
    title: string;
    iconUrl?: string | null;
    currentVersion?: string;
    currentVersionId?: string;
    instanceMcVersion?: string;
    instanceLoader?: string;
    contentType: "mod" | "resourcepack" | "shader" | "datapack";
    projectId: string;
    source: VersionSwitcherSource;
    isInstalling?: boolean;
    onClose: () => void;
    onSwitch: (entry: VersionEntry) => void;
}

const TYPE_COLOR: Record<VersionEntry["versionType"], string> = {
    release: "#22c55e",
    beta: "#f59e0b",
    alpha: "#ef4444",
    unknown: "#9ca3af",
};

function formatDate(iso?: string): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    } catch {
        return "";
    }
}

function normalizeModrinthVersion(raw: any): VersionEntry {
    const typeRaw = String(raw?.version_type || "release").toLowerCase();
    const versionType: VersionEntry["versionType"] = ["release", "beta", "alpha"].includes(typeRaw)
        ? (typeRaw as VersionEntry["versionType"])
        : "unknown";
    return {
        id: String(raw?.id),
        versionNumber: String(raw?.version_number || raw?.name || raw?.id || ""),
        versionType,
        gameVersions: raw?.game_versions || [],
        loaders: (raw?.loaders || []).map((l: string) => l.toLowerCase()),
        datePublished: raw?.date_published,
        changelog: raw?.changelog,
    };
}

function normalizeCurseforgeFile(raw: any): VersionEntry {
    
    const map: Record<number, VersionEntry["versionType"]> = {
        1: "release",
        2: "beta",
        3: "alpha",
    };
    const versionType = map[raw?.releaseType] || "unknown";
    return {
        id: String(raw?.id),
        versionNumber: String(raw?.displayName || raw?.fileName || raw?.id || ""),
        versionType,
        gameVersions: (raw?.gameVersions || []).filter((v: string) => /^\d/.test(v)),
        loaders: (raw?.gameVersions || [])
            .filter((v: string) => !/^\d/.test(v))
            .map((l: string) => l.toLowerCase()),
        datePublished: raw?.fileDate,
        changelog: undefined,
    };
}

export function VersionSwitcherModal({
    colors,
    title,
    iconUrl,
    currentVersion,
    currentVersionId,
    instanceMcVersion,
    instanceLoader,
    contentType,
    projectId,
    source,
    isInstalling = false,
    onClose,
    onSwitch,
}: VersionSwitcherModalProps) {
    const { t } = useTranslation();
    const [versions, setVersions] = useState<VersionEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [showIncompatible, setShowIncompatible] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                if (source === "modrinth") {
                    const raw = await (window.api as any)?.modrinthGetVersions?.(projectId);
                    if (cancelled) return;
                    if (Array.isArray(raw)) {
                        setVersions(raw.map(normalizeModrinthVersion));
                    } else {
                        setVersions([]);
                    }
                } else {
                    const raw = await (window.api as any)?.curseforgeGetFiles?.(projectId, instanceMcVersion);
                    if (cancelled) return;
                    const list = raw?.data || raw || [];
                    if (Array.isArray(list)) {
                        setVersions(list.map(normalizeCurseforgeFile));
                    } else {
                        setVersions([]);
                    }
                }
            } catch (err: any) {
                if (!cancelled) setError(err?.message || String(err));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [projectId, source, instanceMcVersion]);

    const loader = instanceLoader?.toLowerCase();
    const needsLoaderCheck = contentType === "mod" && loader && loader !== "vanilla";

    const isCompatible = (v: VersionEntry): boolean => {
        const gvOk = !instanceMcVersion || v.gameVersions.includes(instanceMcVersion);
        const loaderOk = !needsLoaderCheck || v.loaders.length === 0 || v.loaders.includes(loader!);
        return gvOk && loaderOk;
    };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return versions.filter((v) => {
            if (!showIncompatible && !isCompatible(v)) return false;
            if (!q) return true;
            return (
                v.versionNumber.toLowerCase().includes(q) ||
                v.gameVersions.some((gv) => gv.toLowerCase().includes(q))
            );
        });
    }, [versions, search, showIncompatible, instanceMcVersion, loader]);

    const latestCompatibleId = useMemo(() => {
        return versions.find((version) => isCompatible(version))?.id || null;
    }, [versions, instanceMcVersion, loader]);

    const handleConfirm = () => {
        const target = filtered.find((v) => v.id === selectedId);
        if (!target) return;
        playClick();
        onSwitch(target);
    };

    return (
        <Portal>
            <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
                onClick={onClose}
            >
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-3xl max-h-[85vh] rounded-2xl flex flex-col overflow-hidden animate-fade-in"
                    style={{ backgroundColor: colors.surface, border: `1px solid ${colors.outline}30` }}
                >
                    <div
                        className="flex items-center gap-4 px-6 py-4"
                        style={{ borderBottom: `1px solid ${colors.outline}20`, backgroundColor: colors.surfaceContainer }}
                    >
                        <div
                            className="w-12 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
                            style={{ backgroundColor: colors.surfaceContainerHighest }}
                        >
                            {iconUrl ? (
                                <img src={iconUrl} alt={title} className="w-full h-full object-cover" />
                            ) : (
                                <Icons.Box className="w-6 h-6" style={{ color: colors.onSurfaceVariant }} />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs uppercase tracking-wider opacity-60" style={{ color: colors.onSurfaceVariant }}>
                                {t("switch_version_title" as any) || "Switch version"}
                            </div>
                            <h2 className="text-lg font-bold truncate" style={{ color: colors.onSurface }}>
                                {title}
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/10"
                            style={{ color: colors.onSurface }}
                            title={t("cancel" as any) || "Close"}
                        >
                            <Icons.Close className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex items-center gap-2 px-6 py-3" style={{ borderBottom: `1px solid ${colors.outline}15` }}>
                        <div
                            className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1 min-w-0"
                            style={{ backgroundColor: colors.surfaceContainer }}
                        >
                            <i className="fa-solid fa-search text-sm shrink-0" style={{ color: colors.onSurfaceVariant }} />
                            <input
                                type="text"
                                placeholder={t("search_version_placeholder" as any) || "Search version or MC version"}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="bg-transparent outline-none text-sm w-full"
                                style={{ color: colors.onSurface }}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => { playClick(); setShowIncompatible((v) => !v); }}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:bg-white/5"
                            style={{
                                backgroundColor: showIncompatible ? colors.secondary : colors.surfaceContainer,
                                color: showIncompatible ? "#1a1a1a" : colors.onSurface,
                                border: `1px solid ${colors.outline}30`,
                            }}
                            title={t("show_incompatible_hint" as any) || "Toggle incompatible versions"}
                        >
                            <i className={`fa-solid ${showIncompatible ? "fa-eye" : "fa-eye-slash"}`} />
                            <span className="hidden sm:inline">
                                {t("show_incompatible" as any) || "Incompatible"}
                            </span>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-3 py-3" style={{ backgroundColor: colors.surface }}>
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: colors.onSurfaceVariant }}>
                                <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                <p className="text-sm">{t("loading") || "Loading..."}</p>
                            </div>
                        ) : error ? (
                            <div className="text-center py-12 text-sm" style={{ color: "#ef4444" }}>
                                {error}
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="text-center py-12 text-sm" style={{ color: colors.onSurfaceVariant }}>
                                {t("no_versions_found" as any) || "No matching versions"}
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {filtered.map((v) => {
                                    const isCurrent = Boolean(
                                        (currentVersionId && v.id === currentVersionId) ||
                                        (currentVersion && v.versionNumber.trim() === currentVersion.trim()),
                                    );
                                    const isLatest = latestCompatibleId === v.id;
                                    const compatible = isCompatible(v);
                                    const isSelected = selectedId === v.id;
                                    return (
                                        <button
                                            type="button"
                                            key={v.id}
                                            onClick={() => {
                                                if (isCurrent) return;
                                                playClick();
                                                setSelectedId(v.id);
                                            }}
                                            disabled={isCurrent}
                                            className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-70"
                                            style={{
                                                backgroundColor: isSelected ? `${colors.secondary}20` : "transparent",
                                                border: `1px solid ${
                                                    isSelected
                                                        ? colors.secondary
                                                        : isCurrent
                                                          ? colors.outline + "50"
                                                          : "transparent"
                                                }`,
                                                opacity: !compatible && !isSelected ? 0.55 : 1,
                                            }}
                                        >
                                            <div
                                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                                style={{ backgroundColor: TYPE_COLOR[v.versionType] }}
                                                title={v.versionType}
                                            />

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-sm truncate" style={{ color: colors.onSurface }}>
                                                        {v.versionNumber}
                                                    </span>
                                                    {isCurrent && (
                                                        <span
                                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                                            style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                                        >
                                                            {t("current_version_badge" as any) || "CURRENT"}
                                                        </span>
                                                    )}
                                                    {isLatest && (
                                                        <span
                                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                                            style={{ backgroundColor: "#22c55e20", color: "#16a34a" }}
                                                        >
                                                            {t("latest_version_badge" as any) || "LATEST"}
                                                        </span>
                                                    )}
                                                    {!compatible && (
                                                        <span
                                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                                            style={{ backgroundColor: "#ef444420", color: "#ef4444" }}
                                                        >
                                                            {t("incompatible_badge" as any) || "INCOMPATIBLE"}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs opacity-70 mt-0.5" style={{ color: colors.onSurfaceVariant }}>
                                                    <span className="capitalize">{v.versionType}</span>
                                                    {v.gameVersions.length > 0 && (
                                                        <>
                                                            <span aria-hidden="true">&middot;</span>
                                                            <span className="truncate">
                                                                MC {v.gameVersions.slice(0, 3).join(", ")}
                                                                {v.gameVersions.length > 3 ? "..." : ""}
                                                            </span>
                                                        </>
                                                    )}
                                                    {v.loaders.length > 0 && (
                                                        <>
                                                            <span aria-hidden="true">&middot;</span>
                                                            <span className="truncate capitalize">{v.loaders.join(", ")}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {v.datePublished && (
                                                <span
                                                    className="text-xs whitespace-nowrap hidden md:inline"
                                                    style={{ color: colors.onSurfaceVariant }}
                                                >
                                                    {formatDate(v.datePublished)}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div
                        className="flex items-center justify-between gap-3 px-6 py-4"
                        style={{ borderTop: `1px solid ${colors.outline}20`, backgroundColor: colors.surfaceContainer }}
                    >
                        <div className="flex items-center gap-2 text-xs" style={{ color: "#f59e0b" }}>
                            <i className="fa-solid fa-triangle-exclamation" />
                            <span className="hidden sm:inline">
                                {t("switch_version_warning" as any) ||
                                    "Switching versions may break your instance. Back up first."}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
                                style={{
                                    color: colors.onSurface,
                                    border: `1px solid ${colors.outline}40`,
                                }}
                            >
                                {t("cancel" as any) || "Cancel"}
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirm}
                                disabled={!selectedId || isInstalling}
                                className="px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95"
                                style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                            >
                                {isInstalling ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        {t("installing") || "Installing"}
                                    </>
                                ) : (
                                    <>
                                        <i className="fa-solid fa-right-left" />
                                        {t("switch_to_version" as any) || "Switch"}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Portal>
    );
}
