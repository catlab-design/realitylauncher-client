/**
 * ImportModpackModal - Modal สำหรับ import modpack
 */

import React, { type MouseEvent } from "react";
import { motion } from "framer-motion";
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

    const handleClose = () => {
        onClose();
    };

    const stopPropagation = (event: MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
    };

    return (
        <Portal>
            <motion.div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-5"
                onClick={handleClose}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
            >
                <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('import_modpack_title')}
                    className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
                    style={{ backgroundColor: colors.surface }}
                    onClick={stopPropagation}
                    initial={{ opacity: 0, y: 28, scale: 0.975 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.9 }}
                >
                    <div
                        className="flex items-center justify-between border-b px-6 py-3.5 sm:px-7 shrink-0"
                        style={{
                            borderColor: `${colors.onSurface}10`,
                            backgroundColor: colors.surfaceContainerLow || colors.surfaceContainer,
                        }}
                    >
                        <div className="flex items-center gap-4">
                            <div
                                className="flex h-10 w-10 items-center justify-center rounded-md"
                                style={{
                                    backgroundColor: colors.secondary,
                                    color: "#1a1a1a",
                                }}
                            >
                                <svg className="w-5.5 h-5.5" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                                </svg>
                            </div>
                            <div>
                                <h2
                                    className="text-base font-black tracking-tight"
                                    style={{ color: colors.onSurface }}
                                >
                                    {t('import_modpack_title')}
                                </h2>
                                <p
                                    className="text-xs opacity-75"
                                    style={{ color: colors.onSurfaceVariant }}
                                >
                                    {t('import_modpack_desc')}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleClose}
                            className="flex h-10 w-10 items-center justify-center rounded-full border transition-all hover:bg-white/10 shrink-0"
                            style={{
                                color: colors.onSurface,
                                borderColor: `${colors.onSurface}15`,
                                backgroundColor: colors.surfaceContainer,
                            }}
                            title="Close"
                        >
                            <Icons.Close className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Scrollable Body */}
                    <div className="flex-1 overflow-y-auto px-6 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6 custom-scrollbar">
                        {/* Drop Zone */}
                        <div
                            className={`rounded-2xl p-10 text-center border-2 border-dashed mb-5 cursor-pointer transition-all duration-300 ${isDragging ? 'scale-[1.02] border-solid' : 'hover:bg-black/5'}`}
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
                            <div className={`w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center transition-transform duration-300 ${isDragging ? 'rotate-12 scale-110' : ''}`}
                                 style={{ backgroundColor: isDragging ? colors.secondary + "20" : colors.surfaceContainerHighest }}>
                                <Icons.Box className="w-8 h-8" style={{ color: isDragging ? colors.secondary : colors.onSurfaceVariant }} />
                            </div>
                            <p className="text-base font-bold mb-1" style={{ color: isDragging ? colors.secondary : colors.onSurface }}>
                                {isDragging ? t('drop_now_to_import') : t('drag_file_here')}
                            </p>
                            <p className="text-xs mb-4 opacity-60" style={{ color: colors.onSurfaceVariant }}>{t('or')}</p>
                            <button
                                disabled={isInstalling}
                                className="px-6 py-2.5 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 text-sm"
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
                                style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}20` }}
                            >
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#f16436" }}>
                                     <img src={curseforgeIcon.src} alt="CurseForge" className="w-6 h-6 brightness-0 invert" />
                                </div>
                                <div>
                                    <div className="text-sm font-bold leading-tight" style={{ color: colors.onSurface }}>CurseForge</div>
                                    <div className="text-[11px] opacity-60" style={{ color: colors.onSurfaceVariant }}>{t('curseforge_desc')}</div>
                                </div>
                            </div>
                            <div
                                className="p-4 rounded-2xl flex items-center gap-4 transition-all hover:bg-black/5 active:scale-[0.98] cursor-pointer"
                                style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}20` }}
                            >
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#1bd96a" }}>
                                    <img src={modrinthIcon.src} alt="Modrinth" className="w-6 h-6 brightness-0 invert" />
                                </div>
                                <div>
                                    <div className="text-sm font-bold leading-tight" style={{ color: colors.onSurface }}>Modrinth</div>
                                    <div className="text-[11px] opacity-60" style={{ color: colors.onSurfaceVariant }}>{t('modrinth_desc')}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </Portal>
    );
}
