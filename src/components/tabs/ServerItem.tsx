import React, { useState, useEffect } from "react";
import { useTranslation } from "../../hooks/useTranslation";
import { playClick } from "../../lib/sounds";
import { cn } from "../../lib/utils";
import { Icons } from "../ui/Icons";
import type { Server } from "../../types/launcher";

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
    isSelected,
    isInstalled,
    isPlaying,
    isLaunching,
    isMember,
    showPublic,
    colors,
    getWithTimestamp,
    onSelect,
    onPlay,
    onStop,
    onJoin,
    onInstall,
    onLeave,
    t
}: ServerItemProps) {
    const [imageLoaded, setImageLoaded] = useState(false);
    
    // Determine the image URL to use (banner preferred, fallback to icon)
    const imageUrl = instance.bannerUrl 
        ? getWithTimestamp(instance.bannerUrl)
        : instance.iconUrl 
            ? getWithTimestamp(instance.iconUrl) 
            : null;

    useEffect(() => {
        if (!imageUrl) {
            setImageLoaded(true); // No image to load, show immediately
            return;
        }

        const img = new Image();
        img.src = imageUrl;
        img.onload = () => setImageLoaded(true);
        img.onerror = () => setImageLoaded(true); // Show anyway on error
        
        return () => {
            img.onload = null;
            img.onerror = null;
        };
    }, [imageUrl]);

    return (
        <div
            className="animate-card-appear"
            style={{ animationDelay: `${Math.min(index * 25, 150)}ms` }}
        >
            <div
                onClick={() => { playClick(); onSelect(instance); }}
                className="group relative rounded-2xl overflow-hidden cursor-pointer h-48 transition-all hover:shadow-xl"
                style={{
                    border: isSelected
                        ? `2px solid ${colors.primary}`
                        : "2px solid transparent",
                }}
            >
                {/* Full Background Image - Prefer Banner, fallback to Icon */}
                <div
                    className={cn(
                        "absolute inset-0 bg-cover bg-center transition-all duration-700 ease-in-out group-hover:scale-105",
                        imageLoaded ? "opacity-100" : "opacity-0"
                    )}
                    style={{
                        backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
                        backgroundColor: imageUrl ? undefined : colors.surfaceContainer,
                        filter: (!isInstalled && !showPublic) ? "grayscale(100%) brightness(0.7)" : undefined
                    }}
                >
                    {(!instance.bannerUrl && !instance.iconUrl) && (
                        <div className="w-full h-full flex items-center justify-center">
                            <span className="text-6xl font-bold opacity-10" style={{ color: colors.onSurface }}>
                                {instance.name[0]?.toUpperCase()}
                            </span>
                        </div>
                    )}
                </div>
                
                {/* Fallback background while loading */}
                {!imageLoaded && (
                    <div 
                        className="absolute inset-0 transition-opacity duration-500"
                        style={{ backgroundColor: colors.surfaceContainer }}
                    />
                )}

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/50 to-transparent" />

                {/* Logo Icon - Top Left */}
                <div className="absolute top-4 left-4 w-12 h-12 rounded-xl bg-black/20 backdrop-blur-md border border-white/10 overflow-hidden shadow-lg z-10">
                    {instance.iconUrl ? (
                        <img 
                            src={getWithTimestamp(instance.iconUrl)} 
                            alt="Icon" 
                            className="w-full h-full object-cover"
                            loading="lazy" 
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-white/10 text-white font-bold text-lg">
                            {instance.name[0]?.toUpperCase()}
                        </div>
                    )}
                </div>

                {/* Status & Badges - Top Right */}
                <div className="absolute top-3 right-3 flex gap-2">
                    <span
                        className={cn(
                            "w-3 h-3 rounded-full border border-white/20 shadow-sm animate-status-breath",
                            instance.status === "active" ? "bg-green-500" : "bg-red-500"
                        )}
                        style={{ 
                            "--status-color-rgb": instance.status === "active" ? "34, 197, 94" : "239, 68, 68" 
                        } as React.CSSProperties}
                    />
                    {instance.isOwned && (
                        <span className="text-[10px] bg-yellow-500/80 text-black px-2 py-0.5 rounded-full font-bold backdrop-blur-sm">
                            {t('owner_badge')}
                        </span>
                    )}
                    {showPublic && !instance.isOwned && (
                        <span className="text-[10px] bg-blue-500/80 text-white px-2 py-0.5 rounded-full font-bold backdrop-blur-sm border border-white/20">
                            {t('public_badge')}
                        </span>
                    )}

                    {!isInstalled && (
                        <span className="text-[10px] bg-gray-500/80 text-white px-2 py-0.5 rounded-full font-bold backdrop-blur-sm border border-white/20">
                            {t('not_installed')}
                        </span>
                    )}
                </div>

                {/* Loader Badge - Top Left (Moved below Icon) */}
                {instance.loaderType && (
                    <div className="absolute top-20 left-4">
                        <span className="text-[10px] bg-black/50 text-white px-2 py-0.5 rounded-full backdrop-blur-md border border-white/10 uppercase tracking-wider">
                            {instance.loaderType}
                        </span>
                    </div>
                )}

                {/* Content & Actions - Bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end gap-3">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold text-white truncate drop-shadow-md">
                            {instance.name}
                        </h3>
                        <p className="text-sm text-gray-300 truncate drop-shadow-sm">
                            {instance.description || `Minecraft ${instance.minecraftVersion || ""}`}
                        </p>
                    </div>

                    <div className="flex gap-2 shrink-0">
                        {!isMember ? (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playClick();
                                    onJoin(instance);
                                }}
                                className="h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10"
                                style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                            >
                                <Icons.UserPlus className="w-5 h-5" />
                                <span className="font-bold">{t('join')}</span>
                            </button>
                        ) : (
                            <>
                                {isInstalled ? (
                                    <button
                                        onClick={(e) => {
                                            playClick();
                                            if (isPlaying || isLaunching) {
                                                onStop(e, instance.id);
                                            } else {
                                                onPlay(e, instance);
                                            }
                                        }}
                                        className="h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10"
                                        style={{
                                            backgroundColor: (isPlaying || isLaunching) ? "#ef4444" : "rgba(255,255,255,0.1)",
                                            color: "#fff"
                                        }}
                                    >
                                        {(isPlaying || isLaunching) ? (
                                            <>
                                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M6 6h12v12H6z" />
                                                </svg>
                                                <span className="font-bold">{t('stop')}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Icons.Play className="w-5 h-5 fill-current" />
                                                <span className="font-bold">{t('play')}</span>
                                            </>
                                        )}
                                    </button>
                                ) : (
                                    <button
                                        className="h-10 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10"
                                        style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                        onClick={(e) => { playClick(); onInstall(e, instance); }}
                                    >
                                        <Icons.Download className="w-5 h-5" />
                                        <span className="font-bold">{t('install')}</span>
                                    </button>
                                )}

                                {/* Leave Button */}
                                <button
                                    onClick={(e) => {
                                        playClick();
                                        onLeave(e, instance);
                                    }}
                                    className="h-10 w-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md border border-white/10"
                                    style={{
                                        backgroundColor: colors.errorContainer || "rgba(255, 59, 48, 0.2)",
                                        color: colors.onErrorContainer || "#ff3b30"
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
        </div>
    );
}

export default ServerItem;
