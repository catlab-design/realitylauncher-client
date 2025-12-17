/**
 * ========================================
 * Meteors - Background Effect ดาวตก
 * ========================================
 * 
 * Component แสดง meteors/shooting stars effect
 * 
 * Features:
 * - ดาวตกหลายดวงที่มี delay ต่างกัน
 * - Random positions และ durations
 * - Customizable จำนวนและสี
 * 
 * @example
 * ```tsx
 * // ใช้เป็น background
 * <div className="relative">
 *   <Meteors count={20} />
 *   <YourContent />
 * </div>
 * ```
 */

import React, { useMemo } from "react";

// ========================================
// Types
// ========================================

interface MeteorsProps {
    /** จำนวน meteors */
    count?: number;
    /** สี meteor (CSS color) */
    color?: string;
    /** ความเร็วขั้นต่ำ (seconds) */
    minSpeed?: number;
    /** ความเร็วสูงสุด (seconds) */
    maxSpeed?: number;
    /** Additional CSS classes */
    className?: string;
}

// ========================================
// Component
// ========================================

/**
 * Meteors - ดาวตก background effect
 * 
 * การทำงาน:
 * 1. สร้าง meteor elements ตามจำนวนที่กำหนด
 * 2. แต่ละ meteor มี random position, delay, และ duration
 * 3. ใช้ CSS animation ให้ตกลงมาเอียง
 * 4. Fade out เมื่อตกลงไป
 */
export default function Meteors({
    count = 20,
    color = "rgba(255, 255, 255, 0.6)",
    minSpeed = 2,
    maxSpeed = 6,
    className = "",
}: MeteorsProps) {
    // สร้าง array ของ meteor data (useMemo เพื่อไม่ให้สร้างใหม่ทุก render)
    const meteors = useMemo(() => {
        return Array.from({ length: count }, (_, i) => ({
            id: i,
            // ตำแหน่งเริ่มต้น (% จากซ้าย)
            left: Math.random() * 100,
            // ความยาว meteor (px)
            size: Math.random() * 80 + 20,
            // Animation duration (seconds)
            duration: Math.random() * (maxSpeed - minSpeed) + minSpeed,
            // Animation delay (seconds)
            delay: Math.random() * 5,
        }));
    }, [count, minSpeed, maxSpeed]);

    return (
        <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
            {meteors.map((meteor) => (
                <span
                    key={meteor.id}
                    className="absolute h-0.5 rotate-[215deg]"
                    style={{
                        // ตำแหน่งเริ่มต้น (บนซ้าย)
                        top: "-10%",
                        left: `${meteor.left}%`,
                        // ความยาว meteor
                        width: `${meteor.size}px`,
                        // Gradient จากสีไปโปร่งใส
                        background: `linear-gradient(90deg, ${color}, transparent)`,
                        // Animation
                        animation: `meteor ${meteor.duration}s linear ${meteor.delay}s infinite`,
                    }}
                >
                    {/* หัว meteor (จุดสว่าง) */}
                    <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-1 w-1 rounded-full"
                        style={{
                            backgroundColor: color,
                            boxShadow: `0 0 6px 2px ${color}`,
                        }}
                    />
                </span>
            ))}

            {/* Keyframes */}
            <style>{`
        @keyframes meteor {
          0% {
            transform: rotate(215deg) translateX(0);
            opacity: 1;
          }
          70% {
            opacity: 1;
          }
          100% {
            transform: rotate(215deg) translateX(500px);
            opacity: 0;
          }
        }
      `}</style>
        </div>
    );
}
