/**
 * ModItem - Component for displaying a single mod item
 */

import React from "react";
import { Icons } from "../../ui/Icons";
import { playClick } from "../../../lib/sounds";
import { useTranslation } from "../../../hooks/useTranslation";

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
    onToggleSelection
}: LazyModItemProps) {
    const { t } = useTranslation();

    // Safety check for undefined mod (can happen during loading skeleton states if rendered prematurely)
    if (!mod) return null;

    // Use data directly from props - backend now loads all metadata before sending
    const displayName = mod.displayName || mod.name;
    const author = mod.author || "";
    const icon = mod.icon;

    return (
        <div
            className="flex items-center gap-4 p-4 rounded-xl transition-all group"
            style={{
                backgroundColor: isSelected ? colors.secondary + "15" : colors.surfaceContainer,
                opacity: mod.enabled ? 1 : 0.6,
                border: isSelected ? `1px solid ${colors.secondary}50` : "1px solid transparent"
            }}
        >
            {/* Checkbox */}
            <div
                onClick={(e) => {
                    e.stopPropagation();
                    playClick();
                    onToggleSelection?.(mod.filename);
                }}
                className={`w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer border-2 ${isSelected ? "scale-110" : "opacity-40 group-hover:opacity-100"}`}
                style={{
                    backgroundColor: isSelected ? colors.secondary : "transparent",
                    borderColor: isSelected ? colors.secondary : colors.onSurfaceVariant
                }}
            >
                {isSelected && <Icons.Check className="w-3.5 h-3.5" style={{ color: "#1a1a1a" }} />}
            </div>

            {/* Mod icon */}
            {icon ? (
                <img
                    src={icon}
                    alt={displayName}
                    className="w-10 h-10 rounded-lg object-cover"
                />
            ) : (
                <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: colors.surfaceContainerHighest }}
                >
                    <Icons.Box className="w-5 h-5" style={{ color: colors.onSurfaceVariant }} />
                </div>
            )}

            {/* Mod info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="font-medium truncate" style={{ color: colors.onSurface }}>
                        {displayName}
                    </p>
                    {isLocked && (
                        Icons?.Lock && <Icons.Lock className="w-3 h-3" style={{ color: colors.secondary }} />
                    )}
                </div>
                <p className="text-xs truncate" style={{ color: colors.onSurfaceVariant }}>
                    {author ? `${t("by")} ${author} • ` : ""}{formatSize(mod.size)}
                </p>
            </div>

            {/* Lock button */}
            {onToggleLock && (
                <button
                    onClick={() => { playClick(); onToggleLock(mod.filename); }}
                    className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
                    style={{
                        color: isLocked ? colors.secondary : colors.onSurfaceVariant,
                        backgroundColor: isLocked ? colors.secondary + "20" : "transparent"
                    }}
                    title={isLocked ? t("unlock_sync_hint") : t("lock_sync_hint")}
                >
                    {isLocked ? (Icons?.Lock ? <Icons.Lock className="w-5 h-5" /> : "L") : (Icons?.Unlock ? <Icons.Unlock className="w-5 h-5" /> : "U")}
                </button>
            )}

            {/* Toggle switch */}
            <button
                onClick={() => { playClick(); onToggle(mod.filename); }}
                className="relative w-12 h-6 rounded-full transition-colors"
                style={{ backgroundColor: mod.enabled ? colors.secondary : colors.surfaceContainerHighest }}
                title={mod.enabled ? t("disable") : t("enable")}
            >
                <div
                    className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow"
                    style={{ left: mod.enabled ? "calc(100% - 20px)" : "4px" }}
                />
            </button>

            {/* Delete button */}
            <button
                onClick={() => { playClick(); onDelete(mod.filename); }}
                className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/20"
                style={{ color: "#ef4444", opacity: isLocked ? 0.5 : 1, cursor: isLocked ? "not-allowed" : "pointer" }}
                disabled={isLocked}
                title={isLocked ? t("cannot_delete_locked") : t("delete_mod")}
            >
                <Icons.Trash className="w-5 h-5" />
            </button>
        </div>
    );
}
