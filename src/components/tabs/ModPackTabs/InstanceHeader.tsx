import React from "react";
import { Icons } from "../../ui/Icons";
import type { GameInstance } from "../../../types/launcher";
import { useTranslation } from "../../../hooks/useTranslation";
import { formatPlayTime, getLoaderLabel } from "./helpers";

export interface InstanceHeaderProps {
    colors: any;
    instance: GameInstance;
    launchingId: string | null;
    isGameRunning: boolean;
    isThisInstancePlaying: boolean;
    onBack: () => void;
    onPlayStop: () => void;
    onOpenSettings: () => void;
    onOpenFolder: () => void;
}

export function InstanceHeader({
    colors,
    instance,
    launchingId,
    isGameRunning,
    isThisInstancePlaying,
    onBack,
    onPlayStop,
    onOpenSettings,
    onOpenFolder,
}: InstanceHeaderProps) {
    const { t } = useTranslation();

    return (
        <div
            className="flex flex-wrap items-center gap-x-4 gap-y-3 py-1"
            style={{
                "--ghost-fg": colors.onSurfaceVariant,
                "--ghost-hover-fg": colors.onSurface,
                "--ghost-hover-bg": colors.surfaceContainerHighest,
            } as React.CSSProperties}
        >
            <button
                onClick={onBack}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-colors active:scale-95 shrink-0 text-(--ghost-fg) hover:text-(--ghost-hover-fg) hover:bg-(--ghost-hover-bg)"
                title={t("back")}
            >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                </svg>
            </button>

            <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden shrink-0"
                style={{ backgroundColor: (instance.icon?.startsWith("data:") || instance.icon?.startsWith("file://") || instance.icon?.startsWith("http")) ? 'transparent' : colors.surfaceContainerHighest }}
            >
                {instance.icon?.startsWith("data:") || instance.icon?.startsWith("file://") || instance.icon?.startsWith("http") ? (
                    <img src={instance.icon} alt="icon" className="w-full h-full object-cover" />
                ) : (
                    <Icons.Box className="w-8 h-8" style={{ color: colors.onSurfaceVariant }} />
                )}
            </div>

            <div className="flex-1 min-w-48">
                <h2 className="font-display text-2xl font-bold leading-tight truncate" style={{ color: colors.onSurface }}>{instance.name}</h2>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-sm" style={{ color: colors.onSurfaceVariant }}>
                    <span>{getLoaderLabel(instance.loader)} {instance.minecraftVersion}</span>
                    {instance.totalPlayTime > 0 && (
                        <>
                            <span className="opacity-50">&bull;</span>
                            <span className="flex items-center gap-1.5">
                                <Icons.Clock className="w-3.5 h-3.5 opacity-70" />
                                {formatPlayTime(instance.totalPlayTime, { minutes: t("minutes_unit"), hours: t("hours_unit") })}
                            </span>
                        </>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
                <button
                    onClick={onOpenFolder}
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors active:scale-95 text-(--ghost-fg) hover:text-(--ghost-hover-fg) hover:bg-(--ghost-hover-bg)"
                    title={t("open_folder")}
                >
                    <Icons.Folder className="w-5 h-5" />
                </button>

                <button
                    onClick={onOpenSettings}
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors active:scale-95 text-(--ghost-fg) hover:text-(--ghost-hover-fg) hover:bg-(--ghost-hover-bg)"
                    title={t("settings")}
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                    </svg>
                </button>

                <button
                    onClick={onPlayStop}
                    disabled={launchingId !== null || (isGameRunning && !isThisInstancePlaying)}
                    className="h-11 px-6 ml-1.5 rounded-xl text-[15px] font-semibold flex items-center gap-2 whitespace-nowrap transition-all hover:brightness-105 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                    style={{
                        backgroundColor: isThisInstancePlaying ? "#ef4444" : colors.secondary,
                        color: isThisInstancePlaying ? "#ffffff" : "#111"
                    }}
                >
                    {launchingId === instance.id ? (
                        <>
                            <div className="w-4.5 h-4.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            {t("launching")}
                        </>
                    ) : isThisInstancePlaying ? (
                        <>
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 6h12v12H6z" />
                            </svg>
                            {t("stop")}
                        </>
                    ) : (
                        <>
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            {t("play")}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
