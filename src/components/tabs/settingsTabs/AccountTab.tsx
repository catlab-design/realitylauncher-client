import { useState, useEffect } from "react";
import type { AuthSession, LauncherConfig } from "../../../types/launcher";
import { Icons } from "../../ui/Icons";
import { MCHead } from "../../ui/MCHead";
import microsoftIcon from "../../../assets/microsoft_icon.svg";
import { useTranslation } from "../../../hooks/useTranslation";
import { useAuthStore } from "../../../store/authStore";
import { toast } from "react-hot-toast";
import { SettingsPage, SettingsSection, SettingsRow, buttonClass, buttonStyle } from "./SettingsUI";

export interface SettingsTabProps {
    config: LauncherConfig;
    updateConfig: (newConfig: Partial<LauncherConfig>) => void;
    colors: any;
}

export interface AccountTabProps extends SettingsTabProps {
    session: AuthSession | null;
    accounts: AuthSession[];
    handleLogout: () => void;
    selectAccount: (account: AuthSession) => void;
    removeAccount: (account: AuthSession) => void;
    setLoginDialogOpen: (open: boolean) => void;
    handleUnlink: (provider: "catid" | "microsoft") => void;
    setLinkCatIDOpen: (open: boolean) => void;
    onLinkMicrosoft: () => void;
}

export function AccountTab({
    config,
    updateConfig,
    colors,
    session,
    accounts,
    handleLogout,
    selectAccount,
    removeAccount,
    setLoginDialogOpen,
    handleUnlink,
    setLinkCatIDOpen,
    onLinkMicrosoft,
}: AccountTabProps) {
    const { updateAccount } = useAuthStore();
    const [isUpdatingAvatarSource, setIsUpdatingAvatarSource] = useState(false);

    const handleAvatarSourceChange = async (source: "catid_avatar" | "minecraft_skin") => {
        if (!session || !window.api?.authUpdateAvatarSource) return;
        const isLinked = session.authType === "catid" ? !!session.minecraftUuid : !!session.catidLinked;
        if (!isLinked) return;
        setIsUpdatingAvatarSource(true);
        const toastId = toast.loading(t('saving') || "กำลังบันทึก...");
        try {
            const result = await window.api.authUpdateAvatarSource(source);
            toast.dismiss(toastId);
            if (result.ok && result.session) {
                
                
                
                
                
                
                updateAccount({
                    ...session,
                    avatarSource: source,
                    avatarUrl: result.session.avatarUrl ?? session.avatarUrl,
                });
                toast.success(t('save_success') || "บันทึกสำเร็จ");
                
                
                window.dispatchEvent(new CustomEvent("minecraft-skin-updated", { detail: { username: session.username } }));
            } else {
                toast.error(result.error || "เกิดข้อผิดพลาด");
            }
        } catch (error: any) {
            toast.dismiss(toastId);
            toast.error(error?.message || "เกิดข้อผิดพลาด");
        } finally {
            setIsUpdatingAvatarSource(false);
        }
    };

    const { t, language } = useTranslation(config.language);

    const avatarSourcePicker = session && (
        <AvatarSourcePicker
            value={session.avatarSource === "minecraft_skin" ? "minecraft_skin" : "catid_avatar"}
            disabled={isUpdatingAvatarSource}
            onSelect={handleAvatarSourceChange}
            colors={colors}
            t={t}
        />
    );

    return (
        <SettingsPage title={t('user_account')} colors={colors}>
            {}
            {session ? (
                <SettingsSection colors={colors}>
                    <div
                        className="rounded-xl border px-5 py-5"
                        style={{ backgroundColor: colors.surfaceContainer, borderColor: "transparent" }}
                    >
                        <div className="flex items-center gap-4">
                            <MCHead username={session.username} size={56} className="rounded-full shrink-0" />
                            <div className="flex-1 min-w-0">
                                <div className="text-lg font-bold flex items-center gap-1.5" style={{ color: colors.onSurface }}>
                                    <span className="truncate">{session.username}</span>
                                    {session.isAdmin ? (
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: "#fbbf24" }}>
                                            <Icons.Check className="w-3.5 h-3.5 text-gray-900" />
                                        </span>
                                    ) : session.authType === "catid" ? (
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: "#3b82f6" }}>
                                            <Icons.Check className="w-3.5 h-3.5 text-white" />
                                        </span>
                                    ) : session.authType === "microsoft" ? (
                                        <>
                                            <img src={microsoftIcon} alt="Microsoft" className="w-5 h-5 shrink-0" />
                                            {session.catidLinked && (
                                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: "#fbbf24" }}>
                                                    <Icons.Check className="w-3.5 h-3.5 text-white" />
                                                </span>
                                            )}
                                        </>
                                    ) : null}
                                </div>
                                <div className="text-sm mt-0.5 flex items-center gap-2" style={{ color: colors.onSurfaceVariant }}>
                                    {session.authType === "microsoft"
                                        ? (session.catidLinked ? t('catid_and_microsoft_account') : t('microsoft_account'))
                                        : session.authType === "catid" ? t('catid_account') : t('user_account')}
                                </div>
                                {}
                                {(session.authType === "catid" || (session.authType === "microsoft" && session.apiToken)) && (
                                    <SessionTimer session={session} t={t} colors={colors} language={language} />
                                )}
                            </div>
                            <button
                                onClick={handleLogout}
                                className={`${buttonClass} transition-all hover:bg-red-500/10`}
                                style={{ backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.35)", color: "#ef4444" }}
                            >
                                <i className="fa-solid fa-right-from-bracket text-sm"></i>
                                {t('logout')}
                            </button>
                        </div>
                    </div>

                    {}
                    {session.authType === "microsoft" && (
                        <>
                            <SettingsRow
                                colors={colors}
                                icon={<i className="fa-solid fa-link text-base"></i>}
                                title={t('account_connections')}
                            >
                                {session.catidLinked ? (
                                    <button
                                        onClick={() => handleUnlink("catid")}
                                        className={buttonClass}
                                        style={buttonStyle(colors)}
                                    >
                                        <Icons.Check className="w-4 h-4" style={{ color: colors.secondary }} />
                                        <span>{t('unlink_catid')}</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setLinkCatIDOpen(true)}
                                        className={buttonClass}
                                        style={buttonStyle(colors)}
                                    >
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full" style={{ backgroundColor: "#fbbf24" }}>
                                            <Icons.Check className="w-3.5 h-3.5 text-white" />
                                        </span>
                                        <span>{t('link_catid')}</span>
                                    </button>
                                )}
                            </SettingsRow>

                            {}
                            {session.catidLinked && (
                                <SettingsRow
                                    colors={colors}
                                    icon={<i className="fa-solid fa-image-portrait text-base"></i>}
                                    title={t('avatar_display')}
                                >
                                    {avatarSourcePicker}
                                </SettingsRow>
                            )}
                        </>
                    )}

                    {}
                    {session.authType === "catid" && (
                        <>
                            <SettingsRow
                                colors={colors}
                                icon={<i className="fa-solid fa-link text-base"></i>}
                                title={t('account_connections')}
                            >
                                {session.minecraftUuid ? (
                                    <div
                                        className="h-10 px-4 rounded-lg border text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap"
                                        style={{ backgroundColor: "rgba(34,197,94,0.1)", color: colors.onSurface, borderColor: "rgba(34,197,94,0.35)" }}
                                    >
                                        <img src={microsoftIcon} alt="Microsoft" className="w-4 h-4" />
                                        <Icons.Check className="w-4 h-4" style={{ color: "#22c55e" }} />
                                        <span>{t('linked_with_microsoft')}</span>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => onLinkMicrosoft()}
                                        className={buttonClass}
                                        style={buttonStyle(colors)}
                                    >
                                        <img src={microsoftIcon} alt="Microsoft" className="w-4 h-4" />
                                        <span>{t('link_microsoft')}</span>
                                    </button>
                                )}
                            </SettingsRow>

                            {session.minecraftUuid && (
                                <SettingsRow
                                    colors={colors}
                                    icon={<i className="fa-solid fa-image-portrait text-base"></i>}
                                    title={t('avatar_display')}
                                >
                                    {avatarSourcePicker}
                                </SettingsRow>
                            )}
                        </>
                    )}
                </SettingsSection>
            ) : (
                <div
                    className="rounded-xl border px-5 py-8 text-center"
                    style={{ backgroundColor: colors.surfaceContainer, borderColor: "transparent" }}
                >
                    <Icons.Person className="w-12 h-12 mx-auto mb-3" style={{ color: colors.onSurfaceVariant }} />
                    <p className="text-base font-medium" style={{ color: colors.onSurfaceVariant }}>{t('not_logged_in')}</p>
                </div>
            )}

            <SettingsSection colors={colors}>
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {accounts.map((acc, index) => {
                        const account = acc as AuthSession;
                        const isActive = account.uuid === session?.uuid;
                        return (
                            <div
                                key={index}
                                onClick={() => selectAccount(acc)}
                                className="flex items-center gap-3.5 px-4 py-3 rounded-xl border cursor-pointer transition-colors hover:brightness-110"
                                style={{
                                    backgroundColor: isActive ? colors.surfaceContainerHigh : colors.surfaceContainer,
                                    borderColor: isActive ? colors.secondary : colors.outlineVariant,
                                }}
                            >
                                <MCHead username={account.username} size={40} className="rounded-full shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-base font-semibold flex items-center gap-1.5" style={{ color: colors.onSurface }}>
                                        <span className="truncate">{account.username}</span>
                                        {account.isAdmin ? (
                                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: "#fbbf24" }}>
                                                <Icons.Check className="w-3 h-3 text-gray-900" />
                                            </span>
                                        ) : account.authType === "catid" ? (
                                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: "#3b82f6" }}>
                                                <Icons.Check className="w-3 h-3 text-white" />
                                            </span>
                                        ) : account.authType === "microsoft" ? (
                                            <>
                                                <img src={microsoftIcon} alt="Microsoft" className="w-5 h-5 shrink-0" />
                                                {account.catidLinked && (
                                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: "#fbbf24" }}>
                                                        <Icons.Check className="w-3 h-3 text-white" />
                                                    </span>
                                                )}
                                            </>
                                        ) : null}
                                    </div>
                                    <div className="text-sm flex items-center gap-1.5 mt-0.5" style={{ color: colors.onSurfaceVariant }}>
                                        {account.authType === "microsoft"
                                            ? (account.catidLinked ? t('catid_and_microsoft_account') : t('microsoft_account'))
                                            : account.authType === "catid" ? t('catid_account') : t('user_account')}
                                        {account.authType === "catid" && (() => {
                                            const sevenDays = 7 * 24 * 60 * 60 * 1000;
                                            const createdAt = (account as any).createdAt || Date.now();
                                            const expiresAt = createdAt + sevenDays;
                                            const isExpired = Date.now() > expiresAt;
                                            return isExpired ? (
                                                <span className="ml-1 text-xs font-semibold px-2 py-0.5 rounded-md" style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#ef4444" }}>
                                                    {t('expired')}
                                                </span>
                                            ) : null;
                                        })()}
                                    </div>
                                </div>
                                {account.uuid !== session?.uuid && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeAccount(account);
                                        }}
                                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors hover:bg-red-500 hover:text-white"
                                        style={{ color: colors.onSurfaceVariant }}
                                    >
                                        <i className="fa-solid fa-trash text-sm"></i>
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                <button
                    onClick={() => setLoginDialogOpen(true)}
                    className="w-full h-12 rounded-xl text-[15px] font-semibold border-2 border-dashed transition-all hover:brightness-110 flex items-center justify-center gap-2"
                    style={{
                        borderColor: colors.secondary,
                        color: colors.secondary,
                    }}
                >
                    <i className="fa-solid fa-plus"></i>
                    {t('add_new_account')}
                </button>
            </SettingsSection>
        </SettingsPage>
    );
}

function AvatarSourcePicker({ value, disabled, onSelect, colors, t }: {
    value: "catid_avatar" | "minecraft_skin";
    disabled: boolean;
    onSelect: (source: "catid_avatar" | "minecraft_skin") => void;
    colors: any;
    t: any;
}) {
    const options: { value: "catid_avatar" | "minecraft_skin"; icon: string; label: string }[] = [
        { value: "catid_avatar", icon: "fa-circle-user", label: t('avatar_source_catid') },
        { value: "minecraft_skin", icon: "fa-gamepad", label: t('avatar_source_minecraft') },
    ];
    return (
        <div className="inline-flex p-1 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest }}>
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onSelect(option.value)}
                        disabled={disabled}
                        className="h-9 px-4 rounded-md text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap disabled:opacity-50"
                        style={active ? { backgroundColor: colors.secondary, color: "#111" } : { color: colors.onSurfaceVariant }}
                    >
                        <i className={`fa-solid ${option.icon} text-sm`}></i>
                        <span>{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

function SessionTimer({ session, t, colors, language }: { session: AuthSession, t: any, colors: any, language: string }) {
    const [timeLeft, setTimeLeft] = useState<{
        expired: boolean,
        days: number,
        hours: number,
        minutes: number,
        seconds: number,
        expiryDate: string
    } | null>(null);

    useEffect(() => {
        const calculateTime = () => {
            const now = Date.now();
            let expiresAt: number;

            if (session.authType === "microsoft") {
                // For Microsoft+CatID accounts, use apiTokenExpiresAt (API session expiry)
                // DON'T fall back to tokenExpiresAt — that's the Minecraft access token (~24h)
                if (session.apiTokenExpiresAt) {
                    expiresAt = session.apiTokenExpiresAt;
                } else {
                    // No API expiry info yet — don't show timer
                    return;
                }
            } else {
                // For CatID accounts, use tokenExpiresAt
                expiresAt = session.tokenExpiresAt || 0;
                if (!expiresAt) {
                    const sevenDays = 7 * 24 * 60 * 60 * 1000;
                    const createdAt = session.createdAt || now;
                    expiresAt = createdAt + sevenDays;
                }
            }

            const timeRemaining = expiresAt - now;
            const isExpired = timeRemaining <= 0;

            if (isExpired) {
                setTimeLeft({
                    expired: true,
                    days: 0, hours: 0, minutes: 0, seconds: 0,
                    expiryDate: new Date(expiresAt).toLocaleString(language === "th" ? "th-TH" : "en-US")
                });
                return;
            }

            const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

            setTimeLeft({
                expired: false,
                days, hours, minutes, seconds,
                expiryDate: new Date(expiresAt).toLocaleString(language === "th" ? "th-TH" : "en-US", {
                    dateStyle: "short", timeStyle: "medium"
                })
            });
        };

        calculateTime();
        const interval = setInterval(calculateTime, 1000);
        return () => clearInterval(interval);
    }, [session, language]);

    if (!timeLeft) return null;

    if (timeLeft.expired) {
        return (
            <div className="mt-1.5 text-[13px] font-semibold" style={{ color: "#ef4444" }}>
                <span className="flex items-center gap-1">
                    <i className="fa-solid fa-exclamation-triangle" />
                    {t('session_expired')}
                </span>
            </div>
        );
    }

    // Color logic: Red if < 1 hour, Orange if < 24 hours, normal otherwise
    const isUrgent = timeLeft.days === 0 && timeLeft.hours < 1;
    const isWarning = timeLeft.days === 0;
    const textColor = isUrgent ? "#ef4444" : isWarning ? "#f59e0b" : colors.onSurfaceVariant;

    return (
        <div className="mt-1.5 text-[13px]" style={{ color: textColor }}>
            <span className="flex items-center gap-1">
                <i className={`fa-${isUrgent ? 'solid' : 'regular'} fa-clock`} />
                {timeLeft.days > 0 
                    ? `${t('expires_in')} ${timeLeft.days}d ${timeLeft.hours}h ${timeLeft.minutes}m ${timeLeft.seconds}s (${timeLeft.expiryDate})`
                    : `${t('expires_in')} ${timeLeft.hours}h ${timeLeft.minutes}m ${timeLeft.seconds}s`
                }
            </span>
        </div>
    );
}
