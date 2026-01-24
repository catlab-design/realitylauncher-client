/**
 * DeleteConfirmModal - Modal ยืนยันการลบ instance
 */

import React from "react";
import { useTranslation } from "../../../hooks/useTranslation";

export interface DeleteConfirmModalProps {
    colors: any;
    instanceId: string;
    onCancel: () => void;
    onConfirm: (id: string) => void;
    language: "th" | "en";
}

export function DeleteConfirmModal({ colors, instanceId, onCancel, onConfirm, language }: DeleteConfirmModalProps) {
    const { t } = useTranslation(language);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: colors.surface }}>
                <h3 className="text-lg font-medium mb-2" style={{ color: colors.onSurface }}>
                    {t('confirm_delete_instance')}
                </h3>
                <p className="mb-6" style={{ color: colors.onSurfaceVariant }}>
                    {t('delete_instance_ask')}
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2 rounded-lg"
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    >
                        {t('cancel')}
                    </button>
                    <button
                        onClick={() => onConfirm(instanceId)}
                        className="flex-1 py-2 rounded-lg font-medium"
                        style={{ backgroundColor: "#ef4444", color: "#ffffff" }}
                    >
                        {t('delete')}
                    </button>
                </div>
            </div>
        </div>
    );
}
