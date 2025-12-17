/**
 * MCHead Component - Minecraft Avatar Display
 */
import React, { useState } from "react";
import { cn, getMCHeadURL } from "./types";

interface MCHeadProps {
    username: string;
    size?: number;
    className?: string;
}

export function MCHead({ username, size = 48, className = "" }: MCHeadProps) {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);

    return (
        <div
            className={cn(
                "rounded-xl overflow-hidden flex items-center justify-center bg-gray-200",
                className
            )}
            style={{ width: size, height: size }}
        >
            {!error ? (
                <img
                    src={getMCHeadURL(username, size * 2)}
                    alt={username}
                    className={cn(
                        "w-full h-full object-cover transition-opacity",
                        loaded ? "opacity-100" : "opacity-0"
                    )}
                    onLoad={() => setLoaded(true)}
                    onError={() => setError(true)}
                />
            ) : (
                <span className="text-lg font-bold text-gray-500">
                    {username.charAt(0).toUpperCase()}
                </span>
            )}
        </div>
    );
}
