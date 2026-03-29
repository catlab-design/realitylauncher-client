import type { CSSProperties, Dispatch, SetStateAction } from "react";

import { NotificationInbox } from "./ui/NotificationInbox";
import { AppVersionBadge } from "./ui/AppVersionBadge";
import { MCHead } from "./ui/MCHead";
import { Icons } from "./ui/Icons";
import microsoftIcon from "../assets/microsoft_icon.svg";
import rIcon from "../assets/r.svg";
import type { AuthSession, GameInstance, LauncherConfig } from "../types/launcher";
import type { TranslationKey } from "../i18n/translations";
import { playClick } from "../lib/sounds";

interface LauncherPalette {
  primary: string;
  primaryContainer: string;
  secondary: string;
  surface: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
}

interface TitleBarColors {
  background: string;
  text: string;
  muted: string;
  active: string;
  accent: string;
  dotRing: string;
  versionBg: string;
  versionText: string;
}

interface LauncherAppTitleBarProps {
  colors: LauncherPalette;
  titleBarColors: TitleBarColors;
  config: LauncherConfig;
  session: AuthSession | null;
  accounts: AuthSession[];
  selectedInstance: GameInstance | null;
  inboxOpen: boolean;
  setInboxOpen: Dispatch<SetStateAction<boolean>>;
  announcements: any[];
  userNotifications: any[];
  unreadCount: number;
  setInvitations: Dispatch<SetStateAction<any[]>>;
  setServerRefreshTrigger: Dispatch<SetStateAction<number>>;
  setNotificationRefreshTrigger: Dispatch<SetStateAction<number>>;
  accountDropdownOpen: boolean;
  setAccountDropdownOpen: Dispatch<SetStateAction<boolean>>;
  t: (key: TranslationKey, params?: Record<string, any>) => string;
  selectAccount: (account: AuthSession) => void | Promise<void>;
  removeAccountFromList: (account: AuthSession) => void | Promise<void>;
  setLoginDialogOpen: (open: boolean) => void;
  setLinkCatIDOpen: Dispatch<SetStateAction<boolean>>;
  handleLinkMicrosoft: () => void | Promise<void>;
  handleLogout: () => void | Promise<void>;
  updateConfig: (newConfig: Partial<LauncherConfig>) => void | Promise<void>;
}

export function LauncherAppTitleBar({
  colors,
  titleBarColors,
  config,
  session,
  accounts,
  selectedInstance,
  inboxOpen,
  setInboxOpen,
  announcements,
  userNotifications,
  unreadCount,
  setInvitations,
  setServerRefreshTrigger,
  setNotificationRefreshTrigger,
  accountDropdownOpen,
  setAccountDropdownOpen,
  t,
  selectAccount,
  removeAccountFromList,
  setLoginDialogOpen,
  setLinkCatIDOpen,
  handleLinkMicrosoft,
  handleLogout,
  updateConfig,
}: LauncherAppTitleBarProps) {
  return (
    <header
      className="h-10 flex items-center justify-between pr-0 drag-region"
      style={{ background: titleBarColors.background }}
    >
      <div className="flex items-center h-full">
        <div
          className="w-20 h-full flex items-center justify-center no-drag"
          style={{ backgroundColor: colors.secondary }}
        >
          <img
            src={rIcon.src}
            alt="Logo"
            className="w-13 h-13 object-contain select-none transform translate-y-2"
            draggable={false}
            style={{ WebkitUserDrag: "none" } as CSSProperties}
          />
        </div>

        <div className="flex items-center gap-2 pl-4">
          <h1
            className="text-[18px] leading-none font-bold"
            style={{
              fontFamily: "'Inter', sans-serif",
              color: titleBarColors.text,
            }}
          >
            Reality
          </h1>
          <AppVersionBadge
            colors={colors}
            className="border border-white/10 font-semibold tracking-tight"
            bgColor={titleBarColors.versionBg}
            textColor={titleBarColors.versionText}
          />
        </div>
      </div>

      <div
        className="fixed top-0 right-36 h-10 flex items-center gap-2 pr-2 no-drag"
        style={{ zIndex: 99, pointerEvents: "auto" }}
      >

        {session && (
          <div className="relative">
            <button
              onClick={() => setInboxOpen(!inboxOpen)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 hover:bg-white/10 relative"
              style={{
                color: titleBarColors.muted,
                backgroundColor: inboxOpen ? titleBarColors.active : "transparent",
              }}
              title={t("news_and_notifications")}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unreadCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 text-[13px] font-black pointer-events-none select-none"
                  style={{
                    color: "#000000",
                    textShadow: "0 0 2px rgba(255,255,255,0.7)",
                  }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            <NotificationInbox
              isOpen={inboxOpen}
              onClose={() => setInboxOpen(false)}
              announcements={announcements}
              notifications={userNotifications}
              colors={colors}
              isFullscreen={config.fullscreen}
              onInvitationAccepted={() => {
                if (window.api?.notificationsSync) {
                  window.api.notificationsSync().then((data) => {
                    if (data?.invitations) setInvitations(data.invitations);
                  });
                } else if (window.api?.invitationsFetch) {
                  window.api.invitationsFetch().then(setInvitations);
                }
                setServerRefreshTrigger((prev) => prev + 1);
              }}
              onNotificationChanged={() =>
                setNotificationRefreshTrigger((prev) => prev + 1)
              }
            />
          </div>
        )}

        <div className="relative">
          <button
            onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all hover:scale-105 hover:bg-white/10"
            style={{
              color: titleBarColors.text,
              backgroundColor: accountDropdownOpen
                ? titleBarColors.active
                : "transparent",
            }}
          >
            {session ? (
              <MCHead username={session.username} size={22} className="rounded-full" />
            ) : (
              <Icons.Person className="w-4 h-4" />
            )}
            {session?.username || "Account"}
            {session?.isAdmin ? (
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-full"
                style={{ backgroundColor: "#fbbf24" }}
              >
                <Icons.Check className="w-3 h-3 text-gray-900" />
              </span>
            ) : session?.type === "catid" ? (
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-full"
                style={{ backgroundColor: "#3b82f6" }}
              >
                <Icons.Check className="w-3 h-3 text-white" />
              </span>
            ) : session?.type === "microsoft" ? (
              <>
                <img
                  src={microsoftIcon.src}
                  alt="Microsoft"
                  className="w-5 h-5"
                />
                {session.apiToken && (
                  <span
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full"
                    style={{ backgroundColor: "#fbbf24" }}
                  >
                    <Icons.Check className="w-3 h-3 text-white" />
                  </span>
                )}
              </>
            ) : null}
            <svg
              className={`w-3 h-3 transition-transform ${accountDropdownOpen ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </button>

          {accountDropdownOpen && (
            <div
              className="absolute top-full right-0 mt-2 w-64 rounded-2xl shadow-xl p-4 z-50"
              style={{
                backgroundColor: colors.surface,
                border: `1px solid ${colors.outline}`,
              }}
            >
              <p
                className="text-xs font-medium mb-3"
                style={{ color: colors.onSurfaceVariant }}
              >
                Account
              </p>

              <div className="space-y-2 mb-4">
                {accounts.length > 0 ? (
                  accounts.map((account, index) => (
                    <div
                      key={`${account.type}-${account.username}-${index}`}
                      className="flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all hover:bg-gray-500/10"
                      style={{
                        backgroundColor:
                          session?.username === account.username
                            ? colors.surfaceContainerHighest
                            : "transparent",
                        border:
                          session?.username === account.username
                            ? `1px solid ${colors.secondary}`
                            : "1px solid transparent",
                      }}
                      onClick={() => {
                        void selectAccount(account);
                        setAccountDropdownOpen(false);
                      }}
                    >
                      <MCHead
                        username={account.username}
                        size={32}
                        className="rounded-full"
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm font-medium truncate flex items-center gap-1"
                          style={{ color: colors.onSurface }}
                        >
                          {account.username}
                          {account.isAdmin ? (
                            <span
                              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full shrink-0"
                              style={{ backgroundColor: "#fbbf24" }}
                            >
                              <Icons.Check className="w-2.5 h-2.5 text-gray-900" />
                            </span>
                          ) : account.type === "catid" ? (
                            <span
                              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full shrink-0"
                              style={{ backgroundColor: "#3b82f6" }}
                            >
                              <Icons.Check className="w-2.5 h-2.5 text-white" />
                            </span>
                          ) : account.type === "microsoft" ? (
                            <img
                              src={microsoftIcon.src}
                              alt="Microsoft"
                              className="w-5 h-5"
                            />
                          ) : null}
                          {account.type === "microsoft" && account.apiToken && (
                            <span
                              title={t("linked_with_catid")}
                              className="ml-1 opacity-80 inline-flex items-center justify-center w-4 h-4 rounded-full"
                              style={{ backgroundColor: "#fbbf24" }}
                            >
                              <Icons.Check className="w-3 h-3 text-white" />
                            </span>
                          )}
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: colors.onSurfaceVariant }}
                        >
                          {account.type === "microsoft"
                            ? "Microsoft"
                            : account.type === "catid"
                              ? "CatID Account"
                              : "Offline Account"}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void removeAccountFromList(account);
                        }}
                        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-500/20"
                        style={{ color: colors.onSurfaceVariant }}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                      </button>
                    </div>
                  ))
                ) : (
                  <p
                    className="text-sm text-center py-2"
                    style={{ color: colors.onSurfaceVariant }}
                  >
                    {t("no_accounts_yet")}
                  </p>
                )}
              </div>

              <div className="h-px mb-3" style={{ backgroundColor: colors.outline }} />

              <p
                className="text-xs font-medium mb-2"
                style={{ color: colors.onSurfaceVariant }}
              >
                Actions
              </p>
              <div className="space-y-1">
                <button
                  onClick={() => {
                    setAccountDropdownOpen(false);
                    setLoginDialogOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all hover:bg-gray-500/10"
                  style={{ color: colors.onSurface }}
                >
                  <span
                    className="flex items-center justify-center w-5 h-5 text-lg"
                    style={{ color: colors.secondary }}
                  >
                    +
                  </span>
                  <span className="text-sm">{t("add_account")}</span>
                </button>

                {session && session.type === "microsoft" && !session.apiToken && (
                  <button
                    onClick={() => {
                      setAccountDropdownOpen(false);
                      setLinkCatIDOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all hover:bg-gray-500/10"
                    style={{ color: colors.onSurface }}
                  >
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full"
                      style={{ backgroundColor: "#fbbf24" }}
                    >
                      <Icons.Check className="w-3.5 h-3.5 text-white" />
                    </span>
                    <span className="text-sm">{t("link_catid")}</span>
                  </button>
                )}

                {session && session.type === "catid" && (
                  <button
                    onClick={async () => {
                      playClick();
                      setAccountDropdownOpen(false);
                      await handleLinkMicrosoft();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all hover:bg-gray-500/10"
                    style={{ color: colors.onSurface }}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 21 21" fill="currentColor">
                      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                    </svg>
                    <span className="text-sm">{t("link_microsoft")}</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    playClick();
                    void handleLogout();
                    setAccountDropdownOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all hover:bg-gray-500/10"
                  style={{ color: colors.onSurface }}
                >
                  <span className="w-5 h-5 flex items-center justify-center text-lg">
                    {"\u2190"}
                  </span>
                  <span className="text-sm">{t("logout")}</span>
                </button>
              </div>
            </div>
          )}

          {accountDropdownOpen && (
            <div
              className="fixed inset-0 z-40"
              onClick={() => setAccountDropdownOpen(false)}
            />
          )}
        </div>

        <div
          className="fixed top-0 right-0 flex items-center gap-0 no-drag"
          style={{ pointerEvents: "auto", zIndex: 100 }}
        >
          <button
            onClick={() => window.api?.windowMinimize()}
            className="w-12 h-10 flex items-center justify-center transition-all hover:bg-white/10"
            style={{ color: titleBarColors.muted }}
            title={t("minimize")}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13H5v-2h14v2z" />
            </svg>
          </button>
          <button
            onClick={async () => {
              await window.api?.windowMaximize();
              const isMaximized = await window.api?.windowIsMaximized?.();
              await updateConfig({ fullscreen: isMaximized ?? false });
            }}
            className="w-12 h-10 flex items-center justify-center transition-all hover:bg-white/10"
            style={{
              color: config.fullscreen
                ? titleBarColors.accent
                : titleBarColors.muted,
            }}
            title={config.fullscreen ? t("restore") : t("maximize")}
          >
            {config.fullscreen ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => window.api?.windowClose()}
            className="w-12 h-10 flex items-center justify-center transition-all hover:bg-red-500 hover:text-white!"
            style={{ color: titleBarColors.muted }}
            title={t("close")}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
