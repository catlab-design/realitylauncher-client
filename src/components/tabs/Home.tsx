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
    tag?: string;
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

const stagedRevealStyle = (delay: number) => ({
    animationDelay: `${delay}ms`,
    opacity: 0,
});

// Header: greeting on the left, a plain readable date/time on the right. The
// A soft time-of-day scene rendered behind the header content. Purely
// decorative and low-opacity so it tints the card without hurting text
// contrast: dawn/day/dusk get a warm-to-blue sky gradient + a sun; night gets
// a deep gradient + a moon and a few stars.
type Phase = "dawn" | "day" | "dusk" | "night";

function phaseForHour(hour: number): Phase {
    if (hour >= 5 && hour < 8) return "dawn";
    if (hour >= 8 && hour < 17) return "day";
    if (hour >= 17 && hour < 20) return "dusk";
    return "night";
}

const PHASE_GRADIENT: Record<Phase, string> = {
    dawn: "linear-gradient(120deg, #f9a86b 0%, #f6c99a 35%, #8fb8e0 100%)",
    day: "linear-gradient(120deg, #4a9fe0 0%, #7cc0f0 45%, #bfe3f7 100%)",
    dusk: "linear-gradient(120deg, #3a3a7a 0%, #b5568a 55%, #f2955c 100%)",
    night: "linear-gradient(120deg, #0b1230 0%, #1a2352 55%, #2c3470 100%)",
};

const TimeScene = React.memo(({ hour }: { hour: number }) => {
    const phase = phaseForHour(hour);
    const isNight = phase === "night";
    const isDay = phase === "day";
    const isSun = phase === "dawn" || phase === "day" || phase === "dusk";

    // Deterministic star field so it doesn't jitter on each re-render.
    const stars = React.useMemo(
        () =>
            Array.from({ length: 14 }, (_, i) => ({
                top: `${(i * 37) % 80 + 4}%`,
                left: `${(i * 53) % 92 + 3}%`,
                size: (i % 3) + 1,
                delay: `${(i % 5) * 0.6}s`,
            })),
        [],
    );

    const leaves = React.useMemo(
        () =>
            Array.from({ length: 7 }, (_, i) => ({
                left: `${(i * 41) % 90 + 4}%`,
                duration: `${7 + (i % 4) * 2}s`,
                delay: `${(i * 1.7) % 6}s`,
                size: 8 + (i % 3) * 3,
                hue: ["#e8a54c", "#d98236", "#c9b037", "#b5702e"][i % 4],
            })),
        [],
    );

    const comets = React.useMemo(
        () => [
            { top: "6%", right: "8%", tailLen: 100, duration: "6s", delay: "0s", hue: "#b8d4ff" },
            { top: "32%", right: "45%", tailLen: 80, duration: "5s", delay: "5s", hue: "#d4e8ff" },
        ],
        [],
    );

    return (
        <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none overflow-hidden transition-[background] duration-1000"
            style={{ background: PHASE_GRADIENT[phase] }}
        >
            {isSun && (
                <div
                    className="absolute rounded-full blur-xl"
                    style={{
                        width: 120,
                        height: 120,
                        top: phase === "day" ? "-30px" : "10px",
                        right: "12%",
                        background: phase === "dusk"
                            ? "radial-gradient(circle, #ffcf5e, #ff8a3d 58%, transparent 72%)"
                            : "radial-gradient(circle, #fff0a6, #ffc12e 52%, transparent 72%)",
                    }}
                />
            )}

            {isDay && leaves.map((l, i) => (
                <span
                    key={i}
                    className="absolute animate-leaf"
                    style={{
                        top: "-16px",
                        left: l.left,
                        width: l.size,
                        height: l.size,
                        borderRadius: "0 100% 0 100%",
                        backgroundColor: l.hue,
                        animationDuration: l.duration,
                        animationDelay: l.delay,
                    }}
                />
            ))}

            {isNight && (
                <>
                    <div
                        className="absolute rounded-full blur-md"
                        style={{
                            width: 70,
                            height: 70,
                            top: "12px",
                            right: "14%",
                            background: "radial-gradient(circle at 38% 38%, #f4f6ff, #c9d2f0 55%, transparent 72%)",
                        }}
                    />
                    {stars.map((s, i) => (
                        <span
                            key={i}
                            className="absolute rounded-full bg-white animate-pulse"
                            style={{ top: s.top, left: s.left, width: s.size, height: s.size, animationDelay: s.delay }}
                        />
                    ))}
                    {comets.map((c, i) => (
                        <div
                            key={i}
                            className="absolute animate-comet"
                            style={{
                                top: c.top,
                                right: c.right,
                                animationDuration: c.duration,
                                animationDelay: c.delay,
                            }}
                        >
                            <div style={{
                                position: "absolute",
                                right: 0,
                                top: "50%",
                                width: 6,
                                height: 6,
                                marginTop: -3,
                                borderRadius: "50%",
                                background: c.hue,
                                boxShadow: `0 0 12px 4px ${c.hue}, 0 0 24px 8px rgba(255,255,255,0.4)`,
                            }} />
                            <div style={{
                                width: c.tailLen,
                                height: 2,
                                borderRadius: "9999px",
                                background: `linear-gradient(90deg, transparent 0%, ${c.hue}15 20%, ${c.hue}60 60%, ${c.hue} 100%)`,
                            }} />
                        </div>
                    ))}
                </>
            )}

        </div>
    );
});

const HomeHeader = React.memo(({ session, colors, language }: { session: any, colors: any, language: string }) => {
    const { t } = useTranslation(language as any);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isHoveringClock, setIsHoveringClock] = useState(false);
    const mousePos = useRef({ x: 0, y: 0 });
    const tooltipRef = useRef<HTMLDivElement>(null);

    // Follow the cursor by writing transform straight to the DOM node — avoids a
    // React re-render per mousemove.
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        mousePos.current = { x: e.clientX, y: e.clientY };
        if (tooltipRef.current) {
            tooltipRef.current.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;
        }
    }, []);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const hour = currentTime.getHours();
    const greeting = hour < 12 ? t('good_morning') : hour < 18 ? t('good_afternoon') : t('good_evening');
    const locale = language === "th" ? "th-TH" : "en-US";

    return (
        <>
        {isHoveringClock && createPortal(
            <div
                ref={tooltipRef}
                className="fixed top-0 left-0 z-50 pointer-events-none px-3 py-1.5 rounded-lg text-sm font-bold border animate-in fade-in zoom-in duration-150 transition-none will-change-transform"
                style={{
                    transform: `translate(${mousePos.current.x + 12}px, ${mousePos.current.y + 12}px)`,
                    backgroundColor: colors.surfaceContainerHighest,
                    color: colors.onSurface,
                    borderColor: colors.outline + '40',
                }}
            >
                {currentTime.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })}
            </div>,
            document.body
        )}
        <header
            className="relative overflow-hidden rounded-2xl px-6 py-5 animate-fade-in border border-white/10"
            style={stagedRevealStyle(20)}
        >
            <TimeScene hour={hour} />

            <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.08) 45%, transparent 100%)" }} />

            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
                <div className="flex items-center gap-4 min-w-0">
                    {session ? (
                        <div className="relative shrink-0">
                            <div className="rounded-full overflow-hidden border-2 border-white/40 bg-black/20">
                                <MCHead
                                    username={session.username}
                                    size={72}
                                    className="rounded-full"
                                />
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-4 border-black/40 flex items-center justify-center bg-[#10B981]">
                                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            </div>
                        </div>
                    ) : (
                        <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center shrink-0 bg-black/25 border-2 border-white/30">
                            <Icons.Person className="w-9 h-9 text-white/70" />
                        </div>
                    )}

                    <div className="min-w-0">
                        <h1 className="text-3xl font-bold tracking-tight truncate text-white">
                            {session ? (
                                <>
                                    {greeting},{" "}
                                    <span style={{ color: '#FCD34D' }}>
                                        {session.username}
                                    </span>
                                </>
                            ) : (
                                t('welcome_guest')
                            )}
                        </h1>
                        <p className="text-base mt-1.5 flex items-center gap-2 text-white/85">
                            {session ? (
                                <>
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                                        {t('online_badge')}
                                    </span>
                                    <span className="opacity-50">·</span>
                                    <span className="opacity-80">{t('ready_to_play')}</span>
                                </>
                            ) : (
                                <span className="opacity-80">{t('please_login_full')}</span>
                            )}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4 self-stretch sm:self-auto">
                    <div
                        className="relative w-12 h-12 shrink-0 cursor-default"
                        onMouseEnter={() => setIsHoveringClock(true)}
                        onMouseLeave={() => setIsHoveringClock(false)}
                        onMouseMove={handleMouseMove}
                    >
                        <svg viewBox="0 0 24 24" className="w-full h-full drop-shadow-md">
                            <circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.35)" strokeWidth="0.5" />
                            <line x1="12" y1="12" x2="12" y2="7" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round"
                                transform={`rotate(${(currentTime.getHours() % 12) * 30 + currentTime.getMinutes() * 0.5} 12 12)`} />
                            <line x1="12" y1="12" x2="12" y2="4" stroke="#7cc0f0" strokeWidth="2" strokeLinecap="round"
                                transform={`rotate(${currentTime.getMinutes() * 6} 12 12)`} />
                            <line x1="12" y1="12" x2="12" y2="3" stroke="#FBBF24" strokeWidth="1.5" strokeLinecap="round"
                                transform={`rotate(${currentTime.getSeconds() * 6} 12 12)`} />
                            <circle cx="12" cy="12" r="1.5" fill="#ffffff" />
                        </svg>
                    </div>
                    <div className="leading-tight text-left sm:text-right">
                        <p className="text-base font-semibold text-white" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
                            {currentTime.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                        <p className="text-xs font-bold uppercase tracking-[0.15em] mt-1 text-[#FCD34D]" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
                            {currentTime.getFullYear()} · REALITY
                        </p>
                    </div>
                </div>
            </div>
        </header>
        </>
    );
});

const SectionHeading = ({ icon, title, colors, action }: { icon: React.ReactNode; title: string; colors: any; action?: React.ReactNode }) => (
    <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2.5" style={{ color: colors.onSurface }}>
            <span style={{ color: colors.onSurfaceVariant }}>{icon}</span>
            {title}
        </h3>
        {action}
    </div>
);

export function Home({
    session,
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
    const RECENT_CACHE_KEY = "launcher-recent-instances-v1";
    // Seed from cache synchronously so the section paints on first render
    // instead of flashing the "Start your adventure" empty state while the
    // async instancesList() call resolves. `recentLoaded` gates the empty
    // state until a real load has finished — a fresh (uncached) user still
    // sees it, but a returning user never sees the flash.
    const cachedRecent = (() => {
        try {
            const cached = localStorage.getItem(RECENT_CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed)) return parsed as GameInstance[];
            }
        } catch {
        }
        return [] as GameInstance[];
    })();
    const [recentInstances, setRecentInstances] = useState<GameInstance[]>(cachedRecent);
    const [recentLoaded, setRecentLoaded] = useState(cachedRecent.length > 0);
    const [selectedNews, setSelectedNews] = useState<Newsletter | null>(null);
    const NEWSLETTER_CACHE_KEY = "launcher-newsletters-v1";
    const NEWSLETTER_CACHE_TTL_MS = 5 * 60 * 1000;

    const fetchNewsletters = useCallback(async (force = false) => {
        if (!force) {
            try {
                const cached = localStorage.getItem(NEWSLETTER_CACHE_KEY);
                if (cached) {
                    const parsed = JSON.parse(cached) as {
                        timestamp: number;
                        newsletters: Newsletter[];
                    };
                    if (
                        parsed?.timestamp &&
                        Date.now() - parsed.timestamp < NEWSLETTER_CACHE_TTL_MS &&
                        Array.isArray(parsed.newsletters)
                    ) {
                        setNewsletters(parsed.newsletters);
                        setNewsletterLoading(false);
                        return;
                    }
                }
            } catch {
            }
        }

        try {
            const res = await fetch("https://api.reality.catlabdesign.space/newsletter/list");
            if (res.ok) {
                const data = await res.json();
                const list = data.newsletters || [];
                setNewsletters(list);
                localStorage.setItem(
                    NEWSLETTER_CACHE_KEY,
                    JSON.stringify({
                        timestamp: Date.now(),
                        newsletters: list,
                    }),
                );
            }
        } catch {
        } finally {
            setNewsletterLoading(false);
        }
    }, [NEWSLETTER_CACHE_KEY]);

    useEffect(() => {
        fetchNewsletters();
        const interval = setInterval(() => fetchNewsletters(true), 300000);
        return () => clearInterval(interval);
    }, [fetchNewsletters]);

    useEffect(() => {
        if (newsletters.length <= 1) return;
        const delay = isHovering ? 20000 : 6000;
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
                        .slice(0, 5);
                    setRecentInstances(sorted);
                    try {
                        localStorage.setItem(RECENT_CACHE_KEY, JSON.stringify(sorted));
                    } catch {
                    }
                }
            } catch {
            } finally {
                setRecentLoaded(true);
            }
        };
        loadRecentInstances();
        const onFocus = () => loadRecentInstances();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, []);

    return (
        <div className="space-y-6 pb-10">
            <HomeHeader session={session} colors={colors} language={language} />

            <div className="flex flex-col lg:flex-row gap-6 items-start w-full max-w-[1450px] mx-auto">
                <div className="w-full lg:flex-1 2xl:max-w-[920px] min-w-0 animate-fade-in" style={stagedRevealStyle(80)}>
                    <SectionHeading
                        icon={<Icons.News className="w-5 h-5" />}
                        title={t('news_feed')}
                        colors={colors}
                    />

                    <div
                        className="relative"
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                    >
                        {newsletterLoading ? (
                            <div className="w-full aspect-[16/9] min-h-[360px] max-h-[600px] rounded-2xl animate-pulse"
                                style={{ backgroundColor: colors.surfaceContainerHighest }} />
                        ) : newsletters.length > 0 ? (
                            <div className="relative w-full aspect-[16/9] min-h-[360px] max-h-[600px] rounded-2xl overflow-hidden shadow-lg"
                                style={{ border: `1px solid ${colors.outline}20` }}>

                                {newsletters.map((item, index) => (
                                    <div
                                        key={item.id}
                                        className={cn(
                                            "absolute inset-0 transition-opacity duration-500 ease-in-out",
                                            index === currentSlide ? "opacity-100 z-10" : "opacity-0 z-0"
                                        )}
                                    >
                                        <BannerImage
                                            src={item.imageUrl}
                                            alt={item.subject}
                                            priority={index === 0 || index === currentSlide}
                                            loading={index === currentSlide || index === (currentSlide + 1) % newsletters.length ? "eager" : "lazy"}
                                            className="absolute inset-0 w-full h-full"
                                        />

                                        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/25 to-transparent" />

                                        {item.tag && (
                                            <div className="absolute top-4 left-4 z-20">
                                                <span className="px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-md text-white text-xs font-semibold">
                                                    {item.tag}
                                                </span>
                                            </div>
                                        )}

                                        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 text-white z-10 pt-16">
                                            <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-white/80 mb-1.5 sm:mb-2 drop-shadow-md">
                                                {new Date(item.sentAt || item.createdAt).toLocaleDateString(language === "th" ? "th-TH" : "en-US", { dateStyle: 'medium' })}
                                            </p>
                                            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-2 sm:mb-2.5 line-clamp-2 leading-tight sm:leading-snug drop-shadow-lg">
                                                {item.subject}
                                            </h2>
                                            <p className="text-sm sm:text-base text-white/90 line-clamp-1 sm:line-clamp-2 leading-relaxed mb-4 sm:mb-5 max-w-3xl drop-shadow-md">
                                                {stripMarkdown(item.content)}
                                            </p>
                                            <button
                                                onClick={() => setSelectedNews(item)}
                                                className="px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/10 transition-all font-semibold text-sm sm:text-base inline-flex items-center gap-1.5 group/btn active:scale-95 shadow-md"
                                            >
                                                {t('read_more')}
                                                <Icons.ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover/btn:translate-x-0.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {newsletters.length > 1 && (
                                    <div className="absolute bottom-6 right-6 z-20 flex items-center gap-2">
                                        <div className="flex gap-1.5 bg-black/30 backdrop-blur-md px-2.5 py-1.5 rounded-full">
                                            {newsletters.map((_, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => setCurrentSlide(idx)}
                                                    aria-label={`Slide ${idx + 1}`}
                                                    className={cn(
                                                        "h-1.5 rounded-full transition-all duration-300",
                                                        idx === currentSlide ? "w-5 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60"
                                                    )}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="w-full aspect-[16/9] min-h-[360px] max-h-[600px] rounded-2xl flex flex-col items-center justify-center text-center p-8"
                                style={{
                                    border: `1px dashed ${colors.outline}40`,
                                    backgroundColor: colors.surfaceContainerLow
                                }}>
                                <Icons.News className="w-10 h-10 mb-3 opacity-40" style={{ color: colors.onSurfaceVariant }} />
                                <p className="text-base font-medium" style={{ color: colors.onSurfaceVariant }}>{t('no_news_yet')}</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="w-full lg:w-80 lg:shrink-0 2xl:flex-1 2xl:max-w-[400px] min-w-0 animate-fade-in" style={stagedRevealStyle(140)}>
                    <SectionHeading
                        icon={<Icons.History className="w-5 h-5" />}
                        title={t('jump_back_in')}
                        colors={colors}
                        action={
                            recentInstances.length > 0 ? (
                                <button
                                    onClick={() => setActiveTab?.("modpack")}
                                    className="text-sm font-semibold hover:underline"
                                    style={{ color: colors.primary }}
                                >
                                    {t('view_all')}
                                </button>
                            ) : undefined
                        }
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                        {recentInstances.length > 0 ? (
                            recentInstances.map((instance) => (
                                <button
                                    key={instance.id}
                                    onClick={() => { setSelectedInstance?.(instance); setActiveTab?.("modpack"); }}
                                    className="group relative flex items-center gap-3 p-3 rounded-xl text-left w-full overflow-hidden"
                                    style={{ backgroundColor: colors.surfaceContainerLow, minHeight: "68px" }}
                                >
                                    <img
                                        src={instance.banner || './banner.png'}
                                        alt=""
                                        aria-hidden="true"
                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        style={{
                                            maskImage: "linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.8) 60%, rgba(0,0,0,1) 100%)",
                                            WebkitMaskImage: "linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.8) 60%, rgba(0,0,0,1) 100%)",
                                        }}
                                    />
                                    <div className="absolute inset-0 bg-black/35 group-hover:bg-black/25 transition-colors" />

                                    <div className="relative z-10 w-12 h-12 rounded-lg overflow-hidden shrink-0"
                                        style={{ backgroundColor: instance.icon ? 'transparent' : colors.surfaceContainerHighest }}>
                                        {instance.icon ? (
                                            <img src={instance.icon} alt={instance.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Icons.Modpack className="w-6 h-6 opacity-70 text-white" />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Icons.Play className="w-5 h-5 text-white fill-current" />
                                        </div>
                                    </div>

                                    <div className="relative z-10 flex-1 min-w-0">
                                        <h4 className="font-semibold truncate text-sm text-white">
                                            {instance.name}
                                        </h4>
                                        <p className="text-xs truncate mt-0.5 text-white/70">
                                            {instance.loader} {instance.minecraftVersion}
                                        </p>
                                    </div>

                                    <Icons.ChevronRight className="relative z-10 w-5 h-5 shrink-0 text-white/80 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
                                </button>
                            ))
                        ) : !recentLoaded ? (
                            // Loading with no cached data yet — show placeholders
                            // instead of the empty state so it doesn't flash.
                            <>
                                {[0, 1, 2].map((i) => (
                                    <div
                                        key={i}
                                        className="rounded-xl animate-pulse"
                                        style={{ backgroundColor: colors.surfaceContainerLow, height: "68px" }}
                                    />
                                ))}
                            </>
                        ) : (
                            <div className="p-8 rounded-xl text-center flex flex-col items-center justify-center"
                                style={{
                                    border: `1px dashed ${colors.outline}40`,
                                    backgroundColor: colors.surfaceContainerLow
                                }}>
                                <div className="p-3 rounded-full mb-3" style={{ backgroundColor: colors.primary + '1a' }}>
                                    <Icons.Controller className="w-6 h-6" style={{ color: colors.primary }} />
                                </div>
                                <p className="text-base font-medium mb-3" style={{ color: colors.onSurfaceVariant }}>
                                    {t('start_your_adventure')}
                                </p>
                                <button
                                    onClick={() => setActiveTab?.("modpack")}
                                    className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors hover:brightness-110"
                                    style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                                >
                                    {t('browse_modpacks')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {selectedNews && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setSelectedNews(null)}>
                    <div className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-3xl p-8 animate-in fade-in zoom-in-95 duration-200 border"
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
                                <div className="w-full aspect-video rounded-2xl overflow-hidden mb-6 border relative"
                                    style={{ borderColor: colors.outline + '20' }}>
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
