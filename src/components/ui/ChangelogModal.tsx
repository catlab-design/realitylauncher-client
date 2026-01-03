import React, { useEffect, useState } from "react";

interface ChangelogModalProps {
    isOpen: boolean;
    onClose: () => void;
    version: string;
    changelog: string;
    colors: {
        surface: string;
        surfaceContainer: string;
        surfaceContainerHighest: string;
        onSurface: string;
        onSurfaceVariant: string;
        secondary: string;
        primary: string;
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
    const [isAnimating, setIsAnimating] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setShouldRender(true);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setIsAnimating(true);
                });
            });
        } else {
            setIsAnimating(false);
            const timer = setTimeout(() => setShouldRender(false), 200);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!shouldRender) return null;

    // Simple markdown-like parsing for changelog
    const formatChangelog = (text: string) => {
        if (!text) return <p style={{ color: colors.onSurfaceVariant }}>ไม่มีรายละเอียดการอัปเดต</p>;

        return text.split('\n').map((line, i) => {
            // Headers
            if (line.startsWith('## ')) {
                return (
                    <h3
                        key={i}
                        className="text-sm font-semibold mt-3 mb-2 flex items-center gap-2"
                        style={{ color: colors.onSurface }}
                    >
                        <i className="fa-solid fa-tag text-xs" style={{ color: colors.secondary }}></i>
                        {line.slice(3)}
                    </h3>
                );
            }
            if (line.startsWith('### ')) {
                return (
                    <h4
                        key={i}
                        className="text-xs font-medium mt-2 mb-1"
                        style={{ color: colors.onSurface }}
                    >
                        {line.slice(4)}
                    </h4>
                );
            }
            // List items with icons
            if (line.startsWith('- ') || line.startsWith('* ')) {
                const content = line.slice(2);
                let iconClass = 'fa-circle';
                let iconColor = colors.onSurfaceVariant;

                // Check for common changelog keywords
                if (content.toLowerCase().includes('fix') || content.toLowerCase().includes('แก้ไข')) {
                    iconClass = 'fa-wrench';
                    iconColor = '#f59e0b';
                } else if (content.toLowerCase().includes('new') || content.toLowerCase().includes('เพิ่ม') || content.toLowerCase().includes('ใหม่')) {
                    iconClass = 'fa-plus';
                    iconColor = '#22c55e';
                } else if (content.toLowerCase().includes('improve') || content.toLowerCase().includes('ปรับปรุง')) {
                    iconClass = 'fa-arrow-up';
                    iconColor = '#3b82f6';
                } else if (content.toLowerCase().includes('remove') || content.toLowerCase().includes('ลบ')) {
                    iconClass = 'fa-minus';
                    iconColor = '#ef4444';
                }

                return (
                    <div
                        key={i}
                        className="flex items-start gap-2 py-1 pl-1"
                    >
                        <i
                            className={`fa-solid ${iconClass} text-[10px] mt-1 flex-shrink-0`}
                            style={{ color: iconColor }}
                        ></i>
                        <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>{content}</span>
                    </div>
                );
            }
            // Empty lines
            if (!line.trim()) {
                return <div key={i} className="h-1.5" />;
            }
            // Regular text
            return <p key={i} className="text-xs py-0.5" style={{ color: colors.onSurfaceVariant }}>{line}</p>;
        });
    };

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${isAnimating ? 'bg-black/50' : 'bg-black/0'
                }`}
            onClick={onClose}
        >
            <div
                className={`w-full max-w-sm rounded-lg shadow-xl relative overflow-hidden transition-all duration-200 ${isAnimating
                        ? 'opacity-100 scale-100'
                        : 'opacity-0 scale-95'
                    }`}
                style={{ backgroundColor: colors.surface, border: `1px solid ${colors.outline}40` }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="px-4 py-3 border-b flex items-center gap-3"
                    style={{ borderColor: colors.outline + "30", backgroundColor: colors.surfaceContainer }}
                >
                    <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: colors.secondary }}
                    >
                        <i className="fa-solid fa-check text-sm" style={{ color: '#1a1a1a' }}></i>
                    </div>
                    <div className="flex-1">
                        <h2 className="text-sm font-semibold" style={{ color: colors.onSurface }}>
                            อัปเดตสำเร็จ
                        </h2>
                        <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                            เวอร์ชัน {version}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded flex items-center justify-center transition-colors hover:bg-black/10"
                    >
                        <i className="fa-solid fa-xmark text-sm" style={{ color: colors.onSurfaceVariant }}></i>
                    </button>
                </div>

                {/* Changelog Content */}
                <div
                    className="px-4 py-3 max-h-[280px] overflow-y-auto"
                    style={{ backgroundColor: colors.surface }}
                >
                    <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: colors.onSurfaceVariant }}>
                        มีอะไรใหม่
                    </p>
                    {formatChangelog(changelog)}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t" style={{ borderColor: colors.outline + "30" }}>
                    <button
                        onClick={onClose}
                        className="w-full py-2 rounded-md text-sm font-medium transition-colors"
                        style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                    >
                        ตกลง
                    </button>
                </div>
            </div>
        </div>
    );
}
