/**
 * ========================================
 * ShimmerButton - ปุ่มเอฟเฟกต์แวววาว
 * ========================================
 * 
 * Component ปุ่มสไตล์ MagicUI ที่มี shimmer effect
 * 
 * Features:
 * - Gradient shimmer animation ที่วิ่งผ่านปุ่ม
 * - Hover glow effect
 * - รองรับ disabled state
 * - รองรับ variants (default, outline)
 * 
 * @example
 * ```tsx
 * <ShimmerButton onClick={() => console.log("Clicked!")}>
 *   Launch Game
 * </ShimmerButton>
 * 
 * <ShimmerButton variant="outline" disabled>
 *   Loading...
 * </ShimmerButton>
 * ```
 */

import React from "react";

// ========================================
// Types - ประเภทข้อมูล
// ========================================

/**
 * ShimmerButtonProps - Props ของ ShimmerButton
 * 
 * @extends React.ButtonHTMLAttributes - รับ props ปกติของ button
 * @property variant - รูปแบบปุ่ม ('default' หรือ 'outline')
 * @property shimmerColor - สีของ shimmer effect
 * @property className - CSS classes เพิ่มเติม
 */
interface ShimmerButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "outline";
    shimmerColor?: string;
    className?: string;
}

// ========================================
// Utility - ฟังก์ชันช่วย
// ========================================

/**
 * cn - Merge classnames (filter falsy values)
 */
function cn(...classes: (string | false | null | undefined)[]): string {
    return classes.filter(Boolean).join(" ");
}

// ========================================
// Component
// ========================================

/**
 * ShimmerButton - ปุ่มที่มี shimmer effect
 * 
 * การทำงานของ shimmer:
 * 1. มี pseudo-element (::before) ที่มี gradient
 * 2. Gradient เอียง 45 องศา
 * 3. Animation ขยับ background-position ให้ gradient วิ่ง
 * 4. Overflow:hidden ซ่อน gradient ที่ออกนอกปุ่ม
 */
export default function ShimmerButton({
    children,
    variant = "default",
    shimmerColor = "rgba(255, 255, 255, 0.15)",
    className,
    disabled,
    ...props
}: ShimmerButtonProps) {
    // Base styles - สไตล์พื้นฐานของปุ่ม
    const baseStyles = cn(
        // Layout & sizing
        "relative inline-flex items-center justify-center gap-2",
        "px-5 py-2.5 rounded-xl",
        // Typography
        "text-sm font-semibold",
        // Transition สำหรับ hover effects
        "transition-all duration-300",
        // Overflow hidden เพื่อซ่อน shimmer ที่ล้นออกมา
        "overflow-hidden",
        // Disabled state
        "disabled:opacity-50 disabled:cursor-not-allowed",
        // Focus ring
        "focus:outline-none focus:ring-2 focus:ring-white/20"
    );

    // Variant styles - สไตล์ตาม variant
    const variantStyles = {
        default: cn(
            // Background gradient
            "bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600",
            "text-white",
            // Hover glow
            "hover:shadow-lg hover:shadow-fuchsia-500/30",
            "active:scale-[0.98]"
        ),
        outline: cn(
            // Transparent background with border
            "bg-transparent",
            "border border-white/20",
            "text-white",
            // Hover
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
            {/* Shimmer overlay - layer ที่มี animation */}
            <span
                className="pointer-events-none absolute inset-0"
                style={{
                    background: `linear-gradient(
            110deg,
            transparent 25%,
            ${shimmerColor} 50%,
            transparent 75%
          )`,
                    backgroundSize: "200% 100%",
                    animation: disabled ? "none" : "shimmer 2s infinite linear",
                }}
            />

            {/* Content - ข้อความ/icon ในปุ่ม */}
            <span className="relative z-10">{children}</span>

            {/* Inline keyframes - สำหรับ shimmer animation */}
            <style>{`
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
        </button>
    );
}
