import React, { type MouseEvent } from "react";
import { motion } from "framer-motion";
import { Icons } from "../../ui/Icons";
import { useTranslation } from "../../../hooks/useTranslation";
import modrinthIcon from "../../../assets/modrinth.svg";
import curseforgeIcon from "../../../assets/curseforge.svg";
import { Portal } from "../../ui/Portal";
import { SPRING, useMotionPreset } from "../../../lib/motion";

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

/** Monochrome SVG logo painted in its brand colour. */
const BrandMark = ({ src, color }: { src: string; color: string }) => (
    <span
        aria-hidden="true"
        className="w-8 h-8 shrink-0"
        style={{ backgroundColor: color, maskImage: `url("${src}")`, WebkitMaskImage: `url("${src}")`, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }}
    />
);

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
    const m = useMotionPreset();

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
                variants={m.modal.backdrop}
                {...m.states}
            >
                <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('import_modpack_title')}
                    className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-2xl"
                    style={{ backgroundColor: colors.surface }}
                    onClick={stopPropagation}
                    variants={m.modal.panel}
                >
                    <div
                        className="flex items-center justify-between border-b px-6 py-4 sm:px-7 shrink-0"
                        style={{
                            borderColor: colors.outlineVariant,
                            backgroundColor: colors.surfaceContainer,
                        }}
                    >
                        <div className="flex items-center gap-4">
                            <div
                                className="flex h-10 w-10 items-center justify-center rounded-full"
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
                                    className="text-lg font-black tracking-tight"
                                    style={{ color: colors.onSurface }}
                                >
                                    {t('import_modpack_title')}
                                </h2>
                                <p
                                    className="text-sm"
                                    style={{ color: colors.onSurfaceVariant }}
                                >
                                    {t('import_modpack_desc')}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleClose}
                            className="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:brightness-110 active:scale-95 shrink-0"
                            style={{
                                color: colors.onSurface,
                                backgroundColor: colors.surfaceContainerHighest,
                            }}
                            title="Close"
                        >
                            <Icons.Close className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6 custom-scrollbar">
                        
                        <motion.div
                            animate={{ scale: isDragging && !m.reduced ? 1.02 : 1 }}
                            transition={SPRING.snappy}
                            className={`rounded-2xl p-10 text-center border-2 border-dashed mb-5 cursor-pointer transition-[background-color,border-color,box-shadow] duration-300 ${isDragging ? 'border-solid' : 'hover:bg-black/5'}`}
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
                            <motion.div
                                animate={isDragging && !m.reduced ? { rotate: 12, scale: 1.1, y: -2 } : { rotate: 0, scale: 1, y: 0 }}
                                transition={SPRING.snappy}
                                className="w-16 h-16 mx-auto mb-3 flex items-center justify-center"
                            >
                                <Icons.Box className="w-11 h-11 transition-colors" style={{ color: isDragging ? colors.secondary : colors.onSurfaceVariant }} />
                            </motion.div>
                            <p className="text-lg font-bold mb-1" style={{ color: isDragging ? colors.secondary : colors.onSurface }}>
                                {isDragging ? t('drop_now_to_import') : t('drag_file_here')}
                            </p>
                            <p className="text-sm mb-4" style={{ color: colors.onSurfaceVariant }}>{t('or')}</p>
                            <button
                                disabled={isInstalling}
                                className="h-11 px-6 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 text-[15px] inline-flex items-center gap-2"
                                style={{ 
                                    backgroundColor: colors.secondary, 
                                    color: "#1a1a1a",
                                }}
                            >
                                {isInstalling ? <Icons.Spinner className="w-4 h-4 animate-spin" /> : (
                                    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                                        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                                        <path d="M12 12v6" />
                                        <path d="m15 15-3-3-3 3" />
                                    </svg>
                                )}
                                {isInstalling ? t('installing') : t('select_file')}
                            </button>
                        </motion.div>

                        <div className="grid grid-cols-2 gap-4">
                            <div
                                className="p-4 rounded-2xl flex items-center gap-4 transition-all hover:bg-black/5 active:scale-[0.98] cursor-pointer"
                                style={{ backgroundColor: colors.surfaceContainer }}
                            >
                                <BrandMark src={curseforgeIcon} color="#f16436" />
                                <div>
                                    <div className="text-base font-bold leading-tight" style={{ color: colors.onSurface }}>CurseForge</div>
                                    <div className="text-sm mt-0.5" style={{ color: colors.onSurfaceVariant }}>{t('curseforge_desc')}</div>
                                </div>
                            </div>
                            <div
                                className="p-4 rounded-2xl flex items-center gap-4 transition-all hover:bg-black/5 active:scale-[0.98] cursor-pointer"
                                style={{ backgroundColor: colors.surfaceContainer }}
                            >
                                <BrandMark src={modrinthIcon} color="#1bd96a" />
                                <div>
                                    <div className="text-base font-bold leading-tight" style={{ color: colors.onSurface }}>Modrinth</div>
                                    <div className="text-sm mt-0.5" style={{ color: colors.onSurfaceVariant }}>{t('modrinth_desc')}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </Portal>
    );
}
