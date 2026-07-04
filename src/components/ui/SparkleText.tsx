import React, { useEffect, useState } from "react";

interface SparkleTextProps {
    children: React.ReactNode;
    sparkleCount?: number;
    colors?: string[];
    className?: string;
}

interface Sparkle {
    id: number;
    x: number;
    y: number;
    size: number;
    color: string;
}

function createSparkle(colors: string[]): Sparkle {
    return {
        id: Date.now() + Math.random(),
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 10 + 6,
        color: colors[Math.floor(Math.random() * colors.length)],
    };
}

export default function SparkleText({
    children,
    sparkleCount = 3,
    colors = ["#FFC700", "#FFD700", "#FFF7E0", "#FFFFFF"],
    className,
}: SparkleTextProps) {
    const [sparkles, setSparkles] = useState<Sparkle[]>([]);

    useEffect(() => {
        const initialSparkles = Array.from({ length: sparkleCount }, () =>
            createSparkle(colors)
        );
        setSparkles(initialSparkles);

        const interval = setInterval(() => {
            setSparkles((prev) => {
                const newSparkle = createSparkle(colors);
                return [...prev.slice(1), newSparkle];
            });
        }, 750);

        return () => clearInterval(interval);
    }, [sparkleCount, colors]);

    return (
        <span className={`relative inline-block ${className ?? ""}`}>
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
                        <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
                    </svg>
                ))}
            </span>
            <span className="relative z-10">{children}</span>
            <style>{`
                @keyframes sparkle {
                    0% { transform: scale(0) rotate(0deg); opacity: 0; }
                    50% { transform: scale(1) rotate(90deg); opacity: 1; }
                    100% { transform: scale(0) rotate(180deg); opacity: 0; }
                }
                .animate-sparkle { animation: sparkle 0.75s ease-in-out forwards; }
            `}</style>
        </span>
    );
}
