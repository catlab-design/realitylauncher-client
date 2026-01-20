import React from "react";
import { cn } from "../../lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    colors?: any;
}

export function Skeleton({ className, colors, style, ...props }: SkeletonProps) {
    return (
        <div
            className={cn("animate-pulse rounded-md", className)}
            style={{
                backgroundColor: colors?.surfaceContainerHighest || "rgba(255, 255, 255, 0.1)",
                ...style,
            }}
            {...props}
        />
    );
}
