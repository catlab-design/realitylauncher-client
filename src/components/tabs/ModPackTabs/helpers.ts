import type { Variants } from "framer-motion";
import { DURATION, EASE, SPRING, type MotionPreset } from "../../../lib/motion";

export function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format play time in minutes to human readable. Caller passes the localized
 * unit strings (typically `t('minutes_unit')` / `t('hours_unit')`).
 */
export function formatPlayTime(
    minutes: number,
    units: { minutes: string; hours: string },
): string {
    if (minutes < 60) return `${minutes} ${units.minutes}`;
    const hours = Math.floor(minutes / 60);
    return `${hours} ${units.hours}`;
}

export function getLoaderLabel(loader: string): string {
    const labels: Record<string, string> = {
        vanilla: "Vanilla",
        fabric: "Fabric",
        forge: "Forge",
        neoforge: "NeoForge",
        quilt: "Quilt",
    };
    return labels[loader] || loader;
}

const BULK_BAR_VARIANTS: Variants = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: { ...SPRING.smooth, opacity: { duration: DURATION.fast, ease: EASE.out } } },
    exit: { opacity: 0, y: 16, transition: { duration: DURATION.fast, ease: EASE.in } },
};

/** Floating bulk-action bar: spring slide-up from the window edge (plain fade under reduced motion). */
export function bulkBarVariants(m: MotionPreset): Variants {
    return m.reduced ? m.fadeIn : BULK_BAR_VARIANTS;
}
