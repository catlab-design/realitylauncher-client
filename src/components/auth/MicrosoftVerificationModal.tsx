import React from "react";
import { AnimatePresence, motion } from "framer-motion";
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

    const handleClose = () => {
        playClick();
        onClose();
    };

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
                                        backgroundColor: "#2f2f2f",
                                        color: "#ffffff",
                                    }}
                                >
                                    <svg className="w-5.5 h-5.5" viewBox="0 0 21 21" fill="currentColor">
                                        <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                                        <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                                        <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                                        <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-base font-black tracking-tight" style={{ color: colors.onSurface }}>
                                        {t('identity_verification')}
                                    </h2>
                                    <p className="text-xs opacity-75" style={{ color: colors.onSurfaceVariant }}>
                                        {t('microsoft_auth_link_desc')}
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
                            {/* Step 1: URL Card */}
                            <div
                                onClick={(e) => {
                                    e.preventDefault();
                                    openLink();
                                }}
                                className="w-full p-4 rounded-xl border border-white/5 flex items-center justify-between group cursor-pointer transition-all hover:brightness-110"
                                style={{
                                    backgroundColor: colors.surfaceContainerHighest
                                }}
                            >
                                <div className="text-left overflow-hidden mr-2">
                                    <div className="text-[9px] uppercase font-black tracking-widest opacity-40 mb-1" style={{ color: colors.onSurface }}>{t('step_1_website')}</div>
                                    <div className="text-xs font-bold truncate text-blue-400 group-hover:underline opacity-90">{data.verificationUri}</div>
                                </div>
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center border transition-colors shrink-0"
                                    style={{ borderColor: `${colors.onSurface}15`, backgroundColor: colors.surface }}>
                                    <svg className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: colors.onSurface }}>
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                </div>
                            </div>

                            {/* Step 2: Code Card */}
                            <div
                                onClick={copyCode}
                                className="w-full p-5 rounded-xl border border-white/5 relative flex flex-col items-center justify-center group cursor-pointer overflow-hidden transition-all hover:border-opacity-50"
                                style={{
                                    backgroundColor: colors.surfaceContainerHighest
                                }}
                            >
                                <div className="text-[9px] uppercase font-black tracking-widest opacity-40 mb-3" style={{ color: colors.onSurface }}>{t('step_2_device_code')}</div>

                                <div className="text-3xl font-black tracking-[0.15em] select-all relative z-10 leading-none" style={{ color: colors.primary }}>
                                    {data.userCode}
                                </div>

                                <div className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors"
                                    style={{ borderColor: `${colors.onSurface}15`, backgroundColor: colors.surface }}>
                                    <Icons.Copy className="w-3 h-3 opacity-60" style={{ color: colors.onSurface }} />
                                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-60" style={{ color: colors.onSurface }}>{t('click_to_copy_code')}</span>
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    copyCode();
                                    openLink();
                                }}
                                className="w-full py-3.5 mt-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-[0.99] shadow-md"
                                style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                            >
                                {t('copy_code_and_open_login')}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
