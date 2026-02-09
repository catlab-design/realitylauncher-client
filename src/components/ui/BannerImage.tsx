import React, { useState, useEffect, useRef } from "react";
import { cn } from "../../lib/utils";
import { Icons } from "../ui/Icons";

interface BannerImageProps {
    src: string | null;
    alt: string;
    className?: string;
    style?: React.CSSProperties;
    loading?: "eager" | "lazy";
    priority?: boolean;
}

export const BannerImage = React.memo(({ 
    src, 
    alt, 
    className, 
    style,
    loading = "lazy",
    priority = false
}: BannerImageProps) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [error, setError] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);
    
    // Check if image is already loaded (cached)
    useEffect(() => {
        if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
            setIsLoaded(true);
        }
    }, [src]);

    // Reset state when src changes
    useEffect(() => {
        setIsLoaded(false);
        setError(false);
        
        if (!src) return;

        // If priority is true, preload image immediately
        if (priority) {
            const img = new Image();
            img.src = src;
            img.onload = () => setIsLoaded(true);
            img.onerror = () => setError(true);
        }
    }, [src, priority]);

    if (!src || error) {
        return (
            <div 
                className={cn("w-full h-full flex items-center justify-center bg-linear-to-br from-gray-800 to-gray-900", className)}
                style={style}
            >
                <Icons.News className="w-24 h-24 opacity-10 text-white" />
            </div>
        );
    }

    return (
        <div className={cn("relative w-full h-full overflow-hidden", className)} style={style}>
            {/* Low Quality Placeholder / Background Color */}
            <div 
                className={cn(
                    "absolute inset-0 bg-gray-800 transition-opacity duration-700",
                    isLoaded ? "opacity-0" : "opacity-100"
                )} 
            />
            
            {/* Main Image - Use ref to check complete status */}
            <img
                ref={imgRef}
                src={src}
                alt={alt}
                loading={priority ? "eager" : loading}
                onLoad={() => setIsLoaded(true)}
                onError={() => setError(true)}
                className={cn(
                    "w-full h-full object-cover transition-opacity duration-1000 ease-in-out will-change-transform",
                    isLoaded ? "opacity-100" : "opacity-0"
                )}
            />
        </div>
    );
});

BannerImage.displayName = "BannerImage";
