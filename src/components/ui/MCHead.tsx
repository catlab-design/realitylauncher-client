import React, { useState } from "react";
import { cn } from "../../lib/utils";

function getMCHeadURL(username: string, size: number = 64): string {
    return `https://crafthead.net/avatar/${username}/${size}`;
}

export function MCHead({ username, size = 48, className = "" }: { username: string; size?: number; className?: string }) {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);

    return (
        <div className={cn("rounded-xl overflow-hidden flex items-center justify-center bg-gray-200", className)} style={{ width: size, height: size }}>
            {!error ? (
                <img
                    src={getMCHeadURL(username, size * 2)}
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
