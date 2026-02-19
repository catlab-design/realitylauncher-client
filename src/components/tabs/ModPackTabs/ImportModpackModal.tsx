/**
 * ImportModpackModal - Modal สำหรับ import modpack
 */

import React from "react";
import { Icons } from "../../ui/Icons";
import { useTranslation } from "../../../hooks/useTranslation";
import modrinthIcon from "../../../assets/modrinth.svg";
import curseforgeIcon from "../../../assets/curseforge.svg";

export interface ImportModpackModalProps {
    colors: any;
    isDragging: boolean;
    isInstalling: boolean;
    onClose: () => void;
    onImport: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    language: "th" | "en";
}

export function ImportModpackModal({
    colors,
    isDragging,
    isInstalling,
    onClose,
    onImport,
    onDragOver,
    onDragLeave,
    onDrop,
    language,
}: ImportModpackModalProps) {
    const { t } = useTranslation(language);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-[80%] max-w-4xl rounded-2xl p-8 relative" style={{ backgroundColor: colors.surface }}>
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20"
                    style={{ color: colors.onSurfaceVariant }}
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                </button>

                <div className="flex items-center gap-3 mb-4">
                    <div
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: colors.secondary }}
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1a1a1a">
                            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="font-semibold" style={{ color: colors.onSurface }}>{t('import_modpack_title')}</h3>
                        <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{t('import_modpack_desc')}</p>
                    </div>
                </div>

                {/* Drop Zone */}
                <div
                    className={`rounded-xl p-8 text-center border-2 border-dashed mb-4 cursor-pointer transition-all hover:opacity-80 ${isDragging ? 'scale-[1.02] opacity-80' : ''}`}
                    style={{
                        borderColor: isDragging ? colors.secondary : colors.outline,
                        backgroundColor: isDragging ? `${colors.secondary}15` : colors.surfaceContainer
                    }}
                    onClick={onImport}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                >
                    <Icons.Box className="w-12 h-12 mx-auto mb-3" style={{ color: isDragging ? colors.secondary : colors.onSurfaceVariant }} />
                    <p className="font-medium mb-1" style={{ color: isDragging ? colors.secondary : colors.onSurfaceVariant }}>
                        {isDragging ? t('drop_now_to_import') : t('drag_file_here')}
                    </p>
                    <p className="text-sm mb-4" style={{ color: colors.onSurfaceVariant }}>{t('or')}</p>
                    <button
                        disabled={isInstalling}
                        className="px-6 py-2 rounded-xl font-medium disabled:opacity-50"
                        style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                    >
                        {isInstalling ? t('installing') : t('select_file')}
                    </button>
                </div>

                {/* Source Options */}
                <div className="grid grid-cols-2 gap-3">
                    <div
                        className="p-3 rounded-xl flex items-center gap-3 transition-colors hover:bg-gray-500/5 group"
                        style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}` }}
                    >
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "#f16436" }}>
                             <img src={curseforgeIcon.src} alt="CurseForge" className="w-6 h-6 brightness-0 invert" />
                        </div>
                        <div>
                            <div className="text-sm font-bold leading-tight" style={{ color: colors.onSurface }}>CurseForge</div>
                            <div className="text-xs opacity-80" style={{ color: colors.onSurfaceVariant }}>{t('curseforge_desc')}</div>
                        </div>
                    </div>
                    <div
                        className="p-3 rounded-xl flex items-center gap-3 transition-colors hover:bg-gray-500/5 group"
                        style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}` }}
                    >
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "#1bd96a" }}>
                            <img src={modrinthIcon.src} alt="Modrinth" className="w-6 h-6 brightness-0 invert" />
                        </div>
                        <div>
                            <div className="text-sm font-bold leading-tight" style={{ color: colors.onSurface }}>Modrinth</div>
                            <div className="text-xs opacity-80" style={{ color: colors.onSurfaceVariant }}>{t('modrinth_desc')}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
