import React, { useMemo } from "react";

interface MeteorsProps {
    count?: number;
    color?: string;
    minSpeed?: number;
    maxSpeed?: number;
    className?: string;
}

export default function Meteors({
    count = 20,
    color = "rgba(255, 255, 255, 0.6)",
    minSpeed = 2,
    maxSpeed = 6,
    className = "",
}: MeteorsProps) {
    const meteors = useMemo(() => {
        return Array.from({ length: count }, (_, i) => ({
            id: i,
            left: Math.random() * 100,
            size: Math.random() * 80 + 20,
            duration: Math.random() * (maxSpeed - minSpeed) + minSpeed,
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
                        top: "-10%",
                        left: `${meteor.left}%`,
                        width: `${meteor.size}px`,
                        background: `linear-gradient(90deg, ${color}, transparent)`,
                        animation: `meteor ${meteor.duration}s linear ${meteor.delay}s infinite`,
                    }}
                >
                    <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-1 w-1 rounded-full"
                        style={{
                            backgroundColor: color,
                            boxShadow: `0 0 6px 2px ${color}`,
                        }}
                    />
                </span>
            ))}
            <style>{`
                @keyframes meteor {
                    0% { transform: rotate(215deg) translateX(0); opacity: 1; }
                    70% { opacity: 1; }
                    100% { transform: rotate(215deg) translateX(500px); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
