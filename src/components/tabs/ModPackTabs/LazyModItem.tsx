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
    version?: string;
    modrinthProjectId?: string;
    curseforgeProjectId?: string;
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
    onToggleSelection,

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
            className="flex items-center gap-3 py-2 px-3 rounded-lg transition-all group"
            style={{
                backgroundColor: isSelected ? colors.secondary + "15" : colors.surfaceContainer,
                opacity: mod.enabled ? 1 : 0.6,
                border: isSelected ? `1px solid ${colors.secondary}50` : "1px solid transparent",
                marginBottom: "4px"
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
                    className="w-10 h-10 rounded-lg object-cover shrink-0 bg-white"
                />
            ) : (
                <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: colors.surfaceContainerHighest }}
                >
                    <Icons.Box className="w-5 h-5" style={{ color: colors.onSurfaceVariant }} />
                </div>
            )}

            {/* Mod info (Name & Author) */}
            <div className="w-[30%] min-w-0 pr-4 shrink-0">
                <div className="flex items-center gap-2">
                    <p className="font-bold text-sm truncate" style={{ color: colors.onSurface }}>
                        {displayName}
                    </p>
                    {isLocked && (
                        Icons?.Lock && <Icons.Lock className="w-3 h-3" style={{ color: colors.secondary }} />
                    )}
                </div>
                <p className="text-xs truncate opacity-70 mt-0.5" style={{ color: colors.onSurfaceVariant }}>
                    {author ? `by ${author}` : formatSize(mod.size)}
                </p>
            </div>

            {/* Updated / Filename Column */}
            <div className="flex-1 min-w-0 pr-4 hidden md:block">
                <p className="text-xs font-medium truncate mb-0.5 flex items-center gap-1.5" style={{ color: colors.onSurface }}>
                    {mod.version ? `v${mod.version}` : "Unknown Version"}

                </p>
                <p className="text-xs truncate opacity-60" style={{ color: colors.onSurfaceVariant }}>
                    {mod.filename}
                </p>
            </div>

            {/* Lock button (if applicable) */}
            {onToggleLock && (
                <button
                    onClick={() => { playClick(); onToggleLock(mod.filename); }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10 shrink-0"
                    style={{
                        color: isLocked ? colors.secondary : colors.onSurfaceVariant,
                        backgroundColor: isLocked ? colors.secondary + "20" : "transparent"
                    }}
                    title={isLocked ? t("unlock_sync_hint") : t("lock_sync_hint")}
                >
                    {isLocked ? (Icons?.Lock ? <Icons.Lock className="w-4 h-4" /> : "L") : (Icons?.Unlock ? <Icons.Unlock className="w-4 h-4" /> : "U")}
                </button>
            )}

            {/* Actions (Toggle, Trash, Menu) */}
            <div className="flex items-center gap-2 shrink-0">
                {/* Toggle switch (Modrinth style: Accent when active, dark grey when inactive) */}
                <button
                    onClick={() => { playClick(); onToggle(mod.filename); }}
                    className="relative w-11 h-6 rounded-full transition-colors shrink-0"
                    style={{ backgroundColor: mod.enabled ? colors.secondary : colors.surfaceContainerHighest }}
                    title={mod.enabled ? t("disable") : t("enable")}
                >
                    <div
                        className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm"
                        style={{ left: mod.enabled ? "calc(100% - 20px)" : "4px" }}
                    />
                </button>

                {/* Delete button (Outline trash) */}
                <button
                    onClick={() => { playClick(); onDelete(mod.filename); }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10 shrink-0"
                    style={{ color: colors.onSurfaceVariant, opacity: isLocked ? 0.5 : 1, cursor: isLocked ? "not-allowed" : "pointer" }}
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

                {/* Three Dots Placeholder */}
                <button className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10 shrink-0" style={{ color: colors.onSurfaceVariant }}>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path>
                    </svg>
                </button>
            </div>
        </div>
    );
}
