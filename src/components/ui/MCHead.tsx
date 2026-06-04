import React, { useState, useEffect } from "react";
import { cn } from "../../lib/utils";
import { useAuthStore } from "../../store/authStore";

function getMCHeadURL(username: string, size: number = 64, versionStr: string = ""): string {
    const url = `https://crafthead.net/avatar/${username}/${size}`;
    return versionStr ? `${url}?v=${versionStr}` : url;
}

function appendVersion(url: string, version: string): string {
    if (!version) return url;
    return url.includes("?") ? `${url}&v=${version}` : `${url}?v=${version}`;
}

export function MCHead({ username, size = 48, className = "" }: { username: string; size?: number; className?: string }) {
    const [displayUrl, setDisplayUrl] = useState("");
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);
    const [version, setVersion] = useState("");

    const session = useAuthStore((state) => state.session);
    const accounts = useAuthStore((state) => state.accounts);

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

    if (session && session.username === username) {
        const isLinked = session.type === "catid" ? !!session.minecraftUuid : !!session.catidLinked;
        const defaultSource = isLinked ? "minecraft_skin" : (session.type === "catid" ? "catid_avatar" : "minecraft_skin");
        const source = session.avatarSource || defaultSource;
        if (source === "catid_avatar" && session.avatarUrl) {
            avatarUrl = session.avatarUrl;
        } else if (source === "minecraft_skin") {
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

    const srcUrl = avatarUrl 
        ? appendVersion(avatarUrl, version) 
        : getMCHeadURL(targetUsername, size * 2, version);

    // Cache logic: load from localStorage immediately, fetch/cache in background
    useEffect(() => {
        let isMounted = true;
        const cacheKey = `avatar-cache:${username}`;
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
            {!error && displayUrl ? (
                <img
                    src={displayUrl}
                    alt={username}
                    className={cn("w-full h-full object-cover transition-opacity", loaded ? "opacity-100" : "opacity-0")}
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
