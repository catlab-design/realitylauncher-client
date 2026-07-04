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
    isPublic?: boolean;
    serverIps?: string[];
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
    onViewDetail?: (instance: Instance) => void;
    onPlay: (e: React.MouseEvent, instance: any) => void;
    onStop: (e: React.MouseEvent, instance: any) => void;
    onJoin: (instance: Instance) => void;
    onInstall: (e: React.MouseEvent, instance: any) => void;
    onLeave: (e: React.MouseEvent, instance: any) => void;
    t: (key: any) => string;
    viewMode?: "tiles" | "table" | "list";
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
    viewMode = "list",
}: ServerItemProps) {
    const isActive = isPlaying || isLaunching;
    const isOnline = instance.status === "active";
    const iconUrl = instance.iconUrl ? getWithTimestamp(instance.iconUrl) : null;
    const bannerImg = instance.bannerUrl || instance.iconUrl;

    if (viewMode === "tiles") {
        return (
            <div
                className="animate-card-appear"
                style={{ animationDelay: `${Math.min(index * 20, 120)}ms` }}
            >
                <div
                    onClick={() => { playClick(); onViewDetail?.(instance); }}
                    className={cn(
                        "relative overflow-hidden rounded-2xl h-48 flex flex-col justify-between pt-6 px-5 pb-3 transition-all duration-300 hover:shadow-lg cursor-pointer group"
                    )}
                    style={{
                        backgroundColor: colors.surfaceContainer,
                        border: `1.5px solid ${colors.outline}12`,
                    }}
                >
                    {bannerImg ? (
                        <img
                            src={getWithTimestamp(bannerImg)}
                            alt=""
                            className={cn(
                                "absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105",
                                !isInstalled && "grayscale opacity-50"
                            )}
                            loading="lazy"
                        />
                    ) : (
                        <div 
                            className="absolute inset-0 opacity-10"
                            style={{
                                background: `linear-gradient(135deg, ${colors.primary} 0%, transparent 100%)`
                            }}
                        />
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent z-0" />


                    {iconUrl ? (
                        <img
                            src={iconUrl}
                            alt=""
                            className={cn(
                                "absolute top-4 left-4 z-20 w-12 h-12 rounded-xl object-contain shrink-0",
                                !isInstalled && "grayscale opacity-60"
                            )}
                            loading="lazy"
                        />
                    ) : (
                        <div
                            className="absolute top-4 left-4 z-20 w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black shrink-0"
                            style={{ backgroundColor: "rgba(255, 255, 255, 0.15)", color: "#fff" }}
                        >
                            {instance.name[0]?.toUpperCase()}
                        </div>
                    )}

                    {instance.serverIps && instance.serverIps.length > 0 && (
                        <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/40 border border-white/10 text-white/90 font-mono text-[11px] sm:text-xs">
                            <Icons.Dns className="w-3.5 h-3.5 text-white/60 shrink-0" />
                            <span>{instance.serverIps[0]}</span>
                        </div>
                    )}

                    <div className="absolute bottom-4 left-5 z-10 pr-36 max-w-[65%] flex flex-col min-w-0">
                        <h3 className="font-black text-lg md:text-xl text-white truncate leading-tight drop-shadow-md">
                            {instance.name}
                        </h3>
                        <p className="text-white/60 text-xs md:text-sm truncate drop-shadow-sm mt-1 font-semibold line-clamp-1">
                            {instance.description || [instance.minecraftVersion, instance.loaderType].filter(Boolean).join(" • ")}
                        </p>
                    </div>

                    <div className="absolute bottom-0 right-0 z-10 flex items-center" onClick={(e) => e.stopPropagation()}>
                        {!isMember ? (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); playClick(); onJoin(instance); }}
                                className="h-12 px-6 rounded-tl-2xl rounded-br-2xl flex items-center gap-1.5 transition-all active:scale-95 hover:brightness-110 font-extrabold text-sm shadow-md"
                                style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                            >
                                <Icons.UserPlus className="w-5 h-5" />
                                <span>{t('join')}</span>
                            </button>
                        ) : isInstalled ? (
                            <>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        playClick();
                                        isActive ? onStop(e, instance) : onPlay(e, instance);
                                    }}
                                    className="h-12 px-6 rounded-tl-2xl flex items-center gap-1.5 transition-all active:scale-95 hover:brightness-110 font-extrabold text-sm shadow-md"
                                    style={{
                                        backgroundColor: isActive ? "#ef4444" : colors.secondary,
                                        color: isActive ? "#fff" : "#1a1a1a",
                                    }}
                                >
                                    {isLaunching ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                                            <span>{t('launching') || "…"}</span>
                                        </>
                                    ) : isPlaying ? (
                                        <>
                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M6 6h12v12H6z" />
                                            </svg>
                                            <span>{t('stop')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Icons.Play className="w-5 h-5 fill-current" />
                                            <span>{t('play')}</span>
                                        </>
                                    )}
                                </button>
                                <div className="w-[1px] h-12 bg-black/20 z-20 self-stretch" />
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); playClick(); onLeave(e, instance); }}
                                    className="h-12 w-12 rounded-br-2xl flex items-center justify-center transition-all active:scale-95 hover:brightness-110 shadow-md"
                                    style={{
                                        backgroundColor: colors.error || "#ef4444",
                                        color: "#ffffff",
                                    }}
                                    title={t('leave_server') || "Leave Server"}
                                >
                                    <Icons.Logout className="w-5 h-5" />
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="h-12 px-6 rounded-tl-2xl flex items-center gap-1.5 transition-all active:scale-95 hover:brightness-110 font-extrabold text-sm shadow-md"
                                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                    onClick={(e) => { e.stopPropagation(); playClick(); onInstall(e, instance); }}
                                >
                                    <Icons.Download className="w-5 h-5" />
                                    <span>{t('install')}</span>
                                </button>
                                <div className="w-[1px] h-12 bg-black/20 z-20 self-stretch" />
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); playClick(); onLeave(e, instance); }}
                                    className="h-12 w-12 rounded-br-2xl flex items-center justify-center transition-all active:scale-95 hover:brightness-110 shadow-md"
                                    style={{
                                        backgroundColor: colors.error || "#ef4444",
                                        color: "#ffffff",
                                    }}
                                    title={t('leave_server') || "Leave Server"}
                                >
                                    <Icons.Logout className="w-5 h-5" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (viewMode === "table") {
        return (
            <div
                className="animate-card-appear"
                style={{ animationDelay: `${Math.min(index * 20, 120)}ms` }}
            >
                <div
                    onClick={() => { playClick(); onViewDetail?.(instance); }}
                    className={cn(
                        "flex items-center justify-between px-6 h-24 rounded-2xl transition-all duration-300 hover:shadow-md cursor-pointer group"
                    )}
                    style={{
                        backgroundColor: colors.surfaceContainer,
                        border: `1.5px solid ${colors.outline}12`,
                    }}
                >
                    <div className="w-2/5 flex items-center gap-4 min-w-0">
                        {iconUrl ? (
                            <img
                                src={iconUrl}
                                alt=""
                                className={cn(
                                    "w-16 h-16 rounded-xl object-contain shrink-0",
                                    !isInstalled && "grayscale opacity-60"
                                )}
                                loading="lazy"
                            />
                        ) : (
                            <div
                                className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-black shrink-0"
                                style={{ backgroundColor: "rgba(255, 255, 255, 0.15)", color: "#fff" }}
                            >
                                {instance.name[0]?.toUpperCase()}
                            </div>
                        )}
                        <div className="flex flex-col min-w-0">
                            <span 
                                className="font-black text-lg md:text-xl truncate leading-tight"
                                style={{ color: colors.onSurface }}
                            >
                                {instance.name}
                            </span>
                            <div className="flex gap-1.5 mt-1.5">
                                {(showPublic || !!instance.isPublic) && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/25">
                                        PUB
                                    </span>
                                )}
                                {instance.isOwned ? (
                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/25">
                                        OWN
                                    </span>
                                ) : isMember ? (
                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                                        MEM
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div 
                        className="w-1/5 text-base font-bold truncate pr-2"
                        style={{ color: colors.onSurface, opacity: 0.7 }}
                    >
                        {instance.minecraftVersion || "-"}
                        {instance.loaderType && (
                            <span 
                                className="text-xs ml-1.5 uppercase"
                                style={{ color: colors.onSurface, opacity: 0.4 }}
                            >
                                ({instance.loaderType})
                            </span>
                        )}
                    </div>

                    <div 
                        className="w-1/5 text-base font-mono truncate pr-2"
                        style={{ color: colors.onSurface, opacity: 0.5 }}
                    >
                        {instance.serverIps && instance.serverIps.length > 0 ? (
                            instance.serverIps[0]
                        ) : (
                            <span style={{ opacity: 0.4 }}>-</span>
                        )}
                    </div>

                    <div className="w-1/5 flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {!isMember ? (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); playClick(); onJoin(instance); }}
                                className="h-11 px-5 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 hover:brightness-110 font-extrabold text-sm shadow-sm"
                                style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                            >
                                <Icons.UserPlus className="w-5 h-5" />
                                <span>{t('join')}</span>
                            </button>
                        ) : isInstalled ? (
                            <>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        playClick();
                                        isActive ? onStop(e, instance) : onPlay(e, instance);
                                    }}
                                    className="h-11 px-5 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 hover:brightness-110 font-extrabold text-sm shadow-sm"
                                    style={{
                                        backgroundColor: isActive ? "#ef4444" : colors.secondary,
                                        color: isActive ? "#fff" : "#1a1a1a",
                                    }}
                                >
                                    {isLaunching ? (
                                        <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                                    ) : isPlaying ? (
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M6 6h12v12H6z" />
                                        </svg>
                                    ) : (
                                        <Icons.Play className="w-5 h-5 fill-current" />
                                    )}
                                    <span>{isActive ? (isLaunching ? t('launching') : t('stop')) : t('play')}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); playClick(); onLeave(e, instance); }}
                                    className="h-11 w-11 rounded-xl flex items-center justify-center transition-all active:scale-95 hover:brightness-110 shadow-sm"
                                    style={{
                                        backgroundColor: colors.error || "#ef4444",
                                        color: "#ffffff",
                                    }}
                                    title={t('leave_server') || "Leave Server"}
                                >
                                    <Icons.Logout className="w-5 h-5" />
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="h-11 px-5 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 hover:brightness-110 font-extrabold text-sm shadow-sm"
                                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                    onClick={(e) => { e.stopPropagation(); playClick(); onInstall(e, instance); }}
                                >
                                    <Icons.Download className="w-5 h-5" />
                                    <span>{t('install')}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); playClick(); onLeave(e, instance); }}
                                    className="h-11 w-11 rounded-xl flex items-center justify-center transition-all active:scale-95 hover:brightness-110 shadow-sm"
                                    style={{
                                        backgroundColor: colors.error || "#ef4444",
                                        color: "#ffffff",
                                    }}
                                    title={t('leave_server') || "Leave Server"}
                                >
                                    <Icons.Logout className="w-5 h-5" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="animate-card-appear"
            style={{ animationDelay: `${Math.min(index * 20, 120)}ms` }}
        >
            <div
                onClick={() => { playClick(); onViewDetail?.(instance); }}
                className={cn(
                    "relative overflow-hidden rounded-2xl h-56 flex items-center justify-between px-6 transition-all duration-300 hover:shadow-lg cursor-pointer group"
                )}
                style={{
                    backgroundColor: colors.surfaceContainer,
                    border: `1.5px solid ${colors.outline}12`,
                }}
            >
                <div className="absolute top-4 left-4 z-20 flex flex-row gap-2">
                    {(showPublic || !!instance.isPublic) && (
                        <span className="text-[10px] sm:text-xs px-3 py-1 font-black uppercase tracking-wider rounded-none bg-blue-500/15 text-blue-300 border border-blue-500/35 backdrop-blur-md shadow-sm">
                            {t('public_badge') || "PUBLIC"}
                        </span>
                    )}
                    {instance.isOwned ? (
                        <span className="text-[10px] sm:text-xs px-3 py-1 font-black uppercase tracking-wider rounded-none bg-amber-500/15 text-amber-300 border border-amber-500/35 backdrop-blur-md shadow-sm">
                            {t('owner_badge') || "OWNER"}
                        </span>
                    ) : isMember ? (
                        <span className="text-[10px] sm:text-xs px-3 py-1 font-black uppercase tracking-wider rounded-none bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 backdrop-blur-md shadow-sm">
                            {t('member_badge') || "MEMBER"}
                        </span>
                    ) : null}
                </div>
                {bannerImg ? (
                    <img
                        src={getWithTimestamp(bannerImg)}
                        alt=""
                        className={cn(
                            "absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105",
                            !isInstalled && "grayscale opacity-50"
                        )}
                        loading="lazy"
                    />
                ) : (
                    <div 
                        className="absolute inset-0 opacity-10"
                        style={{
                            background: `linear-gradient(135deg, ${colors.primary} 0%, transparent 100%)`
                        }}
                    />
                )}

                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent z-0" />

                {instance.serverIps && instance.serverIps.length > 0 && (
                    <div className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-md backdrop-blur-md bg-black/40 border border-white/15">
                        <Icons.Dns className="w-4 h-4 text-white/60 shrink-0" />
                        <span className="text-white/90 text-sm font-mono font-semibold leading-none">
                            {instance.serverIps[0]}
                        </span>
                        {instance.serverIps.length > 1 && (
                            <span className="text-white/50 text-xs font-bold leading-none">
                                +{instance.serverIps.length - 1}
                            </span>
                        )}
                    </div>
                )}

                <div className="absolute bottom-5 left-6 z-10 max-w-[240px] sm:max-w-md md:max-w-lg lg:max-w-xl flex items-center gap-4">
                    {iconUrl ? (
                        <img
                            src={iconUrl}
                            alt=""
                            className={cn(
                                "w-16 h-16 rounded-xl object-contain shrink-0",
                                !isInstalled && "grayscale opacity-60"
                            )}
                            loading="lazy"
                        />
                    ) : (
                        <div
                            className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-black shrink-0"
                            style={{ backgroundColor: "rgba(255, 255, 255, 0.15)", color: "#fff" }}
                        >
                            {instance.name[0]?.toUpperCase()}
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-black text-xl md:text-2xl text-white drop-shadow-md leading-tight">
                                {instance.name}
                            </h3>
                        </div>
                        {instance.description ? (
                            <p className="text-white/80 text-xs md:text-sm font-semibold line-clamp-2 leading-relaxed drop-shadow-sm">
                                {instance.description}
                            </p>
                        ) : (
                            (instance.minecraftVersion || instance.loaderType) && (
                                <p className="text-white/65 text-xs md:text-sm font-semibold leading-relaxed drop-shadow-sm">
                                    {[instance.minecraftVersion, instance.loaderType].filter(Boolean).join(" • ")}
                                </p>
                            )
                        )}
                    </div>
                </div>

                <div className="absolute bottom-0 right-0 z-10 flex items-center">
                    {!isMember ? (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); playClick(); onJoin(instance); }}
                            className="h-14 px-8 rounded-tl-2xl rounded-br-2xl flex items-center gap-2 transition-all active:scale-95 hover:brightness-110 font-extrabold text-sm shadow-md"
                            style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                        >
                            <Icons.UserPlus className="w-5 h-5" />
                            <span>{t('join')}</span>
                        </button>
                    ) : isInstalled ? (
                        <>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playClick();
                                    isActive ? onStop(e, instance) : onPlay(e, instance);
                                }}
                                className="h-14 px-8 rounded-tl-2xl flex items-center gap-2 transition-all active:scale-95 hover:brightness-110 font-extrabold text-sm shadow-md"
                                style={{
                                    backgroundColor: isActive ? "#ef4444" : colors.secondary,
                                    color: isActive ? "#fff" : "#1a1a1a",
                                }}
                            >
                                {isLaunching ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                                        <span>{t('launching') || "…"}</span>
                                    </>
                                ) : isPlaying ? (
                                    <>
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M6 6h12v12H6z" />
                                        </svg>
                                        <span>{t('stop')}</span>
                                    </>
                                ) : (
                                    <>
                                        <Icons.Play className="w-5 h-5 fill-current" />
                                        <span>{t('play')}</span>
                                    </>
                                )}
                            </button>
                            <div className="w-[1px] h-14 bg-black/20 z-20 self-stretch" />
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); playClick(); onLeave(e, instance); }}
                                className="h-14 w-14 rounded-br-2xl flex items-center justify-center transition-all active:scale-95 hover:brightness-110 shadow-md"
                                style={{
                                    backgroundColor: colors.error || "#ef4444",
                                    color: "#ffffff",
                                }}
                                title={t('leave_server') || "Leave Server"}
                            >
                                <Icons.Logout className="w-5 h-5" />
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="h-14 px-8 rounded-tl-2xl flex items-center gap-2 transition-all active:scale-95 hover:brightness-110 font-extrabold text-sm shadow-md"
                                style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                onClick={(e) => { e.stopPropagation(); playClick(); onInstall(e, instance); }}
                            >
                                <Icons.Download className="w-5 h-5" />
                                <span>{t('install')}</span>
                            </button>
                            <div className="w-[1px] h-14 bg-black/20 z-20 self-stretch" />
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); playClick(); onLeave(e, instance); }}
                                className="h-14 w-14 rounded-br-2xl flex items-center justify-center transition-all active:scale-95 hover:brightness-110 shadow-md"
                                style={{
                                    backgroundColor: colors.error || "#ef4444",
                                    color: "#ffffff",
                                }}
                                title={t('leave_server') || "Leave Server"}
                            >
                                <Icons.Logout className="w-5 h-5" />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ServerItem;
