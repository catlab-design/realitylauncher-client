import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import appBanner from "../../assets/banner.png";
import { playClick } from "../../lib/sounds";
import { cn } from "../../lib/utils";
import { Icons } from "../ui/Icons";
import { ServerSocialButtons, StoryReaderModal, useServerStory } from "./serverStory";

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
    serverIps?: string[] | string | null;
    /** Only on joined servers (GET /instances). */
    membersCount?: number;
    owner?: { catidUsername?: string | null; minecraftUsername?: string | null } | null;
    /** Markdown story shown on the detail page and the hero. */
    richDescription?: string | null;
    /** JSON array of { type, url }. */
    socials?: string | null;
    websiteUrl?: string | null;
}

/** Live result of the launcher's Minecraft status ping (src-tauri social::server_ping). */
export interface ServerPing {
    online: boolean;
    players: { online: number; max: number } | null;
}

/** Per-server state the cards need to pick their action. */
export interface ServerFlags {
    isMember: boolean;
    isInstalled: boolean;
    isPlaying: boolean;
    isLaunching: boolean;
}

interface ActionHandlers {
    onPlay: (e: React.MouseEvent, instance: any) => void;
    onStop: (e: React.MouseEvent, instance: any) => void;
    onJoin: (instance: Instance) => void;
    onInstall: (e: React.MouseEvent, instance: any) => void;
}

type T = (key: any) => string;

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export type PrimaryKind = "join" | "install" | "launching" | "stop" | "play";

// Same branching as the original card buttons: Join → Install → Play/Stop.
export function getPrimaryKind(isMember: boolean, isInstalled: boolean, isPlaying: boolean, isLaunching: boolean): PrimaryKind {
    if (!isMember) return "join";
    if (!isInstalled) return "install";
    if (isLaunching) return "launching";
    if (isPlaying) return "stop";
    return "play";
}

export function primaryLabel(kind: PrimaryKind, t: T): string {
    if (kind === "join") return t('join');
    if (kind === "install") return t('install');
    if (kind === "launching") return t('launching') || "…";
    if (kind === "stop") return t('stop');
    return t('play');
}

export function PrimaryIcon({ kind, className }: { kind: PrimaryKind; className?: string }) {
    if (kind === "launching") return <div className={cn("rounded-full border-2 border-current/30 border-t-current animate-spin", className)} />;
    if (kind === "stop") {
        return (
            <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h12v12H6z" />
            </svg>
        );
    }
    if (kind === "join") return <Icons.UserPlus className={className} />;
    if (kind === "install") return <Icons.Download className={className} />;
    return <Icons.Play className={cn("fill-current", className)} />;
}

/** Runs the primary action (join / install / play / stop) for a card, the hero or the status strip. */
export function runPrimaryAction(kind: PrimaryKind, e: React.MouseEvent, instance: Instance, handlers: ActionHandlers) {
    e.stopPropagation();
    playClick();
    if (kind === "join") handlers.onJoin(instance);
    else if (kind === "install") handlers.onInstall(e, instance);
    else if (kind === "play") handlers.onPlay(e, instance);
    else handlers.onStop(e, instance);
}

/** First server address of an instance (serverIps is a JSON array of strings on the API). */
export function getServerAddress(instance: Instance): string | null {
    const raw = instance.serverIps;
    let list: unknown = raw;
    if (typeof raw === "string") {
        try { list = raw.trim().startsWith("[") ? JSON.parse(raw) : [raw]; } catch { list = [raw]; }
    }
    if (!Array.isArray(list)) return null;
    const first = list.find((ip) => typeof ip === "string" && ip.trim().length > 0);
    return typeof first === "string" ? first.trim() : null;
}

function capitalize(value: string): string {
    return value ? value[0].toUpperCase() + value.slice(1) : value;
}

/** Artwork that falls back to the app banner when the server image fails to load. */
function CoverArt({ src, className, eager }: { src: string | null; className?: string; eager?: boolean }) {
    const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
    return (
        <img
            src={src && src !== failedSrc ? src : appBanner}
            alt=""
            draggable={false}
            loading={eager ? "eager" : "lazy"}
            onError={() => setFailedSrc(src)}
            className={cn("h-full w-full object-cover", className)}
        />
    );
}

function coverOf(instance: Instance, getWithTimestamp: (url: string | null | undefined) => string): string | null {
    const img = instance.bannerUrl || instance.iconUrl;
    return img ? getWithTimestamp(img) : null;
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

interface HeroStat {
    key: string;
    value: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}

/** Stat tiles for the hero capsule, built from real fields only. */
function heroStats(instance: Instance, ping: ServerPing | undefined, t: T): HeroStat[] {
    const stats: HeroStat[] = [];
    if (ping?.online && ping.players) {
        stats.push({ key: "players", value: `${ping.players.online}/${ping.players.max}`, label: t('online_players'), icon: Icons.Controller });
    } else if (ping && !ping.online) {
        stats.push({ key: "status", value: t('server_offline'), label: t('status'), icon: Icons.Dns });
    }
    if (instance.minecraftVersion) stats.push({ key: "version", value: instance.minecraftVersion, label: t('version'), icon: Icons.Box });
    if (instance.loaderType) stats.push({ key: "loader", value: capitalize(instance.loaderType), label: t('loader'), icon: Icons.Puzzle });
    if (typeof instance.membersCount === "number") stats.push({ key: "members", value: String(instance.membersCount), label: t('members_label'), icon: Icons.Users });
    return stats.slice(0, 3);
}

interface ServerHeroProps extends ActionHandlers {
    instance: Instance;
    /** Servers shown as thumbnails in the left rail. */
    railItems: Instance[];
    flags: ServerFlags;
    ping?: ServerPing;
    colors: any;
    getWithTimestamp: (url: string | null | undefined) => string;
    t: T;
    onSelect: (instance: Instance) => void;
    onViewDetail: (instance: Instance) => void;
    onLeave: (e: React.MouseEvent, instance: any) => void;
    onSearch: () => void;
    /** Opens the live log; the button shows for installed servers the user is a member of, like the detail page. */
    onViewLogs?: (e: React.MouseEvent, instance: any) => void;
}

/**
 * Full-bleed billboard: art of the selected server under the title bar, a thumbnail rail on the
 * left, name and story teaser bottom-left and socials, logs and actions bottom-right.
 */
export function ServerHero({
    instance,
    railItems,
    flags,
    ping,
    colors,
    getWithTimestamp,
    t,
    onSelect,
    onViewDetail,
    onLeave,
    onSearch,
    onViewLogs,
    onPlay,
    onStop,
    onJoin,
    onInstall,
}: ServerHeroProps) {
    const reduceMotion = !!useReducedMotion();
    const story = useServerStory(instance);
    const [storyOpen, setStoryOpen] = React.useState(false);
    const closeStory = React.useCallback(() => setStoryOpen(false), []);
    const showLogs = !!onViewLogs && flags.isMember && flags.isInstalled;
    const kind = getPrimaryKind(flags.isMember, flags.isInstalled, flags.isPlaying, flags.isLaunching);
    const danger = kind === "stop" || kind === "launching";
    const label = primaryLabel(kind, t);
    const cover = coverOf(instance, getWithTimestamp);
    const iconUrl = instance.iconUrl ? getWithTimestamp(instance.iconUrl) : null;
    const stats = heroStats(instance, ping, t);

    const group = {
        hidden: {},
        show: { transition: { staggerChildren: reduceMotion ? 0 : 0.07, delayChildren: reduceMotion ? 0 : 0.1 } },
        exit: { opacity: 0, transition: { duration: 0.15 } },
    };
    const item = {
        hidden: { opacity: 0, y: reduceMotion ? 0 : 16 },
        show: { opacity: 1, y: 0, transition: { duration: reduceMotion ? 0.2 : 0.5, ease: EASE_OUT } },
    };

    return (
        <section
            className="@container relative h-[clamp(20rem,52vh,34rem)] overflow-hidden bg-black"
            // Size container: the story teaser steps aside on short heroes (global.css, "server-hero").
            style={{ containerType: "size", containerName: "server-hero" }}
        >
            {/* Art crossfades when the selection changes. */}
            <AnimatePresence initial={false}>
                <motion.div
                    key={instance.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0.15 : 0.6, ease: EASE_OUT }}
                    className="absolute inset-0"
                >
                    <CoverArt src={cover} eager />
                </motion.div>
            </AnimatePresence>

            {/* Shades: title bar, right-side text vignette, left rail, and the fade into the page. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-black/55 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-[70%] bg-linear-to-l from-black/75 via-black/35 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 left-0 w-48 bg-linear-to-r from-black/45 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-black/80 via-black/35 to-transparent" />

            {/* Left thumbnail rail. */}
            {railItems.length > 0 && (
                <div className="absolute left-5 top-16 bottom-16 z-10 flex items-center">
                    <motion.div
                        initial={{ opacity: 0, x: reduceMotion ? 0 : -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.45, ease: EASE_OUT }}
                        className="flex max-h-full flex-col items-center gap-2 rounded-2xl bg-black/45 p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl"
                    >
                        <div className="flex min-h-0 flex-col items-center gap-2 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {railItems.map((inst, index) => {
                                const selected = inst.id === instance.id;
                                const thumb = inst.iconUrl ? getWithTimestamp(inst.iconUrl) : coverOf(inst, getWithTimestamp);
                                return (
                                    <motion.button
                                        key={inst.id}
                                        type="button"
                                        initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.35, ease: EASE_OUT, delay: reduceMotion ? 0 : Math.min(index * 0.04, 0.3) }}
                                        onClick={() => { if (!selected) { playClick(); onSelect(inst); } }}
                                        title={inst.name}
                                        aria-label={inst.name}
                                        aria-pressed={selected}
                                        className={cn(
                                            "relative m-0.5 h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-white/10 transition-opacity focus-visible:outline-none",
                                            selected ? "opacity-100" : "opacity-55 hover:opacity-100 focus-visible:opacity-100"
                                        )}
                                        style={{ boxShadow: selected ? "0 0 0 2px #fff" : undefined }}
                                    >
                                        {thumb ? (
                                            <CoverArt src={thumb} className={inst.iconUrl ? "object-contain" : undefined} />
                                        ) : (
                                            <span className="flex h-full w-full items-center justify-center text-base font-black text-white">
                                                {inst.name[0]?.toUpperCase()}
                                            </span>
                                        )}
                                    </motion.button>
                                );
                            })}
                        </div>
                        <div className="h-px w-7 shrink-0 bg-white/15" />
                        <button
                            type="button"
                            onClick={() => { playClick(); onSearch(); }}
                            title={t('search')}
                            aria-label={t('search')}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                        >
                            <Icons.Search className="h-4.5 w-4.5" />
                        </button>
                    </motion.div>
                </div>
            )}

            {/* Text and actions; restaggers on every selection. */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={instance.id}
                    variants={group}
                    initial="hidden"
                    animate="show"
                    exit="exit"
                    className="pointer-events-none absolute inset-0"
                >
                    {/* One bottom row so the two sides share the width and never overlap. */}
                    <div className="absolute inset-x-0 bottom-10 flex items-end justify-between gap-8 pl-24 pr-10">
                        {/* Bottom-left: server icon and name with its facts as one quiet line, then the story teaser. */}
                        <motion.div variants={item} className="min-w-0 basis-[48%]">
                            <div className="flex items-center gap-4">
                                <div className="h-16 w-16 shrink-0">
                                    {iconUrl ? (
                                        <img src={iconUrl} alt="" draggable={false} className="h-full w-full object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]" />
                                    ) : (
                                        <span className="flex h-full w-full items-center justify-center text-2xl font-black text-white">
                                            {instance.name[0]?.toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <h2
                                        className="line-clamp-2 text-balance font-display text-3xl leading-[1.1] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] xl:text-4xl"
                                        title={instance.name}
                                    >
                                        {instance.name}
                                    </h2>
                                    {stats.length > 0 && (
                                        <div className="mt-1.5 truncate text-sm font-medium text-white/65">
                                            {stats.map((stat) => stat.value).join(" • ")}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Story teaser, like the detail page; the excerpt goes first when the hero gets narrow. */}
                            {story.hasStory && (
                                <div className="server-hero-story mt-5">
                                    {story.headline && (
                                        <p className="line-clamp-2 text-lg font-semibold leading-snug text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] xl:text-xl">
                                            {story.headline}
                                        </p>
                                    )}
                                    {story.excerpt && (
                                        <p
                                            // With a headline the excerpt is the first thing to go on narrow heroes; without one it is the story.
                                            className={cn(
                                                "line-clamp-2 max-w-xl text-sm leading-relaxed text-white/80 drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] xl:text-base",
                                                story.headline && "server-hero-excerpt mt-2 @max-4xl:hidden"
                                            )}
                                        >
                                            {story.excerpt}
                                        </p>
                                    )}
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); playClick(); setStoryOpen(true); }}
                                        className="pointer-events-auto mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-black/60 pl-4 pr-3 text-sm font-semibold text-white backdrop-blur-xl transition-colors hover:bg-black/75"
                                    >
                                        {t('read_more')}
                                        <Icons.ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            )}
                        </motion.div>

                        {/* Bottom-right: role chip over socials, logs and the actions. */}
                        <div className="flex shrink-0 flex-col items-end text-right">
                            <motion.div variants={item} className="pointer-events-auto flex items-center gap-2.5">
                                <ServerSocialButtons socials={instance.socials} websiteUrl={instance.websiteUrl} sizeClassName="h-12 w-12" />
                                {showLogs && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); playClick(); onViewLogs?.(e, instance); }}
                                        title={t('logs')}
                                        aria-label={t('logs')}
                                        className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white shadow-xl backdrop-blur-xl transition hover:bg-black/70 active:scale-95"
                                    >
                                        <Icons.Terminal className="h-5 w-5" />
                                    </button>
                                )}
                                {flags.isMember && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); playClick(); onLeave(e, instance); }}
                                        title={t('leave_server') || "Leave Server"}
                                        aria-label={t('leave_server') || "Leave Server"}
                                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-black/45 text-white/80 ring-1 ring-white/15 backdrop-blur-xl transition-colors hover:bg-[#ef4444] hover:text-white"
                                    >
                                        <Icons.Logout className="h-4.5 w-4.5" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); playClick(); onViewDetail(instance); }}
                                    // Frosted pill matching the Play pill's height and shape.
                                    className="group flex h-12 items-center gap-2 rounded-full bg-white/15 pl-6 pr-5 text-base font-semibold text-white backdrop-blur-xl transition-colors hover:bg-white/25"
                                >
                                    <span>{t('more_info')}</span>
                                    <Icons.ChevronRight className="h-4.5 w-4.5 transition-transform group-hover:translate-x-0.5" />
                                </button>
                                <motion.button
                                    type="button"
                                    whileHover={reduceMotion ? undefined : { scale: 1.03 }}
                                    whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                                    transition={{ type: "spring", stiffness: 420, damping: 26 }}
                                    onClick={(e) => runPrimaryAction(kind, e, instance, { onJoin, onInstall, onPlay, onStop })}
                                    // Same as the detail page's Play: yellow pill (red for Stop/Launching), icon first.
                                    className="flex h-12 items-center gap-2.5 rounded-full px-8 text-base font-bold shadow-xl transition hover:brightness-105"
                                    style={danger ? { backgroundColor: colors.error || "#ef4444", color: "#fff" } : { backgroundColor: colors.secondary, color: "#111" }}
                                >
                                    <PrimaryIcon kind={kind} className="h-5 w-5" />
                                    <span>{label}</span>
                                </motion.button>
                            </motion.div>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Full story reader; portalled so the hero's overflow clip does not cut it. */}
            <StoryReaderModal
                open={storyOpen && story.hasStory}
                onClose={closeStory}
                title={instance.name}
                source={story.source}
                t={t}
                portal
            />
        </section>
    );
}

/** Loading placeholder with the hero's footprint: dark like the art, so the title bar and controls don't flip. */
export function ServerHeroSkeleton(_props: { colors: any }) {
    const block = "bg-white/8";
    return (
        <section className="relative h-[clamp(20rem,52vh,34rem)] overflow-hidden animate-skeleton-wave bg-[#141416]">
            <div className="absolute left-5 top-1/2 flex -translate-y-1/2 flex-col gap-2 rounded-2xl bg-white/5 p-1.5">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={`m-0.5 h-11 w-11 rounded-xl ${block}`} />
                ))}
            </div>
            <div className="absolute bottom-10 left-24 flex items-center gap-4">
                <div className={`h-16 w-16 rounded-2xl ${block}`} />
                <div className="flex flex-col gap-2.5">
                    <div className={`h-9 w-64 rounded-lg ${block}`} />
                    <div className={`h-4 w-36 rounded-md ${block}`} />
                </div>
            </div>
            <div className="absolute bottom-10 right-10 flex items-center gap-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={`h-12 w-12 rounded-full ${block}`} />
                ))}
                <div className={`h-12 w-40 rounded-full ${block}`} />
                <div className={`h-12 w-32 rounded-full ${block}`} />
            </div>
        </section>
    );
}

// ---------------------------------------------------------------------------
// Accordion card rows
// ---------------------------------------------------------------------------

const ROW_SIZE = 5;

interface ServerCardRowsProps extends ActionHandlers {
    instances: Instance[];
    selectedId: string | null;
    getFlags: (instance: Instance) => ServerFlags;
    getPing: (instance: Instance) => ServerPing | undefined;
    colors: any;
    getWithTimestamp: (url: string | null | undefined) => string;
    t: T;
    onSelect: (instance: Instance) => void;
    onViewDetail: (instance: Instance) => void;
}

/** Accordion rows of up to five cards: one wide landscape card, the rest tall posters. */
export function ServerCardRows({ instances, ...rest }: ServerCardRowsProps) {
    const rows: Instance[][] = [];
    for (let i = 0; i < instances.length; i += ROW_SIZE) rows.push(instances.slice(i, i + ROW_SIZE));
    const multiRow = rows.length > 1;
    return (
        <div className="flex flex-col gap-4">
            {rows.map((row, rowIndex) => (
                <AccordionRow
                    key={rowIndex}
                    row={row}
                    rowIndex={rowIndex}
                    // Keep later rows on the same grid as the first one.
                    fillTo={multiRow ? ROW_SIZE : row.length}
                    {...rest}
                />
            ))}
        </div>
    );
}

function AccordionRow({
    row,
    rowIndex,
    fillTo,
    selectedId,
    ...rest
}: Omit<ServerCardRowsProps, "instances"> & { row: Instance[]; rowIndex: number; fillTo: number }) {
    const [hoverId, setHoverId] = React.useState<string | null>(null);
    const activeId = (hoverId && row.some((inst) => inst.id === hoverId) && hoverId)
        || (row.some((inst) => inst.id === selectedId) && selectedId)
        || row[0]?.id;

    return (
        <div
            className="flex h-88 gap-3"
            onPointerLeave={() => setHoverId(null)}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHoverId(null); }}
        >
            {row.map((inst, i) => (
                <ServerCard
                    key={inst.id}
                    instance={inst}
                    index={rowIndex * ROW_SIZE + i}
                    active={inst.id === activeId}
                    selected={inst.id === selectedId}
                    onActivate={() => setHoverId(inst.id)}
                    {...rest}
                />
            ))}
            {Array.from({ length: Math.max(0, fillTo - row.length) }).map((_, i) => (
                <div key={`spacer-${i}`} aria-hidden className="min-w-0 basis-0" style={{ flexGrow: 1 }} />
            ))}
        </div>
    );
}

function ServerCard({
    instance,
    index,
    active,
    selected,
    onActivate,
    getFlags,
    getPing,
    colors,
    getWithTimestamp,
    t,
    onSelect,
    onViewDetail,
    onPlay,
    onStop,
    onJoin,
    onInstall,
}: Omit<ServerCardRowsProps, "instances" | "selectedId"> & {
    instance: Instance;
    index: number;
    active: boolean;
    selected: boolean;
    onActivate: () => void;
}) {
    const reduceMotion = !!useReducedMotion();
    const flags = getFlags(instance);
    const ping = getPing(instance);
    const kind = getPrimaryKind(flags.isMember, flags.isInstalled, flags.isPlaying, flags.isLaunching);
    const danger = kind === "stop" || kind === "launching";
    const label = primaryLabel(kind, t);
    const cover = coverOf(instance, getWithTimestamp);
    const iconUrl = instance.iconUrl ? getWithTimestamp(instance.iconUrl) : null;
    // Address only: version/loader already show in the stats row, and the owner's name isn't shown.
    const subtitle = getServerAddress(instance);
    const dimmed = flags.isMember && !flags.isInstalled;
    const fade = reduceMotion ? "duration-0" : "duration-300";

    const select = () => { playClick(); onSelect(instance); };
    const openDetail = () => { playClick(); onViewDetail(instance); };

    return (
        <motion.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE_OUT, delay: reduceMotion ? 0 : Math.min(index * 0.05, 0.4) }}
            className="relative min-w-0 basis-0"
            style={{
                flexGrow: active ? 2.6 : 1,
                transition: reduceMotion ? undefined : "flex-grow 450ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            onPointerEnter={(e) => { if (e.pointerType !== "touch") onActivate(); }}
            onFocus={onActivate}
        >
            <div
                role="button"
                tabIndex={0}
                aria-label={instance.name}
                onClick={select}
                onDoubleClick={openDetail}
                onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter") { e.preventDefault(); openDetail(); }
                    else if (e.key === " ") { e.preventDefault(); select(); }
                }}
                className="group relative h-full w-full cursor-pointer overflow-hidden rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                style={{
                    backgroundColor: colors.surfaceContainerHigh,
                    boxShadow: selected ? `0 0 0 2px ${colors.secondary}` : undefined,
                }}
            >
                <CoverArt
                    src={cover}
                    className={cn("absolute inset-0 transition-transform duration-700 ease-out", !reduceMotion && "group-hover:scale-[1.03]", dimmed && "grayscale opacity-60")}
                />

                {/* Poster state: subtle gradient, small logo and name. */}
                <div className={cn("pointer-events-none absolute inset-0 transition-opacity", fade, active ? "opacity-0" : "opacity-100")}>
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/80 via-black/30 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 p-4">
                        {iconUrl && <img src={iconUrl} alt="" draggable={false} className="h-8 w-8 shrink-0 rounded-lg object-contain" />}
                        <span className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug text-white drop-shadow-md">{instance.name}</span>
                    </div>
                </div>

                {/* Expanded state: name, subtitle, stats and two round actions. */}
                <div className={cn("absolute inset-0 transition-opacity", fade, active ? "opacity-100 delay-100" : "pointer-events-none opacity-0")}>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-black/85 via-black/35 to-transparent" />
                    <div className="pointer-events-none absolute bottom-0 left-0 w-[min(24rem,calc(100%-4.5rem))] min-w-56 p-5">
                        <h3 className="truncate text-lg font-bold text-white drop-shadow-md" title={instance.name}>{instance.name}</h3>
                        {subtitle && <p className="truncate text-sm text-white/60">{subtitle}</p>}
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-white/80">
                            {ping?.online && ping.players && (
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                                    {ping.players.online}/{ping.players.max}
                                </span>
                            )}
                            {typeof instance.membersCount === "number" && (
                                <span className="inline-flex items-center gap-1.5">
                                    <Icons.Users className="h-3.5 w-3.5" />
                                    {instance.membersCount}
                                </span>
                            )}
                            {instance.minecraftVersion && (
                                <span className="inline-flex items-center gap-1.5">
                                    <Icons.Box className="h-3.5 w-3.5" />
                                    {instance.minecraftVersion}
                                </span>
                            )}
                            {instance.loaderType && <span className="capitalize">{instance.loaderType}</span>}
                        </div>
                    </div>
                    <div className="absolute bottom-4 right-4 flex flex-col gap-2">
                        <button
                            type="button"
                            tabIndex={active ? 0 : -1}
                            onClick={(e) => { e.stopPropagation(); openDetail(); }}
                            title={t('view_details')}
                            aria-label={t('view_details')}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-black/70"
                        >
                            <Icons.Info className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            tabIndex={active ? 0 : -1}
                            onClick={(e) => runPrimaryAction(kind, e, instance, { onJoin, onInstall, onPlay, onStop })}
                            title={label}
                            aria-label={label}
                            className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-full ring-1 backdrop-blur-md transition-colors",
                                danger ? "bg-[#ef4444] text-white ring-white/20" : "bg-black/45 text-white ring-white/20 hover:bg-white hover:text-[#111]"
                            )}
                        >
                            <PrimaryIcon kind={kind} className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {(flags.isPlaying || flags.isLaunching) && (
                    <span
                        title={flags.isLaunching ? t('launching') : t('game_running')}
                        className="absolute left-3 top-3 h-2.5 w-2.5 rounded-full motion-safe:animate-pulse"
                        style={{ backgroundColor: colors.secondary }}
                    />
                )}
            </div>
        </motion.div>
    );
}

/** Loading placeholder for one accordion row. */
export function ServerCardRowSkeleton({ colors }: { colors: any }) {
    return (
        <div className="flex h-88 gap-3">
            {Array.from({ length: ROW_SIZE }).map((_, i) => (
                <div
                    key={i}
                    className="min-w-0 basis-0 rounded-2xl animate-skeleton-wave"
                    style={{ flexGrow: i === 0 ? 2.6 : 1, backgroundColor: colors.surfaceContainerHighest, animationDelay: `${i * 60}ms` }}
                />
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Status strip
// ---------------------------------------------------------------------------

interface ServerStatusStripProps extends ActionHandlers {
    instances: Instance[];
    getFlags: (instance: Instance) => ServerFlags;
    getPing: (instance: Instance) => ServerPing | undefined;
    colors: any;
    t: T;
}

/** Compact live-status cards; hovering one reveals its action under it. Only servers that answered a ping. */
export function ServerStatusStrip({ instances, getFlags, getPing, colors, t, onPlay, onStop, onJoin, onInstall }: ServerStatusStripProps) {
    const reduceMotion = !!useReducedMotion();
    const items = instances
        .map((inst) => ({ inst, ping: getPing(inst) }))
        .filter((x): x is { inst: Instance; ping: ServerPing } => !!x.ping);
    if (items.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-x-3 gap-y-11 pb-8">
            {items.map(({ inst, ping }, index) => {
                const flags = getFlags(inst);
                const kind = getPrimaryKind(flags.isMember, flags.isInstalled, flags.isPlaying, flags.isLaunching);
                const label = primaryLabel(kind, t);
                return (
                    <motion.div
                        key={inst.id}
                        initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: EASE_OUT, delay: reduceMotion ? 0 : Math.min(index * 0.04, 0.3) }}
                        className="group/status relative w-52"
                    >
                        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-bold" style={{ color: colors.onSurface }} title={inst.name}>{inst.name}</span>
                                <span
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: ping.online ? "#22c55e" : "#ef4444" }}
                                    title={ping.online ? t('online_badge') : t('server_offline')}
                                />
                            </div>
                            <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                                <span style={{ color: colors.onSurfaceVariant }}>{t('online_players')}</span>
                                <span className="font-bold tabular-nums" style={{ color: colors.onSurface }}>
                                    {ping.online && ping.players ? `${ping.players.online}/${ping.players.max}` : t('server_offline')}
                                </span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={(e) => runPrimaryAction(kind, e, inst, { onJoin, onInstall, onPlay, onStop })}
                            className="pointer-events-none absolute left-3 top-full mt-2 flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold opacity-0 transition duration-200 -translate-y-1 group-hover/status:pointer-events-auto group-hover/status:translate-y-0 group-hover/status:opacity-100 focus-visible:pointer-events-auto focus-visible:translate-y-0 focus-visible:opacity-100"
                            style={{ backgroundColor: colors.secondary, color: "#111" }}
                        >
                            {label}
                            <Icons.ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    </motion.div>
                );
            })}
        </div>
    );
}
