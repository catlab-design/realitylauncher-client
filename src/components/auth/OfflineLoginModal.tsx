import React, { useState } from "react";
import { Icons } from "../ui/Icons";
import { useTranslation } from "../../hooks/useTranslation";
import { playClick } from "../../lib/sounds";
import toast from "react-hot-toast";

interface OfflineLoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLogin: (username: string) => Promise<void>;
    colors: any;
}

export function OfflineLoginModal({ isOpen, onClose, onLogin, colors }: OfflineLoginModalProps) {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    const handleLogin = async () => {
        playClick();
        const usernameInput = document.getElementById("offline-username-input") as HTMLInputElement | null;
        const username = usernameInput?.value.trim() || "";

        if (username && username.length >= 3) {
            setIsLoading(true);
            try {
                await onLogin(username);
            } catch (error) {
                console.error(error);
            } finally {
                setIsLoading(false);
            }
        } else {
            toast.error(t('username_min_3_chars'));
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="flex w-full max-w-2xl h-[480px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden"
                style={{ backgroundColor: colors.surface }}>

                {/* Left Branding Side */}
                <div className="w-[35%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5"
                    style={{ backgroundColor: `${colors.secondary}10` }}>
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none" />
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-2xl shadow-yellow-500/30 z-10"
                        style={{ backgroundColor: colors.secondary }}>
                        <Icons.Person className="w-8 h-8" style={{ color: "#1a1a1a" }} />
                    </div>
                    <h2 className="text-xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>
                        {t('restricted_play_mode')}
                    </h2>
                    <div className="mt-2 px-3 py-0.5 rounded-full bg-yellow-500/20 text-[9px] font-black uppercase tracking-widest z-10"
                        style={{ color: colors.secondary }}>
                        {t('local_play')}
                    </div>
                </div>

                {/* Right Form Side */}
                <div className="flex-1 p-10 flex flex-col relative justify-center">
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

                    <div className="mb-6 mt-2">
                        <h3 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>
                            {t('set_name_to_play')}
                        </h3>
                        <p className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>
                            {t('set_character_name_offline')}
                        </p>
                    </div>

                    <div className="space-y-4 flex-1">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider"
                                style={{ color: colors.onSurface }}>
                                {t('name_to_use')}
                            </label>
                            <input
                                id="offline-username-input"
                                type="text"
                                placeholder={t('username_3_16_chars')}
                                maxLength={16}
                                className="w-full px-5 py-3.5 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-yellow-500/10 text-lg"
                                style={{
                                    borderColor: 'transparent',
                                    backgroundColor: colors.surfaceContainer,
                                    color: colors.onSurface
                                }}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleLogin();
                                }}
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleLogin}
                        disabled={isLoading}
                        className="w-full py-4 rounded-2xl font-black text-lg transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-yellow-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                    >
                        {isLoading ? "..." : t('play_now')}
                    </button>
                </div>
            </div>
        </div>
    );
}
