import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Icons } from "../ui/Icons";
import { ScrollStrip } from "../ui/ScrollStrip";
import { stripMarkdown } from "../ui/SimpleMarkdown";
import { useMotionPreset } from "../../lib/motion";
import { GalleryLightbox } from "./ServerGallery";
import type { GalleryImage } from "./ServerItem";

// Shared by the server detail page and the Server List hero: story teaser, reader and social links.

export type SocialLink = {
    type?: string;
    url: string;
};

export function getSafeExternalUrl(rawUrl?: string | null): string | null {
    if (typeof rawUrl !== "string") return null;
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

function getHostname(rawUrl?: string | null): string {
    if (typeof rawUrl !== "string") return "";
    try {
        return new URL(rawUrl).hostname.toLowerCase();
    } catch {
        return "";
    }
}

export function parseSocialLinks(rawSocials: unknown): SocialLink[] {
    if (typeof rawSocials !== "string" || rawSocials.trim().length === 0) return [];
    try {
        const parsed = JSON.parse(rawSocials);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((entry): entry is { type?: unknown; url?: unknown } => !!entry && typeof entry === "object")
            .map((entry) => ({
                type: typeof entry.type === "string" ? entry.type : undefined,
                url: typeof entry.url === "string" ? entry.url : "",
            }))
            .filter((entry) => !!getSafeExternalUrl(entry.url));
    } catch (e) {
        console.error("Failed to parse social links", e);
        return [];
    }
}

/** Opens an http(s) link in the system browser; anything else is ignored. */
export function openExternalUrl(url: string) {
    const safeUrl = getSafeExternalUrl(url);
    if (!safeUrl) return;
    window.api?.openExternal?.(safeUrl);
}

export function getSocialIcon(url: string, type?: string) {
    const lt = type?.toLowerCase() || "";
    const host = getHostname(url);
    const isXHost = host === "x.com" || host.endsWith(".x.com");
    const isTwitterHost = host === "twitter.com" || host.endsWith(".twitter.com");
    const isDiscordHost = host === "discord.com" || host === "discord.gg" || host.endsWith(".discord.com") || host.endsWith(".discord.gg");
    if (lt === "discord" || isDiscordHost) return Icons.Discord;
    if (lt === "youtube" || host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") return Icons.YouTube;
    if (lt === "facebook" || host === "facebook.com" || host.endsWith(".facebook.com")) return Icons.Facebook;
    if (lt === "twitter" || lt === "x" || isTwitterHost || isXHost) return Icons.TwitterX;
    if (lt === "instagram" || host === "instagram.com" || host.endsWith(".instagram.com")) return Icons.Instagram;
    return Icons.Globe;
}

export function getSocialColor(url: string, type?: string) {
    const lt = type?.toLowerCase() || "";
    const host = getHostname(url);
    const isXHost = host === "x.com" || host.endsWith(".x.com");
    const isTwitterHost = host === "twitter.com" || host.endsWith(".twitter.com");
    const isDiscordHost = host === "discord.com" || host === "discord.gg" || host.endsWith(".discord.com") || host.endsWith(".discord.gg");
    if (lt === "discord" || isDiscordHost) return "#5865F2";
    if (lt === "youtube" || host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") return "#DC2626";
    if (lt === "facebook" || host === "facebook.com" || host.endsWith(".facebook.com")) return "#2563EB";
    if (lt === "twitter" || lt === "x" || isTwitterHost || isXHost) return "#111827";
    if (lt === "instagram" || host === "instagram.com" || host.endsWith(".instagram.com"))
        return "linear-gradient(45deg,#f09433 0%,#e6683c 28%,#dc2743 55%,#bc1888 100%)";
    return "#2b2d31";
}

export interface ServerStory {
    /** Raw markdown of the story (richDescription, else description). */
    source: string;
    hasStory: boolean;
    headline: string;
    excerpt: string;
}

/** Teaser: first heading (or first line) as the headline, the next bit of text as a two-line excerpt. */
export function useServerStory(instance: { richDescription?: string | null; description?: string | null } | null | undefined): ServerStory {
    const source: string = instance?.richDescription || instance?.description || "";
    return React.useMemo(() => {
        const hasStory = source.trim().length > 0;
        const storyLines = stripMarkdown(source).split("\n").map((l) => l.trim()).filter(Boolean);
        const firstHeading = source.split("\n").map((l) => l.trim()).find((l) => /^#{1,6}\s+/.test(l));
        // Only a real Markdown heading is a headline; plain text stays body copy (its first
        // sentence used to be promoted to a heavy display headline).
        const headline = firstHeading ? stripMarkdown(firstHeading) : "";
        const excerpt = storyLines.filter((l) => l !== headline).join(" ").slice(0, 220);
        return { source, hasStory, headline, excerpt };
    }, [source]);
}

interface ServerSocialButtonsProps {
    socials?: unknown;
    websiteUrl?: string | null;
    /** Size classes of each round button. */
    sizeClassName?: string;
}

/** Round social buttons plus a website button (when the site is not already among the socials). */
export function ServerSocialButtons({ socials, websiteUrl, sizeClassName = "w-14 h-14" }: ServerSocialButtonsProps) {
    const socialLinks = parseSocialLinks(socials);
    const safeWebsiteUrl = getSafeExternalUrl(websiteUrl);
    if (socialLinks.length === 0 && !safeWebsiteUrl) return null;

    return (
        <>
            {socialLinks.map((link, i) => {
                const Icon = getSocialIcon(link.url, link.type);
                return (
                    <button
                        key={`${link.url}-${i}`}
                        type="button"
                        onClick={() => openExternalUrl(link.url)}
                        className={`${sizeClassName} rounded-full flex items-center justify-center text-white shadow-xl ring-1 ring-white/20 transition hover:scale-105 active:scale-95`}
                        style={{ background: getSocialColor(link.url, link.type) }}
                        title={link.type || link.url}
                    >
                        <Icon className="w-5 h-5" />
                    </button>
                );
            })}
            {safeWebsiteUrl && !socialLinks.some((l) => getSafeExternalUrl(l.url) === safeWebsiteUrl) && (
                <button
                    type="button"
                    onClick={() => openExternalUrl(safeWebsiteUrl)}
                    className={`${sizeClassName} rounded-full flex items-center justify-center text-white shadow-xl ring-1 ring-white/20 transition hover:scale-105 active:scale-95 bg-black/45 backdrop-blur-xl`}
                    title={safeWebsiteUrl}
                >
                    <Icons.Globe className="w-5 h-5" />
                </button>
            )}
        </>
    );
}

interface StoryReaderModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    /** Markdown source; falls back to t("no_description"). */
    source: string;
    t: (key: any) => string;
    /** Banner shown as the reader's header image. */
    imageUrl?: string | null;
    /** Server gallery, shown as a grid under the story (opens the fullscreen viewer). */
    images?: GalleryImage[];
    /** Gallery image to show first when opening (default: the banner / first slide). */
    initialGalleryIndex?: number | null;
    /**
     * true: render into document.body as a fixed overlay (for clipped containers such as the hero).
     * false: cover the nearest positioned ancestor (the detail page).
     */
    portal?: boolean;
}

/** Full story reader; closes on backdrop click or Escape. */
export function StoryReaderModal({ open, onClose, title, source, t, portal = false, imageUrl, images = [], initialGalleryIndex = null }: StoryReaderModalProps) {
    const m = useMotionPreset();
    const [viewerIndex, setViewerIndex] = React.useState<number | null>(null);
    // Viewer slides: the banner first (when set), then the gallery.
    const slides = React.useMemo(
        () => [
            ...(imageUrl ? [{ url: imageUrl, caption: null as string | null }] : []),
            ...images.map((image) => ({ url: image.url, caption: image.caption ?? null })),
        ],
        [imageUrl, images],
    );
    const [active, setActive] = React.useState(0);
    React.useEffect(() => {
        if (!open) return;
        // Banner is slide 0 when present, so gallery image i is slide i + 1.
        setActive(initialGalleryIndex !== null ? initialGalleryIndex + (imageUrl ? 1 : 0) : 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    const step = React.useCallback(
        (delta: number) => setActive((i) => (slides.length ? (i + delta + slides.length) % slides.length : 0)),
        [slides.length],
    );
    /** Gallery index of a slide (the banner slide has none). */
    const galleryIndexOf = (slide: number): number | null => {
        const g = imageUrl ? slide - 1 : slide;
        return g >= 0 && g < images.length ? g : null;
    };
    React.useEffect(() => { if (!open) setViewerIndex(null); }, [open]);
    React.useEffect(() => {
        // While the image viewer is open it owns Escape (closes itself first).
        if (!open || viewerIndex !== null) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowRight") step(1);
            else if (e.key === "ArrowLeft") step(-1);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose, viewerIndex, step]);

    const overlay = (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="story-reader"
                    className={`${portal ? "fixed z-100" : "absolute z-40"} inset-0 flex items-center justify-center p-6 bg-black/55 backdrop-blur-sm`}
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    variants={m.modal.backdrop}
                    {...m.states}
                >
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-label={t("story")}
                        className="relative flex w-full max-w-6xl max-h-[90vh] flex-col overflow-hidden rounded-3xl bg-[#121214]/95 p-6 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                        variants={m.modal.panel}
                    >
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={t("close")}
                            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center bg-black/55 backdrop-blur-md text-white transition hover:bg-black/75"
                        >
                            <Icons.X className="w-5 h-5" />
                        </button>

                        {/* Top: story text (left) + large viewer (right). */}
                        <div className={`grid min-h-0 gap-6 ${slides.length > 0 ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]" : "flex-1"}`}>
                            <div className="relative min-h-0">
                            <div className={`overflow-y-auto custom-scrollbar pr-2 pt-1 ${slides.length > 0 ? "max-h-64 md:max-h-none md:absolute md:inset-0" : "h-full"}`}>
                                <h2 className="font-display text-3xl text-white mb-4 pr-12 md:pr-0">{title}</h2>
                                <div className="text-lg font-normal leading-relaxed text-white/90 wrap-break-word">
                                <Markdown
                                    remarkPlugins={[remarkGfm, remarkBreaks]}
                                    rehypePlugins={[rehypeRaw, rehypeSanitize]}
                                    components={{
                                        h1: ({ node, ...props }: any) => <h1 className="text-3xl font-extrabold text-white mt-5 mb-3 first:mt-0" {...props} />,
                                        h2: ({ node, ...props }: any) => <h2 className="text-2xl font-extrabold text-white mt-5 mb-3 first:mt-0" {...props} />,
                                        h3: ({ node, ...props }: any) => <h3 className="text-xl font-bold text-white mt-4 mb-2 first:mt-0" {...props} />,
                                        h4: ({ node, ...props }: any) => <h4 className="text-lg font-semibold mt-4 mb-2 first:mt-0" {...props} />,
                                        p: ({ node, ...props }: any) => <p className="mb-4 last:mb-0" {...props} />,
                                        strong: ({ node, ...props }: any) => <strong className="font-bold text-white" {...props} />,
                                        em: ({ node, ...props }: any) => <em className="italic" {...props} />,
                                        del: ({ node, ...props }: any) => <del className="opacity-70" {...props} />,
                                        a: ({ node, href, children, ...props }: any) => (
                                            <a
                                                href={href || "#"}
                                                onClick={(e) => { e.preventDefault(); if (href) openExternalUrl(href); }}
                                                className="font-semibold underline decoration-2 underline-offset-4 decoration-[#ffdd57] hover:opacity-80 cursor-pointer"
                                                {...props}
                                            >
                                                {children}
                                            </a>
                                        ),
                                        ul: ({ node, ...props }: any) => <ul className="list-disc pl-6 mb-4 space-y-1.5 marker:text-white/60" {...props} />,
                                        ol: ({ node, ...props }: any) => <ol className="list-decimal pl-6 mb-4 space-y-1.5 marker:text-white/60" {...props} />,
                                        li: ({ node, ...props }: any) => <li className="pl-1" {...props} />,
                                        blockquote: ({ node, ...props }: any) => <blockquote className="border-l-4 border-[#ffdd57] pl-4 my-4 text-white/80" {...props} />,
                                        hr: ({ node, ...props }: any) => <hr className="my-5 border-0 h-px bg-white/25" {...props} />,
                                        img: ({ node, ...props }: any) => <img className="max-w-full rounded-xl my-3" loading="lazy" alt="" {...props} />,
                                        code: ({ node, inline, className, children, ...props }: any) =>
                                            inline !== false && !className ? (
                                                <code className="px-1.5 py-0.5 rounded-md bg-white/15 font-mono text-[0.88em]" {...props}>{children}</code>
                                            ) : (
                                                <code className="block p-4 rounded-xl my-4 bg-black/55 font-mono text-[15px] whitespace-pre-wrap" {...props}>{children}</code>
                                            ),
                                        pre: ({ node, ...props }: any) => <pre className="my-4 max-w-full" {...props} />,
                                        table: ({ node, ...props }: any) => (
                                            <div className="overflow-x-auto my-4 rounded-xl bg-black/40">
                                                <table className="w-full text-base border-collapse" {...props} />
                                            </div>
                                        ),
                                        th: ({ node, ...props }: any) => <th className="px-4 py-2.5 text-left font-bold border-b border-white/20" {...props} />,
                                        td: ({ node, ...props }: any) => <td className="px-4 py-2.5 border-b border-white/10" {...props} />,
                                    }}
                                >
                                    {source || t("no_description")}
                                </Markdown>
                                </div>
                            </div>
                            </div>

                            {slides.length > 0 && (
                                <div className="relative aspect-video w-full self-start overflow-hidden rounded-2xl bg-black/40">
                                    <AnimatePresence initial={false} mode="popLayout">
                                        <motion.img
                                            key={slides[active].url}
                                            src={slides[active].url}
                                            alt={slides[active].caption || ""}
                                            draggable={false}
                                            onClick={() => images.length > 0 && setViewerIndex(galleryIndexOf(active))}
                                            className={`absolute inset-0 h-full w-full object-cover ${images.length > 0 && galleryIndexOf(active) !== null ? "cursor-zoom-in" : ""}`}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: m.reduced ? 0.1 : 0.35 }}
                                        />
                                    </AnimatePresence>
                                    {slides[active].caption && (
                                        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 to-transparent px-5 pb-4 pt-10 text-sm text-white/90">
                                            {slides[active].caption}
                                        </div>
                                    )}
                                    {slides.length > 1 && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => step(-1)}
                                                aria-label={t("previous")}
                                                className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-md text-white transition hover:bg-black/70"
                                            >
                                                <Icons.ChevronLeft className="w-5 h-5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => step(1)}
                                                aria-label={t("next")}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-md text-white transition hover:bg-black/70"
                                            >
                                                <Icons.ChevronRight className="w-5 h-5" />
                                            </button>
                                            <span className="absolute top-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold tabular-nums text-white/90 backdrop-blur-md">
                                                {active + 1} / {slides.length}
                                            </span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Bottom: thumbnail strip. */}
                        {slides.length > 1 && (
                            <ScrollStrip className="mt-5 shrink-0" viewportClassName="flex gap-3 -m-1 p-1">
                                {slides.map((slide, i) => (
                                    <button
                                        key={slide.url}
                                        type="button"
                                        onClick={() => setActive(i)}
                                        aria-label={slide.caption || `${i + 1}`}
                                        aria-current={i === active}
                                        className={`relative h-24 min-w-40 flex-1 basis-0 overflow-hidden rounded-xl transition ${i === active ? "ring-2 ring-[#ffdd57] opacity-100" : "opacity-55 hover:opacity-90"}`}
                                    >
                                        <img src={slide.url} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
                                    </button>
                                ))}
                            </ScrollStrip>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return (
        <>
            {portal ? createPortal(overlay, document.body) : overlay}
            <GalleryLightbox images={images} index={viewerIndex} onIndexChange={setViewerIndex} onClose={() => setViewerIndex(null)} t={t} />
        </>
    );
}
