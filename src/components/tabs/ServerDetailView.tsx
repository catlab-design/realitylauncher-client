import React from "react";
import { Icons } from "../ui/Icons";
import { cn } from "../../lib/utils";
import { playClick } from "../../lib/sounds";
import type { Server } from "../../types/launcher";
import Markdown from "react-markdown";

interface ServerDetailViewProps {
    instance: any; // Using any for flexibility as it comes from ServerMenu logic
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

    // Determine the hero image URL (use banner if available, otherwise icon, or fallback)
    const heroImage = instance.bannerUrl || instance.image || instance.iconUrl;

    return (
        <div className="flex-1 flex flex-col h-full animate-fade-in relative z-10">
            {/* Top Bar - Back Button */}
            <div className="mb-4">
                <button
                    onClick={() => {
                        playClick();
                        onBack();
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:bg-white/10 active:scale-95"
                    style={{ color: colors.onSurface }}
                >
                    <Icons.ArrowLeft className="w-5 h-5" />
                    <span>{t('back')}</span>
                </button>
            </div>

            {/* Hero Section */}
            <div className="relative w-full h-48 md:h-64 rounded-3xl overflow-hidden shadow-2xl mb-6 group shrink-0">
                {/* Background Image */}
                <div 
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-105"
                    style={{ 
                        backgroundImage: heroImage ? `url(${getWithTimestamp(heroImage)})` : undefined,
                        backgroundColor: colors.surfaceContainerHighest
                    }}
                >
                    {!heroImage && (
                        <div className="w-full h-full flex items-center justify-center opacity-10">
                            <span className="text-7xl font-bold" style={{ color: colors.onSurface }}>
                                {instance.name?.[0]?.toUpperCase()}
                            </span>
                        </div>
                    )}
                </div>
                
                {/* Overlay Gradient */}
                <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-transparent" />

                {/* Content Overlay */}
                <div className="absolute inset-0 flex flex-col items-start justify-end p-6 transition-opacity duration-300 group-hover:opacity-0">
                    {/* Logo / Title Area */}
                    <div className="flex items-end gap-4 z-10 transform translate-y-1">
                        {instance.iconUrl ? (
                            <img 
                                src={getWithTimestamp(instance.iconUrl)} 
                                alt={t('server_icon_alt')}
                                className="w-16 h-16 rounded-2xl shadow-xl object-cover border-2 border-white/10 backdrop-blur-sm"
                            />
                        ) : (
                            <div className="w-16 h-16 rounded-2xl shadow-xl flex items-center justify-center bg-white/10 backdrop-blur-md border-2 border-white/10">
                                <span className="text-3xl font-bold text-white">
                                    {instance.name?.[0]?.toUpperCase()}
                                </span>
                            </div>
                        )}
                        
                        <div className="flex flex-col">
                            <h1 className="text-2xl md:text-4xl font-black text-white drop-shadow-lg tracking-tight mb-2">
                                {instance.name}
                            </h1>
                            {instance.description && (
                                <p className="text-white/90 font-medium text-lg drop-shadow-md max-w-2xl line-clamp-2">
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

                    {/* Server Info Stats */}
                    <div className="bg-white/5 p-4 rounded-3xl border border-white/5 space-y-3">
                        <h3 className="text-base font-bold opacity-80" style={{ color: colors.onSurface }}>
                            {t('server_info')}
                        </h3>
                        
                        <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="opacity-60 text-sm" style={{ color: colors.onSurface }}>{t('version')}</span>
                            <span className="font-mono font-medium text-sm" style={{ color: colors.onSurface }}>
                                {instance.minecraftVersion || instance.version || "1.20.1"}
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="opacity-60 text-sm" style={{ color: colors.onSurface }}>{t('loader')}</span>
                            <span className="font-mono font-medium uppercase text-sm" style={{ color: colors.onSurface }}>
                                {instance.loaderType || "FORGE"}
                            </span>
                        </div>

                         <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="opacity-60 text-sm" style={{ color: colors.onSurface }}>{t('mod_pack')}</span>
                            <span className="font-medium text-right truncate max-w-[150px] text-sm" style={{ color: colors.onSurface }}>
                                {instance.modpack || instance.name}
                            </span>
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
