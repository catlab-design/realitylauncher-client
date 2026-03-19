import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { useTranslation } from "../../hooks/useTranslation";
import { useConfigStore } from "../../store/configStore";
import { useAuthStore } from "../../store/authStore";
import { Icons } from "../ui/Icons";
import { SkinPreview3D } from "./wardrobe/SkinPreview3D";

interface WardrobeProps {
    colors: any;
}

type SkinVariant = "classic" | "slim";

type SkinEntry = {
    id: string;
    state: string;
    url: string;
    variant: string;
    alias?: string;
};

type MinecraftProfile = {
    id: string;
    name: string;
    skins: SkinEntry[];
    capes: any[];
    activeSkin?: SkinEntry | null;
    skinUrl?: string | null;
    variant?: string;
};

const WARDROBE_PROFILE_CACHE_TTL_MS = 60 * 1000;

let cachedWardrobeProfile:
    | {
        username: string;
        fetchedAt: number;
        profile: MinecraftProfile;
    }
    | null = null;

function normalizeVariant(input?: string | null): SkinVariant {
    return String(input || "").toLowerCase() === "slim" ? "slim" : "classic";
}

function getCachedWardrobeProfile(username?: string | null): MinecraftProfile | null {
    if (!username || !cachedWardrobeProfile) return null;
    if (cachedWardrobeProfile.username !== username) return null;
    if (Date.now() - cachedWardrobeProfile.fetchedAt > WARDROBE_PROFILE_CACHE_TTL_MS) {
        return null;
    }
    return cachedWardrobeProfile.profile;
}

function setCachedWardrobeProfile(
    username: string | undefined,
    profile: MinecraftProfile,
): void {
    if (!username) return;
    cachedWardrobeProfile = {
        username,
        fetchedAt: Date.now(),
        profile,
    };
}

export const Wardrobe: React.FC<WardrobeProps> = ({ colors }) => {
    const config = useConfigStore();
    const { session } = useAuthStore();
    const { t } = useTranslation(config.language);

    const isMicrosoftSession = session?.type === "microsoft";
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const resetRotationRef = useRef<(() => void) | null>(null);

    const [profile, setProfile] = useState<MinecraftProfile | null>(null);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);
    const [profileFetched, setProfileFetched] = useState(false);

    const [selectedSkinDataUrl, setSelectedSkinDataUrl] = useState<string | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string>("");
    const [variant, setVariant] = useState<SkinVariant>("classic");
    const [isApplying, setIsApplying] = useState(false);
    const [isPreviewSkinLoading, setIsPreviewSkinLoading] = useState(true);

    const fallbackSkinUrl = useMemo(() => {
        if (!session?.username) return null;
        return `https://minotar.net/skin/${encodeURIComponent(session.username)}`;
    }, [session?.username]);

    const previewSkin = useMemo(
        () => selectedSkinDataUrl || profile?.skinUrl || fallbackSkinUrl,
        [selectedSkinDataUrl, profile?.skinUrl, fallbackSkinUrl],
    );

    const syncProfile = useCallback(async (options?: { force?: boolean }) => {
        if (!isMicrosoftSession || !window.api?.minecraftGetProfile) {
            setProfile(null);
            setProfileError(null);
            setProfileFetched(true);
            return;
        }

        const cachedProfile = options?.force ? null : getCachedWardrobeProfile(session?.username);
        if (cachedProfile) {
            setProfile(cachedProfile);
            setVariant(normalizeVariant(cachedProfile.variant || cachedProfile.activeSkin?.variant));
            setProfileError(null);
            setProfileFetched(true);
            return;
        }

        setIsLoadingProfile(true);
        setProfileError(null);
        try {
            const result = await window.api.minecraftGetProfile({
                forceRefresh: !!options?.force,
            });
            if (!result?.ok || !result.profile) {
                setProfile(null);
                setProfileError(result?.error || t("wardrobe_profile_load_failed"));
                return;
            }
            setProfile(result.profile);
            setVariant(normalizeVariant(result.profile.variant || result.profile.activeSkin?.variant));
            setCachedWardrobeProfile(session?.username, result.profile);
        } catch (error: any) {
            setProfile(null);
            setProfileError(error?.message || t("wardrobe_profile_load_failed"));
        } finally {
            setIsLoadingProfile(false);
            setProfileFetched(true);
        }
    }, [isMicrosoftSession, session?.username, t]);

    useEffect(() => { syncProfile(); }, [syncProfile]);

    useEffect(() => {
        if (selectedSkinDataUrl || !profile) return;
        setVariant(normalizeVariant(profile.variant || profile.activeSkin?.variant));
    }, [profile, selectedSkinDataUrl]);

    const onSelectFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (file.type && file.type !== "image/png") { toast.error(t("wardrobe_only_png")); return; }
        if (file.size > 1024 * 1024 * 2) { toast.error(t("wardrobe_file_too_large")); return; }
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || "");
            if (!result.startsWith("data:image/png;base64,")) { toast.error(t("wardrobe_only_png")); return; }

            // Validate skin dimensions (64x64 or 64x32)
            const img = new Image();
            img.onload = () => {
                const w = img.width;
                const h = img.height;
                if (!((w === 64 && h === 64) || (w === 64 && h === 32))) {
                    toast.error(t("wardrobe_invalid_dimensions"));
                    return;
                }
                setSelectedSkinDataUrl(result);
                setSelectedFileName(file.name);
                toast.success(t("wardrobe_preview_ready"));
            };
            img.onerror = () => toast.error(t("wardrobe_file_read_failed"));
            img.src = result;
        };
        reader.onerror = () => toast.error(t("wardrobe_file_read_failed"));
        reader.readAsDataURL(file);
    }, [t]);

    const onApplySkin = useCallback(async () => {
        if (!isMicrosoftSession) { toast.error(t("wardrobe_microsoft_required")); return; }
        if (!selectedSkinDataUrl) { toast.error(t("wardrobe_select_skin_first")); return; }
        if (!window.api?.minecraftUploadSkin) { toast.error(t("wardrobe_feature_not_ready")); return; }
        setIsApplying(true);
        try {
            const result = await window.api.minecraftUploadSkin(selectedSkinDataUrl, variant, selectedFileName || undefined);
            if (!result?.ok || !result.profile) { toast.error(result?.error || t("wardrobe_apply_failed")); return; }
            setProfile(result.profile);
            setCachedWardrobeProfile(session?.username, result.profile);
            setSelectedSkinDataUrl(null);
            setSelectedFileName("");
            setVariant(normalizeVariant(result.profile.variant || result.profile.activeSkin?.variant));
            toast.success(t("wardrobe_apply_success"));
            
            // Notify other components (like MCHead) to refresh the avatar cache
            window.dispatchEvent(new CustomEvent("minecraft-skin-updated", { detail: { username: session?.username } }));
        } catch (error: any) {
            toast.error(error?.message || t("wardrobe_apply_failed"));
        } finally {
            setIsApplying(false);
        }
    }, [isMicrosoftSession, selectedSkinDataUrl, variant, selectedFileName, t]);

    // --- Guard: Not logged in ---
    if (!session) {
        return (
            <div className="h-full flex items-center justify-center p-6">
                <div className="text-center space-y-3">
                    <Icons.Person className="w-12 h-12 mx-auto opacity-40" style={{ color: colors.onSurface }} />
                    <p className="font-bold text-lg" style={{ color: colors.onSurface }}>{t("not_logged_in")}</p>
                </div>
            </div>
        );
    }

    // --- Guard: Not Microsoft ---
    if (!isMicrosoftSession) {
        return (
            <div className="h-full flex items-center justify-center p-6">
                <div className="flex items-center gap-4 p-5 rounded-2xl border max-w-sm"
                    style={{ backgroundColor: colors.surfaceContainer, borderColor: `${colors.outline}33` }}>
                    <Icons.Microsoft className="w-8 h-8 shrink-0" style={{ color: "#00A4EF" }} />
                    <div>
                        <p className="font-bold text-sm" style={{ color: colors.onSurface }}>{t("wardrobe_microsoft_required")}</p>
                        <p className="text-xs opacity-60 mt-0.5" style={{ color: colors.onSurfaceVariant }}>{t("wardrobe_switch_account_hint")}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden animate-fade-in">
            <div className="flex flex-col pb-6 w-full max-w-screen-2xl mx-auto gap-6 px-8 pt-3">

                {/* Header Row */}
                <div
                    className="flex items-center justify-between gap-3 animate-fade-in"
                    style={{ animationDelay: "20ms", opacity: 0 }}
                >
                    <div>
                        <h2 className="text-4xl font-black tracking-tight" style={{ color: colors.onSurface }}>
                            {t("wardrobe")}
                        </h2>
                        <p className="text-sm opacity-50" style={{ color: colors.onSurfaceVariant }}>
                            {t("wardrobe_desc")}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => syncProfile({ force: true })}
                            disabled={isLoadingProfile}
                            className="p-1.5 rounded-lg hover:opacity-70 transition-all disabled:opacity-40"
                            style={{ color: colors.onSurfaceVariant }}
                        >
                            <Icons.Refresh className={`w-4 h-4 ${isLoadingProfile ? "animate-spin" : ""}`} />
                        </button>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold"
                            style={{ backgroundColor: colors.surfaceContainer, color: colors.onSurface }}>
                            <Icons.Microsoft className="w-4 h-4" style={{ color: "#00A4EF" }} />
                            {profile?.name || session?.username || "-"}
                        </div>
                    </div>
                </div>

                {/* Main Content: Preview + Controls side by side */}
                <div className="flex flex-col md:flex-row gap-8">
                    {/* 3D Preview Card */}
                    <div
                        className="flex-1 h-[440px] md:h-[540px] rounded-3xl overflow-hidden relative animate-fade-in"
                        style={{
                            background: "radial-gradient(ellipse at 50% 35%, rgba(255,255,255,0.06), transparent 70%), linear-gradient(180deg, #18181b 0%, #0c0c0f 100%)",
                            animationDelay: "80ms",
                            opacity: 0,
                        }}>
                        <SkinPreview3D
                            skinUrl={previewSkin}
                            variant={variant}
                            onResetRotation={(fn) => (resetRotationRef.current = fn)}
                            onSkinLoadStateChange={setIsPreviewSkinLoading}
                        />

                        {(isLoadingProfile || isPreviewSkinLoading || !profileFetched) && (
                            <div
                                className="absolute inset-0 animate-skeleton-wave flex items-center justify-center"
                                style={{ backgroundColor: "rgba(14, 14, 18, 0.72)" }}
                            >
                                <div
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2"
                                    style={{ backgroundColor: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.75)" }}
                                >
                                    <Icons.Spinner className="w-3 h-3 animate-spin" />
                                    {t("loading")}
                                </div>
                            </div>
                        )}

                        {/* Preview label */}
                        <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider"
                            style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
                            {t("wardrobe_preview_3d")}
                        </div>

                        {/* Drag hint */}
                        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full text-[9px] font-bold"
                            style={{ backgroundColor: "rgba(0,0,0,0.45)", color: "rgba(255,255,255,0.5)" }}>
                            {t("wardrobe_drag_rotate")}
                        </div>

                        {/* Reset rotation */}
                        <button
                            onClick={() => resetRotationRef.current?.()}
                            className="absolute bottom-2.5 right-2.5 p-1.5 rounded-lg hover:scale-105 active:scale-95 transition-all"
                            style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
                        >
                            <Icons.Refresh className="w-3 h-3" />
                        </button>

                        {isLoadingProfile && (
                            <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold"
                                style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
                                <Icons.Spinner className="w-2.5 h-2.5 animate-spin" />
                                Loading
                            </div>
                        )}
                    </div>

                    {/* Controls Panel */}
                    <div className="w-full md:w-[340px] shrink-0 flex flex-col gap-4">

                        {/* Variant Selector */}
                        <div
                            className="rounded-3xl p-5 border animate-fade-in"
                            style={{
                                borderColor: `${colors.outline}22`,
                                backgroundColor: colors.surfaceContainer,
                                animationDelay: "140ms",
                                opacity: 0,
                            }}>
                            <div className="text-xs font-bold uppercase tracking-wider opacity-40 mb-2.5" style={{ color: colors.onSurfaceVariant }}>
                                {t("wardrobe_variant")}
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                                <button
                                    onClick={() => setVariant("classic")}
                                    className="py-2.5 rounded-lg text-sm font-bold transition-all"
                                    style={{
                                        backgroundColor: variant === "classic" ? colors.secondary : `${colors.outline}15`,
                                        color: variant === "classic" ? colors.onSecondary : colors.onSurface,
                                    }}
                                >
                                    Classic
                                </button>
                                <button
                                    onClick={() => setVariant("slim")}
                                    className="py-2.5 rounded-lg text-sm font-bold transition-all"
                                    style={{
                                        backgroundColor: variant === "slim" ? colors.secondary : `${colors.outline}15`,
                                        color: variant === "slim" ? colors.onSecondary : colors.onSurface,
                                    }}
                                >
                                    Slim
                                </button>
                            </div>
                        </div>

                        {/* File Upload */}
                        <div
                            className="rounded-3xl p-5 border animate-fade-in"
                            style={{
                                borderColor: `${colors.outline}22`,
                                backgroundColor: colors.surfaceContainer,
                                animationDelay: "220ms",
                                opacity: 0,
                            }}>
                            <div className="text-xs font-bold uppercase tracking-wider opacity-40 mb-2.5" style={{ color: colors.onSurfaceVariant }}>
                                {t("wardrobe_skin_control")}
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".png,image/png"
                                onChange={onSelectFile}
                                className="hidden"
                            />

                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full py-3 rounded-xl border border-dashed transition-all hover:opacity-80"
                                style={{
                                    borderColor: selectedFileName ? colors.secondary : `${colors.outline}33`,
                                    backgroundColor: selectedFileName ? `${colors.secondary}10` : 'transparent',
                                }}
                            >
                                <div className="flex flex-col items-center gap-1">
                                    {selectedFileName ? (
                                        <>
                                            <Icons.File className="w-5 h-5" style={{ color: colors.secondary }} />
                                            <span className="text-sm font-bold truncate max-w-[220px]" style={{ color: colors.onSurface }}>
                                                {selectedFileName}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <Icons.Upload className="w-5 h-5 opacity-30" style={{ color: colors.onSurface }} />
                                            <span className="text-sm font-bold" style={{ color: colors.onSurface }}>
                                                {t("wardrobe_choose_skin")}
                                            </span>
                                            <span className="text-xs opacity-30" style={{ color: colors.onSurfaceVariant }}>
                                                PNG
                                            </span>
                                        </>
                                    )}
                                </div>
                            </button>

                            {profileError && (
                                <div className="text-xs font-medium p-2 rounded-lg mt-2 border border-red-500/20 bg-red-500/10 text-red-400">
                                    {profileError}
                                </div>
                            )}
                        </div>

                        {/* Apply Button */}
                        <button
                            onClick={onApplySkin}
                            disabled={isApplying || !selectedSkinDataUrl}
                            className="w-full py-2.5 rounded-xl font-black text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 animate-fade-in"
                            style={{
                                backgroundColor: selectedSkinDataUrl ? colors.primary : colors.surfaceContainer,
                                color: selectedSkinDataUrl ? colors.onPrimary : colors.onSurfaceVariant,
                                animationDelay: "300ms",
                                opacity: 0,
                            }}
                        >
                            {isApplying && <Icons.Spinner className="w-4 h-4 animate-spin" />}
                            {isApplying ? t("wardrobe_applying") : t("wardrobe_apply_skin")}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
