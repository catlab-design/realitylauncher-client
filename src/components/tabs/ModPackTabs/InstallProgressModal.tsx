/**
 * InstallProgressModal - Modal แสดง progress การติดตั้ง modpack
 */

import React from "react";

export interface InstallProgress {
    stage: string;
    message: string;
    current?: number;
    total?: number;
    percent?: number;
}

export interface InstallProgressModalProps {
    colors: any;
    installProgress: InstallProgress;
    onCancel?: () => void;
}

export function InstallProgressModal({ colors, installProgress, onCancel }: InstallProgressModalProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-[380px] rounded-2xl p-5 shadow-2xl" style={{ backgroundColor: colors.surface }}>
                <div className="flex items-center gap-4 mb-5">
                    <div className="w-10 h-10 rounded-full flex flex-shrink-0 items-center justify-center animate-spin"
                        style={{ backgroundColor: colors.surfaceContainerHighest }}>
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: colors.secondary }}>
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate" style={{ color: colors.onSurface }}>
                            กำลังติดตั้ง Modpack
                        </h3>
                        <p className="text-sm truncate" style={{ color: colors.onSurfaceVariant }} title={installProgress.message}>
                            {installProgress.message}
                        </p>
                    </div>
                </div>

                {/* Progress Bar Container - Fixed Height to prevent jumping */}
                <div className="h-12 mb-2 flex flex-col justify-end">
                    {installProgress.percent !== undefined ? (
                        <>
                            <div className="flex justify-between text-sm mb-2" style={{ color: colors.onSurfaceVariant }}>
                                <span className="text-xs">{installProgress.current || 0} / {installProgress.total || "?"}</span>
                                <span className="font-medium">{installProgress.percent}%</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden w-full" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                <div
                                    className="h-full rounded-full transition-all duration-300 ease-out"
                                    style={{
                                        width: `${installProgress.percent}%`,
                                        backgroundColor: colors.secondary,
                                    }}
                                />
                            </div>
                        </>
                    ) : (
                        // Indeterminate State Placeholder
                        <div className="h-1.5 rounded-full overflow-hidden w-full relative" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                            <div className="absolute inset-y-0 left-0 w-1/3 bg-white/20 animate-[shimmer_1.5s_infinite]"
                                style={{ backgroundColor: colors.secondary }} />
                        </div>
                    )}
                </div>

                {/* Cancel Button */}
                <div className="pt-2 flex justify-end border-t" style={{ borderColor: `${colors.outline}20` }}>
                    <button
                        onClick={onCancel}
                        className="text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-500/10 active:scale-95 transition-all"
                        style={{ color: colors.error || "#ef4444" }}
                    >
                        ยกเลิก
                    </button>
                </div>
            </div>
        </div>
    );
}
