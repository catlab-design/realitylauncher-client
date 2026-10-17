import React, { useState, useEffect, useCallback, useMemo } from "react";
import appBanner from "../../assets/banner.png";
import { type AuthSession, type NewsItem, type Server, type GameInstance } from "../../types/launcher";
import { Icons } from "../ui/Icons";
import { useTranslation } from "../../hooks/useTranslation";
import SimpleMarkdown from "../ui/SimpleMarkdown";
import { getLoaderLabel } from "./ModPackTabs/helpers";
import { useUiStore } from "../../store/uiStore";

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

// Joined server list survives tab switches so the section paints on the first frame.
let _joinedServersCache: Server[] | null = null;

const INSTANCES_CACHE_KEY = "launcher-home-instances-v2";
const NEWSLETTER_CACHE_KEY = "launcher-newsletters-v1";
const NEWSLETTER_CACHE_TTL_MS = 5 * 60 * 1000;
const JUMP_IN_COUNT = 4;
const NEWS_COUNT = 5;
const NEWS_AUTOPLAY_MS = 6000;

type T = ReturnType<typeof useTranslation>["t"];

function timeAgo(iso: string | undefined, t: T): string {
    if (!iso) return "";
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return t("just_now");
    if (mins < 60) return t("minutes_ago", { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t("hours_ago", { count: hours });
    return t("days_ago", { count: Math.floor(hours / 24) });
}

const byLastPlayed = (a: GameInstance, b: GameInstance) =>
    new Date(b.lastPlayedAt || 0).getTime() - new Date(a.lastPlayedAt || 0).getTime();

function stripMarkdown(md: string): string {
    return md
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/!\[.*?\]\(.*?\)/g, " ")
        .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
        .replace(/[#>*_`~\-+|]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

const InstanceIcon = ({ instance, colors, className }: { instance: GameInstance; colors: any; className: string }) => (
    <div
        className={`overflow-hidden shrink-0 flex items-center justify-center ${className}`}
        style={{ backgroundColor: colors.surfaceContainerHighest }}
    >
        {instance.icon ? (
            <img src={instance.icon} alt="" className="w-full h-full object-cover" />
        ) : (
            <Icons.Modpack className="w-1/3 h-1/3" style={{ color: colors.onSurfaceVariant }} />
        )}
    </div>
);

/** One "Jump in" row: icon, name, loader · last played, a labelled Play button. */
function JumpRow({ instance, colors, t, onPlay, onOpen }: {
    instance: GameInstance;
    colors: any;
    t: T;
    onPlay: () => void;
    onOpen: () => void;
}) {
    return (
        <div
            onClick={onOpen}
            className="group flex items-center gap-3.5 p-3 rounded-xl border cursor-pointer transition-colors"
            style={{ backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant }}
        >
            <InstanceIcon instance={instance} colors={colors} className="w-12 h-12 rounded-lg" />
            <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold leading-snug truncate" style={{ color: colors.onSurface }}>{instance.name}</p>
                <p className="text-[13px] mt-0.5 truncate" style={{ color: colors.onSurfaceVariant }}>
                    {getLoaderLabel(instance.loader)} {instance.minecraftVersion}
                    {instance.lastPlayedAt ? <span className="opacity-70"> · {timeAgo(instance.lastPlayedAt, t)}</span> : null}
                </p>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); onPlay(); }}
                className="h-9 pl-3 pr-4 rounded-lg flex items-center gap-1.5 text-sm font-bold shrink-0 transition hover:brightness-110 active:scale-[0.97]"
                style={{ backgroundColor: colors.secondary, color: "#111" }}
            >
                <Icons.Play className="w-4 h-4 fill-current" />
                {t("play")}
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); onOpen(); }}
                aria-label={t("open_instance")}
                className="w-8 h-9 rounded-lg flex items-center justify-center shrink-0 transition hover:bg-white/5"
                style={{ color: colors.onSurfaceVariant }}
            >
                <Icons.ChevronRight className="w-4 h-4" />
            </button>
        </div>
    );
}

/** Pack card, same look as the Modpacks page: banner, logo + name, then actions. */
function PackCard({ banner, icon, name, meta, colors, onOpen, dimArt, actions }: {
    banner: string;
    icon?: string | null;
    name: string;
    meta: React.ReactNode;
    colors: any;
    onOpen?: () => void;
    dimArt?: boolean;
    actions: React.ReactNode;
}) {
    return (
        <div
            onClick={onOpen}
            className={`group rounded-2xl overflow-hidden flex flex-col transition hover:-translate-y-0.5 ${onOpen ? "cursor-pointer" : ""}`}
            style={{ backgroundColor: colors.surfaceContainer }}
        >
            <div className="relative aspect-16/7 overflow-hidden" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                <img
                    src={banner}
                    alt=""
                    aria-hidden="true"
                    className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${dimArt ? "grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100" : ""}`}
                />
                <div className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent" />
            </div>

            <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-14 h-14 shrink-0 flex items-center justify-center">
                        {icon ? (
                            <img src={icon} alt={name} className="w-full h-full object-contain" />
                        ) : (
                            <Icons.Modpack className="w-6 h-6" style={{ color: colors.onSurfaceVariant }} />
                        )}
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold leading-snug truncate" style={{ color: colors.onSurface }}>{name}</h3>
                        <p className="text-sm mt-0.5 truncate" style={{ color: colors.onSurfaceVariant }}>{meta}</p>
                    </div>
                </div>
                <div className="flex gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                    {actions}
                </div>
            </div>
        </div>
    );
}

/** Compact shelf card: banner art, logo + name over a fade, one action button. */
function ShelfCard({ banner, icon, name, meta, dimArt, onOpen, actionLabel, actionIcon, onAction, colors }: {
    banner: string;
    icon?: string | null;
    name: string;
    meta: React.ReactNode;
    dimArt?: boolean;
    onOpen?: () => void;
    actionLabel: string;
    actionIcon: React.ReactNode;
    onAction: () => void;
    colors: any;
}) {
    return (
        <div
            onClick={onOpen}
            className={`group relative w-full h-56 rounded-2xl overflow-hidden transition hover:-translate-y-0.5 ${onOpen ? "cursor-pointer" : ""}`}
            style={{ backgroundColor: colors.surfaceContainerHighest }}
        >
            <img
                src={banner}
                alt=""
                aria-hidden="true"
                className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${dimArt ? "grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100" : ""}`}
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 flex items-end gap-4">
                <div className="w-14 h-14 shrink-0 flex items-center justify-center">
                    {icon ? <img src={icon} alt="" className="w-full h-full object-contain drop-shadow-lg" /> : <Icons.Modpack className="w-6 h-6 text-white/80" />}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-xl font-bold text-white leading-snug truncate">{name}</p>
                    <p className="text-base text-white/70 truncate">{meta}</p>
                </div>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onAction(); }}
                    aria-label={actionLabel}
                    title={actionLabel}
                    className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-lg transition hover:scale-105 active:scale-95"
                    style={{ backgroundColor: colors.secondary, color: "#111" }}
                >
                    {actionIcon}
                </button>
            </div>
        </div>
    );
}

export function Home({ session, servers, setSelectedServer, setSelectedInstance, colors, setActiveTab, language }: HomeProps) {
    const { t } = useTranslation(language as any);
    const setPendingLaunchId = useUiStore((state) => state.setPendingLaunchId);
    const setImmersive = useUiStore((state) => state.setImmersive);
    const setFullBleed = useUiStore((state) => state.setFullBleed);
    const heroRef = React.useRef<HTMLElement>(null);
    useEffect(() => {
        setFullBleed(true);
        setImmersive(true);
        const scroller = heroRef.current?.closest("main");
        const onScroll = () => {
            const hero = heroRef.current;
            if (!hero || !scroller) return;
            // White bar text only while the hero art is still under the bar.
            setImmersive(scroller.scrollTop < hero.offsetHeight - 48);
        };
        scroller?.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            scroller?.removeEventListener("scroll", onScroll);
            setImmersive(false);
            setFullBleed(false);
        };
    }, [setImmersive, setFullBleed]);
    const openModal = useUiStore((state) => state.openModal);
    const locale = language === "th" ? "th-TH" : "en-US";

    const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
    const [newsletterLoading, setNewsletterLoading] = useState(true);
    const [selectedNews, setSelectedNews] = useState<Newsletter | null>(null);
    const [newsIndex, setNewsIndex] = useState(0);
    const [newsPaused, setNewsPaused] = useState(false);
    const [jumpOpen, setJumpOpen] = useState(true);
    const [loader, setLoader] = useState<string>("all");

    // All instances (cached so the page paints on the first frame).
    const [instances, setInstances] = useState<GameInstance[]>(() => {
        try {
            const parsed = JSON.parse(localStorage.getItem(INSTANCES_CACHE_KEY) || "[]");
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });
    const [instancesLoaded, setInstancesLoaded] = useState(instances.length > 0);

    const fetchNewsletters = useCallback(async (force = false) => {
        if (!force) {
            try {
                const cached = JSON.parse(localStorage.getItem(NEWSLETTER_CACHE_KEY) || "null");
                if (cached?.timestamp && Date.now() - cached.timestamp < NEWSLETTER_CACHE_TTL_MS && Array.isArray(cached.newsletters)) {
                    setNewsletters(cached.newsletters);
                    setNewsletterLoading(false);
                    return;
                }
            } catch {
            }
        }
        try {
            const res = await fetch("https://api.reality.catlabdesign.space/newsletter/list");
            if (res.ok) {
                const list = (await res.json()).newsletters || [];
                setNewsletters(list);
                localStorage.setItem(NEWSLETTER_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), newsletters: list }));
            }
        } catch {
        } finally {
            setNewsletterLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchNewsletters();
        const interval = setInterval(() => fetchNewsletters(true), 300000);
        return () => clearInterval(interval);
    }, [fetchNewsletters]);

    useEffect(() => {
        const load = async () => {
            try {
                const list = await window.api?.instancesList?.();
                if (list) {
                    setInstances(list);
                    try {
                        localStorage.setItem(INSTANCES_CACHE_KEY, JSON.stringify(list));
                    } catch {
                    }
                }
            } catch {
            } finally {
                setInstancesLoaded(true);
            }
        };
        load();
        window.addEventListener("focus", load);
        return () => window.removeEventListener("focus", load);
    }, []);

    const openInstance = (instance: GameInstance) => {
        setSelectedInstance?.(instance);
        setActiveTab?.("modpack");
    };
    // Launching goes through the Modpack tab's normal flow (account switch, Java, progress).
    const playInstance = (instance: GameInstance) => {
        setSelectedInstance?.(instance);
        setPendingLaunchId(instance.id);
        setActiveTab?.("modpack");
    };
    const openServer = (server: Server) => {
        setSelectedServer(server);
        setActiveTab?.("servers");
    };

    const jumpIn = useMemo(
        () => instances.filter((i) => i.lastPlayedAt).sort(byLastPlayed).slice(0, JUMP_IN_COUNT),
        [instances],
    );

    const [joinedServers, setJoinedServers] = useState<Server[]>(_joinedServersCache ?? []);
    const [loadingServers, setLoadingServers] = useState(false);
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (_joinedServersCache === null) setLoadingServers(true);
            try {
                const result = await (window.api as any)?.instancesGetJoinedServers?.();
                if (!cancelled && result?.ok && result.data) {
                    const merged: Server[] = [...(result.data.owned || []), ...(result.data.member || [])];
                    const unique = merged.filter((v, i, all) => all.findIndex((x) => x.id === v.id) === i);
                    _joinedServersCache = unique;
                    setJoinedServers(unique);
                }
            } catch {
            } finally {
                if (!cancelled) setLoadingServers(false);
            }
        };
        load();
        window.addEventListener("focus", load);
        return () => { cancelled = true; window.removeEventListener("focus", load); };
    }, [session?.username]);

    const serverInstanceByCloudId = useMemo(() => {
        const map = new Map<string, GameInstance>();
        for (const instance of instances) if (instance.cloudId) map.set(instance.cloudId, instance);
        return map;
    }, [instances]);

    const setPendingInstallServerId = useUiStore((state) => state.setPendingInstallServerId);
    const setPendingServerDetailId = useUiStore((state) => state.setPendingServerDetailId);
    // A server pack opens that server's page (same one as in the Servers tab).
    const openServerDetail = (server: Server) => {
        setPendingServerDetailId(server.id);
        setSelectedServer(server);
        setActiveTab?.("servers");
    };
    const installServerPack = (server: Server) => {
        setPendingInstallServerId(server.storagePath || server.id);
        setActiveTab?.("modpack");
    };

    const iconButton = "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition hover:brightness-95 active:scale-95";
    const iconButtonStyle = { backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface };
    const playActions = (instance: GameInstance) => (
        <>
            <button
                type="button"
                onClick={() => playInstance(instance)}
                className="flex-1 h-10 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition hover:brightness-105 active:scale-[0.98]"
                style={{ backgroundColor: colors.secondary, color: "#111" }}
            >
                <Icons.Play className="w-4 h-4 fill-current" />
                {t("play")}
            </button>
            <button type="button" onClick={() => { void window.api?.instancesOpenFolder?.(instance.id); }} className={iconButton} style={iconButtonStyle} title={t("open_folder")}>
                <Icons.Folder className="w-4.5 h-4.5" />
            </button>
            <button type="button" onClick={() => openInstance(instance)} className={iconButton} style={iconButtonStyle} title={t("open_instance")}>
                <Icons.ChevronRight className="w-4.5 h-4.5" />
            </button>
        </>
    );

    // Server packs sit in the same grid; with a loader filter on, only installed packs of that loader stay.
    const serverPacks = useMemo(
        () => joinedServers
            .map((server) => ({ server, installed: serverInstanceByCloudId.get(server.id) }))
            .filter(({ installed }) => loader === "all" || installed?.loader === loader),
        [joinedServers, serverInstanceByCloudId, loader],
    );

    const loaders = useMemo(() => Array.from(new Set(instances.map((i) => i.loader))).filter(Boolean), [instances]);

    const library = useMemo(() => {
        const list = instances.filter((i) => !i.cloudId && (loader === "all" || i.loader === loader));
        return list.sort(byLastPlayed);
    }, [instances, loader]);

    // The rail shows one news item at a time and cycles through the latest few.
    const featuredNews = newsletters.slice(0, NEWS_COUNT);
    const currentNews = featuredNews[Math.min(newsIndex, Math.max(featuredNews.length - 1, 0))] || null;

    useEffect(() => {
        setNewsIndex(0);
    }, [newsletters.length]);

    useEffect(() => {
        if (newsPaused || featuredNews.length < 2) return;
        const id = setInterval(() => setNewsIndex((i) => (i + 1) % featuredNews.length), NEWS_AUTOPLAY_MS);
        return () => clearInterval(id);
    }, [newsPaused, featuredNews.length, newsIndex]);

    const lastPlayed = jumpIn[0];
    // News reader: step through all newsletters, arrow keys too.
    const selectedNewsIndex = selectedNews ? Math.max(0, newsletters.findIndex((n) => n.id === selectedNews.id)) : -1;
    const stepNews = (dir: 1 | -1) => {
        if (!newsletters.length || selectedNewsIndex < 0) return;
        setSelectedNews(newsletters[(selectedNewsIndex + dir + newsletters.length) % newsletters.length]);
    };
    useEffect(() => {
        if (!selectedNews) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft") stepNews(-1);
            else if (e.key === "ArrowRight") stepNews(1);
            else if (e.key === "Escape") setSelectedNews(null);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    const onlineNow = servers.reduce((sum, s) => sum + (s.players?.online ?? s.playerCount ?? 0), 0);
    const newsDate = (n: Newsletter) => new Date(n.sentAt || n.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

    const pill = (active: boolean) => ({
        backgroundColor: active ? colors.surfaceContainerHighest : colors.surfaceContainer,
        borderColor: "transparent",
        color: active ? colors.onSurface : colors.onSurfaceVariant,
    });

    return (
        // Bleed past <main>'s padding so the hero art runs edge to edge.
        <div className="-mx-6 -mt-3 -mb-6 relative overflow-hidden">
            {/* Hero: the news is the backdrop; greeting bottom-left, news card bottom-right. */}
            <section ref={heroRef} className="relative h-[clamp(26rem,66vh,42rem)] overflow-hidden" style={{ backgroundColor: "#000" }}>
                {featuredNews.some((n) => n.imageUrl) ? (
                    // Every slide stays mounted and only opacity changes, so the swap is a crossfade with no flash.
                    featuredNews.map((n, i) => n.imageUrl && (
                        <img
                            key={n.id}
                            src={n.imageUrl}
                            alt=""
                            aria-hidden="true"
                            className="absolute inset-0 w-full h-full object-cover scale-125 blur-3xl transition-opacity duration-1000 ease-out"
                            style={{ opacity: i === newsIndex ? 0.75 : 0 }}
                        />
                    ))
                ) : (
                    <img src={lastPlayed?.banner || appBanner} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-90" />
                )}
                <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-black/20" />
                <div className="absolute inset-0 bg-linear-to-r from-black/45 via-transparent to-transparent" />
                {/* Keeps the floating title bar readable over bright art. */}
                <div className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-black/45 to-transparent" />

                {/* Billboard: one big rounded banner for the current news story. */}
                <div className="relative h-full pt-10 pb-8">
                    <div
                        className="group/bb relative h-full w-full overflow-hidden bg-black/40 cursor-pointer"
                        onClick={() => currentNews && setSelectedNews(currentNews)}
                        onMouseEnter={() => setNewsPaused(true)}
                        onMouseLeave={() => setNewsPaused(false)}
                    >
                        {featuredNews.map((n, i) => (
                            n.imageUrl ? (
                                <img
                                    key={n.id}
                                    src={n.imageUrl}
                                    alt=""
                                    aria-hidden="true"
                                    className="absolute inset-0 w-full h-full object-cover transition-all duration-1000 ease-out group-hover/bb:scale-[1.02]"
                                    style={{ opacity: i === newsIndex ? 1 : 0 }}
                                />
                            ) : null
                        ))}
                        {!featuredNews.some((n) => n.imageUrl) && (
                            <img src={lastPlayed?.banner || appBanner} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
                        )}
                        {/* Text side shade only; the rest of the art stays clean. */}
                        <div className="absolute inset-0 bg-linear-to-r from-black/80 via-black/35 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/50 to-transparent" />

                        {currentNews ? (
                            <div key={currentNews.id} className="absolute left-0 bottom-0 px-8 pb-48 lg:pb-32 max-w-xl xl:max-w-2xl animate-fade-in">
                                <div className="flex items-center gap-2 text-sm text-white/80">
                                    {currentNews.tag && (
                                        <span className="h-7 px-3 rounded-full flex items-center font-semibold bg-white/15 backdrop-blur-md text-white">{currentNews.tag}</span>
                                    )}
                                    <span>{newsDate(currentNews)}</span>
                                </div>
                                <h2 className="font-display text-white text-3xl xl:text-5xl leading-[1.1] line-clamp-2 mt-3">{stripMarkdown(currentNews.subject)}</h2>
                                <p className="text-base xl:text-lg text-white/80 leading-relaxed line-clamp-2 mt-3">{stripMarkdown(currentNews.content).slice(0, 200)}</p>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setSelectedNews(currentNews); }}
                                    className="mt-5 h-11 px-6 rounded-full text-[15px] font-bold inline-flex items-center gap-2 transition hover:brightness-105 active:scale-[0.98]"
                                    style={{ backgroundColor: colors.secondary, color: "#111" }}
                                >
                                    {t("read_more")}
                                    <Icons.ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        ) : newsletterLoading ? null : (
                            <div className="absolute left-0 bottom-0 px-8 pb-48 lg:pb-32">
                                <p className="font-display text-white text-3xl">{t("no_news_yet")}</p>
                            </div>
                        )}

                        {/* Slide controls: dots bottom-right. */}
                        {featuredNews.length > 1 && (
                            <>
                                <div className="absolute right-8 bottom-50 lg:bottom-34 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                    {featuredNews.map((n, i) => (
                                        <button
                                            key={n.id}
                                            onClick={() => setNewsIndex(i)}
                                            aria-label={`${i + 1}`}
                                            className="h-2 rounded-full transition-all duration-300"
                                            style={{ width: i === newsIndex ? 24 : 8, backgroundColor: i === newsIndex ? "#fff" : "rgba(255,255,255,0.4)" }}
                                        />
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Quick links: glass tiles along the bottom of the hero. */}
                        <nav
                            className="absolute inset-x-8 bottom-6 z-10 grid grid-cols-2 lg:grid-cols-4 gap-3"
                            onClick={(e) => e.stopPropagation()}
                            onMouseEnter={() => setNewsPaused(true)}
                        >
                            {([
                                { id: "servers", icon: Icons.Dns, label: t("servers"), count: joinedServers.length },
                                { id: "modpack", icon: Icons.Modpack, label: t("modpacks"), count: instances.length },
                                { id: "explore", icon: Icons.Compass, label: t("explore"), count: null },
                                { id: "wardrobe", icon: Icons.Hanger, label: t("wardrobe"), count: null },
                            ] as const).map(({ id, icon: NavIcon, label, count }) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setActiveTab?.(id)}
                                    className="group/nav flex h-16 items-center gap-3.5 rounded-2xl px-4 text-left shadow-[0_10px_30px_-12px_rgba(0,0,0,0.7)] transition active:scale-[0.98] bg-(--nav-bg) hover:bg-(--nav-hover) text-(--nav-fg)"
                                    style={{
                                        "--nav-bg": colors.surfaceContainerHigh,
                                        "--nav-hover": colors.surfaceContainerHighest,
                                        "--nav-fg": colors.onSurface,
                                    } as React.CSSProperties}
                                >
                                    <NavIcon className="w-7 h-7 shrink-0" />
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-base font-bold truncate">{label}</span>
                                        {count !== null && (
                                            <span className="block text-[13px] tabular-nums" style={{ color: colors.onSurfaceVariant }}>{count}</span>
                                        )}
                                    </span>
                                    <Icons.ChevronRight className="w-5 h-5 shrink-0 transition-transform group-hover/nav:translate-x-1" style={{ color: colors.onSurfaceVariant }} />
                                </button>
                            ))}
                        </nav>

                        {!session && (
                            <button
                                onClick={(e) => { e.stopPropagation(); openModal("login"); }}
                                className="absolute right-6 top-6 h-11 px-5 rounded-full text-sm font-bold transition hover:brightness-110"
                                style={{ backgroundColor: colors.secondary, color: "#111" }}
                            >
                                {t("login")}
                            </button>
                        )}
                    </div>
                </div>
            </section>

            {/* Library: own packs + server packs in a wrapping grid (no sideways scrolling). */}
            <div className="relative z-10 pt-6 pb-6 px-0" style={{ backgroundColor: colors.surface }}>
                <div className="flex items-center gap-3 px-8 mb-3">
                    <h2 className="font-display text-xl" style={{ color: colors.onSurface }}>{t("library")}</h2>
                    {loaders.length > 1 && ["all", ...loaders].map((key) => (
                        <button
                            key={key}
                            onClick={() => setLoader(key)}
                            className="h-8 px-3 rounded-full text-sm font-semibold transition-colors hover:brightness-110" style={loader === key ? { backgroundColor: colors.secondary, color: "#111" } : { backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                        >
                            {key === "all" ? t("all") : getLoaderLabel(key as GameInstance["loader"])}
                        </button>
                    ))}
                </div>

                {library.length > 0 || serverPacks.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 px-8 pt-1 pb-3">
                        {library.map((instance) => (
                            <ShelfCard
                                key={instance.id}
                                banner={instance.banner || appBanner}
                                icon={instance.icon}
                                name={instance.name}
                                meta={<>{getLoaderLabel(instance.loader)} {instance.minecraftVersion}</>}
                                onOpen={() => openInstance(instance)}
                                actionLabel={t("play")}
                                actionIcon={<Icons.Play className="w-4 h-4 fill-current" />}
                                onAction={() => playInstance(instance)}
                                colors={colors}
                            />
                        ))}
                        {serverPacks.map(({ server, installed }) => installed ? (
                            <ShelfCard
                                key={server.id}
                                banner={installed.banner || server.bannerUrl || appBanner}
                                icon={installed.icon || server.iconUrl}
                                name={installed.name || server.name}
                                meta={<>{getLoaderLabel(installed.loader)} {installed.minecraftVersion}</>}
                                onOpen={() => openServerDetail(server)}
                                actionLabel={t("play")}
                                actionIcon={<Icons.Play className="w-4 h-4 fill-current" />}
                                onAction={() => playInstance(installed)}
                                colors={colors}
                            />
                        ) : (
                            <ShelfCard
                                key={server.id}
                                banner={server.bannerUrl || appBanner}
                                icon={server.iconUrl}
                                name={server.name}
                                meta={t("not_installed")}
                                dimArt
                                onOpen={() => openServerDetail(server)}
                                actionLabel={t("install")}
                                actionIcon={<Icons.Download className="w-4 h-4" />}
                                onAction={() => installServerPack(server)}
                                colors={colors}
                            />
                        ))}
                    </div>
                ) : instancesLoaded && !loadingServers ? (
                    <p className="px-8 text-sm" style={{ color: colors.onSurfaceVariant }}>{t("no_results")}</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 px-8">
                        {[0, 1, 2].map((i) => <div key={i} className="h-56 rounded-2xl animate-pulse" style={{ backgroundColor: colors.surfaceContainerHigh }} />)}
                    </div>
                )}
            </div>

            {selectedNews && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedNews(null)}>
                    {/* Landscape reader: art on the left, article on the right. */}
                    <div
                        className="relative w-full max-w-7xl h-[min(86vh,860px)] flex flex-col md:flex-row overflow-hidden rounded-3xl shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                        style={{ backgroundColor: colors.surface }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {selectedNews.imageUrl && (
                            <div className="relative md:w-[55%] h-56 md:h-auto shrink-0 bg-black overflow-hidden">
                                <img src={selectedNews.imageUrl} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-50" />
                                <img src={selectedNews.imageUrl} alt={selectedNews.subject} className="relative w-full h-full object-contain" />
                            </div>
                        )}

                        {newsletters.length > 1 && (
                            <div className="absolute left-4 bottom-4 z-20 flex items-center gap-2">
                                <button
                                    onClick={() => stepNews(-1)}
                                    aria-label={t("back")}
                                    className="w-11 h-11 rounded-full flex items-center justify-center bg-black/55 text-white backdrop-blur-md transition hover:bg-black/75"
                                >
                                    <Icons.ChevronLeft className="w-5 h-5" />
                                </button>
                                <span className="h-11 px-4 rounded-full flex items-center text-sm font-semibold tabular-nums bg-black/55 text-white backdrop-blur-md">
                                    {selectedNewsIndex + 1} / {newsletters.length}
                                </span>
                                <button
                                    onClick={() => stepNews(1)}
                                    aria-label={t("next")}
                                    className="w-11 h-11 rounded-full flex items-center justify-center bg-black/55 text-white backdrop-blur-md transition hover:bg-black/75"
                                >
                                    <Icons.ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        )}

                        <div key={selectedNews.id} className="flex-1 min-w-0 flex flex-col animate-fade-in">
                            <div className="flex items-start justify-between gap-4 px-8 pt-8 pb-5">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-3">
                                        {selectedNews.tag && (
                                            <span className="h-7 px-3 rounded-lg text-[13px] font-semibold flex items-center" style={{ backgroundColor: colors.secondary, color: "#111" }}>
                                                {selectedNews.tag}
                                            </span>
                                        )}
                                        <span className="text-sm" style={{ color: colors.onSurfaceVariant }}>{newsDate(selectedNews)}</span>
                                    </div>
                                    <h2 className="font-display text-3xl leading-tight" style={{ color: colors.onSurface }}>{stripMarkdown(selectedNews.subject)}</h2>
                                </div>
                                <button
                                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition hover:brightness-110"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                    onClick={() => setSelectedNews(null)}
                                    aria-label={t("close")}
                                >
                                    <Icons.X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar" style={{ color: colors.onSurface }}>
                                <SimpleMarkdown content={selectedNews.content} className="text-base leading-relaxed" />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
