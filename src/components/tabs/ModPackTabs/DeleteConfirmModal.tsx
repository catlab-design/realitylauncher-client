/**
 * DeleteConfirmModal - Modal ยืนยันการลบ instance
 */

import React from "react";

export interface DeleteConfirmModalProps {
    colors: any;
    instanceId: string;
    onCancel: () => void;
    onConfirm: (id: string) => void;
}

export function DeleteConfirmModal({ colors, instanceId, onCancel, onConfirm }: DeleteConfirmModalProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: colors.surface }}>
                <h3 className="text-lg font-medium mb-2" style={{ color: colors.onSurface }}>
                    ยืนยันการลบ Instance?
                </h3>
                <p className="mb-6" style={{ color: colors.onSurfaceVariant }}>
                    การลบจะลบไฟล์ทั้งหมดใน Instance นี้ รวมถึง mods, saves, และ config
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2 rounded-lg"
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    >
                        ยกเลิก
                    </button>
                    <button
                        onClick={() => onConfirm(instanceId)}
                        className="flex-1 py-2 rounded-lg font-medium"
                        style={{ backgroundColor: "#ef4444", color: "#ffffff" }}
                    >
                        ลบ
                    </button>
                </div>
            </div>
        </div>
    );
}
