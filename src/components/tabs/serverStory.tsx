import React from "react";
import { createPortal } from "react-dom";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Icons } from "../ui/Icons";
import { stripMarkdown } from "../ui/SimpleMarkdown";

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
    /**
     * true: render into document.body as a fixed overlay (for clipped containers such as the hero).
     * false: cover the nearest positioned ancestor (the detail page).
     */
    portal?: boolean;
}

/** Full story reader; closes on backdrop click or Escape. */
export function StoryReaderModal({ open, onClose, title, source, t, portal = false }: StoryReaderModalProps) {
    React.useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    const overlay = (
        <div
            className={`${portal ? "fixed z-100" : "absolute z-40"} inset-0 flex items-center justify-center p-6 bg-black/55 backdrop-blur-sm animate-in fade-in duration-150`}
            onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={t("story")}
                className="relative w-full max-w-3xl max-h-[80%] flex flex-col rounded-3xl bg-[#121214]/95 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-4 px-8 pt-7 pb-4 shrink-0">
                    <h2 className="font-display text-2xl text-white">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t("close")}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 text-white transition hover:bg-white/20"
                    >
                        <Icons.X className="w-5 h-5" />
                    </button>
                </div>
                <div className="overflow-y-auto custom-scrollbar px-8 pb-8 text-lg font-normal leading-relaxed text-white/90 wrap-break-word">
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
    );

    return portal ? createPortal(overlay, document.body) : overlay;
}
