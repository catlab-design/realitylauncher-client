import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "../../hooks/useTranslation";
import { useMotionPreset } from "../../lib/motion";
import { useConfigStore } from "../../store/configStore";
import { useAuthStore } from "../../store/authStore";
import { useUiStore } from "../../store/uiStore";
import { Icons } from "../ui/Icons";
import { MCHead } from "../ui/MCHead";
import { SkinPreview3D, SKIN_ANIMATIONS, type SkinAnimationType } from "./wardrobe/SkinPreview3D";
import type { GameInstance } from "../../types/launcher";

interface WardrobeProps {
    colors: any;
    selectedInstance?: GameInstance | null;
    onLinkMicrosoft?: () => void | Promise<void>;
    setLoginDialogOpen?: (open: boolean) => void;
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
const SKIN_FILE_MAX_BYTES = 2 * 1024 * 1024;
const CATSKINC_FILE_MAX_BYTES = 256 * 1024 * 1024;
const CATSKINC_MAX_SKIN_SIZE = 8192;

function isValidCatskincSkinSize(width: number, height: number): boolean {
    return width === height && width >= 64 && width <= CATSKINC_MAX_SKIN_SIZE && (width & (width - 1)) === 0;
}

function isValidCatskincOverlaySize(width: number, height: number): boolean {
    return width >= 8 && height >= 8 && width <= CATSKINC_MAX_SKIN_SIZE && height <= CATSKINC_MAX_SKIN_SIZE;
}

function loadImageSize(src: string): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

let cachedWardrobeProfile:
    | {
        username: string;
        fetchedAt: number;
        profile: MinecraftProfile;
    }
    | null = null;

/** True when a #rrggbb colour is dark (theme surface → pick the stage's light/dark look). */
function isDarkHex(hex: string): boolean {
    const m = /^#?([0-9a-f]{6})/i.exec(hex || "");
    if (!m) return false;
    const n = parseInt(m[1], 16);
    const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    return lum < 0.45;
}

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

export const Wardrobe: React.FC<WardrobeProps> = ({
    colors,
    selectedInstance,
    onLinkMicrosoft,
    setLoginDialogOpen,
}) => {
    const config = useConfigStore();
    const { session } = useAuthStore();
    const { t } = useTranslation(config.language);
    const m = useMotionPreset();

    const isMicrosoftSession = session?.authType === "microsoft";
    const isLinkedCatidSession = session?.authType === "catid" && !!session?.minecraftUuid;
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
    const [animationType, setAnimationType] = useState<SkinAnimationType>("idle");

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
        } catch {
            setCatskincSkinUrl(null);
            setCatskincMouthUrl(null);
            setCatskincSlim(false);
        } finally {
            setIsLoadingCatskincSkin(false);
        }
    }, [session?.uuid, selectedInstance?.gameDirectory]);

    const handleSaveIp = useCallback(async () => {
        if (!window.api?.catskincSaveConfig) return;
        const targetIp = serverIpInput.trim() || "storage-skin.catlabdesign.space";
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

    useEffect(() => {
        if (window.api?.catskincGetConfig) {
            window.api.catskincGetConfig(selectedInstance?.gameDirectory).then(cfg => {
                setCatskincConfig(cfg);
                setServerIpInput(cfg?.ip || "storage-skin.catlabdesign.space");
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
            card: colors.surfaceContainer,
            canvas: "transparent",
            gradient: `radial-gradient(ellipse at 50% 45%, ${colors.outline}26, transparent 68%)`,
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
        const isCatskinc = mode === "catskinc";
        if (file.size > (isCatskinc ? CATSKINC_FILE_MAX_BYTES : SKIN_FILE_MAX_BYTES)) {
            toast.error(t(isCatskinc ? "wardrobe_catskinc_file_too_large" : "wardrobe_file_too_large"));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || "");
            if (!result.startsWith("data:image/png;base64,")) { toast.error(t("wardrobe_only_png")); return; }

            const img = new Image();
            img.onload = () => {
                const w = img.width;
                const h = img.height;
                if (isCatskinc ? !isValidCatskincSkinSize(w, h) : !(w >= 64 && (w === h || w === 2 * h))) {
                    toast.error(t(isCatskinc ? "wardrobe_catskinc_invalid_dimensions" : "wardrobe_invalid_dimensions"));
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
    }, [t, mode]);

    const onSelectMouthFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (file.type && file.type !== "image/png") { toast.error(t("wardrobe_only_png")); return; }
        if (file.size > CATSKINC_FILE_MAX_BYTES) { toast.error(t("wardrobe_catskinc_file_too_large")); return; }
        const reader = new FileReader();
        reader.onload = async () => {
            const result = String(reader.result || "");
            if (!result.startsWith("data:image/png;base64,")) { toast.error(t("wardrobe_only_png")); return; }

            const mouthSize = await loadImageSize(result);
            if (!mouthSize) { toast.error(t("wardrobe_file_read_failed")); return; }
            if (!isValidCatskincOverlaySize(mouthSize.width, mouthSize.height)) {
                toast.error(t("wardrobe_catskinc_invalid_mouth_dimensions"));
                return;
            }
            if (selectedSkinDataUrl) {
                const skinSize = await loadImageSize(selectedSkinDataUrl);
                if (skinSize && (skinSize.width !== mouthSize.width || skinSize.height !== mouthSize.height)) {
                    toast.error(t("wardrobe_catskinc_mouth_size_mismatch"));
                    return;
                }
            }
            setMouthOpenDataUrl(result);
            setMouthOpenFileName(file.name);
            toast.success("Mouth overlay loaded");
        };
        reader.onerror = () => toast.error(t("wardrobe_file_read_failed"));
        reader.readAsDataURL(file);
    }, [t, selectedSkinDataUrl]);

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
            const errorMsg = session?.authType === "catid" ? t("wardrobe_catid_link_required") : t("wardrobe_microsoft_required");
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
                const skinSize = await loadImageSize(payload.dataUrl);
                if (!skinSize || !isValidCatskincSkinSize(skinSize.width, skinSize.height)) {
                    toast.error(t("wardrobe_catskinc_invalid_dimensions"));
                    return;
                }
                if (payload.mouthOpenDataUrl) {
                    const mouthSize = await loadImageSize(payload.mouthOpenDataUrl);
                    if (!mouthSize || !isValidCatskincOverlaySize(mouthSize.width, mouthSize.height)) {
                        toast.error(t("wardrobe_catskinc_invalid_mouth_dimensions"));
                        return;
                    }
                    if (mouthSize.width !== skinSize.width || mouthSize.height !== skinSize.height) {
                        toast.error(t("wardrobe_catskinc_mouth_size_mismatch"));
                        return;
                    }
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

    if (!session) {
        return (
            <div className="h-full flex items-center justify-center p-6">
                <motion.div className="text-center space-y-3" variants={m.scaleIn} initial="hidden" animate="show">
                    <Icons.Person className="w-12 h-12 mx-auto opacity-40" style={{ color: colors.onSurface }} />
                    <p className="font-bold text-lg" style={{ color: colors.onSurface }}>{t("not_logged_in")}</p>
                </motion.div>
            </div>
        );
    }

    if (!canManageProfile) {
        const isCatID = session?.authType === "catid";
        const guardTitle = isCatID
            ? t("wardrobe_catid_link_required")
            : t("wardrobe_microsoft_required");
        const guardDesc = isCatID
            ? t("wardrobe_catid_link_hint")
            : t("wardrobe_switch_account_hint");

        return (
            <div className="h-full flex items-center justify-center p-6">
                <motion.div className="flex flex-col items-center text-center p-8 rounded-2xl max-w-sm space-y-5"
                    style={{ backgroundColor: colors.surfaceContainer }}
                    variants={m.scaleIn} initial="hidden" animate="show">
                    <Icons.Microsoft className="w-12 h-12" style={{ color: "#00A4EF" }} />
                    <div>
                        <p className="font-bold text-lg" style={{ color: colors.onSurface }}>{guardTitle}</p>
                        <p className="text-sm mt-1.5" style={{ color: colors.onSurfaceVariant }}>{guardDesc}</p>
                    </div>
                    {isCatID ? (
                        <button
                            onClick={() => onLinkMicrosoft?.()}
                            className="w-full h-12 px-4 rounded-xl text-sm font-bold transition hover:brightness-105 active:scale-[0.98]"
                            style={{ backgroundColor: colors.secondary, color: "#111" }}
                        >
                            {t("link_microsoft") || "Link Microsoft"}
                        </button>
                    ) : (
                        <button
                            onClick={() => setLoginDialogOpen?.(true)}
                            className="w-full h-12 px-4 rounded-xl text-sm font-bold transition hover:brightness-105 active:scale-[0.98]"
                            style={{ backgroundColor: colors.secondary, color: "#111" }}
                        >
                            {t("login_with_microsoft") || "Login with Microsoft"}
                        </button>
                    )}
                </motion.div>
            </div>
        );
    }

    const segmentButtonStyle = (active: boolean): React.CSSProperties => ({
        backgroundColor: active ? colors.secondary : "transparent",
        color: active ? "#111" : colors.onSurfaceVariant,
    });

    // Shared sliding fill for the segmented controls (z-1 over the track, under every label at z-2).
    const segmentPill = (layoutId: string, className: string, backgroundColor: string) => (
        <motion.span
            layoutId={layoutId}
            transition={m.tabIndicator}
            className={`absolute inset-0 z-1 ${className}`}
            style={{ backgroundColor }}
        />
    );

    return (
        <motion.div className="h-full min-h-140 flex flex-col gap-5" variants={m.staggerContainer(0.05)} initial="hidden" animate="show">
            <div className="flex-1 min-h-0 flex gap-5">
                <motion.div
                    className="relative flex-1 min-w-0 rounded-2xl overflow-hidden"
                    style={{
                        backgroundColor: previewBackground.card,
                        backgroundImage: previewBackground.gradient,
                    }}
                    variants={m.fadeUp}
                >
                    <SkinPreview3D
                        skinUrl={previewSkin}
                        variant={variant}
                        backgroundColor={previewBackground.canvas}
                        animationType={animationType}
                        room={{ dark: isDarkHex(colors.surface), accent: colors.secondary || "#ffde59" }}
                        onResetRotation={(fn) => (resetRotationRef.current = fn)}
                        onSkinLoadStateChange={setIsPreviewSkinLoading}
                    />


                    <AnimatePresence initial={false}>
                    {(isLoadingProfile || isPreviewSkinLoading || !profileFetched || isLoadingCatskincSkin) && (
                        <motion.div
                            key="wardrobe-preview-loading"
                            className="absolute inset-0 animate-skeleton-wave flex items-center justify-center"
                            style={{ backgroundColor: previewBackground.overlay }}
                            variants={m.fadeIn}
                            {...m.states}
                        >
                            <div
                                className="h-9 px-4 rounded-full text-sm font-semibold flex items-center gap-2"
                                style={{ backgroundColor: previewBackground.badgeBackground, color: previewBackground.badgeText }}
                            >
                                <Icons.Spinner className="w-4 h-4 animate-spin" />
                                {t("loading")}
                            </div>
                        </motion.div>
                    )}
                    </AnimatePresence>

                    <div className="absolute top-4 left-5 select-none pointer-events-none">
                        <p className="text-sm font-semibold" style={{ color: colors.onSurface }}>
                            {t("wardrobe_preview_3d")}
                        </p>
                        <p className="text-[13px] mt-0.5" style={{ color: colors.onSurfaceVariant }}>
                            {t("wardrobe_drag_rotate")}
                        </p>
                    </div>

                    <motion.button
                        onClick={() => resetRotationRef.current?.()}
                        aria-label={t("wardrobe_reset_rotation")}
                        title={t("wardrobe_reset_rotation")}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{ backgroundColor: previewBackground.buttonBackground, color: previewBackground.buttonText }}
                        {...m.hoverScale}
                    >
                        <Icons.Refresh className="w-5 h-5" />
                    </motion.button>

                    <AnimatePresence>
                    {mode === "catskinc" && finalMouthOpenUrl && (
                        <motion.button
                            key="wardrobe-mic-test"
                            onClick={toggleMicTest}
                            aria-label={testMicActive ? "Stop microphone test" : "Test mouth overlay via microphone"}
                            title={testMicActive ? "Stop microphone test" : "Test mouth overlay via microphone"}
                            className="absolute bottom-4 left-4 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-[filter,background-color,color] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2"
                            style={{
                                backgroundColor: testMicActive ? colors.secondary : previewBackground.buttonBackground,
                                color: testMicActive ? "#111" : previewBackground.buttonText,
                            }}
                            variants={m.scaleIn}
                            {...m.states}
                            {...m.hoverScale}
                        >
                            <Icons.Mic className={`w-5 h-5 ${testMicActive ? "animate-pulse" : ""}`} />
                        </motion.button>
                    )}
                    </AnimatePresence>

                    <div
                        className="isolate absolute bottom-4 left-1/2 -translate-x-1/2 w-max max-w-[calc(100%-2rem)] flex flex-wrap items-center justify-center gap-1 p-1 rounded-3xl backdrop-blur-md"
                        style={{ backgroundColor: previewBackground.hintBackground }}
                    >
                        {SKIN_ANIMATIONS.map(({ id, label }) => (
                            <button
                                key={id}
                                onClick={() => setAnimationType(id)}
                                className="relative h-9 px-3.5 rounded-full text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                                style={{ color: segmentButtonStyle(animationType === id).color }}
                            >
                                {animationType === id && segmentPill("wardrobe-animation-pill", "rounded-full", colors.secondary)}
                                <span className="relative z-2">{label}</span>
                            </button>
                        ))}
                    </div>
                </motion.div>

                <motion.div variants={m.fadeUp} className="w-95 shrink-0 min-h-0 flex flex-col">
                    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-6 pr-1">
                        {/* Skin source: Microsoft profile or the CatSkinC mod. */}
                        <div
                            className="isolate grid grid-cols-2 gap-1 p-1 rounded-xl shrink-0"
                            style={{ backgroundColor: colors.surfaceContainerHighest }}
                        >
                            <button
                                onClick={() => setMode("microsoft")}
                                className="relative h-10 px-3 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                                style={{ color: mode === "microsoft" ? colors.onSurface : colors.onSurfaceVariant }}
                            >
                                {mode === "microsoft" && segmentPill("wardrobe-mode-pill", "rounded-lg", colors.surface)}
                                <span className="relative z-2 inline-flex items-center justify-center gap-2">
                                    <Icons.Microsoft className="w-4 h-4 shrink-0" style={{ color: "#00A4EF" }} />
                                    {t("wardrobe_mode_microsoft")}
                                </span>
                            </button>
                            <button
                                onClick={() => {
                                    if (!canManageProfile) {
                                        toast.error("Microsoft account is required to authenticate with CatSkinC.");
                                        return;
                                    }
                                    setMode("catskinc");
                                }}
                                className="relative h-10 px-3 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                                style={{ color: mode === "catskinc" ? colors.onSurface : colors.onSurfaceVariant }}
                            >
                                {mode === "catskinc" && segmentPill("wardrobe-mode-pill", "rounded-lg", colors.surface)}
                                <span className="relative z-2">{t("wardrobe_mode_catskinc")}</span>
                            </button>
                        </div>

                        <div className="flex items-center gap-4">
                            <div
                                className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
                                style={{ backgroundColor: colors.surfaceContainerHighest }}
                            >
                                <MCHead
                                    username={session.username}
                                    size={56}
                                    className="w-full h-full rounded-xl"
                                />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-lg font-bold truncate leading-tight" style={{ color: colors.onSurface }}>
                                    {profile?.name || session?.username || "-"}
                                </h3>
                                <p className="flex items-center gap-1.5 text-sm mt-1" style={{ color: colors.onSurfaceVariant }}>
                                    {mode !== "catskinc" ? (
                                        <>
                                            <Icons.Microsoft className="w-3.5 h-3.5 shrink-0" style={{ color: isMicrosoftSession ? "#00A4EF" : colors.primary }} />
                                            <span className="truncate">{isMicrosoftSession ? "Microsoft Account" : "Linked CatID"}</span>
                                        </>
                                    ) : (
                                        <span className="truncate">{t("wardrobe_mode_catskinc")}</span>
                                    )}
                                </p>
                            </div>
                            <button
                                onClick={() => syncProfile({ force: true })}
                                disabled={isLoadingProfile}
                                aria-label={t("wardrobe_refresh_profile")}
                                className="ml-auto w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition hover:brightness-110 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}
                            >
                                <Icons.Refresh className={`w-5 h-5 ${isLoadingProfile ? "animate-spin" : ""}`} />
                            </button>
                        </div>

                        <div>
                            <p className="text-sm font-semibold mb-2.5" style={{ color: colors.onSurface }}>
                                {t("wardrobe_variant")}
                            </p>
                            <div
                                className="isolate grid grid-cols-2 gap-1 p-1 rounded-xl"
                                style={{ backgroundColor: colors.surfaceContainer }}
                            >
                                {(["classic", "slim"] as const).map((value) => (
                                    <button
                                        key={value}
                                        onClick={() => setVariant(value)}
                                        className="relative h-11 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                                        style={{ color: segmentButtonStyle(variant === value).color }}
                                    >
                                        {variant === value && segmentPill("wardrobe-variant-pill", "rounded-lg", colors.secondary)}
                                        <span className="relative z-2">{value === "classic" ? "Classic" : "Slim"}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-sm font-semibold mb-2.5" style={{ color: colors.onSurface }}>
                                {t("wardrobe_skin_control")}
                            </p>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".png,image/png"
                                onChange={onSelectFile}
                                className="hidden"
                            />

                            <motion.button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full flex items-center gap-4 p-4 rounded-xl text-left transition-[filter] hover:brightness-110 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
                                style={{ backgroundColor: colors.surfaceContainer }}
                                {...m.hoverLift}
                            >
                                <div
                                    className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                                    style={{
                                        backgroundColor: selectedFileName ? colors.secondary : colors.surfaceContainerHighest,
                                        color: selectedFileName ? "#111" : colors.onSurfaceVariant,
                                    }}
                                >
                                    {/* Re-keyed so the icon pops when a file is picked or cleared. */}
                                    <motion.span key={selectedFileName ? "check" : "upload"} className="flex" variants={m.scaleIn} initial="hidden" animate="show">
                                        {selectedFileName ? <Icons.Check className="w-5 h-5" /> : <Icons.Upload className="w-5 h-5" />}
                                    </motion.span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[15px] font-semibold truncate" style={{ color: colors.onSurface }}>
                                        {selectedFileName || t("wardrobe_choose_skin")}
                                    </p>
                                    <p className="text-[13px] mt-0.5 truncate" style={{ color: colors.onSurfaceVariant }}>
                                        {selectedFileName ? "Ready to apply" : mode === "catskinc" ? "PNG (Square, 64-8192 px)" : "PNG (Aspect Ratio 1:1 or 2:1)"}
                                    </p>
                                </div>
                            </motion.button>

                            <input
                                ref={mouthFileInputRef}
                                type="file"
                                accept=".png,image/png"
                                onChange={onSelectMouthFile}
                                className="hidden"
                            />
                        </div>

                        <AnimatePresence initial={false}>
                        {mode === "catskinc" && (
                            <motion.div key="wardrobe-mouth-overlay" variants={m.fadeUp} {...m.states}>
                                <p className="text-sm font-semibold mb-2.5" style={{ color: colors.onSurface }}>
                                    {t("wardrobe_catskinc_mouth_open")}
                                </p>
                                <motion.button
                                    onClick={() => mouthFileInputRef.current?.click()}
                                    className="w-full flex items-center gap-4 p-4 rounded-xl text-left transition-[filter] hover:brightness-110 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
                                    style={{ backgroundColor: colors.surfaceContainer }}
                                    {...m.hoverLift}
                                >
                                    <div
                                        className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                                        style={{
                                            backgroundColor: mouthOpenFileName ? colors.secondary : colors.surfaceContainerHighest,
                                            color: mouthOpenFileName ? "#111" : colors.onSurfaceVariant,
                                        }}
                                    >
                                        <motion.span key={mouthOpenFileName ? "check" : "upload"} className="flex" variants={m.scaleIn} initial="hidden" animate="show">
                                            {mouthOpenFileName ? <Icons.Check className="w-5 h-5" /> : <Icons.Upload className="w-5 h-5" />}
                                        </motion.span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[15px] font-semibold truncate" style={{ color: colors.onSurface }}>
                                            {mouthOpenFileName || t("wardrobe_catskinc_choose_mouth")}
                                        </p>
                                        <p className="text-[13px] mt-0.5 truncate" style={{ color: colors.onSurfaceVariant }}>
                                            {mouthOpenFileName ? "Overlay loaded" : "PNG (same size as skin)"}
                                        </p>
                                    </div>
                                </motion.button>
                            </motion.div>
                        )}
                        </AnimatePresence>

                        <AnimatePresence initial={false}>
                        {profileError && (
                            <motion.div
                                key="wardrobe-profile-error"
                                role="alert"
                                className="text-sm font-medium px-4 py-3 rounded-xl bg-red-500/10 text-red-500"
                                variants={m.scaleIn}
                                {...m.states}
                            >
                                {profileError}
                            </motion.div>
                        )}
                        </AnimatePresence>
                    </div>

                    <div className="shrink-0 grid grid-cols-2 gap-3 pt-4">
                        <motion.button
                            onClick={handleClearClick}
                            disabled={isClearDisabled}
                            className="h-12 px-3 rounded-xl text-sm font-semibold transition-[filter,opacity] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-center focus-visible:outline-2 focus-visible:outline-offset-2"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            whileTap={isClearDisabled ? undefined : m.pressable.whileTap}
                        >
                            <span className="truncate">
                                {hasPreviewCache
                                    ? (config.language === "th" ? "ล้างรีวิวตัวอย่าง" : "Clear Preview")
                                    : (config.language === "th" ? "ล้างสกิน" : "Clear")}
                            </span>
                        </motion.button>

                        <motion.button
                            onClick={onApplySkin}
                            disabled={isApplying || !selectedSkinDataUrl}
                            className="h-12 px-3 rounded-xl text-sm font-bold transition-[filter,opacity] hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-center cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
                            style={{ backgroundColor: colors.secondary, color: "#111" }}
                            whileTap={isApplying || !selectedSkinDataUrl ? undefined : m.pressable.whileTap}
                        >
                            {isApplying && <Icons.Spinner className="w-4 h-4 animate-spin" />}
                            <span className="truncate">
                                {isApplying ? t("wardrobe_applying") : t("wardrobe_apply_skin")}
                            </span>
                        </motion.button>
                    </div>
                </motion.div>
            </div>

            <AnimatePresence>
            {showClearModal && (
                <motion.div
                    key="wardrobe-clear-modal"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    variants={m.modal.backdrop}
                    {...m.states}
                >
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        className="w-95 p-6 rounded-2xl space-y-5 shadow-2xl"
                        style={{ backgroundColor: colors.surfaceContainer }}
                        variants={m.modal.panel}
                    >
                        <div className="text-center">
                            <h3 className="text-lg font-bold" style={{ color: colors.onSurface }}>
                                {config.language === "th" ? "ล้างข้อมูล CatSkin" : "Clear CatSkin Assets"}
                            </h3>
                            <p className="text-sm mt-1.5" style={{ color: colors.onSurfaceVariant }}>
                                {config.language === "th"
                                    ? "กรุณาเลือกประเภทข้อมูลที่คุณต้องการลบออกจากระบบ CatSkin"
                                    : "Please select the type of data you wish to delete from the CatSkin server."}
                            </p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button
                                disabled={isClearingAssets}
                                onClick={() => handleClearConfirm("skin")}
                                className="w-full h-11 rounded-xl text-sm font-semibold transition hover:bg-red-500/20 active:scale-[0.98] disabled:opacity-50 bg-red-500/10 text-red-500 flex items-center justify-center gap-2"
                            >
                                {isClearingAssets && <Icons.Spinner className="w-4 h-4 animate-spin" />}
                                {config.language === "th" ? "ล้างสกิน (Clear Skin)" : "Clear Skin"}
                            </button>
                            <button
                                disabled={isClearingAssets}
                                onClick={() => handleClearConfirm("mouth")}
                                className="w-full h-11 rounded-xl text-sm font-semibold transition hover:bg-orange-500/20 active:scale-[0.98] disabled:opacity-50 bg-orange-500/10 text-orange-500 flex items-center justify-center gap-2"
                            >
                                {isClearingAssets && <Icons.Spinner className="w-4 h-4 animate-spin" />}
                                {config.language === "th" ? "ล้างเลเยอร์เปิดปาก (Clear Mouth)" : "Clear Mouth"}
                            </button>
                            <button
                                disabled={isClearingAssets}
                                onClick={() => handleClearConfirm("all")}
                                className="w-full h-11 rounded-xl text-sm font-semibold transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50 bg-red-500 text-white flex items-center justify-center gap-2"
                            >
                                {isClearingAssets && <Icons.Spinner className="w-4 h-4 animate-spin" />}
                                {config.language === "th" ? "ล้างทั้งหมด (Clear All)" : "Clear All"}
                            </button>
                            <button
                                disabled={isClearingAssets}
                                onClick={() => setShowClearModal(false)}
                                className="w-full h-11 mt-2 rounded-xl text-sm font-semibold transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                                {t("cancel")}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
            </AnimatePresence>
        </motion.div>
    );
};
