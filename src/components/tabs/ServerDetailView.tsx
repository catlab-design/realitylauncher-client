import React from "react";
import { Icons } from "../ui/Icons";
import { playClick } from "../../lib/sounds";
import { useUiStore } from "../../store/uiStore";
import appBanner from "../../assets/banner.png";
import { ServerSocialButtons, StoryReaderModal, useServerStory } from "./serverStory";

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
    const isActive = isPlaying || isLaunching;

    const [addressCopied, setAddressCopied] = React.useState(false);
    const copyAddress = () => {
        if (!instance.address) return;
        navigator.clipboard?.writeText(instance.address).then(() => {
            setAddressCopied(true);
            setTimeout(() => setAddressCopied(false), 1500);
        });
    };

    // Let the title bar float over the art while this page is open.
    const setImmersive = useUiStore((state) => state.setImmersive);
    const setFullBleed = useUiStore((state) => state.setFullBleed);
    React.useEffect(() => {
        setImmersive(true);
        setFullBleed(true);
        return () => { setImmersive(false); setFullBleed(false); };
    }, [setImmersive, setFullBleed]);

    const [storyOpen, setStoryOpen] = React.useState(false);
    const closeStory = React.useCallback(() => setStoryOpen(false), []);
    const { source: storySource, hasStory, headline: storyHeadline, excerpt: storyExcerpt } = useServerStory(instance);

    const glass = "bg-black/45 backdrop-blur-xl";
    const chip = `h-9 px-3.5 rounded-full flex items-center gap-2 text-sm font-semibold text-white ${glass}`;

    return (
        // Bleed past <main>'s padding so the art runs edge to edge.
        <div className="-mx-6 -mt-3 -mb-6 relative h-[calc(100%+2.25rem)] overflow-hidden animate-fade-in z-10" style={{ backgroundColor: "#000" }}>
            {/* Backdrop */}
            <img
                src={heroImage ? getWithTimestamp(heroImage) : appBanner}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-linear-to-b from-black/45 via-transparent to-black/55" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/50 to-transparent" />
            <div className="absolute inset-0 bg-linear-to-r from-black/30 via-transparent to-transparent" />

            {/* Top-left: back + identity */}
            <div className="absolute top-15 left-6 right-6 z-10">
                <div className="flex items-center gap-4 min-w-0">
                    <button
                        type="button"
                        onClick={() => { playClick(); onBack(); }}
                        aria-label={t("back")}
                        className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white transition hover:bg-black/70 active:scale-95 ${glass}`}
                    >
                        <Icons.ArrowLeft className="w-5 h-5" />
                    </button>
                    {instance.iconUrl ? (
                        <img
                            src={getWithTimestamp(instance.iconUrl)}
                            alt={t("server_icon_alt")}
                            className="w-16 h-16 rounded-2xl object-contain shrink-0 drop-shadow-xl"
                        />
                    ) : (
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-2xl font-black text-white ${glass}`}>
                            {instance.name?.[0]?.toUpperCase()}
                        </div>
                    )}
                    <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="font-display text-3xl md:text-4xl text-white leading-tight truncate drop-shadow-lg">
                                {instance.name}
                            </h1>
                            {instance.modpack && (
                                <div className={chip}>
                                    <Icons.Box className="w-4 h-4" />
                                    {instance.modpack}
                                </div>
                            )}
                            {instance.address && (
                                <button
                                    type="button"
                                    onClick={() => { playClick(); copyAddress(); }}
                                    title={t("copy") || "Copy"}
                                    className={`${chip} font-mono transition hover:bg-black/70 active:scale-[0.98]`}
                                >
                                    <Icons.Dns className="w-4 h-4" />
                                    {instance.address}
                                    {addressCopied ? <Icons.Check className="w-4 h-4 text-emerald-400" /> : <Icons.Copy className="w-4 h-4 text-white/60" />}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom-left: a short teaser; the full story opens in a reader so the art stays clear. */}
            <div className="absolute left-8 bottom-8 z-10 w-[min(36rem,calc(100%-30rem))] drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]">
                {storyHeadline && (
                    <p className="font-display text-2xl leading-snug text-white line-clamp-2">{storyHeadline}</p>
                )}
                {storyExcerpt && (
                    <p className="text-base leading-relaxed text-white/80 mt-2 line-clamp-2">{storyExcerpt}</p>
                )}
                {hasStory && (
                    <button
                        type="button"
                        onClick={() => { playClick(); setStoryOpen(true); }}
                        className={`mt-4 h-10 px-4 rounded-full flex items-center gap-2 text-sm font-semibold text-white transition hover:bg-black/70 ${glass}`}
                    >
                        {t("read_more")}
                        <Icons.ChevronRight className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Bottom-right: the one action */}
            <div className="absolute right-6 bottom-6 z-10 flex items-center gap-3">
                <ServerSocialButtons socials={instance.socials} websiteUrl={instance.websiteUrl} />
                {!isMember ? (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); playClick(); onJoin(instance); }}
                        className="h-14 px-9 rounded-full flex items-center justify-center gap-2.5 text-lg font-bold shadow-xl transition hover:brightness-105 active:scale-[0.97]"
                        style={{ backgroundColor: colors.secondary, color: "#111" }}
                    >
                        <Icons.UserPlus className="w-5 h-5" />
                        {t("join")}
                    </button>
                ) : isInstalled ? (
                    <>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); playClick(); onViewLogs(e, instance); }}
                            className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl transition hover:bg-black/70 active:scale-95 bg-black/50 backdrop-blur-xl"
                            title={t("logs")}
                        >
                            <Icons.Terminal className="w-5 h-5" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                playClick();
                                isActive ? onStop(e, instance.storagePath || instance.id) : onPlay(e, instance);
                            }}
                            className="h-14 px-9 rounded-full flex items-center justify-center gap-2.5 text-lg font-bold shadow-xl transition hover:brightness-105 active:scale-[0.97]"
                            style={isActive ? { backgroundColor: colors.error || "#ef4444", color: "#fff" } : { backgroundColor: colors.secondary, color: "#111" }}
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
                    </>
                ) : (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); playClick(); onInstall(e, instance); }}
                        className="h-14 px-9 rounded-full flex items-center justify-center gap-2.5 text-lg font-bold shadow-xl transition hover:brightness-105 active:scale-[0.97]"
                        style={{ backgroundColor: colors.secondary, color: "#111" }}
                    >
                        <Icons.Download className="w-5 h-5" />
                        {t("install")}
                    </button>
                )}
            </div>

            <StoryReaderModal
                open={storyOpen}
                onClose={closeStory}
                title={instance.name}
                source={storySource}
                t={t}
            />
        </div>
    );
}

export default ServerDetailView;
