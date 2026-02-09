import React, { useState } from "react";
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

    if (!isOpen) return null;

    const handleLogin = async () => {
        playClick();
        const usernameInput = document.getElementById("catid-username") as HTMLInputElement;
        const passwordInput = document.getElementById("catid-password") as HTMLInputElement;

        if (usernameInput?.value && passwordInput?.value) {
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="flex w-full max-w-2xl h-[480px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden"
                style={{ backgroundColor: colors.surface }}>

                {/* Left Branding Side */}
                <div className="w-[35%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5"
                    style={{ backgroundColor: `${"#8b5cf6"}10` }}>
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-purple-500/10 to-transparent pointer-events-none" />
                    <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-purple-500/30 z-10"
                        style={{ backgroundColor: "#8b5cf6" }}>
                        <svg className="w-10 h-10" viewBox="0 0 24 24" fill="#ffffff">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm0 14c-2.03 0-4.43-.82-6.14-2.88C7.55 15.8 9.68 15 12 15s4.45.8 6.14 2.12C16.43 19.18 14.03 20 12 20z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>
                        {t('id_catlab')}
                    </h2>
                    <div className="mt-2 px-3 py-1 rounded-full bg-purple-500/20 text-[10px] font-black uppercase tracking-widest z-10"
                        style={{ color: "#8b5cf6" }}>
                        {t('identity_verification')}
                    </div>
                    <p className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10" style={{ color: colors.onSurface }}>
                        {t('gateway_to_catlab')}
                    </p>
                </div>

                {/* Right Form Side */}
                <div className="flex-1 p-10 flex flex-col relative">
                    {/* Close Button */}
                    <button
                        onClick={() => {
                            playClick();
                            onClose();
                        }}
                        className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors z-20"
                        style={{ color: colors.onSurfaceVariant }}
                    >
                        <Icons.Close className="w-6 h-6" />
                    </button>

                    <div className="mb-8">
                        <h3 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>
                            {t('welcome_back')}
                        </h3>
                        <p className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>
                            {t('login_with_catid_desc')}
                        </p>
                    </div>

                    <div className="space-y-4 flex-1">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider"
                                style={{ color: colors.onSurface }}>
                                {t('username')}
                            </label>
                            <input
                                id="catid-username"
                                type="text"
                                placeholder={t('username')}
                                className="w-full px-5 py-3.5 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-purple-500/10"
                                style={{
                                    borderColor: 'transparent',
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
                                    className="w-full px-5 py-3.5 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-purple-500/10 pr-12"
                                    style={{
                                        borderColor: 'transparent',
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
                    </div>

                    <div className="flex gap-3 mt-8">
                        <button
                            onClick={handleLogin}
                            disabled={isLoading}
                            className="flex-[2] py-4 rounded-2xl font-black text-lg transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
                        >
                            {isLoading ? "..." : t('login')}
                        </button>
                        <button
                            onClick={() => {
                                playClick();
                                onRegister();
                            }}
                            className="flex-1 py-4 rounded-2xl font-bold border-2 transition-all hover:bg-white/5"
                            style={{ borderColor: colors.outline, color: colors.onSurface }}
                        >
                            {t('register')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
