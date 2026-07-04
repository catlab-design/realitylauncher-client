import type { Dispatch, SetStateAction } from "react";

import { toast } from "react-hot-toast";

import { ChangelogModal } from "./ui/ChangelogModal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { LoginModal } from "./auth/LoginModal";
import { CatIDLoginModal } from "./auth/CatIDLoginModal";
import { MicrosoftVerificationModal } from "./auth/MicrosoftVerificationModal";
import { MCHead } from "./ui/MCHead";
import { Icons } from "./ui/Icons";
import type { AuthSession } from "../types/launcher";
import type { TranslationKey } from "../i18n/translations";
import { playClick } from "../lib/sounds";
import { startMicrosoftLoginFlow } from "../lib/microsoftLoginFlow";

interface LauncherPalette {
  primary: string;
  secondary: string;
  surface: string;
  surfaceContainer: string;
  surfaceContainerLow?: string;
  surfaceContainerHighest: string;
  onPrimary: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
}

interface ChangelogData {
  version: string;
  changelog: string;
}

interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
  tertiaryText?: string;
  tertiaryColor?: string;
  onTertiary?: () => void;
}

interface DeviceCodeData {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
}

interface CatIdRegisterData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface LauncherAppOverlaysProps {
  colors: LauncherPalette;
  t: (key: TranslationKey, params?: Record<string, any>) => string;
  changelogModalOpen: boolean;
  setChangelogModalOpen: Dispatch<SetStateAction<boolean>>;
  changelogData: ChangelogData | null;
  confirmDialog: ConfirmDialogState;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState>>;
  loginDialogOpen: boolean;
  setLoginDialogOpen: (open: boolean) => void;
  catIDLoginOpen: boolean;
  setCatIDLoginOpen: Dispatch<SetStateAction<boolean>>;
  deviceCodeModalOpen: boolean;
  setDeviceCodeModalOpen: Dispatch<SetStateAction<boolean>>;
  deviceCodeData: DeviceCodeData | null;
  setDeviceCodeData: Dispatch<SetStateAction<DeviceCodeData | null>>;
  setDeviceCodeError: Dispatch<SetStateAction<string | null>>;
  setDeviceCodePolling: Dispatch<SetStateAction<boolean>>;
  setIsLinkingMicrosoft: Dispatch<SetStateAction<boolean>>;
  handleCatIDLogin: (username: string, password: string) => Promise<boolean>;
  catIDRegisterOpen: boolean;
  setCatIDRegisterOpen: Dispatch<SetStateAction<boolean>>;
  catIDRegisterData: CatIdRegisterData;
  setCatIDRegisterData: Dispatch<SetStateAction<CatIdRegisterData>>;
  isRegistering: boolean;
  handleCatIDRegister: () => Promise<boolean> | boolean | void;
  verificationWaiting: boolean;
  setVerificationWaiting: Dispatch<SetStateAction<boolean>>;
  verificationEmail: string | null;
  handleManualVerificationCheck: () => Promise<void> | void;
  setVerificationToken: Dispatch<SetStateAction<string | null>>;
  forgotPasswordOpen: boolean;
  setForgotPasswordOpen: Dispatch<SetStateAction<boolean>>;
  forgotPasswordStep: "email" | "reset";
  setForgotPasswordStep: Dispatch<SetStateAction<"email" | "reset">>;
  forgotPasswordEmail: string;
  setForgotPasswordEmail: Dispatch<SetStateAction<string>>;
  forgotPasswordOtp: string;
  setForgotPasswordOtp: Dispatch<SetStateAction<string>>;
  forgotPasswordNewPassword: string;
  setForgotPasswordNewPassword: Dispatch<SetStateAction<string>>;
  forgotPasswordConfirmNewPassword: string;
  setForgotPasswordConfirmNewPassword: Dispatch<SetStateAction<string>>;
  isForgotPasswordLoading: boolean;
  setIsForgotPasswordLoading: Dispatch<SetStateAction<boolean>>;
  linkCatIDOpen: boolean;
  setLinkCatIDOpen: Dispatch<SetStateAction<boolean>>;
  showLinkPassword: boolean;
  setShowLinkPassword: Dispatch<SetStateAction<boolean>>;
  handleLinkCatID: (username: string, password: string) => Promise<void> | void;
  accountManagerOpen: boolean;
  setAccountManagerOpen: (open: boolean) => void;
  accounts: AuthSession[];
  session: AuthSession | null;
  selectAccount: (account: AuthSession) => Promise<void> | void;
  removeAccountFromList: (account: AuthSession) => Promise<void> | void;
  importModpackOpen: boolean;
  setImportModpackOpen: (open: boolean) => void;
  isDragging: boolean;
  setIsDragging: Dispatch<SetStateAction<boolean>>;
}

export function LauncherAppOverlays({
  colors,
  t,
  changelogModalOpen,
  setChangelogModalOpen,
  changelogData,
  confirmDialog,
  setConfirmDialog,
  loginDialogOpen,
  setLoginDialogOpen,
  catIDLoginOpen,
  setCatIDLoginOpen,
  deviceCodeModalOpen,
  setDeviceCodeModalOpen,
  deviceCodeData,
  setDeviceCodeData,
  setDeviceCodeError,
  setDeviceCodePolling,
  setIsLinkingMicrosoft,
  handleCatIDLogin,
  catIDRegisterOpen,
  setCatIDRegisterOpen,
  catIDRegisterData,
  setCatIDRegisterData,
  isRegistering,
  handleCatIDRegister,
  verificationWaiting,
  setVerificationWaiting,
  verificationEmail,
  handleManualVerificationCheck,
  setVerificationToken,
  forgotPasswordOpen,
  setForgotPasswordOpen,
  forgotPasswordStep,
  setForgotPasswordStep,
  forgotPasswordEmail,
  setForgotPasswordEmail,
  forgotPasswordOtp,
  setForgotPasswordOtp,
  forgotPasswordNewPassword,
  setForgotPasswordNewPassword,
  forgotPasswordConfirmNewPassword,
  setForgotPasswordConfirmNewPassword,
  isForgotPasswordLoading,
  setIsForgotPasswordLoading,
  linkCatIDOpen,
  setLinkCatIDOpen,
  showLinkPassword,
  setShowLinkPassword,
  handleLinkCatID,
  accountManagerOpen,
  setAccountManagerOpen,
  accounts,
  session,
  selectAccount,
  removeAccountFromList,
  importModpackOpen,
  setImportModpackOpen,
  isDragging,
  setIsDragging,
}: LauncherAppOverlaysProps) {
  return (
    <>
      <ChangelogModal
        isOpen={changelogModalOpen}
        onClose={() => setChangelogModalOpen(false)}
        version={changelogData?.version || ""}
        changelog={changelogData?.changelog || ""}
        colors={colors}
      />

      <ConfirmDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        confirmColor={confirmDialog.confirmColor}
        tertiaryText={confirmDialog.tertiaryText}
        tertiaryColor={confirmDialog.tertiaryColor}
        onTertiary={confirmDialog.onTertiary}
        colors={colors}
      />

      <LoginModal
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
        onMicrosoftLogin={async () => {
          await startMicrosoftLoginFlow({
            startDeviceCodeAuth: window.api?.startDeviceCodeAuth,
            setLoginDialogOpen,
            setDeviceCodeData,
            setDeviceCodeError,
            setDeviceCodeModalOpen,
            setDeviceCodePolling,
            toast,
            t,
            logError: console.error,
          });
        }}
        onCatIDLogin={() => {
          setLoginDialogOpen(false);
          setCatIDLoginOpen(true);
        }}
        colors={colors}
      />

      <CatIDLoginModal
        isOpen={catIDLoginOpen}
        onClose={() => setCatIDLoginOpen(false)}
        onLogin={async (username, password) => {
          const ok = await handleCatIDLogin(username, password);
          if (ok) setCatIDLoginOpen(false);
        }}
        onRegister={() => {
          setCatIDLoginOpen(false);
          setCatIDRegisterOpen(true);
        }}
        onForgotPassword={() => {
          setCatIDLoginOpen(false);
          setForgotPasswordOpen(true);
        }}
        colors={colors}
      />

      <MicrosoftVerificationModal
        isOpen={deviceCodeModalOpen}
        data={deviceCodeData}
        onClose={() => {
          setDeviceCodeModalOpen(false);
          setDeviceCodePolling(false);
          setDeviceCodeData(null);
          setDeviceCodeError(null);
          setIsLinkingMicrosoft(false);
        }}
        colors={colors}
      />

      {catIDRegisterOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-5 animate-in fade-in duration-300">
          <div
            className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-white/10"
            style={{ backgroundColor: colors.surface }}
          >
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
                  <svg className="w-5.5 h-5.5" viewBox="0 0 24 24" fill="#ffffff">
                    <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-black tracking-tight" style={{ color: colors.onSurface }}>
                    {t("create_new_account")}
                  </h2>
                  <p className="text-xs opacity-75" style={{ color: colors.onSurfaceVariant }}>
                    {t("start_new_journey")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCatIDRegisterOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border transition-all hover:bg-white/10"
                style={{
                  color: colors.onSurface,
                  borderColor: `${colors.onSurface}15`,
                  backgroundColor: colors.surfaceContainer,
                }}
                aria-label={t("close")}
              >
                <Icons.Close className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>
                    {t("username")}
                  </label>
                  <input
                    id="catid-reg-username"
                    type="text"
                    placeholder={t("username_placeholder")}
                    className="w-full px-4 py-3 rounded-xl border border-white/5 transition-all outline-none focus:ring-2 focus:ring-purple-500/30"
                    style={{
                      backgroundColor: colors.surfaceContainer,
                      color: colors.onSurface,
                    }}
                    value={catIDRegisterData.username}
                    onChange={(e) =>
                      setCatIDRegisterData((prev) => ({
                        ...prev,
                        username: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>
                    {t("email")}
                  </label>
                  <input
                    id="catid-reg-email"
                    type="email"
                    placeholder={t("email")}
                    className="w-full px-4 py-3 rounded-xl border border-white/5 transition-all outline-none focus:ring-2 focus:ring-purple-500/30"
                    style={{
                      backgroundColor: colors.surfaceContainer,
                      color: colors.onSurface,
                    }}
                    value={catIDRegisterData.email}
                    onChange={(e) =>
                      setCatIDRegisterData((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>
                  {t("password")}
                </label>
                <input
                  id="catid-reg-password"
                  type="password"
                  placeholder={t("password")}
                  className="w-full px-4 py-3 rounded-xl border border-white/5 transition-all outline-none focus:ring-2 focus:ring-purple-500/30"
                  style={{
                    backgroundColor: colors.surfaceContainer,
                    color: colors.onSurface,
                  }}
                  value={catIDRegisterData.password}
                  onChange={(e) =>
                    setCatIDRegisterData((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>
                  {t("confirm_password")}
                </label>
                <input
                  id="catid-reg-confirm"
                  type="password"
                  placeholder={t("confirm_password")}
                  className="w-full px-4 py-3 rounded-xl border border-white/5 transition-all outline-none focus:ring-2 focus:ring-purple-500/30"
                  style={{
                    backgroundColor: colors.surfaceContainer,
                    color: colors.onSurface,
                  }}
                  value={catIDRegisterData.confirmPassword}
                  onChange={(e) =>
                    setCatIDRegisterData((prev) => ({
                      ...prev,
                      confirmPassword: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="flex flex-col gap-2 mt-4">
                <button
                  onClick={() => void handleCatIDRegister()}
                  disabled={isRegistering}
                  className="w-full py-3.5 rounded-xl font-black text-sm transition-all hover:scale-[1.01] active:scale-[0.99] shadow-md disabled:opacity-50"
                  style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
                >
                  {t("register_now")}
                </button>
                <button
                  onClick={() => {
                    setCatIDRegisterOpen(false);
                    setCatIDLoginOpen(true);
                  }}
                  className="w-full py-2.5 rounded-xl font-bold opacity-60 hover:opacity-100 transition-all text-xs"
                  style={{ color: colors.onSurface }}
                >
                  {t("already_have_account")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {verificationWaiting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-5 animate-in fade-in duration-300">
          <div
            className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-white/10"
            style={{ backgroundColor: colors.surface }}
          >
            <div
              className="flex items-center justify-between border-b px-6 py-4"
              style={{
                borderColor: `${colors.onSurface}10`,
                backgroundColor: colors.surfaceContainerLow || colors.surfaceContainer,
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-md animate-pulse"
                  style={{
                    backgroundColor: `${colors.secondary}20`,
                    color: colors.secondary,
                  }}
                >
                  <Icons.Email className="h-5.5 w-5.5" />
                </div>
                <div>
                  <h2 className="text-base font-black tracking-tight" style={{ color: colors.onSurface }}>
                    {t("verification_waiting")}
                  </h2>
                  <p className="text-xs opacity-75" style={{ color: colors.onSurfaceVariant }}>
                    {t("verification_check_email")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setVerificationWaiting(false);
                  setVerificationToken(null);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full border transition-all hover:bg-white/10"
                style={{
                  color: colors.onSurface,
                  borderColor: `${colors.onSurface}15`,
                  backgroundColor: colors.surfaceContainer,
                }}
                aria-label={t("close")}
              >
                <Icons.Close className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-6 flex flex-col items-center text-center gap-4">
              <p className="text-sm font-medium opacity-80" style={{ color: colors.onSurface }}>
                {t("verification_check_email")}
              </p>
              
              <div className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center gap-2">
                <span className="text-xs font-black opacity-40 uppercase" style={{ color: colors.onSurface }}>
                  EMAIL:
                </span>
                <span className="text-xs font-black" style={{ color: colors.secondary }}>
                  {verificationEmail}
                </span>
              </div>
              
              <p className="text-xs opacity-50 leading-relaxed max-w-xs" style={{ color: colors.onSurfaceVariant }}>
                {t("verification_spam_hint")}
              </p>

              <div className="w-full h-px my-2" style={{ backgroundColor: `${colors.onSurface}10` }} />

              <div className="flex flex-col gap-2 w-full">
                <button
                  onClick={() => void handleManualVerificationCheck()}
                  className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-[0.99] shadow-md"
                  style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                >
                  {t("verification_confirm_btn")}
                </button>

                <button
                  onClick={() => {
                    setVerificationWaiting(false);
                    setVerificationToken(null);
                  }}
                  className="w-full py-2.5 rounded-xl font-bold text-xs opacity-50 hover:opacity-100 hover:bg-white/5 transition-all"
                  style={{ color: colors.onSurface }}
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {forgotPasswordOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-5 animate-in fade-in duration-300">
          <div
            className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-white/10"
            style={{ backgroundColor: colors.surface }}
          >
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
                    backgroundColor: colors.secondary,
                    color: "#1a1a1a",
                  }}
                >
                  {forgotPasswordStep === "email" ? (
                    <Icons.Info className="h-5.5 w-5.5" />
                  ) : (
                    <Icons.Key className="h-5.5 w-5.5" />
                  )}
                </div>
                <div>
                  <h2 className="text-base font-black tracking-tight" style={{ color: colors.onSurface }}>
                    {forgotPasswordStep === "email"
                      ? t("recovery_id")
                      : t("reset_password")}
                  </h2>
                  <p className="text-xs opacity-75" style={{ color: colors.onSurfaceVariant }}>
                    {forgotPasswordStep === "email"
                      ? t("forgot_password_desc")
                      : t("check_email_otp")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setForgotPasswordOpen(false);
                  setForgotPasswordStep("email");
                  setForgotPasswordEmail("");
                  setForgotPasswordOtp("");
                  setForgotPasswordNewPassword("");
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full border transition-all hover:bg-white/10"
                style={{
                  color: colors.onSurface,
                  borderColor: `${colors.onSurface}15`,
                  backgroundColor: colors.surfaceContainer,
                }}
                aria-label={t("close")}
              >
                <Icons.Close className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-6 flex flex-col gap-4">
              {forgotPasswordStep === "email" ? (
                <>
                  <div className="space-y-4 w-full">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>
                        {t("email")}
                      </label>
                      <input
                        type="email"
                        value={forgotPasswordEmail}
                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        placeholder={t("email_placeholder")}
                        className="w-full px-4 py-3 rounded-xl border border-white/5 transition-all outline-none focus:ring-2 focus:ring-yellow-500/30"
                        style={{
                          backgroundColor: colors.surfaceContainer,
                          color: colors.onSurface,
                        }}
                      />
                    </div>

                    <button
                      onClick={async () => {
                        if (!forgotPasswordEmail) {
                          toast.error(t("fill_email"));
                          return;
                        }
                        setIsForgotPasswordLoading(true);
                        try {
                          const result =
                            await window.api?.forgotPassword?.(forgotPasswordEmail);
                          if (result?.ok) {
                            setForgotPasswordStep("reset");
                            toast.success(result.message || t("otp_sent"));
                          } else {
                            toast.error(result?.error || t("error_occurred"));
                          }
                        } catch (err) {
                          console.error(err);
                          toast.error(t("error_occurred"));
                        } finally {
                          setIsForgotPasswordLoading(false);
                        }
                      }}
                      disabled={isForgotPasswordLoading}
                      className="w-full py-3.5 rounded-xl font-black text-sm transition-all hover:scale-[1.01] active:scale-[0.99] shadow-md disabled:opacity-50"
                      style={{
                        backgroundColor: colors.secondary,
                        color: "#1a1a1a",
                      }}
                    >
                      {isForgotPasswordLoading ? t("sending") : t("send_otp")}
                    </button>

                    <button
                      onClick={() => {
                        setForgotPasswordOpen(false);
                        setCatIDLoginOpen(true);
                      }}
                      className="w-full py-2.5 rounded-xl font-bold opacity-60 hover:opacity-100 transition-all text-xs"
                      style={{ color: colors.onSurface }}
                    >
                      {t("back_to_login")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3 w-full">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>
                        OTP Code (6 Digits)
                      </label>
                      <input
                        type="text"
                        value={forgotPasswordOtp}
                        onChange={(e) =>
                          setForgotPasswordOtp(
                            e.target.value.replace(/[^0-9]/g, "").slice(0, 6),
                          )
                        }
                        placeholder="######"
                        className="w-full px-4 py-2.5 rounded-xl border border-white/5 transition-all outline-none focus:ring-2 focus:ring-yellow-500/30 tracking-widest font-mono text-center text-lg font-black"
                        style={{
                          backgroundColor: colors.surfaceContainer,
                          color: colors.secondary,
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>
                        {t("new_password")}
                      </label>
                      <input
                        type="password"
                        value={forgotPasswordNewPassword}
                        onChange={(e) =>
                          setForgotPasswordNewPassword(e.target.value)
                        }
                        placeholder={t("password_placeholder")}
                        className="w-full px-4 py-3 rounded-xl border border-white/5 transition-all outline-none focus:ring-2 focus:ring-yellow-500/30"
                        style={{
                          backgroundColor: colors.surfaceContainer,
                          color: colors.onSurface,
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>
                        {t("confirm_password")}
                      </label>
                      <input
                        type="password"
                        value={forgotPasswordConfirmNewPassword}
                        onChange={(e) =>
                          setForgotPasswordConfirmNewPassword(e.target.value)
                        }
                        placeholder={t("confirm_password")}
                        className="w-full px-4 py-3 rounded-xl border border-white/5 transition-all outline-none focus:ring-2 focus:ring-yellow-500/30"
                        style={{
                          backgroundColor: colors.surfaceContainer,
                          color: colors.onSurface,
                        }}
                      />
                    </div>

                    <button
                      onClick={async () => {
                        if (
                          !forgotPasswordOtp ||
                          !forgotPasswordNewPassword ||
                          !forgotPasswordConfirmNewPassword
                        ) {
                          toast.error(t("fill_all_fields"));
                          return;
                        }

                        if (
                          forgotPasswordNewPassword !==
                          forgotPasswordConfirmNewPassword
                        ) {
                          toast.error(
                            t("passwords_do_not_match") ||
                              "Passwords do not match",
                          );
                          return;
                        }
                        setIsForgotPasswordLoading(true);
                        try {
                          const result = await window.api?.resetPassword?.(
                            forgotPasswordEmail,
                            forgotPasswordOtp,
                            forgotPasswordNewPassword,
                          );
                          if (result?.ok) {
                            toast.success(
                              result.message || t("password_reset_success"),
                            );
                            setForgotPasswordOpen(false);
                            setForgotPasswordStep("email");
                            setCatIDLoginOpen(true);
                          } else {
                            toast.error(result?.error || t("error_occurred"));
                          }
                        } catch (err) {
                          console.error(err);
                          toast.error(t("error_occurred"));
                        } finally {
                          setIsForgotPasswordLoading(false);
                        }
                      }}
                      disabled={isForgotPasswordLoading}
                      className="w-full py-3.5 rounded-xl font-black text-sm transition-all hover:scale-[1.01] active:scale-[0.99] shadow-md disabled:opacity-50 mt-2"
                      style={{
                        backgroundColor: colors.secondary,
                        color: "#1a1a1a",
                      }}
                    >
                      {isForgotPasswordLoading
                        ? t("processing")
                        : t("reset_password")}
                    </button>

                    <button
                      onClick={() => setForgotPasswordStep("email")}
                      className="w-full py-1 font-bold opacity-60 hover:opacity-100 transition-all text-[11px]"
                      style={{ color: colors.onSurface }}
                    >
                      {t("wrong_email")}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {linkCatIDOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-5 animate-in fade-in duration-300">
          <div
            className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-white/10"
            style={{ backgroundColor: colors.surface }}
          >
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
                    backgroundColor: colors.secondary,
                    color: "#1a1a1a",
                  }}
                >
                  <Icons.Refresh className="h-5.5 w-5.5" />
                </div>
                <div>
                  <h2 className="text-base font-black tracking-tight" style={{ color: colors.onSurface }}>
                    {t("connect_account")}
                  </h2>
                  <p className="text-xs opacity-75" style={{ color: colors.onSurfaceVariant }}>
                    {t("sync_account")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setLinkCatIDOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border transition-all hover:bg-white/10"
                style={{
                  color: colors.onSurface,
                  borderColor: `${colors.onSurface}15`,
                  backgroundColor: colors.surfaceContainer,
                }}
                aria-label={t("close")}
              >
                <Icons.Close className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-6 flex flex-col gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>
                  {t("catid_username")}
                </label>
                <input
                  id="link-catid-username"
                  type="text"
                  placeholder={t("catid_username")}
                  className="w-full px-4 py-3 rounded-xl border border-white/5 transition-all outline-none focus:ring-2 focus:ring-yellow-500/30"
                  style={{
                    backgroundColor: colors.surfaceContainer,
                    color: colors.onSurface,
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>
                  {t("password")}
                </label>
                <div className="relative">
                  <input
                    id="link-catid-password"
                    type={showLinkPassword ? "text" : "password"}
                    placeholder={t("password")}
                    className="w-full px-4 py-3 rounded-xl border border-white/5 transition-all outline-none focus:ring-2 focus:ring-yellow-500/30 pr-12"
                    style={{
                      backgroundColor: colors.surfaceContainer,
                      color: colors.onSurface,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLinkPassword(!showLinkPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all hover:bg-white/5 opacity-50 hover:opacity-100"
                    style={{ color: colors.onSurface }}
                  >
                    {showLinkPassword ? (
                      <Icons.EyeOff className="w-4 h-4" />
                    ) : (
                      <Icons.Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                onClick={async () => {
                  const username = (
                    document.getElementById("link-catid-username") as
                      | HTMLInputElement
                      | null
                  )?.value;
                  const password = (
                    document.getElementById("link-catid-password") as
                      | HTMLInputElement
                      | null
                  )?.value;

                  if (!username || !password) {
                    toast.error(t("fill_all_fields"));
                    return;
                  }
                  await handleLinkCatID(username, password);
                }}
                className="w-full py-3.5 rounded-xl font-black text-sm transition-all hover:scale-[1.01] active:scale-[0.99] shadow-md mt-4"
                style={{
                  backgroundColor: colors.secondary,
                  color: "#1a1a1a",
                }}
              >
                {t("connect_now")}
              </button>
            </div>
          </div>
        </div>
      )}

      {accountManagerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-5 animate-in fade-in duration-300">
          <div
            className="flex w-full max-w-[540px] flex-col overflow-hidden rounded-2xl border border-white/10"
            style={{ backgroundColor: colors.surface }}
          >
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
                    backgroundColor: colors.secondary,
                    color: "#1a1a1a",
                  }}
                >
                  <Icons.Person className="h-5.5 w-5.5" />
                </div>
                <div>
                  <h2 className="text-base font-black tracking-tight" style={{ color: colors.onSurface }}>
                    {t("account_manager")}
                  </h2>
                  <p className="text-xs opacity-75" style={{ color: colors.onSurfaceVariant }}>
                    {t("account_management")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAccountManagerOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border transition-all hover:bg-white/10"
                style={{
                  color: colors.onSurface,
                  borderColor: `${colors.onSurface}15`,
                  backgroundColor: colors.surfaceContainer,
                }}
                aria-label={t("close")}
              >
                <Icons.Close className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-6 flex flex-col gap-4">
              <div className="space-y-3 max-h-[320px] overflow-y-auto px-1 custom-scrollbar mb-2">
                {accounts.map((account, index) => {
                  const isActive =
                    session?.username === account.username &&
                    session?.type === account.type;
                  return (
                    <div
                      key={`${account.type}-${account.username}-${index}`}
                      className="group flex items-center gap-4 p-4 rounded-2xl transition-all border relative overflow-hidden"
                      style={{
                        backgroundColor: isActive
                          ? `${colors.secondary}15`
                          : colors.surfaceContainer,
                        borderColor: isActive ? colors.secondary : "transparent",
                      }}
                    >
                      <div className="relative shrink-0">
                        <MCHead
                          username={account.username}
                          size={48}
                          className="rounded-full shadow-md border border-white/5"
                        />
                        {isActive && (
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-[#1e1e2e] flex items-center justify-center shadow-lg">
                            <Icons.Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div
                          className="font-black text-base flex items-center gap-2"
                          style={{ color: colors.onSurface }}
                        >
                          <span className="truncate">{account.username}</span>
                          {account.isAdmin && (
                            <div className="bg-yellow-500/20 px-2 py-0.5 rounded text-[9px] font-black text-yellow-500 uppercase">
                              {t("admin")}
                            </div>
                          )}
                        </div>
                        <div
                          className="text-[10px] font-bold uppercase tracking-widest opacity-30 mt-0.5"
                          style={{ color: colors.onSurface }}
                        >
                          {t("account_type_label")} {account.type}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {!isActive && (
                          <button
                            onClick={() => {
                              playClick();
                              void selectAccount(account);
                            }}
                            className="bg-white/5 hover:bg-yellow-500 hover:text-black w-9 h-9 rounded-lg flex items-center justify-center transition-all shadow-md active:scale-90"
                          >
                            <Icons.Play className="w-4.5 h-4.5 ml-0.5" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            playClick();
                            void removeAccountFromList(account);
                          }}
                          className="bg-white/5 hover:bg-red-500 hover:text-white w-9 h-9 rounded-lg flex items-center justify-center transition-all shadow-md active:scale-90"
                        >
                          <Icons.Trash className="w-4.5 h-4.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {accounts.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 py-8">
                    <Icons.Person className="w-12 h-12 mb-3" />
                    <p className="font-black text-xs uppercase tracking-widest">
                      {t("no_account_found")}
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  playClick();
                  setAccountManagerOpen(false);
                }}
                className="w-full py-3 rounded-xl font-black text-sm transition-all hover:bg-white/5 border border-white/5 active:scale-[0.99]"
                style={{ color: colors.onSurface }}
              >
                {t("back_to_main")}
              </button>
            </div>
          </div>
        </div>
      )}

      {importModpackOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-5 animate-in fade-in duration-300">
          <div
            className="flex w-full max-w-[540px] flex-col overflow-hidden rounded-2xl border border-white/10"
            style={{ backgroundColor: colors.surface }}
          >
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
                    backgroundColor: colors.secondary,
                    color: "#1a1a1a",
                  }}
                >
                  <Icons.Download className="h-5.5 w-5.5 -rotate-180" />
                </div>
                <div>
                  <h2 className="text-base font-black tracking-tight" style={{ color: colors.onSurface }}>
                    {t("import_content")}
                  </h2>
                  <p className="text-xs opacity-75" style={{ color: colors.onSurfaceVariant }}>
                    {t("drag_and_drop_or_select")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setImportModpackOpen(false);
                  setIsDragging(false);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full border transition-all hover:bg-white/10"
                style={{
                  color: colors.onSurface,
                  borderColor: `${colors.onSurface}15`,
                  backgroundColor: colors.surfaceContainer,
                }}
                aria-label={t("close")}
              >
                <Icons.Close className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-6 flex flex-col gap-4">
              <div
                className={`relative border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center transition-all ${isDragging ? "scale-[1.02]" : "hover:border-yellow-500/30"}`}
                style={{
                  borderColor: isDragging ? colors.secondary : colors.onSurfaceVariant,
                  backgroundColor: isDragging
                    ? `${colors.secondary}15`
                    : colors.surfaceContainer,
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={async (e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const files = Array.from(e.dataTransfer.files);
                  const validFile = files.find(
                    (file) =>
                      file.name.endsWith(".zip") || file.name.endsWith(".mrpack"),
                  );
                  if (validFile) {
                    let filePath = (validFile as any).path;
                    if (window.api?.getPathForFile) {
                      try {
                        filePath = window.api.getPathForFile(validFile);
                      } catch (err) {
                        console.warn("Failed to get path via webUtils:", err);
                      }
                    }
                    if (filePath) {
                      setImportModpackOpen(false);
                      toast.success(`${t("importing")}: ${validFile.name}`);
                      try {
                        const result = await window.api?.modpackInstall?.(filePath);
                        if (result?.ok && result.instance) {
                          toast.success(t("install_complete"));
                        } else {
                          const errMsg = typeof result?.error === "string" ? result.error : "";
                          if (errMsg) {
                            toast.error(errMsg);
                          }
                        }
                      } catch (error: any) {
                        toast.error(error?.message || t("error_occurred"));
                      }
                    } else {
                      toast.error(t("cannot_read_file"));
                    }
                  } else {
                    toast.error(t("support_zip_mrpack"));
                  }
                }}
              >
                <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-3 transition-transform">
                  <Icons.Box
                    className="w-7 h-7 opacity-40"
                    style={{
                      color: isDragging ? colors.secondary : colors.onSurface,
                    }}
                  />
                </div>
                <p
                  className="text-base font-black tracking-tight"
                  style={{ color: colors.onSurface }}
                >
                  {isDragging ? t("drop_now_to_import") : t("drag_file_here")}
                </p>
                <p className="text-[10px] font-bold opacity-30 mt-1 uppercase tracking-widest">
                  {t("support_zip_mrpack")}
                </p>

                <button
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".zip,.mrpack";
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) {
                        let filePath = (file as any).path;
                        if (window.api?.getPathForFile) {
                          try {
                            filePath = window.api.getPathForFile(file);
                          } catch (err) {
                            console.warn("Failed to get path via webUtils:", err);
                          }
                        }
                        if (filePath) {
                          setImportModpackOpen(false);
                          toast.success(`${t("importing")}: ${file.name}`);
                          try {
                            const result = await window.api?.modpackInstall?.(filePath);
                            if (result?.ok && result.instance) {
                              toast.success(t("install_complete"));
                            } else {
                              const errMsg = typeof result?.error === "string" ? result.error : "";
                              if (errMsg) {
                                toast.error(errMsg);
                              }
                            }
                          } catch (error: any) {
                            toast.error(error?.message || t("error_occurred"));
                          }
                        } else {
                          toast.error(t("cannot_read_file"));
                        }
                      }
                    };
                    input.click();
                  }}
                  className="mt-4 px-6 py-2 rounded-xl font-black text-xs transition-all hover:scale-105 shadow-md"
                  style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                >
                  {t("select_file_from_machine")}
                </button>
              </div>

              <div className="flex gap-4">
                <div
                  className="flex-1 p-3 rounded-xl flex items-center gap-3 border border-white/5"
                  style={{ backgroundColor: colors.surfaceContainer }}
                >
                  <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500 font-black text-[10px]">
                    CF
                  </div>
                  <div>
                    <div
                      className="text-xs font-black"
                      style={{ color: colors.onSurface }}
                    >
                      CurseForge
                    </div>
                    <div className="text-[9px] opacity-40 uppercase font-bold">
                      Standard .ZIP
                    </div>
                  </div>
                </div>
                <div
                  className="flex-1 p-3 rounded-xl flex items-center gap-3 border border-white/5"
                  style={{ backgroundColor: colors.surfaceContainer }}
                >
                  <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500 font-black text-[10px]">
                    MR
                  </div>
                  <div>
                    <div
                      className="text-xs font-black"
                      style={{ color: colors.onSurface }}
                    >
                      Modrinth
                    </div>
                    <div className="text-[9px] opacity-40 uppercase font-bold">
                      Native .MRPACK
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
