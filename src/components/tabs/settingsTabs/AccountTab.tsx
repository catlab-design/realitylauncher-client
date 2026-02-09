import { useState, useEffect } from "react";
import type { AuthSession, LauncherConfig } from "../../../types/launcher";
import { Icons } from "../../ui/Icons";
import { MCHead } from "../../ui/MCHead";
import microsoftIcon from "../../../assets/microsoft_icon.svg";
import { useTranslation } from "../../../hooks/useTranslation";

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
}: AccountTabProps) {
    const { t, language } = useTranslation(config.language);

    return (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
            <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                <i className="fa-solid fa-user text-lg" style={{ color: colors.secondary }}></i>
                <h3 className="font-medium" style={{ color: colors.onSurface }}>{t('user_account')}</h3>
            </div>
            <div className="p-4 space-y-3">
                {/* Current Account */}
                {session ? (
                    <div className="p-3 rounded-xl space-y-4" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                        <div className="flex items-center gap-3">
                            <MCHead username={session.username} size={48} className="rounded-xl" />
                            <div className="flex-1">
                                <div className="font-medium flex items-center gap-1" style={{ color: colors.onSurface }}>
                                    {session.username}
                                    {session.isAdmin ? (
                                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full" style={{ backgroundColor: "#fbbf24" }}>
                                            <Icons.Check className="w-3 h-3 text-gray-900" />
                                        </span>
                                    ) : session.type === "catid" ? (
                                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full" style={{ backgroundColor: "#3b82f6" }}>
                                            <Icons.Check className="w-3 h-3 text-white" />
                                        </span>
                                    ) : session.type === "microsoft" ? (
                                        <>
                                            <img src={microsoftIcon.src} alt="Microsoft" className="w-5 h-5" />
                                            {session.apiToken && (
                                                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full" style={{ backgroundColor: "#fbbf24" }}>
                                                    <Icons.Check className="w-3 h-3 text-white" />
                                                </span>
                                            )}
                                        </>
                                    ) : null}
                                </div>
                                <div className="text-xs flex items-center gap-2" style={{ color: colors.onSurfaceVariant }}>
                                    {session.type === "microsoft"
                                        ? (session.apiToken ? t('catid_and_microsoft_account') : t('microsoft_account'))
                                        : session.type === "catid" ? t('catid_account') : t('offline_mode')}
                                </div>
                                    {/* Session status for accounts with API session */}
                                    {(session.type === "catid" || (session.type === "microsoft" && session.apiToken)) && (
                                        <SessionTimer session={session} t={t} colors={colors} language={language} />
                                    )}
                                </div>
                                <button
                                    onClick={handleLogout}
                                className="px-3 py-1.5 rounded-lg text-sm transition-all hover:scale-105"
                                style={{ backgroundColor: "#ef444420", color: "#ef4444" }}
                            >
                                {t('logout')}
                            </button>
                        </div>

                        {/* Linked Accounts Actions */}
                        {session.type === "microsoft" && (
                            <div className="pt-3 border-t flex flex-col gap-2" style={{ borderColor: colors.outline + "20" }}>
                                <div className="text-xs font-medium" style={{ color: colors.onSurfaceVariant }}>{t('account_connections')}</div>
                                <div className="flex gap-2">
                                    {session.apiToken ? (
                                        <button
                                            onClick={() => handleUnlink("catid")}
                                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-all hover:bg-black/5"
                                            style={{ backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                                        >
                                            <Icons.Check className="w-4 h-4" style={{ color: colors.secondary }} />
                                            <span>{t('unlink_catid')}</span>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setLinkCatIDOpen(true)}
                                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-all hover:bg-black/5"
                                            style={{ backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                                        >
                                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full" style={{ backgroundColor: "#fbbf24" }}>
                                                <Icons.Check className="w-3.5 h-3.5 text-white" />
                                            </span>
                                            <span>{t('link_catid')}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="p-4 rounded-xl text-center" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                        <Icons.Person className="w-10 h-10 mx-auto mb-2" style={{ color: colors.onSurfaceVariant }} />
                        <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{t('not_logged_in')}</p>
                    </div>
                )}

                {/* Account Lists */}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                    {accounts.map((acc, index) => {
                        const account = acc as AuthSession;
                        return (
                            <div
                                key={index}
                                onClick={() => selectAccount(acc)}
                                className="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors"
                                style={{
                                    backgroundColor: account.uuid === session?.uuid ? colors.secondary + "20" : "transparent",
                                    border: account.uuid === session?.uuid ? `1px solid ${colors.secondary}` : `1px solid ${colors.outline}20`
                                }}
                            >
                                <MCHead username={account.username} size={32} className="rounded-lg" />
                                <div className="flex-1">
                                    <div className="text-sm font-medium flex items-center gap-1" style={{ color: colors.onSurface }}>
                                        {account.username}
                                        {account.isAdmin ? (
                                            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#fbbf24" }}>
                                                <Icons.Check className="w-2.5 h-2.5 text-gray-900" />
                                            </span>
                                        ) : account.type === "catid" ? (
                                            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#3b82f6" }}>
                                                <Icons.Check className="w-2.5 h-2.5 text-white" />
                                            </span>
                                        ) : account.type === "microsoft" ? (
                                            <>
                                                <img src={microsoftIcon.src} alt="Microsoft" className="w-5 h-5" />
                                                {account.apiToken && (
                                                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#fbbf24" }}>
                                                        <Icons.Check className="w-2.5 h-2.5 text-white" />
                                                    </span>
                                                )}
                                            </>
                                        ) : null}
                                    </div>
                                    <div className="text-xs flex items-center gap-1" style={{ color: colors.onSurfaceVariant }}>
                                        {account.type === "microsoft"
                                            ? (account.apiToken ? t('catid_and_microsoft_account') : t('microsoft_account'))
                                            : account.type === "catid" ? t('catid_account') : t('offline_mode')}
                                        {/* Show expired warning for CatID accounts only */}
                                        {account.type === "catid" && (() => {
                                            const sevenDays = 7 * 24 * 60 * 60 * 1000;
                                            const createdAt = (account as any).createdAt || Date.now();
                                            const expiresAt = createdAt + sevenDays;
                                            const isExpired = Date.now() > expiresAt;
                                            return isExpired ? (
                                                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#ef444420", color: "#ef4444" }}>
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
                                        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-red-500 hover:text-white"
                                        style={{ color: colors.onSurfaceVariant }}
                                    >
                                        <i className="fa-solid fa-trash text-xs"></i>
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                <button
                    onClick={() => setLoginDialogOpen(true)}
                    className="w-full py-2.5 rounded-xl text-sm font-medium border border-dashed transition-all hover:bg-opacity-10"
                    style={{
                        borderColor: colors.secondary,
                        color: colors.secondary,
                    }}
                >
                    <i className="fa-solid fa-plus mr-2"></i>
                    {t('add_new_account')}
                </button>
            </div>
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

            if (session.type === "microsoft") {
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
            <div className="mt-1 text-xs font-semibold" style={{ color: "#ef4444" }}>
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
        <div className="mt-1 text-xs" style={{ color: textColor }}>
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
