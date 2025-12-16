/**
 * ========================================
 * AnimatedGradientText - ข้อความ Gradient เคลื่อนไหว
 * ========================================
 * 
 * Component แสดงข้อความที่มี animated gradient background
 * 
 * Features:
 * - Gradient สีวิ่งไปมา
 * - รองรับ gradient colors ที่กำหนดเอง
 * - Animation speed ที่ปรับได้
 * 
 * @example
 * ```tsx
 * <AnimatedGradientText>
 *   Welcome to ML Client
 * </AnimatedGradientText>
 * 
 * <AnimatedGradientText 
 *   colors={["#ff0080", "#7928ca", "#ff0080"]}
 *   speed={3}
 * >
 *   Custom Colors
 * </AnimatedGradientText>
 * ```
 */

import React from "react";

// ========================================
// Types
// ========================================

interface AnimatedGradientTextProps {
    children: React.ReactNode;
    /** Gradient colors - array of color strings */
    colors?: string[];
    /** Animation speed in seconds */
    speed?: number;
    /** Additional CSS classes */
    className?: string;
}

// ========================================
// Utility
// ========================================

function cn(...classes: (string | false | null | undefined)[]): string {
    return classes.filter(Boolean).join(" ");
}

// ========================================
// Component
// ========================================

/**
 * AnimatedGradientText - ข้อความที่มี gradient animation
 * 
 * การทำงาน:
 * 1. สร้าง linear-gradient จาก colors array
 * 2. ใช้ background-clip: text เพื่อให้ gradient อยู่ในตัวอักษร
 * 3. Animation ขยับ background-position ให้ gradient เลื่อน
 */
export default function AnimatedGradientText({
    children,
    colors = ["#38bdf8", "#818cf8", "#c084fc", "#f472b6", "#38bdf8"],
    speed = 4,
    className,
}: AnimatedGradientTextProps) {
    // สร้าง gradient string จาก colors array
    const gradientColors = colors.join(", ");

    return (
        <span
            className={cn(
                // ทำให้ตัวอักษรโปร่งใส (เพื่อให้เห็น background)
                "text-transparent",
                // Background gradient จะแสดงเฉพาะในตัวอักษร
                "bg-clip-text",
                // Animation name ที่กำหนดใน style tag
                "animate-gradient",
                className
            )}
            style={{
                // Gradient background
                backgroundImage: `linear-gradient(90deg, ${gradientColors})`,
                // ขยาย background ให้ใหญ่พอสำหรับ animation
                backgroundSize: "300% 100%",
                // Animation
                animation: `gradient-shift ${speed}s ease infinite`,
            }}
        >
            {children}

            {/* Keyframes for gradient animation */}
            <style>{`
        @keyframes gradient-shift {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
      `}</style>
        </span>
    );
}
