import React, { useState } from "react";
import { Icons } from "../ui/Icons";
import { useTranslation } from "../../hooks/useTranslation";
import { playClick } from "../../lib/sounds";
import toast from "react-hot-toast";

interface DeviceCodeData {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    expiresAt: number;
}

interface MicrosoftVerificationModalProps {
    isOpen: boolean;
    data: DeviceCodeData | null;
    onClose: () => void;
    colors: any;
}

export function MicrosoftVerificationModal({
    isOpen,
    data,
    onClose,
    colors
}: MicrosoftVerificationModalProps) {
    const { t } = useTranslation();

    if (!isOpen || !data) return null;

    const copyCode = async () => {
        await window.navigator.clipboard.writeText(data.userCode);
        toast.success(t('copy_code_success'));
        playClick();
    };

    const openLink = () => {
        window.api?.openExternal?.(data.verificationUri);
        playClick();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="flex w-full max-w-2xl h-[480px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden"
                style={{ backgroundColor: colors.surface }}>

                <div className="w-[35%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5"
                    style={{ backgroundColor: "#2f2f2f10" }}>
                    <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl z-10"
                        style={{ backgroundColor: "#2f2f2f" }}>
                        <svg className="w-10 h-10" viewBox="0 0 21 21" fill="currentColor">
                            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>
                        {t('identity_verification')}
                    </h2>
                    <div className="mt-2 px-3 py-1 rounded-full bg-white/5 text-[10px] font-black uppercase tracking-widest z-10"
                        style={{ color: colors.onSurfaceVariant }}>
                        {t('auth_system')}
                    </div>
                    <p className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10" style={{ color: colors.onSurface }}>
                        {t('connect_via_microsoft')}
                    </p>
                </div>

                {/* Right Side */}
                <div className="flex-1 p-8 flex flex-col relative justify-center text-center">
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

                    <div className="mb-6 text-left">
                        <h3 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>
                            {t('identity_verification')}
                        </h3>
                        <p className="text-xs font-bold uppercase tracking-widest opacity-40 mt-1" style={{ color: colors.onSurfaceVariant }}>
                            {t('microsoft_auth_link_desc')}
                        </p>
                    </div>

                    <div className="flex-1 flex flex-col gap-3 w-full">
                        {/* Step 1: URL Card */}
                        <div
                            onClick={(e) => {
                                e.preventDefault();
                                openLink();
                            }}
                            className="w-full p-5 rounded-2xl border flex items-center justify-between group cursor-pointer transition-all hover:brightness-110"
                            style={{
                                borderColor: colors.outline,
                                backgroundColor: colors.surfaceContainerHighest
                            }}
                        >
                            <div className="text-left overflow-hidden">
                                <div className="text-[10px] uppercase font-black tracking-widest opacity-40 mb-1" style={{ color: colors.onSurface }}>Step 1: Website</div>
                                <div className="text-sm font-bold truncate text-blue-400 group-hover:underline opacity-90">{data.verificationUri}</div>
                            </div>
                            <div className="w-8 h-8 rounded-full flex items-center justify-center border transition-colors"
                                style={{ borderColor: colors.outline, backgroundColor: colors.surface }}>
                                <svg className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: colors.onSurface }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                            </div>
                        </div>

                        {/* Step 2: Code Card */}
                        <div
                            onClick={copyCode}
                            className="flex-1 w-full p-6 rounded-[2rem] border relative flex flex-col items-center justify-center group cursor-pointer overflow-hidden transition-all hover:border-opacity-50"
                            style={{
                                backgroundColor: colors.surfaceContainerHighest,
                                borderColor: colors.outline
                            }}
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-current to-transparent opacity-0 group-hover:opacity-20 transition-opacity" style={{ color: colors.onSurface }} />

                            <div className="text-[10px] uppercase font-black tracking-widest opacity-40 mb-4" style={{ color: colors.onSurface }}>Step 2: Device Code</div>

                            <div className="text-5xl font-black tracking-[0.2em] select-all relative z-10 leading-none" style={{ color: colors.primary }}>
                                {data.userCode}
                            </div>

                            <div className="mt-4 flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors"
                                style={{ borderColor: colors.outline, backgroundColor: colors.surface }}>
                                <Icons.Copy className="w-3 h-3 opacity-60" style={{ color: colors.onSurface }} />
                                <span className="text-[10px] font-bold uppercase tracking-wider opacity-60" style={{ color: colors.onSurface }}>{t('click_to_copy_code')}</span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            copyCode();
                            openLink();
                        }}
                        className="w-full py-4 mt-5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-black/20"
                        style={{ backgroundColor: "#1a1a1a", color: "#ffffff" }}
                    >
                        {t('copy_code_and_open_login')}
                    </button>
                </div>
            </div>
        </div>
    );
}
