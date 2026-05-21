import React from "react";
import { playClick } from "../../lib/sounds";
import { cn } from "../../lib/utils";
import { Icons } from "../ui/Icons";

export interface Instance {
    id: string;
    name: string;
    description: string | null;
    iconUrl: string | null;
    bannerUrl: string | null;
    minecraftVersion: string | null;
    loaderType: string | null;
    status: string;
    memberType?: string;
    isOwned?: boolean;
    storagePath?: string;
}

interface ServerItemProps {
    instance: Instance;
    index: number;
    isSelected: boolean;
    isInstalled: boolean;
    isPlaying: boolean;
    isLaunching: boolean;
    isMember: boolean;
    showPublic: boolean;
    colors: any;
    getWithTimestamp: (url: string | null | undefined) => string;
    onSelect: (instance: Instance) => void;
    /** Open the full detail view for this instance */
    onViewDetail?: (instance: Instance) => void;
    onPlay: (e: React.MouseEvent, instance: any) => void;
    onStop: (e: React.MouseEvent, instanceId: string) => void;
    onJoin: (instance: Instance) => void;
    onInstall: (e: React.MouseEvent, instance: any) => void;
    onLeave: (e: React.MouseEvent, instance: any) => void;
    t: (key: any) => string;
}

export function ServerItem({
    instance,
    index,
    isSelected: _isSelected,
    isInstalled,
    isPlaying,
    isLaunching,
    isMember,
    showPublic,
    colors,
    getWithTimestamp,
    onSelect: _onSelect,
    onViewDetail,
    onPlay,
    onStop,
    onJoin,
    onInstall,
    onLeave,
    t,
}: ServerItemProps) {
    const isActive = isPlaying || isLaunching;
    const isOnline = instance.status === "active";
    const iconUrl = instance.iconUrl ? getWithTimestamp(instance.iconUrl) : null;

    return (
        <div
            className="animate-card-appear"
            style={{ animationDelay: `${Math.min(index * 20, 120)}ms` }}
        >
            <div
                onClick={() => { playClick(); onViewDetail?.(instance); }}
                className={cn(
                    "flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-200",
                    onViewDetail ? "cursor-pointer hover:brightness-105" : ""
                )}
                style={{
                    backgroundColor: "transparent",
                    border: "none",
                }}
            >
                {/* ── Icon ─────────────────────────────────────────────── */}
                <div
                    className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border"
                    style={{ borderColor: `${colors.outline}20` }}
                >
                    {iconUrl ? (
                        <img
                            src={iconUrl}
                            alt={instance.name}
                            className={cn(
                                "w-full h-full object-cover",
                                (!isInstalled && isMember && !showPublic) && "grayscale opacity-60"
                            )}
                            loading="lazy"
                        />
                    ) : (
                        <div
                            className="w-full h-full flex items-center justify-center text-2xl font-black"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}
                        >
                            {instance.name[0]?.toUpperCase()}
                        </div>
                    )}
                </div>

                {/* ── Info ─────────────────────────────────────────────── */}
                <div className="flex-1 min-w-0">
                    {/* Name row */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3
                            className="font-bold text-base truncate"
                            style={{ color: colors.onSurface }}
                        >
                            {instance.name}
                        </h3>
                        {instance.isOwned && (
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold border bg-amber-500/10 text-amber-500 border-amber-500/25">
                                {t('owner_badge')}
                            </span>
                        )}
                        {showPublic && !instance.isOwned && (
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold border bg-blue-500/10 text-blue-400 border-blue-500/25">
                                {t('public_badge')}
                            </span>
                        )}
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <p
                            className="text-sm truncate"
                            style={{ color: colors.onSurfaceVariant, opacity: 0.7 }}
                        >
                            {instance.description || `Minecraft ${instance.minecraftVersion || ""}`}
                        </p>
                    </div>
                </div>

                {/* ── Right: Chips + Status + Actions ──────────────────── */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Loader chip */}
                    {instance.loaderType && (
                        <span
                            className="hidden md:inline-flex text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg border"
                            style={{
                                backgroundColor: colors.surfaceContainerHighest,
                                color: colors.onSurfaceVariant,
                                borderColor: `${colors.outline}25`,
                            }}
                        >
                            {instance.loaderType}
                        </span>
                    )}

                    {/* Version chip */}
                    {instance.minecraftVersion && (
                        <span
                            className="hidden md:inline-flex text-[10px] font-medium px-2 py-1 rounded-lg border"
                            style={{
                                backgroundColor: colors.surfaceContainerHighest,
                                color: colors.onSurfaceVariant,
                                borderColor: `${colors.outline}25`,
                                opacity: 0.75,
                            }}
                        >
                            {instance.minecraftVersion}
                        </span>
                    )}

                    {/* Status pill */}
                    <span
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border uppercase tracking-wide",
                            isOnline
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : "bg-red-500/10 border-red-500/20 text-red-400"
                        )}
                    >
                        <span
                            className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                isOnline ? "bg-emerald-400 animate-pulse" : "bg-red-400"
                            )}
                        />
                        {isOnline ? "Online" : "Offline"}
                    </span>

                    {/* Action Buttons */}
                    {!isMember ? (
                        /* JOIN */
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); playClick(); onJoin(instance); }}
                            className="h-10 px-4 rounded-xl flex items-center gap-2 transition-all active:scale-95 hover:brightness-110 font-bold text-sm"
                            style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                        >
                            <Icons.UserPlus className="w-4 h-4" />
                            <span className="hidden sm:inline">{t('join')}</span>
                        </button>
                    ) : isInstalled ? (
                        <>
                            {/* PLAY / LAUNCHING / STOP */}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playClick();
                                    isActive ? onStop(e, instance.id) : onPlay(e, instance);
                                }}
                                className="h-10 px-4 rounded-xl flex items-center gap-2 transition-all active:scale-95 hover:brightness-110 font-bold text-sm"
                                style={{
                                    backgroundColor: isActive ? "#ef4444" : colors.secondary,
                                    color: isActive ? "#fff" : "#1a1a1a",
                                }}
                            >
                                {isLaunching ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                                        <span className="hidden sm:inline">{t('launching') || "…"}</span>
                                    </>
                                ) : isPlaying ? (
                                    <>
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M6 6h12v12H6z" />
                                        </svg>
                                        <span className="hidden sm:inline">{t('stop')}</span>
                                    </>
                                ) : (
                                    <>
                                        <Icons.Play className="w-4 h-4 fill-current" />
                                        <span className="hidden sm:inline">{t('play')}</span>
                                    </>
                                )}
                            </button>
                            {/* LEAVE */}
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); playClick(); onLeave(e, instance); }}
                                className="h-10 w-10 rounded-xl flex items-center justify-center transition-all active:scale-95 hover:brightness-110"
                                style={{
                                    backgroundColor: `${colors.error || "#ef4444"}18`,
                                    color: colors.error || "#ef4444",
                                    border: `1px solid ${colors.error || "#ef4444"}25`,
                                }}
                                title={t('leave_server') || "Leave Server"}
                            >
                                <Icons.Logout className="w-4 h-4" />
                            </button>
                        </>
                    ) : (
                        /* INSTALL + LEAVE */
                        <>
                            <button
                                type="button"
                                className="h-10 px-4 rounded-xl flex items-center gap-2 transition-all active:scale-95 hover:brightness-110 font-bold text-sm"
                                style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                onClick={(e) => { e.stopPropagation(); playClick(); onInstall(e, instance); }}
                            >
                                <Icons.Download className="w-4 h-4" />
                                <span className="hidden sm:inline">{t('install')}</span>
                            </button>
                            {/* LEAVE */}
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); playClick(); onLeave(e, instance); }}
                                className="h-10 w-10 rounded-xl flex items-center justify-center transition-all active:scale-95 hover:brightness-110"
                                style={{
                                    backgroundColor: `${colors.error || "#ef4444"}18`,
                                    color: colors.error || "#ef4444",
                                    border: `1px solid ${colors.error || "#ef4444"}25`,
                                }}
                                title={t('leave_server') || "Leave Server"}
                            >
                                <Icons.Logout className="w-4 h-4" />
                            </button>
                        </>
                    )}

                </div>
            </div>
        </div>
    );
}

export default ServerItem;
