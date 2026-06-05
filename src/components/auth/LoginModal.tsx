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
                        className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-white/10"
                        style={{ backgroundColor: colors.surface }}
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0, y: 28, scale: 0.975 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 18, scale: 0.985 }}
                        transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.9 }}
                    >
                        {/* Header */}
                        <div
                            className="flex items-center justify-between border-b px-6 py-4"
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
                                    <Icons.Login className="h-5.5 w-5.5" />
                                </div>
                                <div>
                                    <h2 className="text-base font-black tracking-tight" style={{ color: colors.onSurface }}>
                                        {t('login')}
                                    </h2>
                                    <p className="text-xs opacity-75" style={{ color: colors.onSurfaceVariant }}>
                                        {t('login_subtitle')}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleClose}
                                className="flex h-10 w-10 items-center justify-center rounded-full border transition-all hover:bg-white/10"
                                style={{
                                    color: colors.onSurface,
                                    borderColor: `${colors.onSurface}15`,
                                    backgroundColor: colors.surfaceContainer,
                                }}
                                aria-label={t('close')}
                            >
                                <Icons.Close className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="px-6 py-6 flex flex-col gap-4">
                            {/* Microsoft Login Button */}
                            <button
                                onClick={() => {
                                    playClick();
                                    onMicrosoftLogin();
                                }}
                                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99] border border-white/5 shadow-md hover:brightness-110"
                                style={{ backgroundColor: "#2f2f2f", color: "#ffffff" }}
                            >
                                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                    <svg className="w-5.5 h-5.5" viewBox="0 0 21 21" fill="currentColor">
                                        <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                                        <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                                        <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                                        <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                                    </svg>
                                </div>
                                <div className="text-left">
                                    <div className="font-black text-sm">{t('ms_account')}</div>
                                    <div className="text-[9px] uppercase font-bold tracking-widest opacity-40">{t('premium_authentic')}</div>
                                </div>
                            </button>

                            {/* CatID Login Button */}
                            <button
                                onClick={() => {
                                    playClick();
                                    onCatIDLogin();
                                }}
                                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99] border border-white/5 shadow-md hover:brightness-110"
                                style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
                            >
                                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                                    <Icons.Person className="w-5.5 h-5.5 text-white" />
                                </div>
                                <div className="text-left">
                                    <div className="font-black text-sm">{t('id_catlab')}</div>
                                    <div className="text-[9px] uppercase font-bold tracking-widest opacity-40">{t('identity_verification')}</div>
                                </div>
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
