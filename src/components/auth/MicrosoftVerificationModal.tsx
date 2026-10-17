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
                        aria-label={t('identity_verification')}
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
                                    {t('identity_verification')}
                                </h2>
                                <p className="text-base mt-2" style={{ color: colors.onSurfaceVariant }}>
                                    {t('microsoft_auth_link_desc')}
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
                                type="button"
                                onClick={openLink}
                                className="group w-full p-4 rounded-2xl flex items-center justify-between gap-3 text-left transition hover:brightness-95"
                                style={{ backgroundColor: colors.surfaceContainer }}
                            >
                                <div className="min-w-0">
                                    <div className="text-sm" style={{ color: colors.onSurfaceVariant }}>{t('step_1_website')}</div>
                                    <div className="text-base font-semibold truncate mt-0.5 text-blue-400 group-hover:underline">{data.verificationUri}</div>
                                </div>
                                <Icons.ExternalLink className="w-5 h-5 shrink-0" style={{ color: colors.onSurfaceVariant }} />
                            </button>

                            <button
                                type="button"
                                onClick={copyCode}
                                className="w-full px-4 py-6 rounded-2xl flex flex-col items-center text-center transition hover:brightness-95"
                                style={{ backgroundColor: colors.surfaceContainer }}
                            >
                                <div className="text-sm" style={{ color: colors.onSurfaceVariant }}>{t('step_2_device_code')}</div>
                                <div className="font-display text-4xl tracking-[0.18em] select-all leading-none mt-3" style={{ color: colors.primary }}>
                                    {data.userCode}
                                </div>
                                <div className="mt-4 flex items-center gap-2 text-sm font-semibold" style={{ color: colors.onSurfaceVariant }}>
                                    <Icons.Copy className="w-4 h-4" />
                                    {t('click_to_copy_code')}
                                </div>
                            </button>

                            <button
                                onClick={() => {
                                    copyCode();
                                    openLink();
                                }}
                                className="w-full h-12 mt-2 rounded-xl text-base font-bold transition hover:brightness-105 active:scale-[0.99]"
                                style={{ backgroundColor: colors.secondary, color: "#111" }}
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
