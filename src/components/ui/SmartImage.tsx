import React, { useEffect, useState } from "react";

// Smart Image Component with caching (no timestamp cache busting)
const imageCache = new Map<string, string>();

export function SmartImage({
    src,
    alt,
    className,
    style,
    trigger,
}: {
    src: string | undefined;
    alt?: string;
    className?: string;
    style?: any;
    trigger?: number;
}) {
    const [displaySrc, setDisplaySrc] = useState(() => {
        if (!src) return undefined;
        return imageCache.get(src) || src;
    });
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (!src) {
            setDisplaySrc(undefined);
            return;
        }

        // Use cached version if available
        const cached = imageCache.get(src);
        if (cached) {
            setDisplaySrc(cached);
            return;
        }

        setDisplaySrc(src);
        setHasError(false);

        // Skip fetch for data/blob URLs
        if (src.startsWith("data:") || src.startsWith("blob:")) return;

        // Preload image in background (no cache busting)
        const img = new Image();
        img.onload = () => {
            imageCache.set(src, src);
            setDisplaySrc(src);
        };
        img.onerror = () => setHasError(true);
        img.src = src;
    }, [src, trigger]);

    if (hasError || !displaySrc) {
        return (
            <div
                className={className}
                style={{ ...style, backgroundColor: "rgba(128,128,128,0.2)" }}
            />
        );
    }

    return (
        <img
            src={displaySrc}
            alt={alt}
            className={className}
            style={style}
            loading="lazy"
        />
    );
}

export function SmartBackground({
    src,
    className,
    style,
    children,
    onClick,
    trigger,
}: {
    src: string | undefined;
    className?: string;
    style?: any;
    children?: React.ReactNode;
    onClick?: () => void;
    trigger?: number;
}) {
    const [displaySrc, setDisplaySrc] = useState(() => {
        if (!src) return undefined;
        return imageCache.get(src) || src;
    });

    useEffect(() => {
        if (!src) {
            setDisplaySrc(undefined);
            return;
        }

        // Use cached version if available
        const cached = imageCache.get(src);
        if (cached) {
            setDisplaySrc(cached);
            return;
        }

        setDisplaySrc(src);

        // Skip fetch for data/blob URLs
        if (src.startsWith("data:") || src.startsWith("blob:")) return;

        // Preload image in background
        const img = new Image();
        img.onload = () => {
            imageCache.set(src, src);
            setDisplaySrc(src);
        };
        img.src = src;
    }, [src, trigger]);

    return (
        <div
            className={className}
            style={{
                ...style,
                backgroundImage: displaySrc
                    ? `url("${displaySrc}")`
                    : style?.backgroundImage,
            }}
            onClick={onClick}
        >
            {children}
        </div>
    );
}
