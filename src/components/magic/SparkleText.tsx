/**
 * ========================================
 * SparkleText - ข้อความประกายระยิบ
 * ========================================
 * 
 * Component ข้อความที่มี sparkle/stars effect
 * 
 * Features:
 * - ดาวระยิบรอบๆ ข้อความ
 * - Animation pop-in/out
 * - Random positions ที่เปลี่ยนเรื่อยๆ
 * 
 * @example
 * ```tsx
 * <SparkleText>
 *   ✨ Special Text
 * </SparkleText>
 * ```
 */

import React, { useEffect, useState } from "react";

// ========================================
// Types
// ========================================

interface SparkleTextProps {
    children: React.ReactNode;
    /** จำนวน sparkles */
    sparkleCount?: number;
    /** สี sparkle */
    colors?: string[];
    /** Additional CSS classes */
    className?: string;
}

interface Sparkle {
    id: number;
    x: number;
    y: number;
    size: number;
    color: string;
}

// ========================================
// Utility
// ========================================

function cn(...classes: (string | false | null | undefined)[]): string {
    return classes.filter(Boolean).join(" ");
}

/**
 * สร้าง sparkle object ใหม่
 */
function createSparkle(colors: string[]): Sparkle {
    return {
        id: Date.now() + Math.random(),
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 10 + 6,
        color: colors[Math.floor(Math.random() * colors.length)],
    };
}

// ========================================
// Component
// ========================================

export default function SparkleText({
    children,
    sparkleCount = 3,
    colors = ["#FFC700", "#FFD700", "#FFF7E0", "#FFFFFF"],
    className,
}: SparkleTextProps) {
    const [sparkles, setSparkles] = useState<Sparkle[]>([]);

    // สร้าง sparkles และ animate
    useEffect(() => {
        // สร้าง sparkles เริ่มต้น
        const initialSparkles = Array.from({ length: sparkleCount }, () =>
            createSparkle(colors)
        );
        setSparkles(initialSparkles);

        // Interval สำหรับสร้าง sparkle ใหม่
        const interval = setInterval(() => {
            setSparkles((prev) => {
                // เอา sparkle เก่าที่สุดออก และเพิ่ม sparkle ใหม่
                const newSparkle = createSparkle(colors);
                return [...prev.slice(1), newSparkle];
            });
        }, 750);

        return () => clearInterval(interval);
    }, [sparkleCount, colors]);

    return (
        <span className={cn("relative inline-block", className)}>
            {/* Sparkles container */}
            <span className="pointer-events-none absolute inset-0">
                {sparkles.map((sparkle) => (
                    <svg
                        key={sparkle.id}
                        className="absolute animate-sparkle"
                        style={{
                            left: `${sparkle.x}%`,
                            top: `${sparkle.y}%`,
                            width: sparkle.size,
                            height: sparkle.size,
                        }}
                        viewBox="0 0 24 24"
                        fill={sparkle.color}
                    >
                        {/* 4-pointed star shape */}
                        <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
                    </svg>
                ))}
            </span>

            {/* Text content */}
            <span className="relative z-10">{children}</span>

            {/* Keyframes */}
            <style>{`
        @keyframes sparkle {
          0% {
            transform: scale(0) rotate(0deg);
            opacity: 0;
          }
          50% {
            transform: scale(1) rotate(90deg);
            opacity: 1;
          }
          100% {
            transform: scale(0) rotate(180deg);
            opacity: 0;
          }
        }
        .animate-sparkle {
          animation: sparkle 0.75s ease-in-out forwards;
        }
      `}</style>
        </span>
    );
}
