import React from "react";
import Markdown from "react-markdown";
import { Icons } from "../ui/Icons";
import { cn } from "../../lib/utils";
import { playClick } from "../../lib/sounds";

type SocialLink = {
    type?: string;
    url: string;
};

function getSafeExternalUrl(rawUrl?: string | null): string | null {
    if (typeof rawUrl !== "string") return null;
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

function parseSocialLinks(rawSocials: unknown): SocialLink[] {
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
    onViewLogs,
}: ServerDetailViewProps) {
    const heroImage = instance.bannerUrl || instance.image || instance.iconUrl;
    const socialLinks = parseSocialLinks(instance.socials);
    const safeWebsiteUrl = getSafeExternalUrl(instance.websiteUrl);
    const isActive = isPlaying || isLaunching;
    const isOnline = instance.status === "active";

    const playerSummary = instance.players
        ? `${instance.players.online}/${instance.players.max}`
        : typeof instance.playerCount === "number"
            ? instance.maxPlayers
                ? `${instance.playerCount}/${instance.maxPlayers}`
                : String(instance.playerCount)
            : null;

    const hasExternalLinks = socialLinks.length > 0 || !!safeWebsiteUrl;

    const handleOpenExternal = (url: string) => {
        const safeUrl = getSafeExternalUrl(url);
        if (!safeUrl) return;
        window.api?.openExternal?.(safeUrl);
    };

    const getSocialIcon = (url: string, type?: string) => {
        const l = url.toLowerCase(), lt = type?.toLowerCase() || "";
        if (lt === "discord" || l.includes("discord")) return Icons.Discord;
        if (lt === "youtube" || l.includes("youtu")) return Icons.YouTube;
        if (lt === "facebook" || l.includes("facebook")) return Icons.Facebook;
        if (lt === "twitter" || lt === "x" || l.includes("twitter") || l.includes("x.com")) return Icons.TwitterX;
        if (lt === "instagram" || l.includes("instagram")) return Icons.Instagram;
        return Icons.Globe;
    };

    const getSocialColor = (url: string, type?: string) => {
        const l = url.toLowerCase(), lt = type?.toLowerCase() || "";
        if (lt === "discord" || l.includes("discord")) return "#5865F2";
        if (lt === "youtube" || l.includes("youtu")) return "#DC2626";
        if (lt === "facebook" || l.includes("facebook")) return "#2563EB";
        if (lt === "twitter" || lt === "x" || l.includes("twitter") || l.includes("x.com")) return "#111827";
        if (lt === "instagram" || l.includes("instagram"))
            return "linear-gradient(45deg,#f09433 0%,#e6683c 28%,#dc2743 55%,#bc1888 100%)";
        return "#2b2d31";
    };

    return (
        <div className="flex-1 flex flex-col h-full animate-fade-in relative z-10 overflow-hidden">

            {/* ── Back Button ───────────────────────────────────────────── */}
            <div className="flex items-center gap-3 mb-4 shrink-0">
                <button
                    type="button"
                    onClick={() => { playClick(); onBack(); }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all hover:bg-black/5 active:scale-[0.98]"
                    style={{ color: colors.onSurface }}
                >
                    <Icons.ArrowLeft className="w-5 h-5" />
                    <span className="font-medium">{t("back")}</span>
                </button>
            </div>

            {/* ── Hero Banner ───────────────────────────────────────────── */}
            <div className="relative w-full rounded-2xl overflow-hidden mb-5 shrink-0" style={{ height: "220px" }}>
                {/* Background */}
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{
                        backgroundImage: heroImage ? `url(${getWithTimestamp(heroImage)})` : undefined,
                        backgroundColor: colors.surfaceContainerHighest,
                    }}
                >
                    {!heroImage && (
                        <div className="w-full h-full flex items-center justify-center">
                            <span className="text-8xl font-black opacity-[0.07]" style={{ color: colors.onSurface }}>
                                {instance.name?.[0]?.toUpperCase()}
                            </span>
                        </div>
                    )}
                </div>

                {/* Gradient overlays */}
                <div className="absolute inset-0 bg-linear-to-r from-black/80 via-black/45 to-black/10" />
                <div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-black/60 to-transparent" />

                {/* Content overlay */}
                <div className="absolute inset-0 flex items-end p-5 gap-4">
                    {/* Icon */}
                    {instance.iconUrl ? (
                        <img
                            src={getWithTimestamp(instance.iconUrl)}
                            alt={t("server_icon_alt")}
                            className="w-16 h-16 rounded-xl object-contain shrink-0 shadow-xl"
                        />
                    ) : (
                        <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-white/10 shrink-0">
                            <span className="text-2xl font-black text-white">
                                {instance.name?.[0]?.toUpperCase()}
                            </span>
                        </div>
                    )}

                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl font-black text-white tracking-tight truncate leading-tight">
                            {instance.name}
                        </h1>
                        {instance.description && (
                            <p className="text-white/65 text-sm line-clamp-1 mt-0.5">
                                {instance.description}
                            </p>
                        )}
                    </div>

                    {/* Status badge - top right */}
                    <div className="absolute top-4 right-4">
                        <span
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border backdrop-blur-md uppercase tracking-wide",
                                isOnline
                                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                                    : "bg-red-500/15 border-red-500/30 text-red-400"
                            )}
                        >
                            <span className={cn("w-1.5 h-1.5 rounded-full", isOnline ? "bg-emerald-400 animate-pulse" : "bg-red-400")} />
                            {isOnline ? "Online" : "Offline"}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Stats Chips Row ───────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2 mb-5 shrink-0">
                {instance.minecraftVersion && (
                    <div
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border"
                        style={{
                            backgroundColor: colors.surfaceContainer,
                            color: colors.onSurfaceVariant,
                            borderColor: `${colors.outline}25`,
                        }}
                    >
                        <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                        </svg>
                        MC {instance.minecraftVersion}
                    </div>
                )}
                {instance.loaderType && (
                    <div
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border uppercase tracking-wide"
                        style={{
                            backgroundColor: colors.surfaceContainer,
                            color: colors.onSurfaceVariant,
                            borderColor: `${colors.outline}25`,
                        }}
                    >
                        {instance.loaderType}
                    </div>
                )}
                {playerSummary && (
                    <div
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border"
                        style={{
                            backgroundColor: colors.surfaceContainer,
                            color: colors.onSurfaceVariant,
                            borderColor: `${colors.outline}25`,
                        }}
                    >
                        <Icons.Person className="w-3.5 h-3.5 opacity-60" />
                        {playerSummary} {t("online_players") || "players"}
                    </div>
                )}
                {instance.address && (
                    <div
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono border"
                        style={{
                            backgroundColor: colors.surfaceContainer,
                            color: colors.onSurfaceVariant,
                            borderColor: `${colors.outline}25`,
                        }}
                    >
                        <Icons.Dns className="w-3.5 h-3.5 opacity-60" />
                        {instance.address}
                    </div>
                )}
            </div>

            {/* ── Main Layout: Actions (left) + Description (right) ─────── */}
            <div className="flex-1 grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-5 overflow-y-auto xl:overflow-hidden min-h-0">

                {/* LEFT: Action Buttons + Social Links */}
                <div className="flex flex-col gap-3 xl:overflow-y-auto shrink-0">

                    {/* Primary action */}
                    {!isMember ? (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); playClick(); onJoin(instance); }}
                            className="w-full h-12 rounded-xl flex items-center justify-center gap-2.5 transition-all hover:brightness-105 active:scale-[0.98] font-bold text-base"
                            style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                        >
                            <Icons.UserPlus className="w-5 h-5" />
                            {t("join")}
                        </button>
                    ) : isInstalled ? (
                        <div className="flex gap-2">
                            {/* Play / Stop */}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    playClick();
                                    isActive ? onStop(e, instance.id) : onPlay(e, instance);
                                }}
                                className="flex-1 h-12 rounded-xl flex items-center justify-center gap-2.5 transition-all hover:brightness-105 active:scale-[0.98] font-bold text-base"
                                style={
                                    isActive
                                        ? { backgroundColor: colors.error || "#ef4444", color: "#fff" }
                                        : { backgroundColor: colors.secondary, color: "#1a1a1a" }
                                }
                            >
                                {isLaunching ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                                        {t("launching")}
                                    </>
                                ) : isPlaying ? (
                                    <>
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z" /></svg>
                                        {t("stop")}
                                    </>
                                ) : (
                                    <>
                                        <Icons.Play className="w-5 h-5 fill-current" />
                                        {t("play")}
                                    </>
                                )}
                            </button>
                            {/* Logs */}
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); playClick(); onViewLogs(e, instance); }}
                                className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:brightness-105 active:scale-[0.98]"
                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                title={t("logs")}
                            >
                                <Icons.Terminal className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); playClick(); onInstall(e, instance); }}
                            className="w-full h-12 rounded-xl flex items-center justify-center gap-2.5 transition-all hover:brightness-105 active:scale-[0.98] font-bold text-base"
                            style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                        >
                            <Icons.Download className="w-5 h-5" />
                            {t("install")}
                        </button>
                    )}

                    {/* Social links */}
                    {hasExternalLinks && (
                        <div className="flex gap-2 flex-wrap">
                            {socialLinks.map((link, i) => {
                                const Icon = getSocialIcon(link.url, link.type);
                                return (
                                    <button
                                        key={`${link.url}-${i}`}
                                        type="button"
                                        onClick={() => handleOpenExternal(link.url)}
                                        className="flex-1 min-w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold transition-all hover:scale-[1.04] active:scale-[0.97]"
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
                                    onClick={() => handleOpenExternal(safeWebsiteUrl)}
                                    className="flex-1 min-w-10 h-10 rounded-xl flex items-center justify-center bg-[#2b2d31] text-white font-bold transition-all hover:scale-[1.04] active:scale-[0.97]"
                                    title={safeWebsiteUrl}
                                >
                                    <Icons.Globe className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* RIGHT: Description */}
                <div className="flex flex-col gap-4 overflow-y-auto xl:overflow-y-auto custom-scrollbar pb-6">
                    <div>
                        <h2
                            className="text-lg font-bold flex items-center gap-2.5 mb-3"
                            style={{ color: colors.onSurface }}
                        >
                            <Icons.Book className="w-5 h-5" style={{ color: colors.primary }} />
                            {t("story")}
                        </h2>
                        <div
                            className="text-sm leading-relaxed markdown-content"
                            style={{ color: colors.onSurfaceVariant }}
                        >
                            <Markdown>{instance.richDescription || instance.description || t("no_description")}</Markdown>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ServerDetailView;
