import React, { useEffect, useState } from "react";
import { Icons } from "../../ui/Icons";
import { playClick } from "../../../lib/sounds";
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

/** Shared column template for the mods table (header row in ModsList + each row). */
export const MOD_ROW_GRID =
    "grid grid-cols-[1.125rem_minmax(0,1fr)_10rem] md:grid-cols-[1.125rem_minmax(0,1.25fr)_minmax(0,1fr)_10rem] items-center gap-x-4";
/** Same as MOD_ROW_GRID but with room for the lock toggle (server-managed instances). */
export const MOD_ROW_GRID_LOCK =
    "grid grid-cols-[1.125rem_minmax(0,1fr)_12.5rem] md:grid-cols-[1.125rem_minmax(0,1.25fr)_minmax(0,1fr)_12.5rem] items-center gap-x-4";

export interface ModInfo {
    filename: string;
    name: string;
    displayName: string;
    author: string;
    description: string;
    icon: string | null;
    enabled: boolean;
    size: number;
    modifiedAt: string;
    version?: string;
    modrinthProjectId?: string;
    curseforgeProjectId?: string;
    installedVersionId?: string;
}

export interface LazyModItemProps {
    mod: ModInfo;
    instanceId: string;
    colors: any;
    formatSize: (bytes: number) => string;
    onToggle: (filename: string) => void;
    onDelete: (filename: string) => void;
    isLocked?: boolean;
    onToggleLock?: (filename: string) => void;
    isServerManaged?: boolean;
    index?: number;
    isSelected?: boolean;
    onToggleSelection?: (filename: string) => void;
    onOpenProjectDetail?: (mod: ModInfo) => void;
    onUpdate?: (mod: ModInfo) => void;
    isUpdating?: boolean;
    onSwitchVersion?: (mod: ModInfo) => void;
    instanceMcVersion?: string;
    instanceLoader?: string;
}

export function LazyModItem({
    mod,
    instanceId,
    colors,
    formatSize,
    onToggle,
    onDelete,
    isLocked,
    onToggleLock,
    isServerManaged,
    index = 0,
    isSelected = false,
    onToggleSelection,
    onOpenProjectDetail,
    onUpdate,
    isUpdating = false,
    onSwitchVersion,
    instanceMcVersion,
    instanceLoader,
}: LazyModItemProps) {
    const { t } = useTranslation();
    
    const [hasUpdate, setHasUpdate] = useState<boolean | null>(null);

    useEffect(() => {
        if (!mod) return;
        let cancelled = false;
        const currentVersion = (mod.version || "").trim();
        const installedVersionId = (mod.installedVersionId || "").trim();
        if (!currentVersion && !installedVersionId) {
            setHasUpdate(null);
            return;
        }

        const projectId = mod.modrinthProjectId || mod.curseforgeProjectId;
        if (!projectId) {
            setHasUpdate(null);
            return;
        }
        setHasUpdate(null);

        const loader = instanceLoader?.toLowerCase();
        const needsLoaderCheck = loader && loader !== "vanilla";

        const run = async () => {
            try {
                let olderThanLatest = false;
                if (mod.modrinthProjectId) {
                    const versions = await (window.api as any)?.modrinthGetVersions?.(mod.modrinthProjectId);
                    if (Array.isArray(versions)) {
                        const compatibleVersions = versions.filter((v: any) => {
                            const gvOk = !instanceMcVersion || (v.game_versions || []).includes(instanceMcVersion);
                            const loaderOk =
                                !needsLoaderCheck ||
                                (v.loaders || [])
                                    .map((l: string) => l.toLowerCase())
                                    .includes(loader!);
                            return gvOk && loaderOk;
                        });
                        olderThanLatest = isInstalledOlderThanLatest(
                            compatibleVersions,
                            currentVersion,
                            installedVersionId,
                        );
                    }
                } else if (mod.curseforgeProjectId) {
                    const files = await (window.api as any)?.curseforgeGetFiles?.(
                        mod.curseforgeProjectId,
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
    }, [mod?.filename, mod?.version, mod?.installedVersionId, mod?.modrinthProjectId, mod?.curseforgeProjectId, instanceMcVersion, instanceLoader]);

    
    if (!mod) return null;

    
    const displayName = mod.displayName || mod.name;
    const author = mod.author || "";
    const icon = mod.icon;
    const canOpenProject = Boolean(onOpenProjectDetail);

    const handleOpenProject = () => {
        if (!onOpenProjectDetail) return;
        playClick();
        onOpenProjectDetail(mod);
    };

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
            className={`${onToggleLock ? MOD_ROW_GRID_LOCK : MOD_ROW_GRID} min-h-18 px-3 py-2.5 rounded-xl transition-colors group bg-(--row-bg) hover:bg-(--row-hover) ${canOpenProject ? "cursor-pointer" : ""}`}
            style={{
                "--row-bg": isSelected ? colors.secondary + "1f" : "transparent",
                "--row-hover": isSelected ? colors.secondary + "29" : colors.surfaceContainer,
                "--btn-fg": colors.onSurfaceVariant,
                "--btn-hover-fg": colors.onSurface,
                "--btn-hover-bg": colors.surfaceContainerHighest,
            } as React.CSSProperties}
        >
            <div
                onClick={(e) => {
                    e.stopPropagation();
                    playClick();
                    onToggleSelection?.(mod.filename);
                }}
                className={`w-4.5 h-4.5 rounded-md flex items-center justify-center transition-all cursor-pointer border-[1.5px] ${isSelected ? "" : "opacity-50 group-hover:opacity-100"}`}
                style={{
                    backgroundColor: isSelected ? colors.secondary : "transparent",
                    borderColor: isSelected ? colors.secondary : colors.onSurfaceVariant
                }}
            >
                {isSelected && <Icons.Check className="w-3.5 h-3.5" style={{ color: "#111" }} />}
            </div>

            <div className={`flex items-center gap-3 min-w-0 transition-opacity ${mod.enabled ? "" : "opacity-60"}`}>
                {icon ? (
                    <img
                        src={icon}
                        alt={displayName}
                        className="w-12 h-12 rounded-xl object-contain shrink-0"
                    />
                ) : (
                    <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: colors.surfaceContainerHighest }}
                    >
                        <Icons.Box className="w-5 h-5" style={{ color: colors.onSurfaceVariant }} />
                    </div>
                )}

                <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <p className="font-semibold text-base leading-tight truncate" style={{ color: colors.onSurface }}>
                            {displayName}
                        </p>
                        {isLocked && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-semibold shrink-0" style={{ backgroundColor: `${colors.secondary}20`, color: colors.secondary }}>
                                {Icons?.Lock && <Icons.Lock className="w-3 h-3" />}
                                {t('locked_badge' as any) || 'LOCKED'}
                            </div>
                        )}
                    </div>
                    <p className="text-sm truncate mt-0.5" style={{ color: colors.onSurfaceVariant }}>
                        {author ? `by ${author}` : formatSize(mod.size)}
                    </p>
                </div>
            </div>

            <div className={`min-w-0 hidden md:block transition-opacity ${mod.enabled ? "" : "opacity-60"}`}>
                <p className="text-sm font-medium truncate" style={{ color: colors.onSurface }}>
                    {mod.version ? `v${mod.version}` : "—"}
                </p>
                <p className="text-sm truncate mt-0.5" style={{ color: colors.onSurfaceVariant }}>
                    {mod.filename}
                </p>
            </div>

            <div className="flex items-center justify-end gap-1 shrink-0">

                <button
                    onClick={(e) => { e.stopPropagation(); playClick(); onToggle(mod.filename); }}
                    className="relative w-10 h-6 mr-1.5 rounded-full transition-colors shrink-0"
                    style={{ backgroundColor: mod.enabled ? colors.secondary : colors.surfaceContainerHighest }}
                    title={mod.enabled ? t("disable") : t("enable")}
                >
                    <div
                        className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm"
                        style={{ left: mod.enabled ? "calc(100% - 20px)" : "4px" }}
                    />
                </button>

                {/* Update OR Switch version (mutually exclusive based on hasUpdate).
                    While hasUpdate is being computed (only when a project ID exists), render
                    an invisible placeholder so the row doesn't flash Switch→Update. */}
                {(() => {
                    const hasProjectRef = Boolean(mod.modrinthProjectId || mod.curseforgeProjectId);
                    const stillChecking =
                        hasProjectRef &&
                        hasUpdate === null &&
                        Boolean((mod.version || "").trim() || (mod.installedVersionId || "").trim());
                    if (stillChecking) {
                        return <div className="w-8 h-8 shrink-0" aria-hidden="true" />;
                    }
                    if (onUpdate && hasUpdate === true) {
                        const handleUpdateClick = (e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            playClick();
                            if (onSwitchVersion) {
                                onSwitchVersion(mod);
                                return;
                            }
                            onUpdate(mod);
                        };
                        return (
                            <button
                                onClick={handleUpdateClick}
                                disabled={isUpdating && !onSwitchVersion}
                                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-green-500/15 shrink-0 disabled:opacity-50"
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
                                onClick={(e) => { e.stopPropagation(); playClick(); onSwitchVersion(mod); }}
                                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 text-(--btn-fg) hover:text-(--btn-hover-fg) hover:bg-(--btn-hover-bg)"
                                title={t('switch_version_title' as any) || 'Switch version'}
                                type="button"
                            >
                                <i className="fa-solid fa-right-left text-sm"></i>
                            </button>
                        );
                    }
                    return null;
                })()}

                <button
                    onClick={(e) => { e.stopPropagation(); playClick(); onDelete(mod.filename); }}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 text-(--btn-fg) ${isLocked ? "" : "hover:text-red-500 hover:bg-red-500/10"}`}
                    style={{ opacity: isLocked ? 0.5 : 1, cursor: isLocked ? "not-allowed" : "pointer" }}
                    disabled={isLocked}
                    title={isLocked ? t("cannot_delete_locked") : t("delete_mod")}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>

                <button onClick={(e) => e.stopPropagation()} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 text-(--btn-fg) hover:text-(--btn-hover-fg) hover:bg-(--btn-hover-bg)">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path>
                    </svg>
                </button>

                {onToggleLock && (
                    <button
                        onClick={(e) => { e.stopPropagation(); playClick(); onToggleLock(mod.filename); }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 hover:brightness-110"
                        style={{
                            color: isLocked ? colors.secondary : colors.onSurfaceVariant,
                            backgroundColor: isLocked ? colors.secondary + "20" : "transparent"
                        }}
                        title={isLocked ? t("unlock_sync_hint") : t("lock_sync_hint")}
                    >
                        {isLocked ? (Icons?.Lock ? <Icons.Lock className="w-4 h-4" /> : "L") : (Icons?.Unlock ? <Icons.Unlock className="w-4 h-4" /> : "U")}
                    </button>
                )}
            </div>
        </div>
    );
}
