import React from "react";
import { Icons } from "../ui/Icons";
import { cn } from "../../lib/utils";
import { playClick } from "../../lib/sounds";
import type { Server } from "../../types/launcher";
import Markdown from "react-markdown";

interface ServerDetailViewProps {
    instance: any;
    onBack: () => void;
    onPlay: (e: React.MouseEvent, instance: any) => void;
    onStop: (e: React.MouseEvent, instanceId: string) => void;
    onInstall: (e: React.MouseEvent, instance: any) => void;
    onJoin: (instance: any) => void;
    isInstalled: boolean;
    isPlaying: boolean;
    isLaunching: boolean;
    isMember: boolean;
    colors: any;
    t: (key: any) => string;
    getWithTimestamp: (url: string | null | undefined) => string;
    onViewLogs: (e: React.MouseEvent, instance: any) => void;
}

export function ServerDetailView({
    instance,
    onBack,
    onPlay,
    onStop,
    onInstall,
    onJoin,
    isInstalled,
    isPlaying,
    isLaunching,
    isMember,
    colors,
    t,
    getWithTimestamp,
    onViewLogs
}: ServerDetailViewProps) {

    const heroImage = instance.bannerUrl || instance.image || instance.iconUrl;

    return (
        <div className="flex-1 flex flex-col h-full animate-fade-in relative z-10 overflow-hidden">
            {/* Compact Header with Back Button */}
            <div className="flex items-center gap-3 mb-4 shrink-0">
                <button
                    onClick={() => { playClick(); onBack(); }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all hover:bg-white/10 active:scale-95 shrink-0"
                    style={{ color: colors.onSurface }}
                >
                    <Icons.ArrowLeft className="w-5 h-5" />
                    <span className="font-medium">{t('back')}</span>
                </button>
            </div>

            {/* Modern Hero - Taller */}
            <div className="relative w-full rounded-2xl overflow-hidden shadow-xl mb-5 shrink-0 group">
                {/* Background Image - Increased height */}
                <div className="h-48 relative">
                    <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{
                            backgroundImage: heroImage ? `url(${getWithTimestamp(heroImage)})` : undefined,
                            backgroundColor: colors.surfaceContainerHighest
                        }}
                    >
                        {!heroImage && (
                            <div className="w-full h-full flex items-center justify-center">
                                <span className="text-5xl font-bold opacity-20" style={{ color: colors.onSurface }}>
                                    {instance.name?.[0]?.toUpperCase()}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />

                    {/* Content on Image */}
                    <div className="absolute inset-0 flex items-center p-5 gap-4">
                        {instance.iconUrl ? (
                            <img
                                src={getWithTimestamp(instance.iconUrl)}
                                alt={t('server_icon_alt')}
                                className="w-16 h-16 rounded-xl shadow-lg object-cover border-2 border-white/20 shrink-0"
                            />
                        ) : (
                            <div className="w-16 h-16 rounded-xl shadow-lg flex items-center justify-center bg-white/10 border-2 border-white/20 shrink-0">
                                <span className="text-2xl font-bold text-white">
                                    {instance.name?.[0]?.toUpperCase()}
                                </span>
                            </div>
                        )}

                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl md:text-2xl font-black text-white drop-shadow-lg tracking-tight truncate">
                                {instance.name}
                            </h1>
                            {instance.description && (
                                <p className="text-white/80 text-sm line-clamp-1 drop-shadow-md">
                                    {instance.description}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Grid */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 overflow-hidden min-h-0">
                
                {/* LEFT COLUMN - Actions & Stats */}
                <div className="md:col-span-4 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
                    
                    {/* Main Action Button */}
                    <div className="bg-white/5 p-4 rounded-3xl border border-white/5 flex flex-col gap-3">
                        {!isMember ? (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playClick();
                                    onJoin(instance);
                                }}
                                className="w-full h-12 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95 shadow-lg hover:shadow-xl hover:brightness-110"
                                style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                            >
                                <Icons.UserPlus className="w-5 h-5" />
                                <span className="text-lg font-bold">{t('join')}</span>
                            </button>
                        ) : isInstalled ? (
                            <div className="flex gap-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        playClick();
                                        if (isPlaying || isLaunching) {
                                            onStop(e, instance.id);
                                        } else {
                                            onPlay(e, instance);
                                        }
                                    }}
                                    className={cn(
                                        "flex-1 h-12 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95 shadow-lg hover:shadow-xl hover:brightness-110",
                                        (isPlaying || isLaunching) ? "bg-red-500 text-white" : "text-white"
                                    )}
                                    style={(isPlaying || isLaunching) ? { backgroundColor: colors.error || "#ef4444" } : { backgroundColor: colors.secondary }}
                                >
                                    {(isPlaying || isLaunching) ? (
                                        <>
                                            {isLaunching ? (
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <div className="w-5 h-5 bg-white rounded-sm" />
                                            )}
                                            <span className="text-lg font-bold">{isLaunching ? t('launching') : t('stop')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Icons.Play className="w-6 h-6 fill-current" />
                                            <span className="text-xl font-bold">{t('play')}</span>
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        playClick();
                                        onViewLogs(e, instance);
                                    }}
                                    className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:scale-[1.05] active:scale-95 shadow-lg hover:brightness-110"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                    title={t('logs')}
                                >
                                    <Icons.Terminal className="w-6 h-6" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playClick();
                                    onInstall(e, instance);
                                }}
                                className="w-full h-12 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95 shadow-lg hover:shadow-xl hover:brightness-110"
                                style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                            >
                                <Icons.Download className="w-5 h-5" />
                                <span className="text-lg font-bold">{t('install')}</span>
                            </button>
                        )}
                        
                        {/* Social Buttons */}
                        <div className="flex gap-3 flex-wrap">
                            {(() => {
                                let socialLinks: { type: string, url: string }[] = [];
                                try {
                                    if (instance.socials) {
                                        socialLinks = JSON.parse(instance.socials);
                                    }
                                } catch (e) {
                                    console.error("Failed to parse social links", e);
                                }

                                // Helper to return icon based on URL or type
                                const getSocialIcon = (url: string, type?: string) => {
                                    const lowerUrl = url.toLowerCase();
                                    const lowerType = type?.toLowerCase() || "";

                                    if (lowerType === 'discord' || lowerUrl.includes('discord.gg') || lowerUrl.includes('discord.com')) return Icons.Discord;
                                    if (lowerType === 'youtube' || lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return Icons.YouTube;
                                    if (lowerType === 'facebook' || lowerUrl.includes('facebook.com')) return Icons.Facebook;
                                    if (lowerType === 'twitter' || lowerType === 'x' || lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return Icons.TwitterX;
                                    if (lowerType === 'instagram' || lowerUrl.includes('instagram.com')) return Icons.Instagram;
                                    
                                    return Icons.Globe;
                                };

                                // Helper to return color based on type
                                const getSocialColor = (url: string, type?: string) => {
                                    const lowerUrl = url.toLowerCase();
                                    const lowerType = type?.toLowerCase() || "";

                                    if (lowerType === 'discord' || lowerUrl.includes('discord')) return '#5865F2';
                                    if (lowerType === 'youtube' || lowerUrl.includes('youtu')) return '#FF0000';
                                    if (lowerType === 'facebook' || lowerUrl.includes('facebook')) return '#1877F2';
                                    if (lowerType === 'twitter' || lowerType === 'x' || lowerUrl.includes('twitter') || lowerUrl.includes('x.com')) return '#000000';
                                    if (lowerType === 'instagram' || lowerUrl.includes('instagram')) return 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)';

                                    return '#2b2d31'; // Default dark gray
                                };

                                return (
                                    <>
                                        {socialLinks.map((link, index) => {
                                            const Icon = getSocialIcon(link.url, link.type);
                                            const bgValue = getSocialColor(link.url, link.type);
                                            return (
                                                <button
                                                    key={index}
                                                    onClick={() => (window as any).api.openExternal(link.url)}
                                                    className="flex-1 min-w-12 h-10 rounded-xl flex items-center justify-center text-white font-bold transition-all hover:scale-[1.05] active:scale-95 shadow-lg hover:brightness-110"
                                                    style={{ background: bgValue }}
                                                >
                                                    <Icon className="w-5 h-5" />
                                                </button>
                                            );
                                        })}
                                        
                                        {/* Fallback Legacy Website URL Button if no socials or as extra?? 
                                            User said "change mind", implying we replace the old behavior?
                                            "ถ้าเขาไม่ระบุให้มีให้ไม่แสดง" (If not specified, don't show)
                                            "เพิ่มได้หลายลิงค์" (Can add multiple links)
                                            Let's keep websiteUrl as a generic "Website" button if it exists and NOT in socials?
                                            Or just treat websiteUrl as one of the socials if not empty?
                                            Let's render it as a button if it exists, to be safe.
                                        */}
                                        {instance.websiteUrl && !socialLinks.some(l => l.url === instance.websiteUrl) && (
                                            <button
                                                onClick={() => (window as any).api.openExternal(instance.websiteUrl)}
                                                className="flex-1 min-w-12 h-10 rounded-xl flex items-center justify-center bg-[#2b2d31] text-white font-bold transition-all hover:bg-[#3f4147] hover:scale-[1.05] active:scale-95 shadow-lg"
                                            >
                                                <Icons.Globe className="w-5 h-5" />
                                            </button>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Server Info Stats - Horizontal Cards */}
                    <div className="grid grid-cols-3 gap-3">
                        {/* Version Card */}
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col items-center text-center gap-2 hover:bg-white/10 transition-colors">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.primary + '20' }}>
                                <Icons.Box className="w-5 h-5" style={{ color: colors.primary }} />
                            </div>
                            <div>
                                <p className="text-xs opacity-60 uppercase tracking-wider" style={{ color: colors.onSurface }}>{t('version')}</p>
                                <p className="font-mono font-bold text-sm" style={{ color: colors.onSurface }}>
                                    {instance.minecraftVersion || instance.version || "1.20.1"}
                                </p>
                            </div>
                        </div>

                        {/* Loader Card */}
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col items-center text-center gap-2 hover:bg-white/10 transition-colors">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.secondary + '30' }}>
                                <Icons.Settings className="w-5 h-5" style={{ color: colors.secondary }} />
                            </div>
                            <div>
                                <p className="text-xs opacity-60 uppercase tracking-wider" style={{ color: colors.onSurface }}>{t('loader')}</p>
                                <p className="font-bold text-sm" style={{ color: colors.onSurface }}>
                                    {(instance.loaderType || "FORGE").toUpperCase()}
                                </p>
                            </div>
                        </div>

                        {/* Mod Pack Card */}
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col items-center text-center gap-2 hover:bg-white/10 transition-colors">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.tertiary || colors.primary + '20' }}>
                                <Icons.Modpack className="w-5 h-5" style={{ color: colors.tertiary || colors.primary }} />
                            </div>
                            <div className="min-w-0 w-full">
                                <p className="text-xs opacity-60 uppercase tracking-wider" style={{ color: colors.onSurface }}>{t('mod_pack')}</p>
                                <p className="font-bold text-sm truncate" style={{ color: colors.onSurface }}>
                                    {instance.modpack || instance.name}
                                </p>
                            </div>
                        </div>
                    </div>

                </div>

                {/* RIGHT COLUMN - Stories & Details */}
                <div className="md:col-span-8 flex flex-col gap-4 overflow-y-auto custom-scrollbar pb-4">
                    
                    {/* Story Section */}
                    <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                        <h2 className="text-2xl font-bold mb-4 flex items-center gap-3" style={{ color: colors.onSurface }}>
                            <Icons.Book className="w-6 h-6" style={{ color: colors.primary }} />
                            <span>{t('story')}</span>
                        </h2>
                        
                        <div className="prose prose-invert max-w-none">
                            <div className="text-base leading-relaxed opacity-90 whitespace-pre-line markdown-content" style={{ color: colors.onSurface }}>
                                <Markdown>{instance.richDescription || instance.description || t('no_description')}</Markdown>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ServerDetailView;
