import type { Dispatch, SetStateAction } from "react";

import { toast } from "react-hot-toast";

import { ChangelogModal } from "./ui/ChangelogModal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { LoginModal } from "./auth/LoginModal";
import { OfflineLoginModal } from "./auth/OfflineLoginModal";
import { CatIDLoginModal } from "./auth/CatIDLoginModal";
import { MicrosoftVerificationModal } from "./auth/MicrosoftVerificationModal";
import { MCHead } from "./ui/MCHead";
import { Icons } from "./ui/Icons";
import type { AuthSession } from "../types/launcher";
import type { TranslationKey } from "../i18n/translations";
import { playClick } from "../lib/sounds";

interface LauncherPalette {
  primary: string;
  secondary: string;
  surface: string;
  surfaceContainer: string;
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
  offlineUsernameOpen: boolean;
  setOfflineUsernameOpen: Dispatch<SetStateAction<boolean>>;
  catIDLoginOpen: boolean;
  setCatIDLoginOpen: Dispatch<SetStateAction<boolean>>;
  deviceCodeModalOpen: boolean;
  setDeviceCodeModalOpen: Dispatch<SetStateAction<boolean>>;
  deviceCodeData: DeviceCodeData | null;
  setDeviceCodeData: Dispatch<SetStateAction<DeviceCodeData | null>>;
  setDeviceCodeError: Dispatch<SetStateAction<string | null>>;
  setDeviceCodePolling: Dispatch<SetStateAction<boolean>>;
  setIsLinkingMicrosoft: Dispatch<SetStateAction<boolean>>;
  handleOfflineLogin: (username: string) => Promise<boolean>;
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
  offlineUsernameOpen,
  setOfflineUsernameOpen,
  catIDLoginOpen,
  setCatIDLoginOpen,
  deviceCodeModalOpen,
  setDeviceCodeModalOpen,
  deviceCodeData,
  setDeviceCodeData,
  setDeviceCodeError,
  setDeviceCodePolling,
  setIsLinkingMicrosoft,
  handleOfflineLogin,
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
          setLoginDialogOpen(false);
          if (window.api?.startDeviceCodeAuth) {
            try {
              const toastId = toast.loading(t("requesting_login_code"));
              const result = await window.api.startDeviceCodeAuth();
              toast.dismiss(toastId);
              if (!result.ok || !result.deviceCode || !result.userCode) {
                toast.error(result.error || t("request_code_failed"));
                return;
              }
              setDeviceCodeData({
                deviceCode: result.deviceCode,
                userCode: result.userCode,
                verificationUri:
                  result.verificationUri || "https://microsoft.com/devicelogin",
                expiresAt: Date.now() + (result.expiresIn || 900) * 1000,
              });
              setDeviceCodeError(null);
              setDeviceCodeModalOpen(true);
              setDeviceCodePolling(true);
            } catch (error) {
              console.error("[Auth] Error starting device code flow:", error);
              toast.error(t("start_login_failed"));
            }
          } else {
            toast.error(t("ms_login_requires_electron"));
          }
        }}
        onCatIDLogin={() => {
          setLoginDialogOpen(false);
          setCatIDLoginOpen(true);
        }}
        onOfflineLogin={() => {
          setLoginDialogOpen(false);
          setOfflineUsernameOpen(true);
        }}
        colors={colors}
      />

      <OfflineLoginModal
        isOpen={offlineUsernameOpen}
        onClose={() => setOfflineUsernameOpen(false)}
        onLogin={async (username) => {
          const ok = await handleOfflineLogin(username);
          if (ok) setOfflineUsernameOpen(false);
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div
            className="flex w-full max-w-2xl h-[520px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden"
            style={{ backgroundColor: colors.surface }}
          >
            <div
              className="w-[35%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5"
              style={{ backgroundColor: `${"#8b5cf6"}10` }}
            >
              <div className="absolute top-0 left-0 w-full h-full bg-linear-to-b from-purple-500/10 to-transparent pointer-events-none" />
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-purple-500/30 z-10"
                style={{ backgroundColor: "#8b5cf6" }}
              >
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="#ffffff">
                  <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
              <h2
                className="text-2xl font-black tracking-tighter text-center z-10"
                style={{ color: colors.onSurface }}
              >
                {t("join_the_journey")}
              </h2>
              <div
                className="mt-2 px-3 py-1 rounded-full bg-purple-500/20 text-[10px] font-black uppercase tracking-widest z-10"
                style={{ color: "#8b5cf6" }}
              >
                {t("create_new_id")}
              </div>
              <p
                className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10"
                style={{ color: colors.onSurface }}
              >
                {t("create_your_identity_catlab")}
              </p>
            </div>

            <div className="flex-1 p-10 flex flex-col relative">
              <button
                onClick={() => setCatIDRegisterOpen(false)}
                className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors z-20"
                style={{ color: colors.onSurfaceVariant }}
              >
                <Icons.Close className="w-6 h-6" />
              </button>

              <div className="mb-6">
                <h3
                  className="text-2xl font-black tracking-tight"
                  style={{ color: colors.onSurface }}
                >
                  {t("create_new_account")}
                </h3>
                <p
                  className="text-sm font-medium opacity-60"
                  style={{ color: colors.onSurfaceVariant }}
                >
                  {t("start_new_journey")}
                </p>
              </div>

              <div className="space-y-3.5 flex-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label
                      className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider"
                      style={{ color: colors.onSurface }}
                    >
                      {t("username")}
                    </label>
                    <input
                      id="catid-reg-username"
                      type="text"
                      placeholder={t("username_placeholder")}
                      className="w-full px-4 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-purple-500/10"
                      style={{
                        borderColor: "transparent",
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
                    <label
                      className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider"
                      style={{ color: colors.onSurface }}
                    >
                      {t("email")}
                    </label>
                    <input
                      id="catid-reg-email"
                      type="email"
                      placeholder={t("email")}
                      className="w-full px-4 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-purple-500/10"
                      style={{
                        borderColor: "transparent",
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
                  <label
                    className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider"
                    style={{ color: colors.onSurface }}
                  >
                    {t("password")}
                  </label>
                  <input
                    id="catid-reg-password"
                    type="password"
                    placeholder={t("password")}
                    className="w-full px-5 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-purple-500/10"
                    style={{
                      borderColor: "transparent",
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
                  <label
                    className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider"
                    style={{ color: colors.onSurface }}
                  >
                    {t("confirm_password")}
                  </label>
                  <input
                    id="catid-reg-confirm"
                    type="password"
                    placeholder={t("confirm_password")}
                    className="w-full px-5 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-purple-500/10"
                    style={{
                      borderColor: "transparent",
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
              </div>

              <div className="flex flex-col gap-3 mt-8">
                <button
                  onClick={() => void handleCatIDRegister()}
                  disabled={isRegistering}
                  className="w-full py-4 rounded-2xl font-black text-lg transition-all hover:scale-[1.02] shadow-lg shadow-purple-500/20 disabled:opacity-50"
                  style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
                >
                  {t("register_now")}
                </button>
                <button
                  onClick={() => {
                    setCatIDRegisterOpen(false);
                    setCatIDLoginOpen(true);
                  }}
                  className="w-full py-3 rounded-2xl font-bold opacity-60 hover:opacity-100 transition-all text-sm"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div
            className="w-full max-w-md rounded-4xl shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden p-8"
            style={{ backgroundColor: colors.surface }}
          >
            <div className="flex-1 p-10 flex flex-col items-center justify-center text-center">
              <div
                className="w-20 h-20 rounded-4xl flex items-center justify-center mb-8 relative"
                style={{ backgroundColor: `${colors.secondary}20` }}
              >
                <Icons.Email
                  className="w-10 h-10 animate-bounce"
                  style={{ color: colors.secondary }}
                />
                <div
                  className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center animate-pulse"
                  style={{ backgroundColor: colors.secondary }}
                >
                  <Icons.Timer
                    className="w-3.5 h-3.5"
                    style={{ color: "#1a1a1a" }}
                  />
                </div>
              </div>

              <h3
                className="text-3xl font-black tracking-tight mb-4"
                style={{ color: colors.onSurface }}
              >
                {t("verification_waiting")}
              </h3>

              <div className="space-y-4 max-w-sm">
                <p
                  className="text-base font-medium opacity-80"
                  style={{ color: colors.onSurface }}
                >
                  {t("verification_check_email")}
                </p>
                <div className="px-4 py-3 rounded-2xl bg-white/5 border border-white/5">
                  <span
                    className="text-sm font-black opacity-40 mr-2"
                    style={{ color: colors.onSurface }}
                  >
                    EMAIL:
                  </span>
                  <span
                    className="text-sm font-bold"
                    style={{ color: colors.secondary }}
                  >
                    {verificationEmail}
                  </span>
                </div>
                <p
                  className="text-xs opacity-50 leading-relaxed"
                  style={{ color: colors.onSurfaceVariant }}
                >
                  {t("verification_spam_hint")}
                </p>
              </div>

              <div className="w-full h-px my-10 bg-white/5" />

              <div className="flex flex-col gap-3 w-full">
                <button
                  onClick={() => void handleManualVerificationCheck()}
                  className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-yellow-500/10"
                  style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                >
                  {t("verification_confirm_btn")}
                </button>

                <button
                  onClick={() => {
                    setVerificationWaiting(false);
                    setVerificationToken(null);
                  }}
                  className="w-full py-4 rounded-2xl font-bold text-sm opacity-50 hover:opacity-100 hover:bg-white/5 transition-all"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div
            className="flex w-full max-w-2xl h-[480px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden"
            style={{ backgroundColor: colors.surface }}
          >
            <div
              className="w-[38%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5"
              style={{ backgroundColor: `${colors.secondary}10` }}
            >
              <div className="absolute top-0 left-0 w-full h-full bg-linear-to-b from-yellow-500/10 to-transparent pointer-events-none" />
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-yellow-500/30 z-10"
                style={{ backgroundColor: colors.secondary }}
              >
                {forgotPasswordStep === "email" ? (
                  <Icons.Info className="w-10 h-10 text-black" />
                ) : (
                  <Icons.Key className="w-10 h-10 text-black" />
                )}
              </div>
              <h2
                className="text-2xl font-black tracking-tighter text-center z-10"
                style={{ color: colors.onSurface }}
              >
                {forgotPasswordStep === "email"
                  ? t("recovery_id")
                  : t("reset_password")}
              </h2>
              <div
                className="mt-2 px-3 py-1 rounded-full bg-yellow-500/20 text-[10px] font-black uppercase tracking-widest z-10"
                style={{ color: colors.secondary }}
              >
                {t("support_team")}
              </div>
              <p
                className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10"
                style={{ color: colors.onSurface }}
              >
                {forgotPasswordStep === "email"
                  ? t("forgot_password_desc")
                  : t("check_email_otp")}
              </p>
            </div>

            <div className="flex-1 p-10 flex flex-col relative justify-center">
              <button
                onClick={() => {
                  setForgotPasswordOpen(false);
                  setForgotPasswordStep("email");
                  setForgotPasswordEmail("");
                  setForgotPasswordOtp("");
                  setForgotPasswordNewPassword("");
                }}
                className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors z-20"
                style={{ color: colors.onSurfaceVariant }}
              >
                <Icons.Close className="w-6 h-6" />
              </button>

              {forgotPasswordStep === "email" ? (
                <>
                  <div className="mb-6">
                    <h3
                      className="text-2xl font-black tracking-tight"
                      style={{ color: colors.onSurface }}
                    >
                      {t("forgot_password_title")}
                    </h3>
                    <p
                      className="text-sm font-medium opacity-60"
                      style={{ color: colors.onSurfaceVariant }}
                    >
                      {t("enter_email_recovery")}
                    </p>
                  </div>

                  <div className="space-y-4 w-full">
                    <div className="space-y-1.5">
                      <label
                        className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider"
                        style={{ color: colors.onSurface }}
                      >
                        {t("email")}
                      </label>
                      <input
                        type="email"
                        value={forgotPasswordEmail}
                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        placeholder={t("email_placeholder")}
                        className="w-full px-5 py-3.5 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-yellow-500/10"
                        style={{
                          borderColor: "transparent",
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
                      className="w-full py-4 rounded-2xl font-black text-lg transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-yellow-500/20 disabled:opacity-50"
                      style={{
                        backgroundColor: colors.secondary,
                        color: colors.onPrimary,
                      }}
                    >
                      {isForgotPasswordLoading ? t("sending") : t("send_otp")}
                    </button>

                    <button
                      onClick={() => {
                        setForgotPasswordOpen(false);
                        setCatIDLoginOpen(true);
                      }}
                      className="w-full py-2 font-bold opacity-60 hover:opacity-100 transition-all text-sm"
                      style={{ color: colors.onSurface }}
                    >
                      {t("back_to_login")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4">
                    <h3
                      className="text-xl font-black tracking-tight"
                      style={{ color: colors.onSurface }}
                    >
                      {t("set_new_password")}
                    </h3>
                    <p
                      className="text-xs font-medium opacity-60"
                      style={{ color: colors.onSurfaceVariant }}
                    >
                      {t("sent_to")}{" "}
                      <span style={{ color: colors.secondary }}>
                        {forgotPasswordEmail}
                      </span>
                    </p>
                  </div>

                  <div className="space-y-3 w-full">
                    <div className="space-y-1">
                      <label
                        className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider"
                        style={{ color: colors.onSurface }}
                      >
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
                        className="w-full px-5 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-yellow-500/10 tracking-widest font-mono text-center text-xl"
                        style={{
                          borderColor: "transparent",
                          backgroundColor: colors.surfaceContainer,
                          color: colors.secondary,
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider"
                        style={{ color: colors.onSurface }}
                      >
                        {t("new_password")}
                      </label>
                      <input
                        type="password"
                        value={forgotPasswordNewPassword}
                        onChange={(e) =>
                          setForgotPasswordNewPassword(e.target.value)
                        }
                        placeholder={t("password_placeholder")}
                        className="w-full px-5 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-yellow-500/10"
                        style={{
                          borderColor: "transparent",
                          backgroundColor: colors.surfaceContainer,
                          color: colors.onSurface,
                        }}
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider"
                        style={{ color: colors.onSurface }}
                      >
                        {t("confirm_password")}
                      </label>
                      <input
                        type="password"
                        value={forgotPasswordConfirmNewPassword}
                        onChange={(e) =>
                          setForgotPasswordConfirmNewPassword(e.target.value)
                        }
                        placeholder={t("confirm_password")}
                        className="w-full px-5 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-yellow-500/10"
                        style={{
                          borderColor: "transparent",
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
                      className="w-full py-4 rounded-2xl font-black text-lg transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-yellow-500/20 disabled:opacity-50 mt-2"
                      style={{
                        backgroundColor: colors.secondary,
                        color: colors.onPrimary,
                      }}
                    >
                      {isForgotPasswordLoading
                        ? t("processing")
                        : t("reset_password")}
                    </button>

                    <button
                      onClick={() => setForgotPasswordStep("email")}
                      className="w-full py-1 font-bold opacity-60 hover:opacity-100 transition-all text-xs"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div
            className="flex w-full max-w-2xl h-[450px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden"
            style={{ backgroundColor: colors.surface }}
          >
            <div
              className="w-[38%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5"
              style={{ backgroundColor: `${colors.secondary}10` }}
            >
              <div className="absolute top-0 left-0 w-full h-full bg-linear-to-b from-yellow-500/10 to-transparent pointer-events-none" />
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-yellow-500/30 z-10"
                style={{ backgroundColor: colors.secondary }}
              >
                <Icons.Refresh
                  className="w-10 h-10"
                  style={{ color: colors.onPrimary }}
                />
              </div>
              <h2
                className="text-2xl font-black tracking-tighter text-center z-10"
                style={{ color: colors.onSurface }}
              >
                {t("connect_account")}
              </h2>
              <div
                className="mt-2 px-3 py-1 rounded-full bg-yellow-500/20 text-[10px] font-black uppercase tracking-widest z-10"
                style={{ color: colors.secondary }}
              >
                {t("sync_account")}
              </div>
              <p
                className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10"
                style={{ color: colors.onSurface }}
              >
                {t("sync_progress")}
              </p>
            </div>

            <div className="flex-1 p-10 flex flex-col relative">
              <button
                onClick={() => setLinkCatIDOpen(false)}
                className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors z-20"
                style={{ color: colors.onSurfaceVariant }}
              >
                <Icons.Close className="w-6 h-6" />
              </button>

              <div className="mb-8">
                <h3
                  className="text-2xl font-black tracking-tight"
                  style={{ color: colors.onSurface }}
                >
                  {t("connect_with_catid")}
                </h3>
                <p
                  className="text-sm font-medium opacity-60"
                  style={{ color: colors.onSurfaceVariant }}
                >
                  {t("enter_catid_password_to_connect")}
                </p>
              </div>

              <div className="space-y-4 flex-1">
                <div className="space-y-1.5">
                  <label
                    className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider"
                    style={{ color: colors.onSurface }}
                  >
                    {t("catid_username")}
                  </label>
                  <input
                    id="link-catid-username"
                    type="text"
                    placeholder={t("catid_username")}
                    className="w-full px-5 py-3.5 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-yellow-500/10"
                    style={{
                      borderColor: "transparent",
                      backgroundColor: colors.surfaceContainer,
                      color: colors.onSurface,
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider"
                    style={{ color: colors.onSurface }}
                  >
                    {t("password")}
                  </label>
                  <div className="relative">
                    <input
                      id="link-catid-password"
                      type={showLinkPassword ? "text" : "password"}
                      placeholder={t("password")}
                      className="w-full px-5 py-3.5 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-yellow-500/10 pr-12"
                      style={{
                        borderColor: "transparent",
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
                className="w-full py-4 rounded-2xl font-black text-lg transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-yellow-500/20 mt-8"
                style={{
                  backgroundColor: colors.secondary,
                  color: colors.onPrimary,
                }}
              >
                {t("connect_now")}
              </button>
            </div>
          </div>
        </div>
      )}

      {accountManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div
            className="flex w-full max-w-3xl h-[600px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden"
            style={{ backgroundColor: colors.surface }}
          >
            <div
              className="w-[30%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5"
              style={{ backgroundColor: `${colors.secondary}10` }}
            >
              <div className="absolute top-0 left-0 w-full h-full bg-linear-to-b from-yellow-500/10 to-transparent pointer-events-none" />
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-yellow-500/30 z-10"
                style={{ backgroundColor: colors.secondary }}
              >
                <Icons.Person
                  className="w-10 h-10"
                  style={{ color: "#1a1a1a" }}
                />
              </div>
              <h2
                className="text-2xl font-black tracking-tighter text-center z-10"
                style={{ color: colors.onSurface }}
              >
                {t("account_manager")}
              </h2>
              <div
                className="mt-2 px-3 py-1 rounded-full bg-yellow-500/20 text-[10px] font-black uppercase tracking-widest z-10"
                style={{ color: colors.secondary }}
              >
                {t("account_management")}
              </div>
              <p
                className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10"
                style={{ color: colors.onSurface }}
              >
                {t("manage_accounts_hint")}
              </p>
            </div>

            <div className="flex-1 p-10 flex flex-col relative">
              <button
                onClick={() => setAccountManagerOpen(false)}
                className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors z-20"
                style={{ color: colors.onSurfaceVariant }}
              >
                <Icons.Close className="w-6 h-6" />
              </button>

              <div className="mb-8">
                <h3
                  className="text-2xl font-black tracking-tight"
                  style={{ color: colors.onSurface }}
                >
                  {t("account_manager")}
                </h3>
                <p
                  className="text-sm font-medium opacity-60"
                  style={{ color: colors.onSurfaceVariant }}
                >
                  {t("manage_accounts_desc")}
                </p>
              </div>

              <div className="space-y-3 flex-1 overflow-y-auto px-1 custom-scrollbar mb-6">
                {accounts.map((account, index) => {
                  const isActive =
                    session?.username === account.username &&
                    session?.type === account.type;
                  return (
                    <div
                      key={`${account.type}-${account.username}-${index}`}
                      className="group flex items-center gap-4 p-4 rounded-3xl transition-all border-2 relative overflow-hidden"
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
                          size={54}
                          className="rounded-2xl shadow-lg border-2 border-white/5"
                        />
                        {isActive && (
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 border-4 border-[#1e1e2e] flex items-center justify-center shadow-lg">
                            <Icons.Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div
                          className="font-black text-lg flex items-center gap-2"
                          style={{ color: colors.onSurface }}
                        >
                          <span className="truncate">{account.username}</span>
                          {account.isAdmin && (
                            <div className="bg-yellow-500/20 px-2 py-0.5 rounded text-[10px] font-black text-yellow-500 uppercase">
                              {t("admin")}
                            </div>
                          )}
                        </div>
                        <div
                          className="text-xs font-bold uppercase tracking-widest opacity-30 mt-0.5"
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
                            className="bg-white/5 hover:bg-yellow-500 hover:text-black w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-lg active:scale-90"
                          >
                            <Icons.Play className="w-5 h-5 ml-0.5" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            playClick();
                            void removeAccountFromList(account);
                          }}
                          className="bg-white/5 hover:bg-red-500 hover:text-white w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-lg active:scale-90"
                        >
                          <Icons.Trash className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {accounts.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 py-12">
                    <Icons.Person className="w-16 h-16 mb-4" />
                    <p className="font-black uppercase tracking-widest">
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
                className="w-full py-4 rounded-2xl font-black text-lg transition-all hover:bg-white/5 border-2 border-white/5 active:scale-[0.98]"
                style={{ color: colors.onSurface }}
              >
                {t("back_to_main")}
              </button>
            </div>
          </div>
        </div>
      )}

      {importModpackOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div
            className="flex w-full max-w-3xl h-[520px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden"
            style={{ backgroundColor: colors.surface }}
          >
            <div
              className="w-[32%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5"
              style={{ backgroundColor: `${colors.secondary}10` }}
            >
              <div className="absolute top-0 left-0 w-full h-full bg-linear-to-b from-yellow-500/10 to-transparent pointer-events-none" />
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-yellow-500/30 z-10"
                style={{ backgroundColor: colors.secondary }}
              >
                <Icons.Download
                  className="w-10 h-10 -rotate-180"
                  style={{ color: "#1a1a1a" }}
                />
              </div>
              <h2
                className="text-2xl font-black tracking-tighter text-center z-10"
                style={{ color: colors.onSurface }}
              >
                {t("import")}
              </h2>
              <div
                className="mt-2 px-3 py-1 rounded-full bg-yellow-500/20 text-[10px] font-black uppercase tracking-widest z-10"
                style={{ color: colors.secondary }}
              >
                {t("modpacks")}
              </div>
              <p
                className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10"
                style={{ color: colors.onSurface }}
              >
                {t("expand_your_world")}
              </p>
            </div>

            <div className="flex-1 p-10 flex flex-col relative">
              <button
                onClick={() => {
                  setImportModpackOpen(false);
                  setIsDragging(false);
                }}
                className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors z-20"
                style={{ color: colors.onSurfaceVariant }}
              >
                <Icons.Close className="w-6 h-6" />
              </button>

              <div className="mb-6">
                <h3
                  className="text-2xl font-black tracking-tight"
                  style={{ color: colors.onSurface }}
                >
                  {t("import_content")}
                </h3>
                <p
                  className="text-sm font-medium opacity-60"
                  style={{ color: colors.onSurfaceVariant }}
                >
                  {t("drag_and_drop_or_select")}
                </p>
              </div>

              <div
                className={`relative flex-1 border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center transition-all ${isDragging ? "scale-105" : "hover:border-yellow-500/30"}`}
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
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const files = Array.from(e.dataTransfer.files);
                  const validFile = files.find(
                    (file) =>
                      file.name.endsWith(".zip") || file.name.endsWith(".mrpack"),
                  );
                  if (validFile) {
                    toast.success(`${t("importing")}: ${validFile.name}`);
                    setImportModpackOpen(false);
                  } else {
                    toast.error(t("support_zip_mrpack"));
                  }
                }}
              >
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Icons.Box
                    className="w-10 h-10 opacity-40"
                    style={{
                      color: isDragging ? colors.secondary : colors.onSurface,
                    }}
                  />
                </div>
                <p
                  className="text-lg font-black tracking-tight"
                  style={{ color: colors.onSurface }}
                >
                  {isDragging ? t("drop_now_to_import") : t("drag_file_here")}
                </p>
                <p className="text-xs font-bold opacity-30 mt-1 uppercase tracking-widest">
                  {t("support_zip_mrpack")}
                </p>

                <button
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".zip,.mrpack";
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) {
                        toast.success(`${t("importing")}: ${file.name}`);
                        setImportModpackOpen(false);
                      }
                    };
                    input.click();
                  }}
                  className="mt-6 px-8 py-3 rounded-2xl font-black text-sm transition-all hover:scale-105 shadow-xl"
                  style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                >
                  {t("select_file_from_machine")}
                </button>
              </div>

              <div className="mt-6 flex gap-4">
                <div
                  className="flex-1 p-3 rounded-2xl flex items-center gap-3 border border-white/5"
                  style={{ backgroundColor: colors.surfaceContainer }}
                >
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 font-black text-xs">
                    CF
                  </div>
                  <div>
                    <div
                      className="text-xs font-black"
                      style={{ color: colors.onSurface }}
                    >
                      CurseForge
                    </div>
                    <div className="text-[10px] opacity-40 uppercase font-bold">
                      Standard .ZIP
                    </div>
                  </div>
                </div>
                <div
                  className="flex-1 p-3 rounded-2xl flex items-center gap-3 border border-white/5"
                  style={{ backgroundColor: colors.surfaceContainer }}
                >
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500 font-black text-xs">
                    MR
                  </div>
                  <div>
                    <div
                      className="text-xs font-black"
                      style={{ color: colors.onSurface }}
                    >
                      Modrinth
                    </div>
                    <div className="text-[10px] opacity-40 uppercase font-bold">
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
