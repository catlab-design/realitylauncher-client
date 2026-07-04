import React from "react";

interface AnimatedGradientTextProps {
    children: React.ReactNode;
    colors?: string[];
    speed?: number;
    className?: string;
}

export default function AnimatedGradientText({
    children,
    colors = ["#38bdf8", "#818cf8", "#c084fc", "#f472b6", "#38bdf8"],
    speed = 4,
    className,
}: AnimatedGradientTextProps) {
    return (
        <span
            className={`text-transparent bg-clip-text ${className ?? ""}`}
            style={{
                backgroundImage: `linear-gradient(90deg, ${colors.join(", ")})`,
                backgroundSize: "300% 100%",
                animation: `gradient-shift ${speed}s ease infinite`,
            }}
        >
            {children}
            <style>{`
                @keyframes gradient-shift {
                    0%, 100% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                }
            `}</style>
        </span>
    );
}
