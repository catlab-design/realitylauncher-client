import React, { useState, useEffect, useCallback } from "react";
import { cn } from "../../lib/utils";
import { type AuthSession, type NewsItem, type Server } from "../../types/launcher";
import { Icons } from "../ui/Icons";
import { MCHead } from "../ui/MCHead";
import { useTranslation } from "../../hooks/useTranslation";

interface Newsletter {
    // ... existing interface
    id: string;
    subject: string;
    content: string;
    imageUrl: string | null;
    displayOrder: number;
    createdAt: string;
    sentAt: string | null;
}

interface HomeProps {
    session: AuthSession | null;
    news: NewsItem[];
    servers: Server[];
    selectedServer: Server | null;
    setSelectedServer: (server: Server) => void;
    colors: any;
    setActiveTab?: (tab: string) => void;
    language: string;
}

interface GameInstance {
    id: string;
    name: string;
    icon?: string;
    minecraftVersion: string;
    loader: string;
    lastPlayedAt?: string;
    totalPlayTime: number;
}

export function Home({
    session,
    news,
    servers,
    selectedServer,
    setSelectedServer,
    colors,
    setActiveTab,
    language,
}: HomeProps) {
    const { t } = useTranslation(language as any);
    const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
    const [newsletterLoading, setNewsletterLoading] = useState(true);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isHovering, setIsHovering] = useState(false);
    const [recentInstances, setRecentInstances] = useState<GameInstance[]>([]);

    const fetchNewsletters = useCallback(async () => {
        try {
            const res = await fetch("https://api.reality.notpumpkins.com/newsletter/list");
            if (res.ok) {
                const data = await res.json();
                setNewsletters(data.newsletters || []);
            }
        } catch {
            // Silent fail
        } finally {
            setNewsletterLoading(false);
        }
    }, []);

    // Fetch newsletters on mount and every 60 seconds (5s was too aggressive)
    useEffect(() => {
        fetchNewsletters();
        const interval = setInterval(fetchNewsletters, 60000);
        return () => clearInterval(interval);
    }, [fetchNewsletters]);

    // Auto-slide: 3s normal, 20s when hovering
    useEffect(() => {
        if (newsletters.length <= 1) return;
        const delay = isHovering ? 20000 : 3000;
        const slideInterval = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % newsletters.length);
        }, delay);
        return () => clearInterval(slideInterval);
    }, [newsletters.length, isHovering]);

    // Fetch recently played instances
    useEffect(() => {
        const loadRecentInstances = async () => {
            try {
                const instances = await window.api?.instancesList?.();
                if (instances) {
                    // Sort by lastPlayedAt descending, take top 4
                    const sorted = [...instances]
                        .filter((i: GameInstance) => i.lastPlayedAt)
                        .sort((a: GameInstance, b: GameInstance) => {
                            const aDate = new Date(a.lastPlayedAt!).getTime();
                            const bDate = new Date(b.lastPlayedAt!).getTime();
                            return bDate - aDate;
                        })
                        .slice(0, 4);
                    setRecentInstances(sorted);
                }
            } catch {
                // Silent fail
            }
        };
        loadRecentInstances();
    }, []);

    // Get current hour for greeting
    const hour = new Date().getHours();
    const greeting = hour < 12 ? t('good_morning') : hour < 18 ? t('good_afternoon') : t('good_evening');

    return (
        <div className="space-y-8">
            {/* User Status Bar */}
            <div
                className="flex items-center justify-between p-4 rounded-2xl"
                style={{
                    backgroundColor: colors.surfaceContainer,
                    border: `1px solid ${colors.outline}15`,
                }}
            >
                <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="relative">
                        {session ? (
                            <MCHead
                                username={session.username}
                                size={48}
                                className="rounded-xl"
                            />
                        ) : (
                            <div
                                className="w-12 h-12 rounded-xl flex items-center justify-center"
                                style={{ backgroundColor: colors.surfaceContainerHighest }}
                            >
                                <Icons.Person className="w-6 h-6" style={{ color: colors.onSurfaceVariant }} />
                            </div>
                        )}
                        {/* Online indicator */}
                        {session && (
                            <div
                                className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
                                style={{
                                    backgroundColor: '#22c55e',
                                    borderColor: colors.surfaceContainer,
                                }}
                            />
                        )}
                    </div>

                    {/* User Info */}
                    <div>
                        <h2 className="text-base font-semibold" style={{ color: colors.onSurface }}>
                            {session ? session.username : t('not_logged_in')}
                        </h2>
                        <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                            {session ? t('ready_to_play') : t('please_login')}
                        </p>
                    </div>
                </div>

                {/* Right side - Time greeting */}
                <div className="text-right">
                    <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                        {greeting}
                    </p>
                    <p className="text-xs font-medium" style={{ color: colors.primary }}>
                        {new Date().toLocaleDateString(language === "th" ? "th-TH" : "en-US", { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </div>
            </div>

            {/* Main Content - Stacked Layout */}
            <div className="space-y-8">
                {/* Newsletter Carousel Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: colors.onSurface }}>
                            <span className="w-1 h-5 rounded-full" style={{
                                backgroundColor: colors.primary
                            }} />
                            {t('news_and_updates')}
                        </h3>
                        {newsletters.length > 0 && (
                            <span
                                className="text-xs px-2.5 py-1 rounded-full font-medium"
                                style={{
                                    backgroundColor: colors.surfaceContainerHighest,
                                    color: colors.onSurfaceVariant,
                                }}
                            >
                                {t('items_count').replace('{count}', newsletters.length.toString())}
                            </span>
                        )}
                    </div>

                    {/* Newsletter Carousel */}
                    {newsletterLoading ? (
                        /* Skeleton Loading */
                        <div
                            className="rounded-3xl overflow-hidden animate-pulse"
                            style={{
                                background: `linear-gradient(135deg, ${colors.surfaceContainer}, ${colors.surfaceContainerHighest || colors.surfaceContainer})`,
                                border: `1px solid ${colors.outline}20`
                            }}
                        >
                            {/* Skeleton Image */}
                            <div
                                className="h-56 w-full"
                                style={{ backgroundColor: colors.surfaceContainerHighest }}
                            />
                            {/* Skeleton Content */}
                            <div className="p-5 space-y-3">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="h-4 w-32 rounded-full"
                                        style={{ backgroundColor: colors.surfaceContainerHighest }}
                                    />
                                </div>
                                <div
                                    className="h-6 w-3/4 rounded-lg"
                                    style={{ backgroundColor: colors.surfaceContainerHighest }}
                                />
                                <div
                                    className="h-4 w-full rounded-lg"
                                    style={{ backgroundColor: colors.surfaceContainerHighest }}
                                />
                                <div
                                    className="h-4 w-2/3 rounded-lg"
                                    style={{ backgroundColor: colors.surfaceContainerHighest }}
                                />
                            </div>
                        </div>
                    ) : newsletters.length === 0 ? (
                        <div
                            className="p-16 rounded-3xl text-center relative overflow-hidden"
                            style={{
                                background: `linear-gradient(135deg, ${colors.surfaceContainer}, ${colors.surfaceContainerHighest || colors.surfaceContainer})`,
                                border: `1px solid ${colors.outline}20`
                            }}
                        >
                            <div className="absolute inset-0 opacity-10"
                                style={{
                                    backgroundImage: `radial-gradient(circle at 50% 50%, ${colors.primary}40 0%, transparent 70%)`
                                }}
                            />
                            <Icons.News className="w-16 h-16 mx-auto mb-4 opacity-20" style={{ color: colors.primary }} />
                            <p className="text-lg font-medium" style={{ color: colors.onSurfaceVariant }}>{t('no_news_yet')}</p>
                            <p className="text-sm mt-1 opacity-60" style={{ color: colors.onSurfaceVariant }}>{t('new_news_will_appear_here')}</p>
                        </div>
                    ) : (
                        <div
                            className="relative"
                            onMouseEnter={() => setIsHovering(true)}
                            onMouseLeave={() => setIsHovering(false)}
                        >

                            {/* Carousel Container - Transparent */}
                            <div
                                className="relative overflow-hidden rounded-2xl"
                            >
                                <div
                                    className="flex transition-transform duration-700 ease-out"
                                    style={{ transform: `translateX(-${currentSlide * 100}%)` }}
                                >
                                    {newsletters.map((item) => (
                                        <div key={item.id} className="w-full flex-shrink-0 relative">
                                            {/* Image with Overlay */}
                                            <div className="relative h-56 overflow-hidden">
                                                {item.imageUrl ? (
                                                    <div
                                                        className="absolute inset-0 bg-cover bg-center"
                                                        style={{ backgroundImage: `url(${item.imageUrl})` }}
                                                    />
                                                ) : (
                                                    <div
                                                        className="absolute inset-0 flex items-center justify-center"
                                                        style={{
                                                            background: `linear-gradient(135deg, ${colors.primary}20, ${colors.secondary}25, ${colors.primary}15)`
                                                        }}
                                                    >
                                                        <div className="relative">
                                                            <div
                                                                className="absolute inset-0 blur-3xl opacity-40"
                                                                style={{ background: `radial-gradient(circle, ${colors.primary}60, transparent)` }}
                                                            />
                                                            <Icons.News className="w-16 h-16 opacity-20 relative z-10" style={{ color: colors.primary }} />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Badge on Image */}
                                                <div className="absolute top-4 left-4 flex items-center gap-2">
                                                    <span
                                                        className="text-xs px-3 py-1.5 rounded-full font-medium backdrop-blur-xl"
                                                        style={{
                                                            background: `${colors.surface}95`,
                                                            color: colors.onSurface,
                                                            border: `1px solid ${colors.outline}30`,
                                                        }}
                                                    >
                                                        <Icons.News className="w-3 h-3 mr-1.5" />
                                                        {t('news_and_updates')}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Content */}
                                            <div className="p-5">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <span className="text-xs flex items-center gap-1.5" style={{ color: colors.onSurfaceVariant }}>
                                                        <Icons.Timer className="w-3 h-3" />
                                                        {new Date(item.sentAt || item.createdAt).toLocaleDateString(language === "th" ? "th-TH" : "en-US", { day: "numeric", month: "long", year: "numeric" })}
                                                    </span>
                                                </div>
                                                <h4
                                                    className="text-xl font-bold mb-2 leading-tight"
                                                    style={{ color: colors.onSurface }}
                                                >
                                                    {item.subject}
                                                </h4>
                                                <p
                                                    className="text-sm line-clamp-2 leading-relaxed"
                                                    style={{ color: colors.onSurfaceVariant }}
                                                >
                                                    {item.content}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Navigation Arrows - show only on hover */}
                                {isHovering && newsletters.length > 1 && (
                                    <>
                                        <button
                                            onClick={() => setCurrentSlide((prev) => (prev - 1 + newsletters.length) % newsletters.length)}
                                            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-xl transition-all hover:scale-110 active:scale-95"
                                            style={{
                                                background: `${colors.surface}80`,
                                                border: `1px solid ${colors.outline}30`,
                                            }}
                                        >
                                            <Icons.ChevronLeft className="w-4 h-4" style={{ color: colors.onSurface }} />
                                        </button>
                                        <button
                                            onClick={() => setCurrentSlide((prev) => (prev + 1) % newsletters.length)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-xl transition-all hover:scale-110 active:scale-95"
                                            style={{
                                                background: `${colors.surface}80`,
                                                border: `1px solid ${colors.outline}30`,
                                            }}
                                        >
                                            <Icons.ChevronRight className="w-4 h-4" style={{ color: colors.onSurface }} />
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Hover Indicator - Clock icon when reading */}
                            {isHovering && newsletters.length > 1 && (
                                <div
                                    className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-xl animate-fade-in"
                                    style={{
                                        background: `${colors.surface}90`,
                                        border: `1px solid ${colors.outline}30`,
                                    }}
                                >
                                    <Icons.Timer className="w-3 h-3" style={{ color: colors.primary }} />
                                    <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>{t('reading_status')}</span>
                                </div>
                            )}

                            {/* Navigation Dots */}
                            {newsletters.length > 1 && (
                                <div className="flex justify-center gap-2 mt-4">
                                    {newsletters.map((_, index) => (
                                        <button
                                            key={index}
                                            onClick={() => setCurrentSlide(index)}
                                            className={cn(
                                                "h-2 rounded-full transition-all duration-300",
                                                index === currentSlide ? "w-8" : "w-2 opacity-40 hover:opacity-70"
                                            )}
                                            style={{
                                                backgroundColor: index === currentSlide ? colors.primary : colors.onSurfaceVariant,
                                                boxShadow: index === currentSlide ? `0 0 10px ${colors.primary}50` : 'none'
                                            }}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Recently Played Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: colors.onSurface }}>
                            <span className="w-1 h-5 rounded-full" style={{ backgroundColor: colors.primary }} />
                            {t('recently_played')}
                        </h3>
                        <button
                            onClick={() => setActiveTab?.("modpack")}
                            className="text-sm px-3 py-1 rounded-lg transition-all hover:opacity-80"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.secondary }}
                        >
                            {t('view_all')}
                        </button>
                    </div>
                    {recentInstances.length > 0 ? (
                        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
                            {recentInstances.map((instance) => (
                                <button
                                    key={instance.id}
                                    onClick={() => setActiveTab?.("modpack")}
                                    className="p-4 rounded-2xl text-left transition-all hover:scale-[1.02] hover:shadow-lg group"
                                    style={{ backgroundColor: colors.surfaceContainer }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                                            style={{ backgroundColor: colors.surfaceContainerHighest }}
                                        >
                                            {instance.icon ? (
                                                <img src={instance.icon} alt={instance.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <Icons.Modpack className="w-6 h-6" style={{ color: colors.onSurfaceVariant }} />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate" style={{ color: colors.onSurface }}>
                                                {instance.name}
                                            </p>
                                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                                {instance.minecraftVersion} • {instance.loader}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div
                            className="p-8 rounded-2xl text-center"
                            style={{ backgroundColor: colors.surfaceContainer }}
                        >
                            <Icons.Modpack className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: colors.onSurfaceVariant }} />
                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{t('no_mod_packs') || "No recently played games"}</p>
                        </div>
                    )}
                </div>


            </div>
        </div>
    );
}
