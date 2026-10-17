import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icons } from "../ui/Icons";
import { useTranslation } from "../../hooks/useTranslation";
import { playClick } from "../../lib/sounds";
import { useMotionPreset } from "../../lib/motion";
import toast from "react-hot-toast";

interface CatIDLoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLogin: (username: string, password: string) => Promise<void>;
    onRegister: () => void;
    onForgotPassword: () => void;
    colors: any;
}

export function CatIDLoginModal({
    isOpen,
    onClose,
    onLogin,
    onRegister,
    onForgotPassword,
    colors
}: CatIDLoginModalProps) {
    const { t } = useTranslation();
    const m = useMotionPreset();
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleClose = () => {
        playClick();
        onClose();
    };

    const handleLogin = async () => {
        playClick();
        const usernameInput = document.getElementById("catid-username") as HTMLInputElement | null;
        const passwordInput = document.getElementById("catid-password") as HTMLInputElement | null;

        if (usernameInput && passwordInput && usernameInput.value && passwordInput.value) {
            setIsLoading(true);
            try {
                await onLogin(usernameInput.value, passwordInput.value);
            } catch (error) {
                console.error(error);
            } finally {
                setIsLoading(false);
            }
        } else {
            toast.error(t('fill_all_fields'));
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-5"
                    onClick={handleClose}
                    variants={m.modal.backdrop}
                    {...m.states}
                >
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-label={t('id_catlab')}
                        className="flex w-full max-w-[520px] flex-col overflow-hidden rounded-3xl shadow-2xl"
                        style={{ backgroundColor: colors.surface }}
                        onClick={(e) => e.stopPropagation()}
                        variants={m.modal.panel}
                    >
                        <div className="flex items-start justify-between gap-4 px-8 pt-8 pb-2">
                            <div>
                                <h2 className="font-display text-3xl leading-tight" style={{ color: colors.onSurface }}>
                                    {t('id_catlab')}
                                </h2>
                                <p className="text-base mt-2" style={{ color: colors.onSurfaceVariant }}>
                                    {t('welcome_back')}
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

                        <div className="px-8 pt-5 pb-8 flex flex-col gap-4">
                            <div className="space-y-2">
                                <label htmlFor="catid-username" className="block text-sm font-semibold" style={{ color: colors.onSurface }}>
                                    {t('username')}
                                </label>
                                <input
                                    id="catid-username"
                                    type="text"
                                    autoFocus
                                    placeholder={t('username')}
                                    className="w-full h-12 px-4 rounded-xl border border-transparent outline-none text-[15px]"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="catid-password" className="block text-sm font-semibold" style={{ color: colors.onSurface }}>
                                        {t('password')}
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            playClick();
                                            onForgotPassword();
                                        }}
                                        className="text-sm font-semibold hover:underline"
                                        style={{ color: "#8b5cf6" }}
                                    >
                                        {t('forgot_password')}
                                    </button>
                                </div>
                                <div className="relative">
                                    <input
                                        id="catid-password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder={t('password')}
                                        className="w-full h-12 pl-4 pr-12 rounded-xl border border-transparent outline-none text-[15px]"
                                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") handleLogin();
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        aria-label={t('password')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center transition-opacity opacity-60 hover:opacity-100"
                                        style={{ color: colors.onSurface }}
                                    >
                                        {showPassword ? <Icons.EyeOff className="w-5 h-5" /> : <Icons.Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-3">
                                <button
                                    onClick={handleLogin}
                                    disabled={isLoading}
                                    className="flex-[2] h-12 rounded-xl text-base font-bold transition hover:brightness-105 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
                                >
                                    {isLoading ? "..." : t('login')}
                                </button>
                                <button
                                    onClick={() => {
                                        playClick();
                                        onRegister();
                                    }}
                                    className="flex-1 h-12 rounded-xl text-base font-semibold transition hover:brightness-95"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                >
                                    {t('register')}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
