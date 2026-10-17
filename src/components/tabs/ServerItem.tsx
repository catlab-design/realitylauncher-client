import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import appBanner from "../../assets/banner.png";
import { useMotionPreset } from "../../lib/motion";
import { playClick, toastError, toastSuccess } from "../../lib/sounds";
import { cn } from "../../lib/utils";
import { Icons } from "../ui/Icons";
import { ServerSocialButtons, StoryReaderModal, useServerStory } from "./serverStory";
import { normalizeGallery } from "./ServerGallery";
import { ScrollStrip } from "../ui/ScrollStrip";
import { VerifiedBadge, type InstanceVerification } from "../ui/VerifiedBadge";

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
    /** Owner-uploaded screenshots, ordered (GET /instances, /instances/public, /instances/:id). */
    gallery?: GalleryImage[];
    /** Admin-assigned badge (GET /instances, /instances/public, /instances/:id); null = none. */
    verification?: InstanceVerification | null;
}

/** One gallery image; `url` is immutable per id, so it is safe to cache. */
export interface GalleryImage {
    id: string;
    url: string;
    caption: string | null;
    width: number | null;
    height: number | null;
}

/** Live result of the launcher's Minecraft status ping (src-tauri social::server_ping). */
export interface ServerPing {
    online: boolean;
    players: { online: number; max: number } | null;
    /** Plain-text MOTD. */
    motd?: string | null;
    /** Raw status `description`: a legacy section-sign string or a chat component. */
    motdRaw?: unknown;
    /** Round trip in ms. */
    latency?: number | null;
    /** Version name the server reports (e.g. "Paper 1.21.1"). */
    version?: string | null;
    /** Server icon as a data URL. */
    favicon?: string | null;
    error?: string | null;
}

/** Where a server's address came from: the instance's "Server address" field, or the first entry of its local servers.dat. */
export interface ServerAddressInfo {
    address: string;
    source: "api" | "local";
    /** servers.dat entry name/icon (local source only). */
    name?: string | null;
    icon?: string | null;
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

/** Splits "host[:port]" ("[v6]:port" too); IPv6 literals without brackets keep the default port. */
export function splitServerAddress(address: string): { host: string; port?: number } {
    const value = address.trim();
    const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(value);
    if (bracketed) return { host: bracketed[1], port: bracketed[2] ? parseInt(bracketed[2], 10) : undefined };
    const parts = value.split(":");
    if (parts.length === 2) {
        const port = parseInt(parts[1], 10);
        return { host: parts[0], port: Number.isFinite(port) && port > 0 && port < 65536 ? port : undefined };
    }
    return { host: value };
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
// Minecraft formatted text (MOTD)
// ---------------------------------------------------------------------------

interface McStyle {
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underlined?: boolean;
    strikethrough?: boolean;
    obfuscated?: boolean;
}

interface McSegment extends McStyle {
    text: string;
}

/** Vanilla palette in §0-§f order. */
const MC_PALETTE: [string, string][] = [
    ["black", "#000000"],
    ["dark_blue", "#0000AA"],
    ["dark_green", "#00AA00"],
    ["dark_aqua", "#00AAAA"],
    ["dark_red", "#AA0000"],
    ["dark_purple", "#AA00AA"],
    ["gold", "#FFAA00"],
    ["gray", "#AAAAAA"],
    ["dark_gray", "#555555"],
    ["blue", "#5555FF"],
    ["green", "#55FF55"],
    ["aqua", "#55FFFF"],
    ["red", "#FF5555"],
    ["light_purple", "#FF55FF"],
    ["yellow", "#FFFF55"],
    ["white", "#FFFFFF"],
];
const MC_CODES = "0123456789abcdef";
const MC_NAMED: Record<string, string> = Object.fromEntries(MC_PALETTE);
const SECTION = "§";
const MAX_SEGMENTS = 300;

function mcColor(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    if (/^#[0-9a-f]{6}$/i.test(value)) return value;
    return MC_NAMED[value.toLowerCase()];
}

/** Text with legacy codes: a colour resets the formatting, §r goes back to the component's own style. */
function pushLegacy(text: string, base: McStyle, out: McSegment[]) {
    let style: McStyle = { ...base };
    let buf = "";
    const flush = () => {
        if (buf && out.length < MAX_SEGMENTS) out.push({ ...style, text: buf });
        buf = "";
    };
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch !== SECTION || i + 1 >= text.length) {
            buf += ch;
            continue;
        }
        const code = text[++i].toLowerCase();
        flush();
        // BungeeCord hex colour: §x§r§r§g§g§b§b
        const hexRun = text.slice(i + 1, i + 13);
        if (code === "x" && /^(§[0-9a-f]){6}$/i.test(hexRun)) {
            style = { color: `#${hexRun.split(SECTION).join("")}` };
            i += 12;
            continue;
        }
        const colorIndex = MC_CODES.indexOf(code);
        if (colorIndex >= 0) style = { color: MC_PALETTE[colorIndex][1] };
        else if (code === "l") style = { ...style, bold: true };
        else if (code === "o") style = { ...style, italic: true };
        else if (code === "n") style = { ...style, underlined: true };
        else if (code === "m") style = { ...style, strikethrough: true };
        else if (code === "k") style = { ...style, obfuscated: true };
        else if (code === "r") style = { ...base };
    }
    flush();
}

function componentStyle(node: Record<string, unknown>, inherited: McStyle): McStyle {
    const style: McStyle = { ...inherited };
    const color = mcColor(node.color);
    if (color) style.color = color;
    for (const key of ["bold", "italic", "underlined", "strikethrough", "obfuscated"] as const) {
        if (typeof node[key] === "boolean") style[key] = node[key] as boolean;
    }
    return style;
}

function walkComponent(node: unknown, inherited: McStyle, out: McSegment[], depth: number) {
    if (depth > 24 || out.length >= MAX_SEGMENTS || node == null) return;
    if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
        pushLegacy(String(node), inherited, out);
        return;
    }
    if (Array.isArray(node)) {
        // Vanilla treats the first element as the parent of the rest.
        if (node.length === 0) return;
        const head = node[0];
        walkComponent(head, inherited, out, depth + 1);
        const headStyle = typeof head === "object" && head && !Array.isArray(head)
            ? componentStyle(head as Record<string, unknown>, inherited)
            : inherited;
        for (const child of node.slice(1)) walkComponent(child, headStyle, out, depth + 1);
        return;
    }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const style = componentStyle(obj, inherited);
    const text = typeof obj.text === "string" || typeof obj.text === "number"
        ? String(obj.text)
        : typeof obj.translate === "string" ? obj.translate : "";
    if (text) pushLegacy(text, style, out);
    if (Array.isArray(obj.extra)) for (const child of obj.extra) walkComponent(child, style, out, depth + 1);
}

/** Segments of a MOTD from the raw description (string or chat component), else the plain fallback. */
function parseMotd(raw: unknown, fallback?: string | null): McSegment[] {
    const out: McSegment[] = [];
    walkComponent(raw ?? fallback ?? "", {}, out, 0);
    return out;
}

/** MOTD in Minecraft colours and formatting. Meant for a dark background, like the in-game server list. */
export function MinecraftText({ raw, fallback, className }: { raw?: unknown; fallback?: string | null; className?: string }) {
    const segments = React.useMemo(() => parseMotd(raw, fallback), [raw, fallback]);
    return (
        <span className={className}>
            {segments.map((seg, i) => {
                const decoration = [seg.underlined && "underline", seg.strikethrough && "line-through"].filter(Boolean).join(" ");
                return (
                    <span
                        key={i}
                        className={seg.obfuscated ? "blur-[2px]" : undefined}
                        style={{
                            color: seg.color,
                            fontWeight: seg.bold ? 700 : undefined,
                            fontStyle: seg.italic ? "italic" : undefined,
                            textDecorationLine: decoration || undefined,
                        }}
                    >
                        {seg.text}
                    </span>
                );
            })}
        </span>
    );
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
    const m = useMotionPreset();
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

    return (
        <section
            className="@container relative h-[clamp(20rem,52vh,34rem)] overflow-hidden bg-black"
            // Size container: the story teaser steps aside on short heroes (global.css, "server-hero").
            style={{ containerType: "size", containerName: "server-hero" }}
        >
            {/* Art settles in on page entry (like the Library hero) and crossfades when the selection changes. */}
            <AnimatePresence>
                <motion.div
                    key={instance.id}
                    variants={m.showcaseArt}
                    initial="hidden"
                    animate="show"
                    exit="exit"
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
                        variants={m.showcaseSlide("left", 28)}
                        {...m.states}
                        className="flex max-h-full flex-col items-center gap-2 rounded-2xl bg-black/45 p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl"
                    >
                        <ScrollStrip
                            orientation="vertical"
                            className="flex min-h-0 flex-col"
                            viewportClassName="flex min-h-0 flex-1 flex-col items-center gap-2"
                            arrowClassName="w-7 h-7 bg-black/75 text-white hover:bg-black"
                        >
                            {railItems.map((inst, index) => {
                                const selected = inst.id === instance.id;
                                const thumb = inst.iconUrl ? getWithTimestamp(inst.iconUrl) : coverOf(inst, getWithTimestamp);
                                return (
                                    <motion.button
                                        key={inst.id}
                                        type="button"
                                        variants={m.showcaseItem}
                                        custom={index}
                                        {...m.states}
                                        {...m.hoverScale}
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
                                        <VerifiedBadge verification={inst.verification} size="xs" className="pointer-events-none absolute bottom-0.5 right-0.5" />
                                    </motion.button>
                                );
                            })}
                        </ScrollStrip>
                        <div className="h-px w-7 shrink-0 bg-white/15" />
                        <button
                            type="button"
                            onClick={() => { playClick(); onSearch(); }}
                            title={t('search')}
                            aria-label={t('search')}
                            className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/75 hover:bg-white/10 hover:text-white"
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
                    variants={m.showcaseStagger(0.09, 0.15)}
                    {...m.states}
                    className="pointer-events-none absolute inset-0"
                >
                    {/* One bottom row so the two sides share the width and never overlap. */}
                    <div className="absolute inset-x-0 bottom-10 flex items-end justify-between gap-8 pl-24 pr-10">
                        {/* Bottom-left: server icon and name with its facts as one quiet line, then the story teaser. */}
                        <div className="min-w-0 basis-[48%]">
                            <motion.div variants={m.showcaseUp} className="flex items-center gap-4">
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
                                        <VerifiedBadge verification={instance.verification} size="lg" label className="ml-3 align-middle" />
                                    </h2>
                                    {stats.length > 0 && (
                                        <div className="mt-1.5 truncate text-sm font-medium text-white/65">
                                            {stats.map((stat) => stat.value).join(" • ")}
                                        </div>
                                    )}
                                </div>
                            </motion.div>

                            {/* Story teaser, like the detail page; the excerpt goes first when the hero gets narrow. */}
                            {story.hasStory && (
                                <motion.div variants={m.showcaseUp} className="server-hero-story mt-5">
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
                                        className="pressable pointer-events-auto mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-black/60 pl-4 pr-3 text-sm font-semibold text-white backdrop-blur-xl hover:bg-black/75"
                                    >
                                        {t('read_more')}
                                        <Icons.ChevronRight className="h-4 w-4" />
                                    </button>
                                </motion.div>
                            )}
                        </div>

                        {/* Bottom-right: socials, logs and the actions. */}
                        <div className="flex shrink-0 flex-col items-end text-right">
                            <motion.div variants={m.showcaseUp} className="pointer-events-auto flex items-center gap-2.5">
                                <ServerSocialButtons socials={instance.socials} websiteUrl={instance.websiteUrl} sizeClassName="h-12 w-12" />
                                {showLogs && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); playClick(); onViewLogs?.(e, instance); }}
                                        title={t('logs')}
                                        aria-label={t('logs')}
                                        className="pressable flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white shadow-xl backdrop-blur-xl hover:bg-black/70"
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
                                        className="pressable flex h-11 w-11 items-center justify-center rounded-xl bg-black/45 text-white/80 ring-1 ring-white/15 backdrop-blur-xl hover:bg-[#ef4444] hover:text-white"
                                    >
                                        <Icons.Logout className="h-4.5 w-4.5" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); playClick(); onViewDetail(instance); }}
                                    // Frosted pill matching the Play pill's height and shape.
                                    className="pressable group flex h-12 items-center gap-2 rounded-full bg-white/15 pl-6 pr-5 text-base font-semibold text-white backdrop-blur-xl hover:bg-white/25"
                                >
                                    <span>{t('more_info')}</span>
                                    <Icons.ChevronRight className="h-4.5 w-4.5 transition-transform group-hover:translate-x-0.5" />
                                </button>
                                <motion.button
                                    type="button"
                                    {...m.hoverScale}
                                    onClick={(e) => runPrimaryAction(kind, e, instance, { onJoin, onInstall, onPlay, onStop })}
                                    // Same as the detail page's Play: yellow pill (red for Stop/Launching), icon first.
                                    className="flex h-12 items-center gap-2.5 rounded-full px-8 text-base font-bold shadow-xl hover:brightness-105"
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
                imageUrl={cover}
                images={normalizeGallery(instance.gallery)}
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
// Accordion card row (a horizontal carousel past four servers)
// ---------------------------------------------------------------------------

/** Up to this many cards fill the width; more turn the row into a scrolling strip with arrows. */
const FILL_MAX = 4;

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

/**
 * One accordion row: the active (hovered, else selected) card opens wide, the rest are posters.
 * Up to four cards share the width; with more, cards get fixed widths and the row scrolls
 * sideways with arrow buttons, snapping and mouse drag.
 */
export function ServerCardRows({ instances, selectedId, ...rest }: ServerCardRowsProps) {
    const m = useMotionPreset();
    const scroll = instances.length > FILL_MAX;
    const scrollerRef = React.useRef<HTMLDivElement>(null);
    const [hoverId, setHoverId] = React.useState<string | null>(null);
    const [edges, setEdges] = React.useState({ start: false, end: false });
    const [dragging, setDragging] = React.useState(false);
    const dragRef = React.useRef<{ x: number; left: number; moved: boolean; pointerId: number } | null>(null);
    const suppressClickRef = React.useRef(false);

    const activeId = (hoverId && instances.some((inst) => inst.id === hoverId) && hoverId)
        || (instances.some((inst) => inst.id === selectedId) && selectedId)
        || instances[0]?.id;

    const updateEdges = React.useCallback(() => {
        const el = scrollerRef.current;
        const max = el ? el.scrollWidth - el.clientWidth : 0;
        const next = el && scroll ? { start: el.scrollLeft > 4, end: el.scrollLeft < max - 4 } : { start: false, end: false };
        setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
    }, [scroll]);

    // Arrow visibility follows scrolling, resizes and the cards' width transitions.
    React.useEffect(() => {
        const el = scrollerRef.current;
        if (!el) return;
        updateEdges();
        el.addEventListener("scroll", updateEdges, { passive: true });
        el.addEventListener("transitionend", updateEdges);
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateEdges) : null;
        observer?.observe(el);
        return () => {
            el.removeEventListener("scroll", updateEdges);
            el.removeEventListener("transitionend", updateEdges);
            observer?.disconnect();
        };
    }, [updateEdges, instances.length]);

    // A server picked elsewhere (the hero rail) scrolls its card into view.
    React.useEffect(() => {
        const el = scrollerRef.current;
        if (!el || !scroll || !selectedId) return;
        const card = Array.from(el.children).find((child) => (child as HTMLElement).dataset.cardId === selectedId) as HTMLElement | undefined;
        if (!card) return;
        const left = card.offsetLeft;
        if (left < el.scrollLeft || left + Math.min(card.offsetWidth, el.clientWidth) > el.scrollLeft + el.clientWidth) {
            el.scrollTo({ left: Math.max(0, left - 4), behavior: m.reduced ? "auto" : "smooth" });
        }
    }, [selectedId, scroll, m.reduced]);

    const page = (dir: -1 | 1) => {
        const el = scrollerRef.current;
        if (!el) return;
        playClick();
        el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: m.reduced ? "auto" : "smooth" });
    };

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!scroll || e.pointerType !== "mouse" || e.button !== 0) return;
        dragRef.current = { x: e.clientX, left: e.currentTarget.scrollLeft, moved: false, pointerId: e.pointerId };
    };
    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const dx = e.clientX - drag.x;
        if (!drag.moved) {
            if (Math.abs(dx) < 6) return;
            drag.moved = true;
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
        }
        e.currentTarget.scrollLeft = drag.left - dx;
    };
    const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        dragRef.current = null;
        if (!drag.moved) return;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
        // Swallow the click that ends a drag so it doesn't select a card.
        suppressClickRef.current = true;
        window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    };

    return (
        <div className="relative">
            <div
                ref={scrollerRef}
                className={cn(
                    "flex gap-3",
                    scroll
                        ? cn(
                            // Padding keeps the selected ring and hover lift inside the scroll clip.
                            "relative -m-1 scroll-px-1 overflow-x-auto overscroll-x-contain p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                            dragging ? "cursor-grabbing select-none" : "snap-x snap-proximity"
                        )
                        : "h-88"
                )}
                onPointerLeave={() => setHoverId(null)}
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHoverId(null); }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onClickCapture={(e) => {
                    if (!suppressClickRef.current) return;
                    suppressClickRef.current = false;
                    e.preventDefault();
                    e.stopPropagation();
                }}
            >
                {instances.map((inst, i) => (
                    <ServerCard
                        key={inst.id}
                        instance={inst}
                        index={i}
                        scroll={scroll}
                        active={inst.id === activeId}
                        selected={inst.id === selectedId}
                        onActivate={() => { if (!dragRef.current?.moved) setHoverId(inst.id); }}
                        {...rest}
                    />
                ))}
            </div>

            {scroll && (
                <>
                    <RowArrow side="left" visible={edges.start} label={rest.t('previous')} onClick={() => page(-1)} />
                    <RowArrow side="right" visible={edges.end} label={rest.t('next')} onClick={() => page(1)} />
                </>
            )}
        </div>
    );
}

function RowArrow({ side, visible, label, onClick }: { side: "left" | "right"; visible: boolean; label: string; onClick: () => void }) {
    const m = useMotionPreset();
    const Icon = side === "left" ? Icons.ChevronLeft : Icons.ChevronRight;
    return (
        <div className={cn("pointer-events-none absolute inset-y-0 z-20 flex items-center", side === "left" ? "left-3" : "right-3")}>
            <AnimatePresence initial={false}>
                {visible && (
                    <motion.button
                        key={side}
                        type="button"
                        variants={m.scaleIn}
                        {...m.states}
                        {...m.hoverScale}
                        onClick={onClick}
                        title={label}
                        aria-label={label}
                        className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)] ring-1 ring-white/15 backdrop-blur-xl hover:bg-black/80"
                    >
                        <Icon className="h-5 w-5" />
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
}

function ServerCard({
    instance,
    index,
    scroll,
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
    /** Fixed widths in the scrolling strip instead of sharing the row by flex-grow. */
    scroll: boolean;
    active: boolean;
    selected: boolean;
    onActivate: () => void;
}) {
    const m = useMotionPreset();
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
    const fade = m.reduced ? "duration-0" : "duration-300";

    const select = () => { playClick(); onSelect(instance); };
    const openDetail = () => { playClick(); onViewDetail(instance); };

    return (
        <motion.div
            data-card-id={instance.id}
            variants={m.showcaseItem}
            custom={index}
            {...m.states}
            whileHover={m.hoverLift.whileHover}
            className={cn(
                "relative",
                scroll
                    ? "h-88 shrink-0 snap-start"
                    : "min-w-0 basis-0"
            )}
            style={scroll ? {
                // Minimum widths (poster 14rem, active 36rem) that still grow to fill the row,
                // so a strip that only just overflows doesn't leave an empty gap at the end.
                flexGrow: active ? 2.6 : 1,
                flexBasis: active ? "36rem" : "14rem",
                transition: m.reduced ? undefined : "flex-grow 450ms cubic-bezier(0.22, 1, 0.36, 1), flex-basis 450ms cubic-bezier(0.22, 1, 0.36, 1)",
            } : {
                flexGrow: active ? 2.6 : 1,
                transition: m.reduced ? undefined : "flex-grow 450ms cubic-bezier(0.22, 1, 0.36, 1)",
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
                    className={cn("absolute inset-0 transition-transform duration-700 ease-out", !m.reduced && "group-hover:scale-[1.03]", dimmed && "grayscale opacity-60")}
                />

                {/* Poster state: subtle gradient, small logo and name. */}
                <div className={cn("pointer-events-none absolute inset-0 transition-opacity", fade, active ? "opacity-0" : "opacity-100")}>
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/80 via-black/30 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 p-4">
                        {iconUrl && <img src={iconUrl} alt="" draggable={false} className="h-8 w-8 shrink-0 rounded-lg object-contain" />}
                        <span className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug text-white drop-shadow-md">{instance.name}<VerifiedBadge verification={instance.verification} size="sm" className="ml-1 align-[-2px]" /></span>
                    </div>
                </div>

                {/* Expanded state: name, subtitle, stats and two round actions. */}
                <div className={cn("absolute inset-0 transition-opacity", fade, active ? "opacity-100 delay-100" : "pointer-events-none opacity-0")}>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-black/85 via-black/35 to-transparent" />
                    <div className="pointer-events-none absolute bottom-0 left-0 w-[min(24rem,calc(100%-4.5rem))] min-w-56 p-5">
                        <h3 className="flex min-w-0 items-center gap-1.5 text-lg font-bold text-white drop-shadow-md" title={instance.name}><span className="truncate">{instance.name}</span><VerifiedBadge verification={instance.verification} size="sm" label /></h3>
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
                            className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur-md hover:bg-black/70"
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
                                "pressable flex h-9 w-9 items-center justify-center rounded-full ring-1 backdrop-blur-md",
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

/** Loading placeholder for the card row. */
export function ServerCardRowSkeleton({ colors }: { colors: any }) {
    return (
        <div className="flex h-88 gap-3">
            {Array.from({ length: FILL_MAX }).map((_, i) => (
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
    /** Address to show and ping; servers without one are left out. */
    getAddress: (instance: Instance) => ServerAddressInfo | null;
    getFlags: (instance: Instance) => ServerFlags;
    getPing: (instance: Instance) => ServerPing | undefined;
    getWithTimestamp: (url: string | null | undefined) => string;
    colors: any;
    t: T;
}

/** Latency buckets: 4 bars under 80 ms down to 1 bar from 300 ms. */
function signalOf(ping: ServerPing): { level: number; color: string } {
    const ms = ping.latency;
    if (!ping.online || typeof ms !== "number") return { level: 0, color: "#ef4444" };
    if (ms < 80) return { level: 4, color: "#22c55e" };
    if (ms < 150) return { level: 3, color: "#84cc16" };
    if (ms < 300) return { level: 2, color: "#eab308" };
    return { level: 1, color: "#ef4444" };
}

function SignalBars({ level, color, muted }: { level: number; color: string; muted: string }) {
    return (
        <span className="flex h-3.5 items-end gap-0.5" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
                <span
                    key={i}
                    className="w-0.75 rounded-[1px]"
                    style={{ height: `${(i + 1) * 25}%`, backgroundColor: i < level ? color : muted }}
                />
            ))}
        </span>
    );
}

/** Server favicon (pixel art, so no smoothing), else the instance icon, else a Dns glyph. */
function StatusFavicon({ sources, offline, colors }: { sources: { src: string; pixelated: boolean }[]; offline: boolean; colors: any }) {
    const [failed, setFailed] = React.useState<string[]>([]);
    const current = sources.find((s) => !failed.includes(s.src));
    return (
        <div
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl"
            style={{ backgroundColor: colors.surfaceContainerHighest }}
        >
            {current ? (
                <img
                    key={current.src}
                    src={current.src}
                    alt=""
                    draggable={false}
                    onError={() => setFailed((prev) => [...prev, current.src])}
                    className={cn(
                        "h-full w-full",
                        current.pixelated ? "object-cover [image-rendering:pixelated]" : "object-contain p-1",
                        offline && "opacity-50 grayscale"
                    )}
                />
            ) : (
                <Icons.Dns className="h-7 w-7" style={{ color: colors.onSurfaceVariant, opacity: offline ? 0.5 : 1 }} />
            )}
        </div>
    );
}

function StatusCardSkeleton({ colors }: { colors: any }) {
    const block = { backgroundColor: colors.surfaceContainerHighest };
    return (
        <div className="flex h-full gap-4" aria-hidden>
            <div className="h-16 w-16 shrink-0 rounded-xl animate-skeleton-wave" style={block} />
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                <div className="flex items-center justify-between gap-3">
                    <div className="h-4 w-32 rounded-md animate-skeleton-wave" style={block} />
                    <div className="h-3.5 w-12 rounded-md animate-skeleton-wave" style={block} />
                </div>
                <div className="h-3 w-40 rounded-md animate-skeleton-wave" style={block} />
                <div className="h-11 w-full rounded-lg animate-skeleton-wave" style={block} />
                <div className="h-3 w-3/5 rounded-md animate-skeleton-wave" style={block} />
            </div>
        </div>
    );
}

interface StatusCardProps extends ActionHandlers {
    instance: Instance;
    index: number;
    info: ServerAddressInfo;
    ping: ServerPing | undefined;
    flags: ServerFlags;
    getWithTimestamp: (url: string | null | undefined) => string;
    colors: any;
    t: T;
}

function StatusCard({ instance, index, info, ping, flags, getWithTimestamp, colors, t, onPlay, onStop, onJoin, onInstall }: StatusCardProps) {
    const m = useMotionPreset();
    const kind = getPrimaryKind(flags.isMember, flags.isInstalled, flags.isPlaying, flags.isLaunching);
    const danger = kind === "stop" || kind === "launching";
    const label = primaryLabel(kind, t);
    const online = !!ping?.online;
    const signal = ping ? signalOf(ping) : { level: 0, color: "#ef4444" };
    const muted = `${colors.onSurfaceVariant}40`;
    const players = online ? ping?.players : null;
    const fill = players && players.max > 0 ? Math.min(1, players.online / players.max) : 0;
    const version = (online && ping?.version) || instance.minecraftVersion;

    const iconSources = [
        ping?.favicon ? { src: ping.favicon, pixelated: true } : null,
        info.icon ? { src: info.icon, pixelated: true } : null,
        instance.iconUrl ? { src: getWithTimestamp(instance.iconUrl), pixelated: false } : null,
    ].filter((s): s is { src: string; pixelated: boolean } => !!s);

    const copyAddress = (e: React.MouseEvent) => {
        e.stopPropagation();
        playClick();
        const write = navigator.clipboard?.writeText(info.address);
        if (!write) { toastError(t('error_occurred')); return; }
        write.then(() => toastSuccess(t('server_address_copied')), () => toastError(t('error_occurred')));
    };

    return (
        <motion.div
            variants={m.showcaseItem}
            custom={index}
            {...m.states}
            whileHover={m.hoverLift.whileHover}
            className="group/status relative min-h-36 rounded-2xl p-4"
            style={{ backgroundColor: colors.surfaceContainer }}
        >
            {!ping ? (
                <StatusCardSkeleton colors={colors} />
            ) : (
                <motion.div variants={m.fadeIn} {...m.states} className="flex h-full gap-4">
                    <StatusFavicon sources={iconSources} offline={!online} colors={colors} />

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                        {/* Name and address; status on the right, swapped for the action on hover. */}
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-1 text-[15px] font-bold leading-tight" style={{ color: colors.onSurface }} title={instance.name}>
                                    <span className="truncate">{instance.name}</span>
                                    <VerifiedBadge verification={instance.verification} size="sm" />
                                </div>
                                <button
                                    type="button"
                                    onClick={copyAddress}
                                    title={`${t('copy')} · ${info.address}`}
                                    className="pressable group/addr -ml-1 mt-0.5 flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 font-mono text-xs hover:bg-current/10"
                                    style={{ color: colors.onSurfaceVariant }}
                                >
                                    <span className="truncate">{info.address}</span>
                                    <Icons.Copy className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/addr:opacity-100 group-focus-visible/addr:opacity-100" />
                                </button>
                            </div>

                            <div className="relative flex h-8 shrink-0 items-center">
                                <div
                                    className={cn(
                                        "flex items-center gap-1.5 text-xs font-semibold tabular-nums transition-opacity",
                                        !m.reduced && "duration-200",
                                        "group-hover/status:opacity-0"
                                    )}
                                    title={online ? t('online_badge') : (ping.error || t('server_offline'))}
                                >
                                    {online ? (
                                        <>
                                            <SignalBars level={signal.level} color={signal.color} muted={muted} />
                                            <span style={{ color: colors.onSurfaceVariant }}>
                                                {typeof ping.latency === "number" ? `${ping.latency} ms` : t('online_badge')}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
                                            <span style={{ color: colors.onSurfaceVariant }}>{t('server_offline')}</span>
                                        </>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => runPrimaryAction(kind, e, instance, { onJoin, onInstall, onPlay, onStop })}
                                    className="pressable pointer-events-none absolute right-0 top-0 flex h-8 translate-y-1 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-bold opacity-0 shadow-lg group-hover/status:pointer-events-auto group-hover/status:translate-y-0 group-hover/status:opacity-100 focus-visible:pointer-events-auto focus-visible:translate-y-0 focus-visible:opacity-100"
                                    style={danger ? { backgroundColor: colors.error || "#ef4444", color: "#fff" } : { backgroundColor: colors.secondary, color: "#111" }}
                                >
                                    <PrimaryIcon kind={kind} className="h-3.5 w-3.5" />
                                    {label}
                                </button>
                            </div>
                        </div>

                        {/* MOTD on a dark inset so the server's own colours stay readable in any theme. */}
                        <div className="min-h-11 rounded-lg bg-[#101012] px-3 py-1.5 text-[13px] leading-snug text-[#AAAAAA] shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)]">
                            {online ? (
                                <MinecraftText
                                    raw={ping.motdRaw}
                                    fallback={ping.motd}
                                    className="line-clamp-2 wrap-break-word whitespace-pre-line [text-shadow:1px_1px_0_rgba(0,0,0,0.45)]"
                                />
                            ) : (
                                <span className="line-clamp-2 text-white/40">{t('server_unreachable')}</span>
                            )}
                        </div>

                        {/* Players with a fill bar, then the version. */}
                        <div className="mt-auto flex items-center gap-3 text-xs" style={{ color: colors.onSurfaceVariant }}>
                            {players ? (
                                <div className="flex min-w-0 flex-1 items-center gap-2" title={t('online_players')}>
                                    <Icons.Users className="h-3.5 w-3.5 shrink-0" />
                                    <span className="font-bold tabular-nums" style={{ color: colors.onSurface }}>
                                        {players.online}
                                        <span className="font-semibold" style={{ color: colors.onSurfaceVariant }}>/{players.max}</span>
                                    </span>
                                    <div className="h-1.5 max-w-28 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                        <div
                                            className="h-full w-full origin-left rounded-full bg-[#22c55e] transition-transform duration-500"
                                            style={{ transform: `scaleX(${fill})` }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1" />
                            )}
                            {version && (
                                <span className="flex min-w-0 max-w-[45%] items-center gap-1.5 font-semibold" title={version}>
                                    <Icons.Box className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">{version}</span>
                                </span>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
}

/**
 * Live status cards for the listed servers that have an address (the instance's server address,
 * else its first servers.dat entry): favicon, MOTD, players, version and latency. Skeletons while
 * the first ping is out; hovering a card reveals its action.
 */
export function ServerStatusStrip({ instances, getAddress, getFlags, getPing, getWithTimestamp, colors, t, onPlay, onStop, onJoin, onInstall }: ServerStatusStripProps) {
    const items = instances
        .map((inst) => ({ inst, info: getAddress(inst) }))
        .filter((x): x is { inst: Instance; info: ServerAddressInfo } => !!x.info);
    if (items.length === 0) return null;

    return (
        <div className="@container">
            <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @6xl:grid-cols-3">
                {items.map(({ inst, info }, index) => (
                    <StatusCard
                        key={inst.id}
                        instance={inst}
                        index={index}
                        info={info}
                        ping={getPing(inst)}
                        flags={getFlags(inst)}
                        getWithTimestamp={getWithTimestamp}
                        colors={colors}
                        t={t}
                        onPlay={onPlay}
                        onStop={onStop}
                        onJoin={onJoin}
                        onInstall={onInstall}
                    />
                ))}
            </div>
        </div>
    );
}
