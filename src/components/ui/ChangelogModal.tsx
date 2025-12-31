import React from "react";

interface ChangelogModalProps {
    isOpen: boolean;
    onClose: () => void;
    version: string;
    changelog: string;
    colors: {
        surface: string;
        surfaceContainer: string;
        onSurface: string;
        onSurfaceVariant: string;
        secondary: string;
        outline: string;
    };
}

export function ChangelogModal({
    isOpen,
    onClose,
    version,
    changelog,
    colors,
}: ChangelogModalProps) {
    if (!isOpen) return null;

    // Simple markdown-like parsing for changelog
    const formatChangelog = (text: string) => {
        if (!text) return <p style={{ color: colors.onSurfaceVariant }}>ไม่มีรายละเอียดการอัปเดต</p>;

        return text.split('\n').map((line, i) => {
            // Headers
            if (line.startsWith('## ')) {
                return <h3 key={i} className="text-lg font-bold mt-4 mb-2" style={{ color: colors.onSurface }}>{line.slice(3)}</h3>;
            }
            if (line.startsWith('### ')) {
                return <h4 key={i} className="text-base font-semibold mt-3 mb-1" style={{ color: colors.onSurface }}>{line.slice(4)}</h4>;
            }
            // List items
            if (line.startsWith('- ') || line.startsWith('* ')) {
                return (
                    <div key={i} className="flex items-start gap-2 py-0.5">
                        <span style={{ color: colors.secondary }}>•</span>
                        <span style={{ color: colors.onSurfaceVariant }}>{line.slice(2)}</span>
                    </div>
                );
            }
            // Empty lines
            if (!line.trim()) {
                return <div key={i} className="h-2" />;
            }
            // Regular text
            return <p key={i} style={{ color: colors.onSurfaceVariant }}>{line}</p>;
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div
                className="w-full max-w-lg rounded-3xl p-6 shadow-xl relative max-h-[80vh] flex flex-col"
                style={{ backgroundColor: colors.surface }}
            >
                {/* Header */}
                <div className="flex items-center gap-4 mb-4">
                    <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{ backgroundColor: colors.secondary }}
                    >
                        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="#1a1a1a">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM9.29 16.29L5.7 12.7c-.39-.39-.39-1.02 0-1.41.39-.39 1.02-.39 1.41 0L10 14.17l6.88-6.88c.39-.39 1.02-.39 1.41 0 .39.39.39 1.02 0 1.41l-7.59 7.59c-.38.39-1.02.39-1.41 0z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold" style={{ color: colors.onSurface }}>
                            อัปเดตเป็น v{version} แล้ว!
                        </h2>
                        <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                            ดูการเปลี่ยนแปลงในเวอร์ชันนี้
                        </p>
                    </div>
                </div>

                {/* Changelog Content */}
                <div
                    className="flex-1 overflow-y-auto p-4 rounded-2xl mb-4"
                    style={{ backgroundColor: colors.surfaceContainer }}
                >
                    {formatChangelog(changelog)}
                </div>

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="w-full py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                >
                    เข้าใจแล้ว!
                </button>
            </div>
        </div>
    );
}
