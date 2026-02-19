import React, { useEffect, useState } from "react";
import { Icons } from "./Icons";
import { useTranslation } from "../../hooks/useTranslation";

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    confirmColor?: string; // Hex color for confirm button
    tertiaryText?: string;
    onTertiary?: () => void;
    tertiaryColor?: string;
    colors: any;
}

export function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText,
    cancelText,
    confirmColor,
    tertiaryText,
    onTertiary,
    tertiaryColor,
    colors,
}: ConfirmDialogProps) {
    const { t } = useTranslation();
    const [isAnimating, setIsAnimating] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);
    const finalConfirmText = confirmText ?? t("confirm");
    const finalCancelText = cancelText ?? t("cancel");

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

    return (
        <div
            className={`fixed inset-0 z-[60] flex items-center justify-center transition-opacity duration-200 ${isAnimating ? 'bg-black/50' : 'bg-black/0'}`}
            onClick={onClose}
        >
            <div
                className={`w-full max-w-sm rounded-2xl shadow-2xl relative overflow-hidden transition-all duration-200 ${isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
                style={{ backgroundColor: colors.surface, border: `1px solid ${colors.outline}40` }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-5 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#fee2e2" }}>
                        <i className="fa-solid fa-triangle-exclamation text-lg text-red-500"></i>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold mb-1" style={{ color: colors.onSurface }}>
                            {title}
                        </h3>
                        <p className="text-sm leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
                            {message}
                        </p>
                    </div>
                </div>

                <div className="px-4 py-4 bg-black/5 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-black/5 border"
                        style={{
                            color: colors.onSurface,
                            borderColor: colors.outline
                        }}
                    >
                        {finalCancelText}
                    </button>
                    {tertiaryText && (
                        <button
                            onClick={() => {
                                onTertiary?.();
                                onClose();
                            }}
                            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-black/5 border"
                            style={{
                                color: tertiaryColor || colors.onSurface,
                                borderColor: colors.outline
                            }}
                        >
                            {tertiaryText}
                        </button>
                    )}
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className="px-4 py-2 rounded-xl text-sm font-medium transition-transform active:scale-95 shadow-lg shadow-red-500/20"
                        style={{
                            backgroundColor: confirmColor || "#ef4444",
                            color: "#ffffff"
                        }}
                    >
                        {finalConfirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
