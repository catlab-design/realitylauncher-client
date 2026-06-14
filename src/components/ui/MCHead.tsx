import React, { useState, useEffect } from "react";
import { cn } from "../../lib/utils";
import { useAuthStore } from "../../store/authStore";
import { useUiStore } from "../../store/uiStore";

function getMCHeadURL(username: string, size: number = 64, versionStr: string = ""): string {
    const url = `https://crafthead.net/avatar/${username}/${size}`;
    return versionStr ? `${url}?v=${versionStr}` : url;
}

function appendVersion(url: string, version: string): string {
    if (!version) return url;
    return url.includes("?") ? `${url}&v=${version}` : `${url}?v=${version}`;
}

function extractMCHeadFromSkinTexture(skinDataUrl: string, size: number): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    resolve(skinDataUrl);
                    return;
                }
                ctx.imageSmoothingEnabled = false;

                // Dynamically calculate scale factor for HD skins (base width is 64)
                const scale = img.width / 64;

                const headX = Math.round(8 * scale);
                const headY = Math.round(8 * scale);
                const headSize = Math.round(8 * scale);

                const overlayX = Math.round(40 * scale);
                const overlayY = Math.round(8 * scale);
                const overlaySize = Math.round(8 * scale);

                // Base head layer
                ctx.drawImage(img, headX, headY, headSize, headSize, 0, 0, size, size);
                // Hat/accessory overlay layer
                ctx.drawImage(img, overlayX, overlayY, overlaySize, overlaySize, 0, 0, size, size);

                resolve(canvas.toDataURL("image/png"));
            } catch (e) {
                console.warn("Failed to extract head from skin texture via canvas:", e);
                resolve(skinDataUrl);
            }
        };
        img.onerror = () => {
            resolve(skinDataUrl);
        };
        img.src = skinDataUrl;
    });
}

export function MCHead({ username, size = 48, className = "" }: { username: string; size?: number; className?: string }) {
    const [displayUrl, setDisplayUrl] = useState("");
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);
    const [version, setVersion] = useState("");

    const session = useAuthStore((state) => state.session);
    const accounts = useAuthStore((state) => state.accounts);

    const wardrobeMode = useUiStore((state) => state.wardrobeMode);

    const [catskinHeadUrl, setCatskinHeadUrl] = useState<string | null>(null);

    useEffect(() => {
        const handleSkinUpdated = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail?.username === username) {
                // Bust the cache by appending timestamp
                setVersion(Date.now().toString());
                setLoaded(false); // Reset loading state to trigger fade-in again
                setError(false);
            }
        };

        window.addEventListener("minecraft-skin-updated", handleSkinUpdated);
        return () => window.removeEventListener("minecraft-skin-updated", handleSkinUpdated);
    }, [username]);

    // Check if there is an active session or a configured account with this username
    let avatarUrl: string | undefined;
    let targetUsername = username;
    let isMinecraftHead = false;

    if (session && session.username === username) {
        const isLinked = session.type === "catid" ? !!session.minecraftUuid : !!session.catidLinked;
        const defaultSource = isLinked ? "minecraft_skin" : (session.type === "catid" ? "catid_avatar" : "minecraft_skin");
        const source = session.avatarSource || defaultSource;
        if (source === "catid_avatar" && session.avatarUrl) {
            avatarUrl = session.avatarUrl;
        } else if (source === "minecraft_skin") {
            isMinecraftHead = true;
            const uuidToUse = session.minecraftUuid || session.uuid;
            if (uuidToUse && !uuidToUse.startsWith("catid-")) {
                targetUsername = uuidToUse;
            }
        }
    } else {
        const matchingAccount = accounts.find((a) => a.username === username);
        if (matchingAccount) {
            const isLinked = matchingAccount.type === "catid" ? !!matchingAccount.minecraftUuid : !!matchingAccount.catidLinked;
            const defaultSource = isLinked ? "minecraft_skin" : (matchingAccount.type === "catid" ? "catid_avatar" : "minecraft_skin");
            const source = matchingAccount.avatarSource || defaultSource;
            if (source === "catid_avatar" && matchingAccount.avatarUrl) {
                avatarUrl = matchingAccount.avatarUrl;
            } else if (source === "minecraft_skin") {
                const uuidToUse = matchingAccount.minecraftUuid || matchingAccount.uuid;
                if (uuidToUse && !uuidToUse.startsWith("catid-")) {
                    targetUsername = uuidToUse;
                }
            }
        }
    }

    // Effect to fetch and process CatSkin head
    useEffect(() => {
        if (wardrobeMode !== "catskinc" || !isMinecraftHead || !session || session.username !== username) {
            setCatskinHeadUrl(null);
            return;
        }

        let isMounted = true;
        const cacheKey = `catskin-hd-head-cache:${username}:${size}:${version}`;
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
            setCatskinHeadUrl(cached);
            return;
        }

        const fetchCatskinHead = async () => {
            if (!window.api?.catskincGetSelectedSkin) return;
            try {
                const res = await window.api.catskincGetSelectedSkin();
                if (isMounted) {
                    if (res.ok && res.url) {
                        const headDataUrl = await extractMCHeadFromSkinTexture(res.url, size * 2);
                        if (isMounted) {
                            try {
                                for (let i = 0; i < localStorage.length; i++) {
                                    const key = localStorage.key(i);
                                    if (key && key.startsWith(`catskin-hd-head-cache:${username}:${size}:`)) {
                                        localStorage.removeItem(key);
                                    }
                                }
                                localStorage.setItem(cacheKey, headDataUrl);
                            } catch (e) {
                                console.warn("Failed to cache CatSkin head to localStorage:", e);
                            }
                            setCatskinHeadUrl(headDataUrl);
                        }
                    } else {
                        setCatskinHeadUrl(null);
                    }
                }
            } catch (err) {
                console.warn("Failed to fetch/extract CatSkin head in MCHead:", err);
                if (isMounted) {
                    setCatskinHeadUrl(null);
                }
            }
        };

        fetchCatskinHead();

        return () => {
            isMounted = false;
        };
    }, [wardrobeMode, isMinecraftHead, session?.username, username, version, size]);

    const srcUrl = avatarUrl 
        ? appendVersion(avatarUrl, version) 
        : getMCHeadURL(targetUsername, size * 2, version);

    // Cache logic: load from localStorage immediately, fetch/cache in background
    useEffect(() => {
        let isMounted = true;
        const cacheKey = `avatar-cache:${username}:${size}`;
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
            setDisplayUrl(cached);
            setLoaded(true);
            setError(false);
        } else {
            setDisplayUrl(srcUrl);
            setLoaded(false);
            setError(false);
        }

        // Fetch fresh image in background and cache it as base64
        fetch(srcUrl)
            .then((res) => {
                if (!res.ok) throw new Error("Failed to fetch profile image");
                return res.blob();
            })
            .then((blob) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    if (isMounted) {
                        const base64data = reader.result as string;
                        try {
                            localStorage.setItem(cacheKey, base64data);
                        } catch (e) {
                            // If localStorage is full, clear old keys or ignore
                            console.warn("Failed to save avatar to localStorage:", e);
                        }
                        setDisplayUrl(base64data);
                        setLoaded(true);
                        setError(false);
                    }
                };
                reader.readAsDataURL(blob);
            })
            .catch((err) => {
                console.warn("Avatar fetch failed for username:", username, err);
                if (isMounted && !cached) {
                    setError(true);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [username, srcUrl]);

    const hasCustomRounded = className.includes("rounded-");

    return (
        <div className={cn("overflow-hidden flex items-center justify-center bg-gray-200", !hasCustomRounded && "rounded-xl", className)} style={{ width: size, height: size }}>
            {!error && (catskinHeadUrl || displayUrl) ? (
                <img
                    src={catskinHeadUrl || displayUrl}
                    alt={username}
                    className={cn("w-full h-full object-cover transition-opacity", (catskinHeadUrl || loaded) ? "opacity-100" : "opacity-0")}
                    style={{ imageRendering: (!avatarUrl || !!catskinHeadUrl) ? "pixelated" : undefined }}
                    onLoad={() => setLoaded(true)}
                    onError={() => {
                        // Fallback to error only if background fetch also fails or image fails to load
                        if (!displayUrl.startsWith("data:")) {
                            setError(true);
                        }
                    }}
                />
            ) : (
                <span className="text-lg font-bold text-gray-500">{username.charAt(0).toUpperCase()}</span>
            )}
        </div>
    );
}
