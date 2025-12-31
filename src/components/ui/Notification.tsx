import React, { useEffect, useState } from "react";

interface NotificationProps {
    message: string;
    type?: "success" | "error" | "loading" | "info";
    duration?: number;
    onClose?: () => void;
    colors: {
        surface: string;
        surfaceContainer: string;
        onSurface: string;
        onSurfaceVariant: string;
        outline: string;
    };
}

export function Notification({
    message,
    type = "info",
    duration = 3000,
    onClose,
    colors,
}: NotificationProps) {
    const [isVisible, setIsVisible] = useState(true);
    const [isLeaving, setIsLeaving] = useState(false);

    useEffect(() => {
        if (type === "loading") return;

        const timer = setTimeout(() => {
            setIsLeaving(true);
            setTimeout(() => {
                setIsVisible(false);
                onClose?.();
            }, 200);
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, type, onClose]);

    if (!isVisible) return null;

    const getIcon = () => {
        switch (type) {
            case "success":
                return (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: "#22c55e" }}>
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                );
            case "error":
                return (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: "#ef4444" }}>
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                );
            case "loading":
                return (
                    <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: colors.onSurfaceVariant, borderTopColor: 'transparent' }} />
                );
            default:
                return (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: colors.onSurfaceVariant }}>
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                );
        }
    };

    return (
        <div
            className={`flex items-center gap-3 px-4 py-3 transition-all duration-200 ${isLeaving ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}`}
            style={{
                backgroundColor: colors.surfaceContainer,
                borderLeft: `3px solid ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : colors.onSurfaceVariant}`,
            }}
        >
            {getIcon()}
            <span className="text-sm" style={{ color: colors.onSurface }}>{message}</span>
        </div>
    );
}

// Notification container for stacking multiple notifications
interface NotificationItem {
    id: string;
    message: string;
    type: "success" | "error" | "loading" | "info";
}

let notificationId = 0;
let addNotification: ((item: Omit<NotificationItem, "id">) => string) | null = null;
let removeNotification: ((id: string) => void) | null = null;
let updateNotification: ((id: string, item: Partial<Omit<NotificationItem, "id">>) => void) | null = null;

export function NotificationContainer({ colors }: { colors: NotificationProps["colors"] }) {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);

    useEffect(() => {
        addNotification = (item) => {
            const id = `notification-${++notificationId}`;
            setNotifications((prev) => [...prev, { ...item, id }]);
            return id;
        };

        removeNotification = (id) => {
            setNotifications((prev) => prev.filter((n) => n.id !== id));
        };

        updateNotification = (id, item) => {
            setNotifications((prev) =>
                prev.map((n) => (n.id === id ? { ...n, ...item } : n))
            );
        };

        return () => {
            addNotification = null;
            removeNotification = null;
            updateNotification = null;
        };
    }, []);

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
            {notifications.map((notification) => (
                <Notification
                    key={notification.id}
                    message={notification.message}
                    type={notification.type}
                    colors={colors}
                    onClose={() => removeNotification?.(notification.id)}
                />
            ))}
        </div>
    );
}

// Toast-like API
export const notify = {
    success: (message: string) => addNotification?.({ message, type: "success" }) || "",
    error: (message: string) => addNotification?.({ message, type: "error" }) || "",
    loading: (message: string) => addNotification?.({ message, type: "loading" }) || "",
    info: (message: string) => addNotification?.({ message, type: "info" }) || "",
    dismiss: (id: string) => removeNotification?.(id),
    update: (id: string, message: string, type: NotificationItem["type"]) => {
        updateNotification?.(id, { message, type });
        // Auto-dismiss after update (if not loading)
        if (type !== "loading") {
            setTimeout(() => removeNotification?.(id), 3000);
        }
    },
};
