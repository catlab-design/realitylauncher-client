import { useState, useEffect } from "react";

interface AppVersionBadgeProps {
    colors: any;
    className?: string;
    bgColor?: string;
    textColor?: string;
}

export function AppVersionBadge({ colors, className, bgColor, textColor }: AppVersionBadgeProps) {
    const [version, setVersion] = useState<string>("...");

    useEffect(() => {
        (async () => {
            try {
                const appVersion = await (window as any).api?.getAppVersion?.();
                if (appVersion) setVersion(appVersion);
            } catch {
                setVersion("0.0.0");
            }
        })();
    }, []);

    return (
        <span
            className={`text-xs px-2 py-0.5 rounded-full ${className || ""}`}
            style={{ backgroundColor: bgColor ?? colors.surfaceContainerHighest, color: textColor ?? colors.onSurfaceVariant }}
        >
            v{version}
        </span>
    );
}
