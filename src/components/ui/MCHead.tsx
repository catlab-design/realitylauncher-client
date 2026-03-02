import React, { useState, useEffect } from "react";
import { cn } from "../../lib/utils";

function getMCHeadURL(username: string, size: number = 64, versionStr: string = ""): string {
    const url = `https://crafthead.net/avatar/${username}/${size}`;
    return versionStr ? `${url}?v=${versionStr}` : url;
}

export function MCHead({ username, size = 48, className = "" }: { username: string; size?: number; className?: string }) {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);
    const [version, setVersion] = useState("");

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

    return (
        <div className={cn("rounded-xl overflow-hidden flex items-center justify-center bg-gray-200", className)} style={{ width: size, height: size }}>
            {!error ? (
                <img
                    src={getMCHeadURL(username, size * 2, version)}
                    alt={username}
                    className={cn("w-full h-full object-cover transition-opacity", loaded ? "opacity-100" : "opacity-0")}
                    onLoad={() => setLoaded(true)}
                    onError={() => setError(true)}
                />
            ) : (
                <span className="text-lg font-bold text-gray-500">{username.charAt(0).toUpperCase()}</span>
            )}
        </div>
    );
}
