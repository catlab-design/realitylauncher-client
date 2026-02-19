/**
 * InstanceHeader - Header section for instance detail view
 */

import React from "react";
import { Icons } from "../../ui/Icons";
import type { GameInstance } from "../../../types/launcher";
import { useTranslation } from "../../../hooks/useTranslation";

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

    const getLoaderLabel = (loader: string): string => {
        const labels: Record<string, string> = {
            vanilla: "Vanilla",
            fabric: "Fabric",
            forge: "Forge",
            neoforge: "NeoForge",
            quilt: "Quilt",
        };
        return labels[loader] || loader;
    };

    const formatPlayTime = (minutes: number): string => {
        if (minutes < 60) return `${minutes} ${t("minutes_unit")}`;
        const hours = Math.floor(minutes / 60);
        return `${hours} ${t("hours_unit")}`;
    };

    return (
        <div className="flex items-center gap-4 pb-4 border-b" style={{ borderColor: colors.outline + "30" }}>
            {/* Back button */}
            <button
                onClick={onBack}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-105"
                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
            >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                </svg>
            </button>

            {/* Instance icon */}
            <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl overflow-hidden"
                style={{ backgroundColor: colors.surfaceContainer }}
            >
                {instance.icon?.startsWith("data:") || instance.icon?.startsWith("file://") || instance.icon?.startsWith("http") ? (
                    <img src={instance.icon} alt="icon" className="w-full h-full object-cover" />
                ) : (
                    <Icons.Box className="w-8 h-8" style={{ color: colors.onSurfaceVariant }} />
                )}
            </div>

            {/* Instance info */}
            <div className="flex-1">
                <h2 className="text-xl font-bold" style={{ color: colors.onSurface }}>{instance.name}</h2>
                <div className="flex items-center gap-3 text-sm" style={{ color: colors.onSurfaceVariant }}>
                    <span>{getLoaderLabel(instance.loader)} {instance.minecraftVersion}</span>
                    {instance.totalPlayTime > 0 && (
                        <span>&bull; {formatPlayTime(instance.totalPlayTime)}</span>
                    )}
                </div>
            </div>

            {/* Play/Stop button */}
            <button
                onClick={onPlayStop}
                disabled={launchingId !== null || (isGameRunning && !isThisInstancePlaying)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:scale-105 disabled:opacity-50"
                style={{
                    backgroundColor: isThisInstancePlaying ? "#ef4444" : colors.secondary,
                    color: isThisInstancePlaying ? "#ffffff" : "#1a1a1a"
                }}
            >
                {launchingId === instance.id ? (
                    <>
                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
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

            {/* Settings button */}
            <button
                onClick={onOpenSettings}
                className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:opacity-80"
                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                title={t("settings")}
            >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                </svg>
            </button>

            {/* Open folder button */}
            <button
                onClick={onOpenFolder}
                className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:opacity-80"
                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                title={t("open_folder")}
            >
                <Icons.Folder className="w-5 h-5" />
            </button>
        </div>
    );
}
