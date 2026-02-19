import React from "react";
import { Icons } from "../ui/Icons";
import { useTranslation } from "../../hooks/useTranslation";
import { playClick } from "../../lib/sounds";
import toast from "react-hot-toast";

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onMicrosoftLogin: () => void;
    onCatIDLogin: () => void;
    onOfflineLogin: () => void;
    colors: any;
}

export function LoginModal({
    isOpen,
    onClose,
    onMicrosoftLogin,
    onCatIDLogin,
    onOfflineLogin,
    colors
}: LoginModalProps) {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="flex w-full max-w-2xl h-[480px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden"
                style={{ backgroundColor: colors.surface }}>

                {/* Left Branding Side */}
                <div className="w-[35%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5"
                    style={{ backgroundColor: `${colors.secondary}10` }}>
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none" />
                    <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-yellow-500/30 z-10"
                        style={{ backgroundColor: colors.secondary }}>
                        <Icons.Login className="w-10 h-10" style={{ color: "#1a1a1a" }} />
                    </div>
                    <h2 className="text-2xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>
                        {t('login')}
                    </h2>
                    <div className="mt-2 px-3 py-1 rounded-full bg-yellow-500/20 text-[10px] font-black uppercase tracking-widest z-10"
                        style={{ color: colors.secondary }}>
                        {t('access_point')}
                    </div>
                    <p className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10"
                        style={{ color: colors.onSurface }}
                        dangerouslySetInnerHTML={{ __html: t('login_method_desc') }}
                    />
                </div>

                {/* Right Side - Buttons */}
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
                            {t('login')}
                        </h3>
                        <p className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>
                            {t('login_subtitle')}
                        </p>
                    </div>

                    <div className="space-y-3.5 flex-1">
                        {/* Microsoft Login Button */}
                        <button
                            onClick={() => {
                                playClick();
                                onMicrosoftLogin();
                            }}
                            className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] border border-white/5 shadow-lg group"
                            style={{ backgroundColor: "#2f2f2f", color: "#ffffff" }}
                        >
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                                <svg className="w-6 h-6" viewBox="0 0 21 21" fill="currentColor">
                                    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                                    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                                </svg>
                            </div>
                            <div className="text-left">
                                <div className="font-black text-base">{t('ms_account')}</div>
                                <div className="text-[10px] uppercase font-bold tracking-widest opacity-40">{t('premium_authentic')}</div>
                            </div>
                        </button>

                        {/* CatID Login Button */}
                        <button
                            onClick={() => {
                                playClick();
                                onCatIDLogin();
                            }}
                            className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] border border-white/5 shadow-lg group"
                            style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
                        >
                            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                                <Icons.Person className="w-6 h-6 text-white" />
                            </div>
                            <div className="text-left">
                                <div className="font-black text-base">{t('id_catlab')}</div>
                                <div className="text-[10px] uppercase font-bold tracking-widest opacity-40">{t('identity_verification')}</div>
                            </div>
                        </button>

                        {/* Offline Login Button */}
                        <button
                            onClick={() => {
                                playClick();
                                onOfflineLogin();
                            }}
                            className="w-full flex items-center justify-between px-6 py-3.5 rounded-2xl border-2 border-dashed transition-all hover:bg-white/5 group"
                            style={{ borderColor: colors.outline, color: colors.onSurface }}>
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center transition-all group-hover:bg-white/10">
                                    <Icons.Lock className="w-5 h-5 opacity-50" />
                                </div>
                                <div className="text-left">
                                    <div className="font-black text-sm">{t('offline_mode')}</div>
                                    <div className="text-[10px] uppercase font-bold tracking-widest opacity-40">{t('local_play')}</div>
                                </div>
                            </div>
                            <Icons.ChevronRight className="w-5 h-5 opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
