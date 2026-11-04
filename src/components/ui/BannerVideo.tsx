import React from "react";
import { useReducedMotionConfig } from "framer-motion";
import { cn } from "../../lib/utils";

/**
 * Looping, muted banner video laid over the banner image (its poster). Fades in once
 * frames are playing; stays hidden on load/codec errors, with reduced motion
 * (Performance mode or the OS setting), and pauses while the window is hidden.
 */
export const BannerVideo = React.memo(function BannerVideo({ src, className }: { src: string | null | undefined; className?: string }) {
    const reduced = !!useReducedMotionConfig();
    const ref = React.useRef<HTMLVideoElement>(null);
    const [playing, setPlaying] = React.useState(false);
    const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
    const usable = !!src && !reduced && src !== failedSrc;

    React.useEffect(() => {
        setPlaying(false);
    }, [src]);

    React.useEffect(() => {
        const video = ref.current;
        if (!usable || !video) return;
        const sync = () => {
            if (document.hidden) video.pause();
            else void video.play().catch(() => {});
        };
        sync();
        document.addEventListener("visibilitychange", sync);
        return () => document.removeEventListener("visibilitychange", sync);
    }, [usable, src]);

    if (!usable) return null;

    return (
        <video
            ref={ref}
            key={src}
            src={src}
            muted
            loop
            playsInline
            autoPlay
            preload="auto"
            aria-hidden="true"
            disablePictureInPicture
            onPlaying={() => setPlaying(true)}
            onError={() => setFailedSrc(src)}
            className={cn(
                "pointer-events-none h-full w-full object-cover transition-opacity duration-500",
                playing ? "opacity-100" : "opacity-0",
                className,
            )}
        />
    );
});
