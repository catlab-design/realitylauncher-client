/**
 * ImportModpackModal - Modal สำหรับ import modpack
 */

import React from "react";
import { Icons } from "../../ui/Icons";
import { useTranslation } from "../../../hooks/useTranslation";
import modrinthIcon from "../../../assets/modrinth.svg";
import curseforgeIcon from "../../../assets/curseforge.svg";
import { Portal } from "../../ui/Portal";

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
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="w-[80%] max-w-4xl rounded-2xl p-8 shadow-2xl relative z-51" style={{ backgroundColor: colors.surface }}>
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:bg-gray-500/20 active:scale-90"
                        style={{ color: colors.onSurfaceVariant }}
                        title="Close"
                    >
                        <Icons.Close className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-4 mb-6">
                        <div
                            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
                            style={{ backgroundColor: colors.secondary, boxShadow: `0 8px 16px ${colors.secondary}30` }}
                        >
                            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#1a1a1a">
                                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold" style={{ color: colors.onSurface }}>{t('import_modpack_title')}</h3>
                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{t('import_modpack_desc')}</p>
                        </div>
                    </div>

                    {/* Drop Zone */}
                    <div
                        className={`rounded-2xl p-12 text-center border-2 border-dashed mb-6 cursor-pointer transition-all duration-300 ${isDragging ? 'scale-[1.02] border-solid' : 'hover:border-solid hover:bg-black/5'}`}
                        style={{
                            borderColor: isDragging ? colors.secondary : colors.outline,
                            backgroundColor: isDragging ? `${colors.secondary}15` : colors.surfaceContainer,
                            boxShadow: isDragging ? `0 20px 40px ${colors.secondary}10` : 'none'
                        }}
                        onClick={onImport}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                    >
                        <div className={`w-20 h-20 mx-auto mb-4 rounded-3xl flex items-center justify-center transition-transform duration-300 ${isDragging ? 'rotate-12 scale-110' : ''}`}
                             style={{ backgroundColor: isDragging ? colors.secondary + "20" : colors.surfaceContainerHighest }}>
                            <Icons.Box className="w-10 h-10" style={{ color: isDragging ? colors.secondary : colors.onSurfaceVariant }} />
                        </div>
                        <p className="text-lg font-bold mb-1" style={{ color: isDragging ? colors.secondary : colors.onSurface }}>
                            {isDragging ? t('drop_now_to_import') : t('drag_file_here')}
                        </p>
                        <p className="text-sm mb-6 opacity-60" style={{ color: colors.onSurfaceVariant }}>{t('or')}</p>
                        <button
                            disabled={isInstalling}
                            className="px-8 py-3 rounded-xl font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50"
                            style={{ 
                                backgroundColor: colors.secondary, 
                                color: "#1a1a1a",
                                boxShadow: `0 8px 20px ${colors.secondary}40`
                            }}
                        >
                            {isInstalling ? t('installing') : t('select_file')}
                        </button>
                    </div>

                    {/* Source Options */}
                    <div className="grid grid-cols-2 gap-4">
                        <div
                            className="p-4 rounded-2xl flex items-center gap-4 transition-all hover:bg-black/5 active:scale-[0.98] cursor-pointer"
                            style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}` }}
                        >
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-md" style={{ backgroundColor: "#f16436" }}>
                                 <img src={curseforgeIcon.src} alt="CurseForge" className="w-7 h-7 brightness-0 invert" />
                            </div>
                            <div>
                                <div className="text-base font-bold leading-tight" style={{ color: colors.onSurface }}>CurseForge</div>
                                <div className="text-xs opacity-60" style={{ color: colors.onSurfaceVariant }}>{t('curseforge_desc')}</div>
                            </div>
                        </div>
                        <div
                            className="p-4 rounded-2xl flex items-center gap-4 transition-all hover:bg-black/5 active:scale-[0.98] cursor-pointer"
                            style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}` }}
                        >
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-md" style={{ backgroundColor: "#1bd96a" }}>
                                <img src={modrinthIcon.src} alt="Modrinth" className="w-7 h-7 brightness-0 invert" />
                            </div>
                            <div>
                                <div className="text-base font-bold leading-tight" style={{ color: colors.onSurface }}>Modrinth</div>
                                <div className="text-xs opacity-60" style={{ color: colors.onSurfaceVariant }}>{t('modrinth_desc')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Portal>
    );
}
