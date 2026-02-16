import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
import { type AuthSession, type NewsItem, type Server, type GameInstance } from "../../types/launcher";
import { Icons } from "../ui/Icons";
import { MCHead } from "../ui/MCHead";
import { BannerImage } from "../ui/BannerImage";
import { useTranslation } from "../../hooks/useTranslation";
import SimpleMarkdown, { stripMarkdown } from "../ui/SimpleMarkdown";

interface Newsletter {
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
    setSelectedInstance?: (instance: GameInstance) => void;
    colors: any;
    setActiveTab?: (tab: string) => void;
    language: string;
}

const HomeHeader = React.memo(({ session, colors, language }: { session: any, colors: any, language: string }) => {
    const { t } = useTranslation(language as any);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isHoveringClock, setIsHoveringClock] = useState(false);

    const mousePos = useRef({ x: 0, y: 0 });

    const tooltipRef = useRef<HTMLDivElement>(null);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        mousePos.current = { x: e.clientX, y: e.clientY };
        
        // Force update for tooltip position if needed, but since we use ref for pos and portal, 
        // we might need a ref to the portal element to update it directly without re-render,
        // OR we just rely on the fact that isHoveringClock is true and we might need to use a requestAnimationFrame or state if we want smooth updates.
        // But previously we used a ref to the tooltip DOM element.
        if (tooltipRef.current) {
             tooltipRef.current.style.transform = `translate(${e.clientX + 10}px, ${e.clientY + 10}px)`;
        }
    }, []);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const hour = currentTime.getHours();
    const greeting = hour < 12 ? t('good_morning') : hour < 18 ? t('good_afternoon') : t('good_evening');

    return (
        <>
             {/* Floating Tooltip following mouse */}
             {isHoveringClock && createPortal(
                <div 
                    ref={tooltipRef}
                    className="fixed top-0 left-0 z-50 pointer-events-none px-3 py-1.5 rounded-lg text-xs font-bold shadow-xl backdrop-blur-md border animate-in fade-in zoom-in duration-200 transition-none will-change-transform"
                    style={{ 
                        // Initial position
                        transform: `translate(${mousePos.current.x + 10}px, ${mousePos.current.y + 10}px)`,
                        backgroundColor: colors.surfaceContainer + 'F2',
                        color: colors.onSurface,
                        borderColor: colors.outline + '40'
                    }}
                >
                    {currentTime.toLocaleTimeString(language === "th" ? "th-TH" : "en-US", { hour: '2-digit', minute: '2-digit', hour12: false })}
                </div>,
                document.body
            )}

            <header
                className="relative overflow-hidden rounded-3xl p-6 transition-all duration-300"
                style={{
                    backgroundColor: colors.surfaceContainer,
                    border: `1px solid ${colors.outline}40`,
                }}
            >
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 w-96 h-96 opacity-10 rounded-full blur-[100px] -mr-20 -mt-20 pointer-events-none transition-opacity duration-700 group-hover/header:opacity-20 translate-x-10 -translate-y-10"
                    style={{ background: `radial-gradient(circle, ${colors.primary}, transparent)` }} />
                
                <div className="absolute bottom-0 left-0 w-64 h-64 opacity-5 rounded-full blur-[80px] -ml-20 -mb-20 pointer-events-none"
                    style={{ background: `radial-gradient(circle, ${colors.secondary}, transparent)` }} />

                <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10 w-full">
                    {/* Left Side: Avatar & Greeting */}
                    <div className="flex items-center gap-6 w-full md:w-auto">
                        <div className="relative group shrink-0">
                            {/* Avatar */}
                            {session ? (
                                    <div className="relative transform transition-transform duration-500 rounded-2xl"
                                         style={{ 
                                            backgroundColor: colors.surfaceContainerHighest,
                                            border: `2px solid ${colors.outline}60` 
                                         }}>
                                    <MCHead
                                        username={session.username}
                                        size={80}
                                        className="rounded-2xl"
                                    />
                                    {/* Status Dot */}
                                    <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full border-4 flex items-center justify-center bg-[#10B981]"
                                        style={{ borderColor: colors.surfaceContainer }}>
                                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-inner relative z-10"
                                    style={{ backgroundColor: colors.surfaceContainerHighest }}
                                >
                                    <Icons.Person className="w-10 h-10 opacity-50" style={{ color: colors.onSurfaceVariant }} />
                                </div>
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <h1 className="text-3xl font-extrabold tracking-tight mb-2" style={{ color: colors.onSurface }}>
                                {session ? (
                                    <span className="flex flex-wrap items-center gap-2">
                                        {greeting}, 
                                        <span className="text-transparent bg-clip-text bg-linear-to-r from-[#FCD34D] to-[#F59E0B]">
                                            {session.username}
                                        </span>
                                    </span>
                                ) : (
                                    t('welcome_guest')
                                )}
                            </h1>
                            <div className="flex items-center gap-3">
                                {session ? (
                                    <>
                                        {/* Online Badge */}
                                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#10B981]/10 border border-[#10B981]/20">
                                            <div className="w-2 h-2 rounded-full bg-[#10B981]" />
                                            <span className="text-xs font-bold text-[#10B981]">{t('online_badge')}</span>
                                        </div>
                                        <span className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>
                                            • {t('ready_to_play')}
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>
                                        {t('please_login_full')}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Date & Time */}
                    <div className="w-full md:w-auto flex justify-end">
                        <div 
                             className="group/date relative overflow-hidden px-5 py-2 rounded-full backdrop-blur-xl border transition-all duration-300 cursor-default"
                             style={{ 
                                 background: `linear-gradient(90deg, ${colors.surfaceContainerHighest}20, ${colors.surfaceContainerHighest}40)`,
                                 borderColor: colors.outline + '60'
                             }}>
                             
                            <div className="flex items-center gap-5 relative z-10 w-full justify-end">
                                <div 
                                    className="relative w-12 h-12 flex items-center justify-center rounded-full transition-transform duration-300 cursor-default"
                                    onMouseEnter={() => setIsHoveringClock(true)}
                                    onMouseLeave={() => setIsHoveringClock(false)}
                                    onMouseMove={handleMouseMove}
                                >
                                    {/* Live Analog Clock Minimalist */}
                                    <div className="p-0.5 rounded-full bg-white/5 border border-white/10 w-full h-full relative overflow-hidden">
                                        <svg viewBox="0 0 24 24" className="w-full h-full">
                                            {/* Clock Face Background */}
                                            <circle cx="12" cy="12" r="11" fill={colors.surfaceContainer} />
                                            
                                            {/* Hour Hand */}
                                            <line x1="12" y1="12" x2="12" y2="7" stroke={colors.onSurface} strokeWidth="2.5" strokeLinecap="round"
                                                  transform={`rotate(${(currentTime.getHours() % 12) * 30 + currentTime.getMinutes() * 0.5} 12 12)`} />
                                            
                                            {/* Minute Hand */}
                                            <line x1="12" y1="12" x2="12" y2="4" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round"
                                                  transform={`rotate(${currentTime.getMinutes() * 6} 12 12)`} />
                                            
                                            {/* Second Hand */}
                                            <line x1="12" y1="12" x2="12" y2="3" stroke={colors.tertiary || "#FBBF24"} strokeWidth="1.5" strokeLinecap="round"
                                                  transform={`rotate(${currentTime.getSeconds() * 6} 12 12)`} />
                                            
                                            {/* Center Dot */}
                                            <circle cx="12" cy="12" r="1.5" fill={colors.onSurface} />
                                        </svg>
                                    </div>
                                </div>

                                <div className="flex flex-col items-end leading-none">
                                    <p className="text-base font-bold tracking-wide" style={{ color: colors.onSurface }}>
                                        {currentTime.toLocaleDateString(language === "th" ? "th-TH" : "en-US", { weekday: 'long', day: 'numeric', month: 'long' })}
                                    </p>
                                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] mt-1.5 opacity-60" style={{ color: colors.primary }}>
                                        {currentTime.getFullYear()} • REALITY
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>
        </>
    );
});

export function Home({
    session,
    news,
    servers,
    selectedServer,
    setSelectedServer,
    setSelectedInstance,
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
    const [selectedNews, setSelectedNews] = useState<Newsletter | null>(null);

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

    useEffect(() => {
        fetchNewsletters();
        const interval = setInterval(fetchNewsletters, 60000);
        return () => clearInterval(interval);
    }, [fetchNewsletters]);

    useEffect(() => {
        if (newsletters.length <= 1) return;
        const delay = isHovering ? 20000 : 5000;
        const slideInterval = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % newsletters.length);
        }, delay);
        return () => clearInterval(slideInterval);
    }, [newsletters.length, isHovering]);

    useEffect(() => {
        const loadRecentInstances = async () => {
            try {
                const instances = await window.api?.instancesList?.();
                if (instances) {
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
        // Add a listener for when the window gets focus to reload instances
        const onFocus = () => loadRecentInstances();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, []);

    return (
        <div className="space-y-8 pb-10">
            <HomeHeader session={session} colors={colors} language={language} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Column (News) */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold flex items-center gap-3" style={{ color: colors.onSurface }}>
                            <div className="p-2 rounded-lg" style={{ backgroundColor: colors.primaryContainer }}>
                                <Icons.News className="w-5 h-5" style={{ color: colors.onPrimaryContainer }} />
                            </div>
                            {t('news_feed')}
                        </h3>
                    </div>

                    <div className="relative group"
                         onMouseEnter={() => setIsHovering(true)}
                         onMouseLeave={() => setIsHovering(false)}>
                        
                        {newsletterLoading ? (
                            <div className="w-full aspect-video max-h-[420px] rounded-3xl animate-pulse"
                                 style={{ backgroundColor: colors.surfaceContainerHighest }} />
                        ) : newsletters.length > 0 ? (
                            <div className="relative w-full aspect-video max-h-[420px] rounded-3xl overflow-hidden shadow-lg transition-all hover:shadow-xl ring-1 ring-inset group/slider"
                                 style={{ borderColor: colors.outline + '20' }}>
                                
                                {/* Slides */}
                                {newsletters.map((item, index) => (
                                    <div
                                        key={item.id}
                                        className={cn(
                                            "absolute inset-0 transition-opacity duration-700 ease-in-out",
                                            index === currentSlide ? "opacity-100 z-10" : "opacity-0 z-0"
                                        )}
                                    >
                                        <BannerImage
                                            src={item.imageUrl}
                                            alt={item.subject}
                                            priority={index === 0 || index === currentSlide} // Always prioritize current slide
                                            loading={index === currentSlide || index === (currentSlide + 1) % newsletters.length ? "eager" : "lazy"} // Eager load current and next
                                            className="absolute inset-0 w-full h-full"
                                            style={{
                                                transform: index === currentSlide && isHovering ? 'scale(1.1)' : 'scale(1.0)',
                                                transition: 'transform 20s linear'
                                            }}
                                        />
                                        
                                        {/* Gradient Overlay */}
                                        <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-transparent" />
                                        <div className="absolute inset-0 bg-linear-to-r from-black/80 via-black/20 to-transparent" />

                                        <div className="absolute bottom-0 left-0 max-w-[65%] p-8 text-white z-10 flex flex-col items-start">
                                            <div className="flex items-center gap-3 mb-4 text-white/90 text-xs font-bold uppercase tracking-wider">
                                                <span className="font-semibold shadow-black/50 drop-shadow-sm">
                                                    {new Date(item.sentAt || item.createdAt).toLocaleDateString(language === "th" ? "th-TH" : "en-US", { dateStyle: 'medium' })}
                                                </span>
                                            </div>
                                            <h2 className="text-3xl font-extrabold mb-3 line-clamp-2 leading-tight drop-shadow-lg tracking-tight">
                                                {item.subject}
                                            </h2>
                                            <p className="text-sm text-white/80 line-clamp-2 leading-relaxed mb-6 font-medium max-w-[90%] drop-shadow-md">
                                                {stripMarkdown(item.content)}
                                            </p>
                                            <button 
                                                onClick={() => setSelectedNews(item)}
                                                className="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 transition-all font-semibold text-sm flex items-center gap-2 group/btn shadow-lg hover:shadow-white/5 active:scale-95">
                                                {t('read_more')}
                                                <Icons.ChevronRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* Controls */}
                                {/* Controls */}
                                {newsletters.length > 1 && (
                                    <div className="absolute bottom-6 right-6 z-20 flex items-center gap-3">
                                        {/* Pagination Dots */}
                                        <div className="flex gap-1.5 bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/5">
                                            {newsletters.map((_, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => setCurrentSlide(idx)}
                                                    className={cn(
                                                        "h-1.5 rounded-full transition-all duration-300 shadow-sm",
                                                        idx === currentSlide ? "w-6 bg-white" : "w-1.5 bg-white/30 hover:bg-white/50"
                                                    )}
                                                />
                                            ))}
                                        </div>

                                        {/* Arrows */}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setCurrentSlide((prev) => (prev - 1 + newsletters.length) % newsletters.length)}
                                                className="w-8 h-8 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-md border border-white/5 text-white transition-all hover:bg-black/40 hover:scale-110 shadow-lg active:scale-95 group/nav"
                                            >
                                                <Icons.ChevronLeft className="w-4 h-4 group-hover/nav:-translate-x-0.5 transition-transform" />
                                            </button>
                                            
                                            <button
                                                onClick={() => setCurrentSlide((prev) => (prev + 1) % newsletters.length)}
                                                className="w-8 h-8 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-md border border-white/5 text-white transition-all hover:bg-black/40 hover:scale-110 shadow-lg active:scale-95 group/nav"
                                            >
                                                <Icons.ChevronRight className="w-4 h-4 group-hover/nav:translate-x-0.5 transition-transform" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="w-full aspect-video max-h-[420px] rounded-3xl flex flex-col items-center justify-center text-center p-8 border-2 border-dashed"
                                 style={{ 
                                     borderColor: colors.outline + '40',
                                     backgroundColor: colors.surfaceContainerLow
                                 }}>
                                <Icons.News className="w-12 h-12 mb-4 opacity-50" style={{ color: colors.onSurfaceVariant }} />
                                <p className="font-medium" style={{ color: colors.onSurfaceVariant }}>{t('no_news_yet')}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Side Column (Recent) */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold flex items-center gap-3" style={{ color: colors.onSurface }}>
                            <div className="p-2 rounded-lg" style={{ backgroundColor: colors.primaryContainer }}>
                                <Icons.History className="w-5 h-5" style={{ color: colors.onPrimaryContainer }} />
                            </div>
                            {t('jump_back_in')}
                        </h3>
                        <button
                            onClick={() => setActiveTab?.("modpack")}
                            className="text-xs font-bold uppercase tracking-wide hover:underline"
                            style={{ color: colors.primary }}
                        >
                            {t('view_all')}
                        </button>
                    </div>

                    <div className="grid gap-3">
                        {recentInstances.length > 0 ? (
                            recentInstances.map((instance) => (
                                <button
                                    key={instance.id}
                                    onClick={() => { setSelectedInstance?.(instance); setActiveTab?.("modpack"); }}
                                    className="group relative flex items-center gap-4 p-3 rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-md text-left w-full border"
                                    style={{ 
                                        backgroundColor: colors.surfaceContainerLow,
                                        borderColor: colors.outline + '10'
                                    }}
                                >
                                    <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 shadow-sm group-hover:shadow-md transition-shadow"
                                         style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                        {instance.icon ? (
                                            <img src={instance.icon} alt={instance.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Icons.Modpack className="w-6 h-6 opacity-50" style={{ color: colors.onSurfaceVariant }} />
                                            </div>
                                        )}
                                        {/* Play Overlay */}
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
                                            <Icons.Play className="w-6 h-6 text-white fill-current" />
                                        </div>
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold truncate text-sm mb-0.5 group-hover:text-primary transition-colors" 
                                            style={{ color: colors.onSurface }}>
                                            {instance.name}
                                        </h4>
                                        <div className="flex items-center gap-2 text-xs opacity-70" style={{ color: colors.onSurfaceVariant }}>
                                            <span className="truncate">{instance.loader} {instance.minecraftVersion}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 duration-300">
                                        <Icons.ChevronRight className="w-4 h-4" style={{ color: colors.onSurfaceVariant }} />
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="p-8 rounded-2xl text-center border-2 border-dashed flex flex-col items-center justify-center h-48"
                                 style={{ 
                                     borderColor: colors.outline + '40',
                                     backgroundColor: colors.surfaceContainerLow
                                 }}>
                                <div className="p-3 rounded-full bg-opacity-10 mb-3" style={{ backgroundColor: colors.primary + '20' }}>
                                    <Icons.Controller className="w-6 h-6" style={{ color: colors.primary }} />
                                </div>
                                <p className="text-sm font-medium" style={{ color: colors.onSurfaceVariant }}>
                                    {t('start_your_adventure')}
                                </p>
                                <button 
                                    onClick={() => setActiveTab?.("modpack")}
                                    className="mt-3 text-xs px-3 py-1.5 rounded-lg border hover:bg-opacity-10 transition-colors"
                                    style={{ 
                                        borderColor: colors.primary,
                                        color: colors.primary
                                    }}
                                >
                                    {t('browse_modpacks')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* News Modal */}
            {selectedNews && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                     onClick={() => setSelectedNews(null)}>
                    <div className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-3xl p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 border"
                         style={{ 
                             backgroundColor: colors.surfaceContainer,
                             borderColor: colors.outline + '40'
                         }}
                         onClick={(e) => e.stopPropagation()}>
                        
                        <div className="absolute top-0 right-0 p-6 z-10">
                            <button 
                                className="p-2 rounded-full transition-all border"
                                style={{ 
                                    backgroundColor: colors.surfaceContainerHighest,
                                    borderColor: colors.outline + '20',
                                    color: colors.onSurfaceVariant
                                }}
                                onClick={() => setSelectedNews(null)}>
                                <Icons.X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="mb-8">
                             {selectedNews.imageUrl && (
                                <div className="w-full aspect-video rounded-2xl overflow-hidden mb-6 shadow-lg border relative group"
                                     style={{ borderColor: colors.outline + '20' }}>
                                    <div className="absolute inset-0 opacity-60"
                                         style={{ background: `linear-gradient(to top, ${colors.surfaceContainer}, transparent)` }} />
                                    <img src={selectedNews.imageUrl} alt={selectedNews.subject} className="w-full h-full object-cover" />
                                </div>
                            )}
                            <div className="flex items-center gap-3 mb-4">
                                <span className="text-sm font-medium" style={{ color: colors.onSurfaceVariant }}>
                                    {new Date(selectedNews.sentAt || selectedNews.createdAt).toLocaleDateString(language === "th" ? "th-TH" : "en-US", { dateStyle: 'long' })}
                                </span>
                            </div>
                            <h2 className="text-3xl md:text-4xl font-bold leading-tight mb-2" style={{ color: colors.onSurface }}>
                                {selectedNews.subject}
                            </h2>
                        </div>
                        
                        <div style={{ color: colors.onSurfaceVariant }}>
                            <SimpleMarkdown
                                content={selectedNews.content}
                                className="text-[15px] leading-relaxed"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
