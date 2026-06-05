import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icons } from "../ui/Icons";
import { useTranslation } from "../../hooks/useTranslation";
import { playClick } from "../../lib/sounds";
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
                                        backgroundColor: "#8b5cf6",
                                        color: "#ffffff",
                                    }}
                                >
                                    <Icons.Person className="h-5.5 w-5.5" />
                                </div>
                                <div>
                                    <h2 className="text-base font-black tracking-tight" style={{ color: colors.onSurface }}>
                                        {t('id_catlab')}
                                    </h2>
                                    <p className="text-xs opacity-75" style={{ color: colors.onSurfaceVariant }}>
                                        {t('welcome_back')}
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
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider"
                                    style={{ color: colors.onSurface }}>
                                    {t('username')}
                                </label>
                                <input
                                    id="catid-username"
                                    type="text"
                                    placeholder={t('username')}
                                    className="w-full px-4 py-3 rounded-xl border border-white/5 transition-all outline-none focus:ring-2 focus:ring-purple-500/30"
                                    style={{
                                        backgroundColor: colors.surfaceContainer,
                                        color: colors.onSurface,
                                    }}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider"
                                    style={{ color: colors.onSurface }}>
                                    {t('password')}
                                </label>
                                <div className="relative">
                                    <input
                                        id="catid-password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder={t('password')}
                                        className="w-full px-4 py-3 rounded-xl border border-white/5 transition-all outline-none focus:ring-2 focus:ring-purple-500/30 pr-12"
                                        style={{
                                            backgroundColor: colors.surfaceContainer,
                                            color: colors.onSurface,
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") handleLogin();
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all hover:bg-white/5 opacity-50 hover:opacity-100"
                                        style={{ color: colors.onSurface }}
                                    >
                                        {showPassword ? (
                                            <Icons.EyeOff className="w-4 h-4" />
                                        ) : (
                                            <Icons.Eye className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    playClick();
                                    onForgotPassword();
                                }}
                                className="text-xs font-black text-right w-full hover:underline transition-all tracking-wide opacity-80"
                                style={{ color: "#8b5cf6" }}
                            >
                                {t('forgot_password')}
                            </button>

                            <div className="flex gap-3 mt-4">
                                <button
                                    onClick={handleLogin}
                                    disabled={isLoading}
                                    className="flex-[2] py-3.5 rounded-xl font-black text-sm transition-all hover:scale-[1.01] active:scale-[0.99] shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
                                >
                                    {isLoading ? "..." : t('login')}
                                </button>
                                <button
                                    onClick={() => {
                                        playClick();
                                        onRegister();
                                    }}
                                    className="flex-1 py-3.5 rounded-xl font-bold border transition-all hover:bg-white/5 text-sm"
                                    style={{ borderColor: `${colors.onSurface}15`, color: colors.onSurface }}
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
