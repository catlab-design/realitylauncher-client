import { useTranslation } from "../../hooks/useTranslation";
import { cn } from "../../lib/utils";

export type InstanceVerification = "official" | "partner";

/** Fixed colours: the badge sits on cover art as often as on the theme surface. */
const FILL: Record<InstanceVerification, string> = {
    official: "#3b82f6",
    partner: "#f97316",
};

const SIZE_PX = { xs: 12, sm: 14, md: 18, lg: 24 } as const;

export function isVerification(value: unknown): value is InstanceVerification {
    return value === "official" || value === "partner";
}

/**
 * Twitch-style verified seal: an 8-point rosette (two rounded squares, one turned 45°)
 * with a white check. Official = blue, Partner = orange. Renders nothing when untagged.
 * Uses aria-label only (no title) so no native tooltip pops up.
 */
const LABEL: Record<InstanceVerification, string> = { official: "Official", partner: "Partner" };

export function VerifiedBadge({
    verification,
    size = "md",
    label = false,
    className,
}: {
    verification: InstanceVerification | string | null | undefined;
    size?: keyof typeof SIZE_PX;
    /** Pill with the tick and the word ("Official" / "Partner") instead of the bare seal. */
    label?: boolean;
    className?: string;
}) {
    const { t } = useTranslation();
    if (!isVerification(verification)) return null;
    const px = SIZE_PX[size];

    if (label) {
        const big = size === "lg";
        return (
            <span
                role="img"
                aria-label={t(verification === "official" ? "verified_official" : "verified_partner")}
                className={cn(
                    "inline-flex shrink-0 items-center rounded-full font-bold text-white align-middle",
                    big ? "h-7 gap-1.5 pl-1.5 pr-3 text-sm" : "h-6 gap-1 pl-1 pr-2.5 text-xs",
                    className,
                )}
                style={{ backgroundColor: FILL[verification], boxShadow: "0 2px 8px -2px rgba(0,0,0,0.45)" }}
            >
                <svg width={big ? 18 : 15} height={big ? 18 : 15} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
                    <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.25)" />
                    <path d="M7.6 12.4l2.9 2.9 5.9-6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {LABEL[verification]}
            </span>
        );
    }

    return (
        <svg
            role="img"
            aria-label={t(verification === "official" ? "verified_official" : "verified_partner")}
            width={px}
            height={px}
            viewBox="0 0 24 24"
            className={cn("inline-block shrink-0", className)}
            style={{ filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.45))" }}
        >
            <g fill={FILL[verification]}>
                <rect x="4" y="4" width="16" height="16" rx="3.5" />
                <rect x="4" y="4" width="16" height="16" rx="3.5" transform="rotate(45 12 12)" />
            </g>
            <path
                d="M7.9 12.4l2.7 2.7 5.5-5.6"
                fill="none"
                stroke="#fff"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
