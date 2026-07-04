import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { useTranslation } from "../../hooks/useTranslation";
import { useConfigStore } from "../../store/configStore";
import { useAuthStore } from "../../store/authStore";
import { useUiStore } from "../../store/uiStore";
import { Icons } from "../ui/Icons";
import { MCHead } from "../ui/MCHead";
import { SkinPreview3D } from "./wardrobe/SkinPreview3D";
import type { GameInstance } from "../../types/launcher";

interface WardrobeProps {
    colors: any;
    selectedInstance?: GameInstance | null;
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
const WARDROBE_PREVIEW_CACHE_KEY = "reality:wardrobe-preview:v1";

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

type WardrobePreviewCacheEntry = {
    username: string;
    selectedSkinDataUrl: string | null;
    selectedFileName: string;
    variant: SkinVariant;
};

function getCachedWardrobePreview(username?: string | null): WardrobePreviewCacheEntry | null {
    if (!username || typeof window === "undefined") return null;

    try {
        const raw = window.localStorage.getItem(WARDROBE_PREVIEW_CACHE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Record<string, WardrobePreviewCacheEntry>;
        return parsed?.[username] || null;
    } catch {
        return null;
    }
}

function setCachedWardrobePreview(
    username: string | undefined,
    preview: Omit<WardrobePreviewCacheEntry, "username">,
): void {
    if (!username || typeof window === "undefined") return;

    try {
        const raw = window.localStorage.getItem(WARDROBE_PREVIEW_CACHE_KEY);
        const parsed = raw ? (JSON.parse(raw) as Record<string, WardrobePreviewCacheEntry>) : {};
        parsed[username] = { username, ...preview };
        window.localStorage.setItem(WARDROBE_PREVIEW_CACHE_KEY, JSON.stringify(parsed));
    } catch {
    }
}

function clearCachedWardrobePreview(username?: string | null): void {
    if (!username || typeof window === "undefined") return;

    try {
        const raw = window.localStorage.getItem(WARDROBE_PREVIEW_CACHE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw) as Record<string, WardrobePreviewCacheEntry>;
        delete parsed[username];
        window.localStorage.setItem(WARDROBE_PREVIEW_CACHE_KEY, JSON.stringify(parsed));
    } catch {
    }
}

function hasWardrobePreviewCache(
    username: string | null | undefined,
    selectedSkinDataUrl: string | null,
    selectedFileName: string,
): boolean {
    return Boolean(username && (selectedSkinDataUrl || selectedFileName));
}

export const Wardrobe: React.FC<WardrobeProps> = ({ colors, selectedInstance }) => {
    const config = useConfigStore();
    const { session } = useAuthStore();
    const { t } = useTranslation(config.language);

    const isMicrosoftSession = session?.type === "microsoft";
    const isLinkedCatidSession = session?.type === "catid" && !!session?.minecraftUuid;
    const canManageProfile = isMicrosoftSession || isLinkedCatidSession;
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const mouthFileInputRef = useRef<HTMLInputElement | null>(null);
    const resetRotationRef = useRef<(() => void) | null>(null);

    const [profile, setProfile] = useState<MinecraftProfile | null>(null);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);
    const [profileFetched, setProfileFetched] = useState(false);

    const mode = useUiStore((state) => state.wardrobeMode);
    const setMode = useUiStore((state) => state.setWardrobeMode);
    const [catskincConfig, setCatskincConfig] = useState<{ ok: boolean; configured: boolean; ip: string } | null>(null);
    const [catskincSkinUrl, setCatskincSkinUrl] = useState<string | null>(null);
    const [catskincMouthUrl, setCatskincMouthUrl] = useState<string | null>(null);
    const [catskincSlim, setCatskincSlim] = useState<boolean>(false);
    const [isLoadingCatskincSkin, setIsLoadingCatskincSkin] = useState(false);
    const [serverIpInput, setServerIpInput] = useState("");

    const [selectedSkinDataUrl, setSelectedSkinDataUrl] = useState<string | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string>("");
    const [mouthOpenDataUrl, setMouthOpenDataUrl] = useState<string | null>(null);
    const [mouthOpenFileName, setMouthOpenFileName] = useState<string>("");

    const [variant, setVariant] = useState<SkinVariant>("classic");
    const [isApplying, setIsApplying] = useState(false);
    const [showClearModal, setShowClearModal] = useState(false);
    const [isClearingAssets, setIsClearingAssets] = useState(false);
    const [isPreviewSkinLoading, setIsPreviewSkinLoading] = useState(true);
    const [animationType, setAnimationType] = useState<"idle" | "walk" | "run" | "fly">("idle");

    const [isMouthOpen, setIsMouthOpen] = useState(false);
    const [testMicActive, setTestMicActive] = useState(false);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const microphoneStreamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const syncCatskincSkin = useCallback(async () => {
        if (!window.api?.catskincGetSelectedSkin || !session?.uuid) {
            setCatskincSkinUrl(null);
            setCatskincMouthUrl(null);
            setCatskincSlim(false);
            return;
        }
        setIsLoadingCatskincSkin(true);
        try {
            const res = await window.api.catskincGetSelectedSkin(selectedInstance?.gameDirectory);
            if (res.ok) {
                setCatskincSkinUrl(res.url || null);
                setCatskincMouthUrl(res.mouthUrl || null);
                setCatskincSlim(!!res.slim);
            } else {
                setCatskincSkinUrl(null);
                setCatskincMouthUrl(null);
                setCatskincSlim(false);
            }
        } catch (error) {
            console.error("Error fetching CatSkinC skin:", error);
            setCatskincSkinUrl(null);
            setCatskincMouthUrl(null);
            setCatskincSlim(false);
        } finally {
            setIsLoadingCatskincSkin(false);
        }
    }, [session?.uuid, selectedInstance?.gameDirectory]);

    const handleSaveIp = useCallback(async () => {
        if (!window.api?.catskincSaveConfig) return;
        const targetIp = serverIpInput.trim() || "storage-api.catskin.space";
        try {
            const res = await window.api.catskincSaveConfig({
                ip: targetIp,
                gameDirectory: selectedInstance?.gameDirectory
            });
            if (res.ok) {
                toast.success(t("wardrobe_catskinc_sync_success"));
                if (window.api?.catskincGetConfig) {
                    const cfg = await window.api.catskincGetConfig(selectedInstance?.gameDirectory);
                    setCatskincConfig(cfg);
                }
                await syncCatskincSkin();
            } else {
                toast.error(res.error || t("wardrobe_apply_failed"));
            }
        } catch (err: any) {
            toast.error(err?.message || t("wardrobe_apply_failed"));
        }
    }, [serverIpInput, syncCatskincSkin, t, selectedInstance?.gameDirectory]);

    const handleIpKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            handleSaveIp();
            e.currentTarget.blur();
        }
    }, [handleSaveIp]);

    // Load CatSkinC config on mount or when active instance changes
    useEffect(() => {
        if (window.api?.catskincGetConfig) {
            window.api.catskincGetConfig(selectedInstance?.gameDirectory).then(cfg => {
                setCatskincConfig(cfg);
                setServerIpInput(cfg?.ip || "storage-api.catskin.space");
            });
        }
    }, [selectedInstance?.gameDirectory]);

    useEffect(() => {
        syncCatskincSkin();
    }, [syncCatskincSkin]);

    const fallbackSkinUrl = useMemo(() => {
        if (!session?.username) return null;
        return `https://minotar.net/skin/${encodeURIComponent(session.username)}`;
    }, [session?.username]);

    const baseSkin = useMemo(() => {
        console.log("[Wardrobe Debug] baseSkin compute:", {
            mode,
            selectedSkinDataUrl,
            catskincSkinUrl,
            profileSkinUrl: profile?.skinUrl,
            sessionSkinUrl: session?.skinUrl,
            fallbackSkinUrl
        });
        if (selectedSkinDataUrl) return selectedSkinDataUrl;
        if (mode === "catskinc" && catskincSkinUrl) {
            return catskincSkinUrl;
        }
        let target = profile?.skinUrl || session?.skinUrl || fallbackSkinUrl;
        if (target && target.startsWith("http://")) {
            target = target.replace("http://", "https://");
        }
        return target;
    }, [selectedSkinDataUrl, mode, catskincSkinUrl, profile?.skinUrl, session?.skinUrl, fallbackSkinUrl]);

    const [closedMouthSkin, setClosedMouthSkin] = useState<string | null>(null);
    const [openMouthSkin, setOpenMouthSkin] = useState<string | null>(null);

    const mergeSkinAndMouth = useCallback((baseDataUrl: string, mouthDataUrl: string): Promise<string> => {
        return new Promise((resolve) => {
            const baseImg = new Image();
            if (baseDataUrl.startsWith("http")) {
                baseImg.crossOrigin = "anonymous";
            }
            baseImg.onload = () => {
                const mouthImg = new Image();
                if (mouthDataUrl.startsWith("http")) {
                    mouthImg.crossOrigin = "anonymous";
                }
                mouthImg.onload = () => {
                    try {
                        const canvas = document.createElement("canvas");
                        canvas.width = baseImg.width;
                        canvas.height = baseImg.height;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) {
                            resolve(baseDataUrl);
                            return;
                        }
                        ctx.drawImage(baseImg, 0, 0);
                        ctx.drawImage(mouthImg, 0, 0);
                        resolve(canvas.toDataURL("image/png"));
                    } catch (e) {
                        console.warn("Canvas merge failed, falling back to base skin:", e);
                        resolve(baseDataUrl);
                    }
                };
                mouthImg.onerror = () => resolve(baseDataUrl);
                mouthImg.src = mouthDataUrl;
            };
            baseImg.onerror = () => resolve(baseDataUrl);
            baseImg.src = baseDataUrl;
        });
    }, []);

    const finalMouthOpenUrl = useMemo(() => {
        if (mouthOpenDataUrl) return mouthOpenDataUrl;
        if (mode === "catskinc" && catskincMouthUrl) {
            return catskincMouthUrl;
        }
        return null;
    }, [mouthOpenDataUrl, mode, catskincMouthUrl]);

    useEffect(() => {
        if (!baseSkin) {
            setClosedMouthSkin(null);
            setOpenMouthSkin(null);
            return;
        }
        setClosedMouthSkin(baseSkin);

        if (finalMouthOpenUrl) {
            mergeSkinAndMouth(baseSkin, finalMouthOpenUrl).then(merged => {
                setOpenMouthSkin(merged);
            });
        } else {
            setOpenMouthSkin(baseSkin);
        }
    }, [baseSkin, finalMouthOpenUrl, mergeSkinAndMouth]);

    const previewSkin = useMemo(() => {
        if (mode === "catskinc" && finalMouthOpenUrl && isMouthOpen) {
            return openMouthSkin || closedMouthSkin;
        }
        return closedMouthSkin;
    }, [mode, finalMouthOpenUrl, isMouthOpen, openMouthSkin, closedMouthSkin]);

    const hasPreviewCache = useMemo(
        () => hasWardrobePreviewCache(session?.username, selectedSkinDataUrl, selectedFileName) || Boolean(mouthOpenFileName),
        [selectedFileName, selectedSkinDataUrl, session?.username, mouthOpenFileName],
    );

    const previewBackground = useMemo(
        () => ({
            card: colors.surfaceContainerHighest,
            canvas: "transparent",
            gradient: `radial-gradient(ellipse at 50% 35%, ${colors.outline}33, transparent 72%), linear-gradient(180deg, ${colors.surfaceContainer} 0%, ${colors.surfaceContainerHighest} 100%)`,
            overlay: `${colors.surface}cc`,
            badgeBackground: `${colors.surface}cc`,
            badgeText: colors.onSurfaceVariant,
            hintBackground: `${colors.surface}d9`,
            hintText: colors.onSurfaceVariant,
            buttonBackground: `${colors.surface}cc`,
            buttonText: colors.onSurfaceVariant,
        }),
        [colors],
    );

    useEffect(() => {
        const cachedPreview = getCachedWardrobePreview(session?.username);
        if (!cachedPreview) return;

        setSelectedSkinDataUrl(cachedPreview.selectedSkinDataUrl);
        setSelectedFileName(cachedPreview.selectedFileName);
        setVariant(cachedPreview.variant);
    }, [session?.username]);

    useEffect(() => {
        if (!session?.username) return;

        setCachedWardrobePreview(session.username, {
            selectedSkinDataUrl,
            selectedFileName,
            variant,
        });
    }, [selectedFileName, selectedSkinDataUrl, session?.username, variant]);

    const syncProfile = useCallback(async (options?: { force?: boolean }) => {
        if (!canManageProfile || !window.api?.minecraftGetProfile) {
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
    }, [canManageProfile, session?.username, t]);

    useEffect(() => { syncProfile(); }, [syncProfile]);

    useEffect(() => {
        if (selectedSkinDataUrl) return;
        if (mode === "catskinc" && catskincSkinUrl) {
            setVariant(catskincSlim ? "slim" : "classic");
            return;
        }
        if (profile) {
            setVariant(normalizeVariant(profile.variant || profile.activeSkin?.variant));
        }
    }, [profile, selectedSkinDataUrl, mode, catskincSlim, catskincSkinUrl]);

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

            // Validate skin dimensions (Aspect ratio 1:1 or 2:1)
            const img = new Image();
            img.onload = () => {
                const w = img.width;
                const h = img.height;
                if (!(w >= 64 && (w === h || w === 2 * h))) {
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

    const onSelectMouthFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (file.type && file.type !== "image/png") { toast.error(t("wardrobe_only_png")); return; }
        if (file.size > 1024 * 1024 * 2) { toast.error(t("wardrobe_file_too_large")); return; }
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || "");
            if (!result.startsWith("data:image/png;base64,")) { toast.error(t("wardrobe_only_png")); return; }

            const img = new Image();
            img.onload = () => {
                const w = img.width;
                const h = img.height;
                if (!(w >= 64 && (w === h || w === 2 * h))) {
                    toast.error(t("wardrobe_invalid_dimensions"));
                    return;
                }
                setMouthOpenDataUrl(result);
                setMouthOpenFileName(file.name);
                toast.success("Mouth overlay loaded");
            };
            img.onerror = () => toast.error(t("wardrobe_file_read_failed"));
            img.src = result;
        };
        reader.onerror = () => toast.error(t("wardrobe_file_read_failed"));
        reader.readAsDataURL(file);
    }, [t]);

    const toggleMicTest = useCallback(() => {
        if (testMicActive) {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            if (microphoneStreamRef.current) {
                microphoneStreamRef.current.getTracks().forEach(track => track.stop());
                microphoneStreamRef.current = null;
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
            analyserRef.current = null;
            setIsMouthOpen(false);
            setTestMicActive(false);
        } else {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    microphoneStreamRef.current = stream;
                    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                    const audioCtx = new AudioContextClass();
                    audioContextRef.current = audioCtx;
                    const source = audioCtx.createMediaStreamSource(stream);
                    const analyser = audioCtx.createAnalyser();
                    analyser.fftSize = 256;
                    analyserRef.current = analyser;
                    source.connect(analyser);

                    const bufferLength = analyser.frequencyBinCount;
                    const dataArray = new Uint8Array(bufferLength);

                    const checkVolume = () => {
                        if (!analyserRef.current) return;
                        analyserRef.current.getByteFrequencyData(dataArray);
                        let sum = 0;
                        for (let i = 0; i < bufferLength; i++) {
                            sum += dataArray[i];
                        }
                        const average = sum / bufferLength;
                        setIsMouthOpen(average > 15);
                        animationFrameRef.current = requestAnimationFrame(checkVolume);
                    };
                    animationFrameRef.current = requestAnimationFrame(checkVolume);
                    setTestMicActive(true);
                })
                .catch(err => {
                    console.error("Mic access failed", err);
                    toast.error("Microphone access failed");
                    setTestMicActive(false);
                });
        }
    }, [testMicActive]);

    // Force turn off microphone if mode changes
    useEffect(() => {
        if (mode !== "catskinc" && testMicActive) {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            if (microphoneStreamRef.current) {
                microphoneStreamRef.current.getTracks().forEach(track => track.stop());
                microphoneStreamRef.current = null;
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
            analyserRef.current = null;
            setIsMouthOpen(false);
            setTestMicActive(false);
        }
    }, [mode, testMicActive]);

    // Clean up microphone on unmount
    useEffect(() => {
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (microphoneStreamRef.current) {
                microphoneStreamRef.current.getTracks().forEach(track => track.stop());
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    const onApplySkin = useCallback(async () => {
        if (!canManageProfile) {
            const errorMsg = session?.type === "catid" ? t("wardrobe_catid_link_required") : t("wardrobe_microsoft_required");
            toast.error(errorMsg);
            return;
        }

        if (mode === "catskinc") {
            if (!window.api?.catskincUploadSkin) {
                toast.error(t("wardrobe_feature_not_ready"));
                return;
            }
            setIsApplying(true);
            try {
                const payload = {
                    dataUrl: selectedSkinDataUrl || "",
                    slim: variant === "slim",
                    mouthOpenDataUrl: mouthOpenDataUrl || undefined,
                    gameDirectory: selectedInstance?.gameDirectory
                };
                if (!payload.dataUrl) {
                    toast.error(t("wardrobe_select_skin_first"));
                    setIsApplying(false);
                    return;
                }
                const result = await window.api.catskincUploadSkin(payload);
                if (!result?.ok) {
                    toast.error(result?.error ? t("wardrobe_catskinc_sync_failed", { error: result.error }) : t("wardrobe_apply_failed"));
                    return;
                }
                toast.success(t("wardrobe_catskinc_sync_success"));
                setCatskincSkinUrl(payload.dataUrl);
                setCatskincSlim(payload.slim);
                if (payload.mouthOpenDataUrl) {
                    setCatskincMouthUrl(payload.mouthOpenDataUrl);
                } else {
                    setCatskincMouthUrl(null);
                }
                
                setSelectedSkinDataUrl(null);
                setSelectedFileName("");
                setMouthOpenDataUrl(null);
                setMouthOpenFileName("");
                if (testMicActive) {
                    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                    if (microphoneStreamRef.current) microphoneStreamRef.current.getTracks().forEach(track => track.stop());
                    if (audioContextRef.current) audioContextRef.current.close();
                    analyserRef.current = null;
                    animationFrameRef.current = null;
                    microphoneStreamRef.current = null;
                    audioContextRef.current = null;
                    setIsMouthOpen(false);
                    setTestMicActive(false);
                }
                clearCachedWardrobePreview(session?.username);
                
                syncCatskincSkin();
                syncProfile({ force: true });
                
                window.dispatchEvent(new CustomEvent("minecraft-skin-updated", { detail: { username: session?.username } }));
            } catch (error: any) {
                toast.error(error?.message || t("wardrobe_apply_failed"));
            } finally {
                setIsApplying(false);
            }
            return;
        }

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
            clearCachedWardrobePreview(session?.username);
            toast.success(t("wardrobe_apply_success"));
            
            window.dispatchEvent(new CustomEvent("minecraft-skin-updated", { detail: { username: session?.username } }));
        } catch (error: any) {
            toast.error(error?.message || t("wardrobe_apply_failed"));
        } finally {
            setIsApplying(false);
        }
    }, [canManageProfile, selectedSkinDataUrl, variant, selectedFileName, t, mode, mouthOpenDataUrl, testMicActive, syncProfile, syncCatskincSkin, session?.username]);

    const onClearPreview = useCallback(() => {
        clearCachedWardrobePreview(session?.username);
        setSelectedSkinDataUrl(null);
        setSelectedFileName("");
        setMouthOpenDataUrl(null);
        setMouthOpenFileName("");
        if (testMicActive) {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (microphoneStreamRef.current) microphoneStreamRef.current.getTracks().forEach(track => track.stop());
            if (audioContextRef.current) audioContextRef.current.close();
            analyserRef.current = null;
            animationFrameRef.current = null;
            microphoneStreamRef.current = null;
            audioContextRef.current = null;
            setIsMouthOpen(false);
            setTestMicActive(false);
        }
        if (mode === "catskinc" && catskincSkinUrl) {
            setVariant(catskincSlim ? "slim" : "classic");
        } else {
            setVariant(normalizeVariant(profile?.variant || profile?.activeSkin?.variant));
        }
        toast.success(t("wardrobe_preview_cleared"));
    }, [profile, session?.username, t, testMicActive, mode, catskincSlim, catskincSkinUrl]);

    const handleClearClick = useCallback(() => {
        if (hasPreviewCache) {
            onClearPreview();
        } else if (mode === "catskinc") {
            setShowClearModal(true);
        }
    }, [hasPreviewCache, onClearPreview, mode]);

    const isClearDisabled = useMemo(() => {
        if (hasPreviewCache) return false;
        return mode !== "catskinc";
    }, [hasPreviewCache, mode]);

    const handleClearConfirm = useCallback(async (clearMode: "all" | "skin" | "mouth") => {
        if (!window.api?.catskincClearAssets) {
            toast.error(t("wardrobe_feature_not_ready"));
            return;
        }
        setIsClearingAssets(true);
        try {
            // Optimistic update of local states to feel instant
            if (clearMode === "skin" || clearMode === "all") {
                setCatskincSkinUrl(null);
                setCatskincSlim(false);
                if (profile) {
                    setVariant(normalizeVariant(profile.variant || profile.activeSkin?.variant));
                } else {
                    setVariant("classic");
                }
            }
            if (clearMode === "mouth" || clearMode === "all") {
                setCatskincMouthUrl(null);
                setMouthOpenDataUrl(null);
                setMouthOpenFileName("");
            }

            const res = await window.api.catskincClearAssets({
                mode: clearMode,
                gameDirectory: selectedInstance?.gameDirectory
            });
            if (res.ok) {
                toast.success(t("wardrobe_preview_cleared"));
                setShowClearModal(false);
                syncCatskincSkin();
                syncProfile({ force: true });
                window.dispatchEvent(new CustomEvent("minecraft-skin-updated", { detail: { username: session?.username } }));
            } else {
                toast.error(res.error || t("wardrobe_apply_failed"));
                syncCatskincSkin();
            }
        } catch (err: any) {
            toast.error(err?.message || t("wardrobe_apply_failed"));
            syncCatskincSkin();
        } finally {
            setIsClearingAssets(false);
        }
    }, [selectedInstance?.gameDirectory, syncCatskincSkin, syncProfile, session?.username, t, profile]);

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

    // --- Guard: Not Microsoft / CatID Linked ---
    if (!canManageProfile) {
        const guardTitle = session?.type === "catid"
            ? t("wardrobe_catid_link_required")
            : t("wardrobe_microsoft_required");
        const guardDesc = session?.type === "catid"
            ? t("wardrobe_catid_link_hint")
            : t("wardrobe_switch_account_hint");

        return (
            <div className="h-full flex items-center justify-center p-6">
                <div className="flex items-center gap-4 p-5 rounded-2xl border max-w-sm"
                    style={{ backgroundColor: colors.surfaceContainer, borderColor: `${colors.outline}33` }}>
                    <Icons.Microsoft className="w-8 h-8 shrink-0" style={{ color: "#00A4EF" }} />
                    <div>
                        <p className="font-bold text-sm" style={{ color: colors.onSurface }}>{guardTitle}</p>
                        <p className="text-xs opacity-60 mt-0.5" style={{ color: colors.onSurfaceVariant }}>{guardDesc}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden animate-fade-in">
            <div className="flex flex-col pb-6 w-full max-w-screen-2xl mx-auto gap-4 lg:gap-6 px-4 lg:px-8 pt-3">

                {/* Header Row */}
                <div
                    className="flex items-center justify-between gap-3 animate-fade-in"
                    style={{ animationDelay: "20ms", opacity: 0 }}
                >
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight" style={{ color: colors.onSurface }}>
                            {t("wardrobe")}
                        </h2>
                        <p className="text-sm opacity-50" style={{ color: colors.onSurfaceVariant }}>
                            {t("wardrobe_desc")}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Mode Selector */}
                        <div className="flex p-0.5 rounded-xl border text-xs font-semibold"
                            style={{ backgroundColor: colors.surfaceContainer, borderColor: `${colors.outline}22` }}>
                            <button
                                onClick={() => setMode("microsoft")}
                                className={`px-3 py-1.5 rounded-lg transition-all ${
                                    mode === "microsoft"
                                        ? "shadow-sm"
                                        : "hover:bg-white/5"
                                }`}
                                style={{
                                    backgroundColor: mode === "microsoft" ? colors.surface : "transparent",
                                    color: mode === "microsoft" ? colors.onSurface : colors.onSurfaceVariant,
                                }}
                            >
                                {t("wardrobe_mode_microsoft")}
                            </button>
                            <button
                                onClick={() => {
                                    if (!canManageProfile) {
                                        toast.error("Microsoft account is required to authenticate with CatSkinC.");
                                        return;
                                    }
                                    setMode("catskinc");
                                }}
                                className={`px-3 py-1.5 rounded-lg transition-all ${
                                    mode === "catskinc"
                                        ? "shadow-sm"
                                        : "hover:bg-white/5"
                                }`}
                                style={{
                                    backgroundColor: mode === "catskinc" ? colors.surface : "transparent",
                                    color: mode === "catskinc" ? colors.onSurface : colors.onSurfaceVariant,
                                }}
                            >
                                {t("wardrobe_mode_catskinc")}
                            </button>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => syncProfile({ force: true })}
                                disabled={isLoadingProfile}
                                aria-label={t("wardrobe_refresh_profile")}
                                className="p-2 rounded-xl hover:bg-white/5 transition-all disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                                style={{ color: colors.onSurfaceVariant }}
                            >
                                <Icons.Refresh className={`w-5 h-5 ${isLoadingProfile ? "animate-spin" : ""}`} />
                            </button>
                            <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-bold border"
                                style={{ 
                                    backgroundColor: colors.surface, 
                                    color: colors.onSurface,
                                    borderColor: `${colors.outline}22` 
                                }}>
                                <Icons.Microsoft className="w-5 h-5" style={{ color: "#00A4EF" }} />
                                {profile?.name || session?.username || "-"}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Unified Card Dashboard wrapping both preview and controls */}
                <div
                    className="w-full h-[520px] xl:h-[560px] rounded-3xl border animate-fade-in shadow-2xl flex flex-row gap-4 xl:gap-6 p-4 xl:p-5"
                    style={{
                        backgroundColor: colors.surfaceContainer,
                        borderColor: `${colors.outline}33`,
                        animationDelay: "80ms",
                        opacity: 0,
                    }}
                >
                    {/* Left: 3D Preview Viewport */}
                    <div
                        className="flex-1 h-full rounded-2xl overflow-hidden relative"
                        style={{
                            backgroundColor: previewBackground.card,
                            backgroundImage: previewBackground.gradient,
                        }}>
                        <SkinPreview3D
                            skinUrl={previewSkin}
                            variant={variant}
                            backgroundColor={previewBackground.canvas}
                            animationType={animationType}
                            onResetRotation={(fn) => (resetRotationRef.current = fn)}
                            onSkinLoadStateChange={setIsPreviewSkinLoading}
                        />

                        {/* circular platform under character feet */}
                        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-64 h-16 pointer-events-none select-none flex items-center justify-center" style={{ perspective: "1000px" }}>
                            {/* Quiet, static, low-opacity border ring */}
                            <div className="absolute w-36 h-36 border rounded-full" style={{ borderColor: `${colors.outline}1a`, transform: "rotateX(75deg)" }} />
                            <div className="absolute w-24 h-24 border rounded-full" style={{ borderColor: `${colors.outline}0d`, transform: "rotateX(75deg)" }} />
                        </div>

                        {(isLoadingProfile || isPreviewSkinLoading || !profileFetched || isLoadingCatskincSkin) && (
                            <div
                                className="absolute inset-0 animate-skeleton-wave flex items-center justify-center"
                                style={{ backgroundColor: previewBackground.overlay }}
                            >
                                <div
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2"
                                    style={{ backgroundColor: previewBackground.badgeBackground, color: previewBackground.badgeText }}
                                >
                                    <Icons.Spinner className="w-3 h-3 animate-spin" />
                                    {t("loading")}
                                </div>
                            </div>
                        )}

                        {/* Preview label */}
                        <div className="absolute top-3.5 left-3.5 text-sm font-medium tracking-wider uppercase select-none opacity-80"
                            style={{ color: colors.onSurface }}>
                            {t("wardrobe_preview_3d")}
                        </div>

                        {/* Animation Controls overlay pill */}
                        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 p-1 rounded-full backdrop-blur-md bg-black/40 border border-white/10">
                            {(["idle", "walk", "run", "fly"] as const).map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setAnimationType(type)}
                                    className="px-3 py-1 rounded-full text-[10px] font-semibold tracking-wider uppercase transition-all focus-visible:outline focus-visible:outline-2"
                                    style={{
                                        background: animationType === type ? `linear-gradient(90deg, ${colors.primary}, ${colors.primary})` : undefined,
                                        color: animationType === type ? colors.onPrimary : "rgba(255, 255, 255, 0.6)",
                                        transform: animationType === type ? "scale(1.05)" : undefined,
                                    }}
                                >
                                    {type === "idle" ? "Idle" : type === "walk" ? "Walk" : type === "run" ? "Run" : "Fly"}
                                </button>
                            ))}
                        </div>

                        {/* Drag hint */}
                        <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 text-sm font-medium tracking-wide select-none opacity-80"
                            style={{ color: colors.onSurface }}>
                            {t("wardrobe_drag_rotate")}
                        </div>

                        {/* Microphone Test Button (Bottom-Left) */}
                        {mode === "catskinc" && finalMouthOpenUrl && (
                            <button
                                onClick={toggleMicTest}
                                aria-label={testMicActive ? "Stop microphone test" : "Test mouth overlay via microphone"}
                                title={testMicActive ? "Stop microphone test" : "Test mouth overlay via microphone"}
                                className="absolute bottom-2.5 left-2.5 p-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all bg-black/40 border focus-visible:outline focus-visible:outline-2"
                                style={{
                                    borderColor: testMicActive ? colors.primary : "rgba(255, 255, 255, 0.05)",
                                    color: testMicActive ? colors.primary : "rgba(255, 255, 255, 0.8)",
                                }}
                            >
                                <Icons.Mic className={`w-5 h-5 ${testMicActive ? "animate-pulse" : ""}`} />
                            </button>
                        )}

                        {/* Reset rotation */}
                        <button
                            onClick={() => resetRotationRef.current?.()}
                            aria-label={t("wardrobe_reset_rotation")}
                            title={t("wardrobe_reset_rotation")}
                            className="absolute bottom-2.5 right-2.5 p-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all bg-black/40 border border-white/5 text-white/80 hover:text-white focus-visible:outline focus-visible:outline-2"
                        >
                            <Icons.Refresh className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Vertical Divider */}
                    <div className="w-[1px] self-stretch hidden md:block" style={{ backgroundColor: `${colors.outline}22` }} />

                    {/* Right: Controls Area */}
                    <div className="w-[300px] xl:w-[340px] shrink-0 flex flex-col gap-3 xl:gap-4 justify-between">
                        {/* Section 1: Active Profile Summary */}
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-full overflow-hidden border relative flex items-center justify-center shrink-0"
                                style={{ backgroundColor: colors.surfaceContainerHighest, borderColor: `${colors.outline}33` }}>
                                <MCHead
                                    username={session.username}
                                    size={56}
                                    className="w-full h-full rounded-full"
                                />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold tracking-wider uppercase opacity-50" style={{ color: colors.onSurfaceVariant }}>
                                    Active Profile
                                </p>
                                <h3 className="text-lg font-bold truncate leading-tight mt-0.5" style={{ color: colors.onSurface }}>
                                    {profile?.name || session?.username || "-"}
                                </h3>
                                {mode !== "catskinc" && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-semibold uppercase mt-2 tracking-wider"
                                        style={{ 
                                            backgroundColor: isMicrosoftSession ? "#00A4EF15" : `${colors.primary}15`, 
                                            color: isMicrosoftSession ? "#00A4EF" : colors.primary,
                                            border: `1px solid ${isMicrosoftSession ? "#00A4EF30" : `${colors.primary}30`}`
                                        }}
                                    >
                                        <Icons.Microsoft className="w-2.5 h-2.5" style={{ color: isMicrosoftSession ? "#00A4EF" : colors.primary }} />
                                        {isMicrosoftSession ? "Microsoft Account" : "Linked CatID"}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="h-[1px] w-full" style={{ backgroundColor: `${colors.outline}22` }} />

                        {/* Section 2: Variant Selector */}
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-2" style={{ color: colors.onSurfaceVariant }}>
                                {t("wardrobe_variant")}
                            </div>
                            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl border"
                                style={{ backgroundColor: colors.surfaceContainerHighest, borderColor: `${colors.outline}22` }}>
                                <button
                                    onClick={() => setVariant("classic")}
                                    className={`py-2 rounded-xl text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 border ${
                                        variant === "classic"
                                            ? "shadow-sm border-transparent"
                                            : "hover:bg-white/5 border-transparent"
                                    }`}
                                    style={{
                                        backgroundColor: variant === "classic" ? colors.surface : undefined,
                                        color: variant === "classic" ? colors.onSurface : colors.onSurfaceVariant,
                                    }}
                                >
                                    Classic
                                </button>
                                <button
                                    onClick={() => setVariant("slim")}
                                    className={`py-2 rounded-xl text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 border ${
                                        variant === "slim"
                                            ? "shadow-sm border-transparent"
                                            : "hover:bg-white/5 border-transparent"
                                    }`}
                                    style={{
                                        backgroundColor: variant === "slim" ? colors.surface : undefined,
                                        color: variant === "slim" ? colors.onSurface : colors.onSurfaceVariant,
                                    }}
                                >
                                    Slim
                                </button>
                            </div>
                        </div>

                        <div className="h-[1px] w-full" style={{ backgroundColor: `${colors.outline}22` }} />

                        {/* Section 3: File Upload & Skin Controls */}
                        <div className="flex flex-col">
                            <div className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-2" style={{ color: colors.onSurfaceVariant }}>
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
                                className={`w-full ${mode === "catskinc" ? "py-3" : "py-4"} rounded-2xl border-2 border-dashed transition-all hover:opacity-90 hover:scale-[1.01] active:scale-95 flex items-center justify-center relative overflow-hidden group cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
                                style={{
                                    borderColor: selectedFileName ? `${colors.primary}80` : `${colors.outline}33`,
                                    backgroundColor: selectedFileName ? `${colors.primary}08` : 'transparent',
                                }}
                            >
                                <div className={`flex flex-col items-center gap-1.5 ${mode === "catskinc" ? "p-1.5" : "p-2"}`}>
                                    {selectedFileName ? (
                                        <>
                                            {mode !== "catskinc" && (
                                                <div className="w-10 h-10 rounded-full flex items-center justify-center mb-1" style={{ backgroundColor: `${colors.primary}15` }}>
                                                    <Icons.Check className="w-5 h-5" style={{ color: `${colors.primary}cc` }} />
                                                </div>
                                            )}
                                            <span className="text-sm font-semibold truncate max-w-[220px]" style={{ color: colors.onSurface }}>
                                                {selectedFileName}
                                            </span>
                                            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded" style={{ backgroundColor: `${colors.primary}15`, color: `${colors.primary}cc` }}>
                                                Ready to apply
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            {mode !== "catskinc" && (
                                                <div className="w-10 h-10 rounded-full flex items-center justify-center mb-1 group-hover:scale-110 transition-transform duration-300"
                                                    style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                                    <Icons.Upload className="w-5 h-5 opacity-40 group-hover:opacity-80 transition-opacity" style={{ color: colors.onSurface }} />
                                                </div>
                                            )}
                                            <span className="text-sm font-semibold" style={{ color: colors.onSurface }}>
                                                {t("wardrobe_choose_skin")}
                                            </span>
                                            <span className="text-[10px] opacity-35 font-semibold" style={{ color: colors.onSurfaceVariant }}>
                                                PNG (Aspect Ratio 1:1 or 2:1)
                                            </span>
                                        </>
                                    )}
                                </div>
                            </button>

                            <input
                                ref={mouthFileInputRef}
                                type="file"
                                accept=".png,image/png"
                                onChange={onSelectMouthFile}
                                className="hidden"
                            />

                            {mode === "catskinc" && (
                                <div className="mt-3 flex flex-col">
                                    <div className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-2" style={{ color: colors.onSurfaceVariant }}>
                                        {t("wardrobe_catskinc_mouth_open")}
                                    </div>
                                    <button
                                        onClick={() => mouthFileInputRef.current?.click()}
                                        className="w-full py-3 rounded-2xl border-2 border-dashed transition-all hover:opacity-90 hover:scale-[1.01] active:scale-95 flex items-center justify-center relative overflow-hidden group cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                                        style={{
                                            borderColor: mouthOpenFileName ? `${colors.primary}80` : `${colors.outline}33`,
                                            backgroundColor: mouthOpenFileName ? `${colors.primary}08` : 'transparent',
                                        }}
                                    >
                                        <div className="flex flex-col items-center gap-1.5 p-1.5">
                                            {mouthOpenFileName ? (
                                                <>
                                                    <span className="text-sm font-semibold truncate max-w-[220px]" style={{ color: colors.onSurface }}>
                                                        {mouthOpenFileName}
                                                    </span>
                                                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded" style={{ backgroundColor: `${colors.primary}15`, color: `${colors.primary}cc` }}>
                                                        Overlay loaded
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-sm font-semibold" style={{ color: colors.onSurface }}>
                                                        {t("wardrobe_catskinc_choose_mouth")}
                                                    </span>
                                                    <span className="text-[10px] opacity-35 font-semibold" style={{ color: colors.onSurfaceVariant }}>
                                                        PNG (Aspect Ratio 1:1 or 2:1)
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </button>
                                    
                                </div>
                            )}

                            {profileError && (
                                <div className="text-xs font-semibold p-3 rounded-xl mt-3 border border-red-500/20 bg-red-500/10 text-red-500">
                                    {profileError}
                                </div>
                            )}

                        </div>

                        <div className="h-[1px] w-full" style={{ backgroundColor: `${colors.outline}22` }} />

                        {/* Section 4: Action Buttons Row */}
                        <div className="grid grid-cols-2 gap-3 w-full">
                            <button
                                onClick={handleClearClick}
                                disabled={isClearDisabled}
                                className="w-full py-3.5 rounded-2xl text-xs font-semibold uppercase tracking-wider border transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/5 active:scale-95 flex items-center justify-center text-center"
                                style={{
                                    backgroundColor: 'transparent',
                                    borderColor: `${colors.outline}33`,
                                    color: colors.onSurface,
                                }}
                            >
                                {hasPreviewCache 
                                    ? (config.language === "th" ? "ล้างรีวิวตัวอย่าง" : "Clear Preview") 
                                    : (config.language === "th" ? "ล้างสกิน" : "Clear")}
                            </button>

                            <button
                                onClick={onApplySkin}
                                disabled={isApplying || !selectedSkinDataUrl}
                                className="w-full py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-45 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 text-center"
                                style={{
                                    backgroundColor: selectedSkinDataUrl ? colors.primary : colors.surfaceContainerHighest,
                                    color: selectedSkinDataUrl ? colors.onPrimary : colors.onSurfaceVariant,
                                    border: selectedSkinDataUrl ? "1px solid rgba(255, 255, 255, 0.1)" : `1px solid ${colors.outline}22`,
                                }}
                            >
                                {isApplying && <Icons.Spinner className="w-3.5 h-3.5 animate-spin" style={{ color: colors.onPrimary }} />}
                                <span className="truncate">
                                    {isApplying ? t("wardrobe_applying") : t("wardrobe_apply_skin")}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            {showClearModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="w-[360px] p-6 rounded-2xl border space-y-4 shadow-2xl" style={{ backgroundColor: colors.surfaceContainer, borderColor: `${colors.outline}33` }}>
                        <div className="text-center">
                            <h3 className="text-lg font-bold" style={{ color: colors.onSurface }}>
                                {config.language === "th" ? "ล้างข้อมูล CatSkin" : "Clear CatSkin Assets"}
                            </h3>
                            <p className="text-xs opacity-60 mt-1" style={{ color: colors.onSurfaceVariant }}>
                                {config.language === "th" 
                                    ? "กรุณาเลือกประเภทข้อมูลที่คุณต้องการลบออกจากระบบ CatSkin" 
                                    : "Please select the type of data you wish to delete from the CatSkin server."}
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 pt-2">
                            <button
                                disabled={isClearingAssets}
                                onClick={() => handleClearConfirm("skin")}
                                className="w-full py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all hover:bg-red-500/15 active:scale-[0.98] border border-red-500/30 text-red-500 flex items-center justify-center gap-1.5"
                            >
                                {isClearingAssets && <Icons.Spinner className="w-3.5 h-3.5 animate-spin" />}
                                {config.language === "th" ? "ล้างสกิน (Clear Skin)" : "Clear Skin"}
                            </button>
                            <button
                                disabled={isClearingAssets}
                                onClick={() => handleClearConfirm("mouth")}
                                className="w-full py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all hover:bg-orange-500/15 active:scale-[0.98] border border-orange-500/30 text-orange-500 flex items-center justify-center gap-1.5"
                            >
                                {isClearingAssets && <Icons.Spinner className="w-3.5 h-3.5 animate-spin" />}
                                {config.language === "th" ? "ล้างเลเยอร์เปิดปาก (Clear Mouth)" : "Clear Mouth"}
                            </button>
                            <button
                                disabled={isClearingAssets}
                                onClick={() => handleClearConfirm("all")}
                                className="w-full py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all hover:bg-red-500/25 active:scale-[0.98] border border-red-500/50 bg-red-500/10 text-red-500 flex items-center justify-center gap-1.5"
                            >
                                {isClearingAssets && <Icons.Spinner className="w-3.5 h-3.5 animate-spin" />}
                                {config.language === "th" ? "ล้างทั้งหมด (Clear All)" : "Clear All"}
                            </button>
                            <div className="h-[1px] w-full my-1" style={{ backgroundColor: `${colors.outline}22` }} />
                            <button
                                disabled={isClearingAssets}
                                onClick={() => setShowClearModal(false)}
                                className="w-full py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider border transition-all hover:bg-white/5 active:scale-[0.98]"
                                style={{
                                    borderColor: `${colors.outline}33`,
                                    color: colors.onSurface,
                                }}
                            >
                                {t("cancel")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
