import React from "react";

interface ShimmerButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "outline";
    shimmerColor?: string;
    className?: string;
}

function cn(...classes: (string | false | null | undefined)[]): string {
    return classes.filter(Boolean).join(" ");
}

export default function ShimmerButton({
    children,
    variant = "default",
    shimmerColor = "rgba(255, 255, 255, 0.15)",
    className,
    disabled,
    ...props
}: ShimmerButtonProps) {
    const baseStyles = cn(
        "relative inline-flex items-center justify-center gap-2",
        "px-5 py-2.5 rounded-xl",
        "text-sm font-semibold",
        "transition-all duration-300",
        "overflow-hidden",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus:outline-none focus:ring-2 focus:ring-white/20"
    );

    const variantStyles = {
        default: cn(
            "bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600",
            "text-white",
            "hover:shadow-lg hover:shadow-fuchsia-500/30",
            "active:scale-[0.98]"
        ),
        outline: cn(
            "bg-transparent",
            "border border-white/20",
            "text-white",
            "hover:bg-white/5 hover:border-white/30",
            "active:scale-[0.98]"
        ),
    };

    return (
        <button
            className={cn(baseStyles, variantStyles[variant], className)}
            disabled={disabled}
            {...props}
        >
            <span
                className="pointer-events-none absolute inset-0"
                style={{
                    background: `linear-gradient(110deg, transparent 25%, ${shimmerColor} 50%, transparent 75%)`,
                    backgroundSize: "200% 100%",
                    animation: disabled ? "none" : "shimmer 2s infinite linear",
                }}
            />
            <span className="relative z-10">{children}</span>
            <style>{`
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            `}</style>
        </button>
    );
}
