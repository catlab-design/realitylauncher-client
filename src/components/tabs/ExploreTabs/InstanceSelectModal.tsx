// ========================================
// Instance Selection Modal
// ========================================

import React from "react";
import type { GameInstance, InstanceCompatibility, ModVersion } from "./types";

interface InstanceSelectModalProps {
    colors: any;
    selectedProjectTitle: string;
    instances: GameInstance[];
    instanceCompatibility: InstanceCompatibility[];
    isCheckingCompatibility: boolean;
    isDownloading: boolean;
    onClose: () => void;
    onSelectInstance: (instance: GameInstance) => void;
}

export function InstanceSelectModal({
    colors,
    selectedProjectTitle,
    instances,
    instanceCompatibility,
    isCheckingCompatibility,
    isDownloading,
    onClose,
    onSelectInstance,
}: InstanceSelectModalProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-2xl p-6 relative" style={{ backgroundColor: colors.surface }}>
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20"
                    style={{ color: colors.onSurfaceVariant }}
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                </button>

                <h3 className="text-lg font-semibold mb-1" style={{ color: colors.onSurface }}>
                    เลือก Instance
                </h3>
                <p className="text-sm mb-4" style={{ color: colors.onSurfaceVariant }}>
                    เพิ่ม "{selectedProjectTitle}" ไปยัง Instance ไหน?
                </p>

                {isCheckingCompatibility ? (
                    <div className="p-6 text-center rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                        <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full mx-auto mb-2" style={{ color: colors.secondary }} />
                        <p style={{ color: colors.onSurfaceVariant }}>กำลังตรวจสอบความเข้ากัน...</p>
                    </div>
                ) : instances.length === 0 ? (
                    <div className="p-6 text-center rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                        <p style={{ color: colors.onSurfaceVariant }}>ไม่มี Instance กรุณาสร้างก่อน</p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {instanceCompatibility.map(({ instance, compatible, reason, bestVersion }) => (
                            <button
                                key={instance.id}
                                onClick={() => compatible && onSelectInstance(instance)}
                                disabled={isDownloading || !compatible}
                                className={`w-full p-3 rounded-xl text-left transition-all ${compatible ? 'hover:scale-[1.01]' : 'opacity-60 cursor-not-allowed'}`}
                                style={{
                                    backgroundColor: colors.surfaceContainer,
                                    borderLeft: `4px solid ${compatible ? '#22c55e' : '#ef4444'}`,
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-medium flex items-center gap-2" style={{ color: colors.onSurface }}>
                                            {instance.name}
                                            {compatible && (
                                                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}>
                                                    ✓ รองรับ
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                                            {instance.minecraftVersion} • {instance.loader}
                                        </div>
                                    </div>
                                    {!compatible && (
                                        <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: '#ef444420', color: '#ef4444' }}>
                                            {reason}
                                        </span>
                                    )}
                                    {compatible && bestVersion && (
                                        <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                            v{bestVersion.version_number}
                                        </span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {isDownloading && (
                    <div className="mt-4 text-center" style={{ color: colors.onSurfaceVariant }}>
                        กำลังดาวน์โหลด...
                    </div>
                )}
            </div>
        </div>
    );
}
