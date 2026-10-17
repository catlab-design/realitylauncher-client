import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icons } from "../ui/Icons";
import { useTranslation } from "../../hooks/useTranslation";
import { playClick } from "../../lib/sounds";

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onMicrosoftLogin: () => void;
    onCatIDLogin: () => void;
    colors: any;
}

export function LoginModal({
    isOpen,
    onClose,
    onMicrosoftLogin,
    onCatIDLogin,
    colors
}: LoginModalProps) {
    const { t } = useTranslation();

    const handleClose = () => {
        playClick();
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-5"
                    onClick={handleClose}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.18, ease: "easeInOut" } }}
                    transition={{ duration: 0.24, ease: "easeOut" }}
                >
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-label={t('login')}
                        className="flex w-full max-w-[520px] flex-col overflow-hidden rounded-3xl shadow-2xl"
                        style={{ backgroundColor: colors.surface }}
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0, y: 28, scale: 0.975 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 18, scale: 0.985 }}
                        transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.9 }}
                    >
                        <div className="flex items-start justify-between gap-4 px-8 pt-8 pb-2">
                            <div>
                                <h2 className="font-display text-3xl leading-tight" style={{ color: colors.onSurface }}>
                                    {t('login')}
                                </h2>
                                <p className="text-base mt-2" style={{ color: colors.onSurfaceVariant }}>
                                    {t('login_subtitle')}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleClose}
                                className="flex h-10 w-10 items-center justify-center rounded-full shrink-0 transition hover:brightness-110"
                                style={{ color: colors.onSurface, backgroundColor: colors.surfaceContainerHighest }}
                                aria-label={t('close')}
                            >
                                <Icons.Close className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="px-8 pt-5 pb-8 flex flex-col gap-3">
                            <button
                                onClick={() => {
                                    playClick();
                                    onMicrosoftLogin();
                                }}
                                className="group w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition hover:brightness-95 active:scale-[0.99]"
                                style={{ backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                            >
                                <svg className="w-8 h-8 shrink-0" viewBox="0 0 21 21" aria-hidden="true">
                                    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                                    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                                </svg>
                                <div className="flex-1 min-w-0">
                                    <div className="text-lg font-bold leading-tight">{t('ms_account')}</div>
                                    <div className="text-sm mt-0.5" style={{ color: colors.onSurfaceVariant }}>{t('premium_authentic')}</div>
                                </div>
                                <Icons.ChevronRight className="w-5 h-5 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: colors.onSurfaceVariant }} />
                            </button>

                            <button
                                onClick={() => {
                                    playClick();
                                    onCatIDLogin();
                                }}
                                className="group w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition hover:brightness-95 active:scale-[0.99]"
                                style={{ backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                            >
                                <div className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center" style={{ backgroundColor: "#8b5cf6", color: "#fff" }}>
                                    <Icons.Person className="w-4.5 h-4.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-lg font-bold leading-tight">{t('id_catlab')}</div>
                                    <div className="text-sm mt-0.5" style={{ color: colors.onSurfaceVariant }}>{t('identity_verification')}</div>
                                </div>
                                <Icons.ChevronRight className="w-5 h-5 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: colors.onSurfaceVariant }} />
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
