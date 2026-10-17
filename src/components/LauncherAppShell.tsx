import React, { type Dispatch, type SetStateAction } from "react";
import { useUiStore } from "../store/uiStore";
import { createPortal } from "react-dom";
import toast, { Toaster } from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";

import { useMotionPreset } from "../lib/motion";
import { Sidebar } from "./layout/Sidebar";
import { ErrorBoundary as UIErrorBoundary } from "./ui/ErrorBoundary";
import { LauncherAppTitleBar } from "./LauncherAppTitleBar";
import { Home } from "./tabs/Home";
import { About, AdminPanel, Explore, ModPack, ServerMenu, SettingsDialog, TabLoadingFallback, Wardrobe, preloadTabs } from "./LauncherAppLazyTabs";
import type { AuthSession, GameInstance, LauncherConfig, NewsItem, Server } from "../types/launcher";
import type { TranslationKey } from "../i18n/translations";

type TranslationFn = (key: TranslationKey, params?: Record<string, any>) => string;
type SettingsTabId = "account" | "appearance" | "game" | "connections" | "language" | "launcher" | "resources" | "java" | "update";





function ToastCountdownBar({ duration, color, paused }: { duration: number; color: string; paused: boolean }) {
  return (
    <span
      className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-full origin-left opacity-70"
      style={{
        backgroundColor: color,
        animation: `toast-countdown ${duration}ms linear forwards`,
        animationPlayState: paused ? "paused" : "running",
      }}
    />
  );
}

function ToastCopyButton({ text, color }: { text: string; color: string }) {
  const [copied, setCopied] = React.useState(false);
  if (!text) return null;
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      title="คัดลอก"
      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-black/10 transition-colors cursor-pointer"
      style={{ color }}
    >
      {copied ? (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

/// Minimized install/export progress rendered as a toast entry (same portal,
/// stacking, and gutter spacing as the notification toasts) instead of a
/// separately-positioned fixed div — the two used to sit at the exact same
/// bottom-right corner and overlap whenever both were on screen at once.
function ProgressToastCard({
  colors,
  visible,
  percent,
  current,
  total,
  title,
  message,
  filename,
  onCancel,
  cancelLabel,
  minimizeLabel,
  expandLabel,
  detailsLabel,
  closeLabel,
}: {
  colors: any;
  visible: boolean;
  percent?: number;
  current?: number;
  total?: number;
  title: string;
  message: string;
  filename?: string;
  onCancel?: () => void;
  cancelLabel?: string;
  minimizeLabel?: string;
  expandLabel?: string;
  detailsLabel?: string;
  closeLabel?: string;
}) {
  const m = useMotionPreset();
  // Local UI state: this component keeps its identity while progress updates re-render it.
  const [minimized, setMinimized] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  // Running log of every step this operation reported, shown in the details popup.
  const [log, setLog] = React.useState<{ at: number; text: string }[]>([]);
  const logEndRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const text = filename && !message.includes(filename) ? `${message} — ${filename}` : message;
    if (!text) return;
    setLog((prev) => (prev[prev.length - 1]?.text === text ? prev : [...prev, { at: Date.now(), text }].slice(-300)));
  }, [message, filename]);
  React.useEffect(() => {
    if (detailsOpen) logEndRef.current?.scrollIntoView({ block: "end" });
  }, [detailsOpen, log]);
  const clock = (at: number) =>
    new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  const bar = (height: string) => (
    <div className={`${height} rounded-full overflow-hidden w-full relative`} style={{ backgroundColor: colors.surfaceContainerHighest }}>
      {percent !== undefined ? (
        // Full-width fill slid left by the remaining percent: animates transform, not width.
        <div
          className="h-full w-full rounded-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${Math.min(100, Math.max(0, percent)) - 100}%)`, backgroundColor: colors.secondary }}
        />
      ) : (
        <div className="absolute inset-y-0 left-0 w-1/3 animate-[shimmer_1.5s_infinite]" style={{ backgroundColor: colors.secondary }} />
      )}
    </div>
  );

  const spinner = (size: string) => (
    <div className={`animate-spin rounded-full ${size} border-[2.5px] border-t-transparent`} style={{ borderColor: colors.secondary, borderTopColor: "transparent" }} />
  );

  const iconButton = "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors hover:bg-black/10";

  return (
    <>
      <motion.div
        layout
        variants={m.toast}
        initial="hidden"
        animate={visible ? "show" : "exit"}
        exit="exit"
        className={`${minimized ? "w-72" : "w-95"} max-w-[calc(100vw-3rem)] rounded-2xl overflow-hidden`}
        style={{ backgroundColor: colors.surfaceContainerHigh || colors.surfaceContainer || "#1e1e1e" }}
      >
        {minimized ? (
          // Compact pill: spinner, short title, percent, thin bar underneath.
          <div>
            <div className="flex items-center gap-2.5 pl-3.5 pr-2 py-2.5">
              {spinner("h-4 w-4")}
              <p className="flex-1 min-w-0 text-sm font-semibold truncate" style={{ color: colors.onSurface }}>{title}</p>
              {percent !== undefined && (
                <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: colors.onSurface }}>{percent}%</span>
              )}
              <button type="button" onClick={() => setMinimized(false)} className={iconButton} style={{ color: colors.onSurfaceVariant }} title={expandLabel} aria-label={expandLabel}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
              </button>
            </div>
            {bar("h-1")}
          </div>
        ) : (
          <div className="p-3.5 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${colors.secondary}26` }}>
                {spinner("h-5 w-5")}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-[15px] leading-snug truncate" style={{ color: colors.onSurface }}>
                  {title}
                </h4>
                <p className="text-sm leading-snug mt-0.5 truncate" style={{ color: colors.onSurfaceVariant }} title={message}>
                  {message}
                </p>
              </div>
              {percent !== undefined && (
                <span className="font-display text-lg tabular-nums shrink-0" style={{ color: colors.onSurface }}>
                  {percent}%
                </span>
              )}
              <button type="button" onClick={() => setMinimized(true)} className={`${iconButton} self-start`} style={{ color: colors.onSurfaceVariant }} title={minimizeLabel} aria-label={minimizeLabel}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            </div>

            <div className="flex flex-col gap-1">
              {total ? (
                <span className="text-[13px] tabular-nums" style={{ color: colors.onSurfaceVariant }}>
                  {current ?? 0} / {total}
                </span>
              ) : null}
              {bar("h-2")}
            </div>

            <div className="flex items-center justify-between -mb-1">
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                className="text-sm font-semibold h-8 px-3 -ml-3 rounded-lg hover:bg-black/10 active:scale-95 transition-all"
                style={{ color: colors.onSurface }}
              >
                {detailsLabel}
              </button>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="text-sm font-semibold h-8 px-3 rounded-lg hover:bg-red-500/10 active:scale-95 transition-all"
                  style={{ color: colors.error || "#ef4444" }}
                >
                  {cancelLabel}
                </button>
              )}
            </div>
          </div>
        )}
      </motion.div>

      {/* Details popup: everything the card has no room for. */}
      {createPortal(
        <AnimatePresence>
        {detailsOpen && (
        <motion.div
          key="progress-details"
          className="fixed inset-0 z-10000 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          onClick={() => setDetailsOpen(false)}
          variants={m.modal.backdrop}
          {...m.states}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="w-full max-w-xl rounded-3xl p-7 shadow-2xl"
            style={{ backgroundColor: colors.surface }}
            onClick={(e) => e.stopPropagation()}
            variants={m.modal.panel}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${colors.secondary}26` }}>
                {spinner("h-6 w-6")}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display text-xl leading-tight" style={{ color: colors.onSurface }}>{title}</h3>
                <p className="text-[15px] mt-1 break-words" style={{ color: colors.onSurfaceVariant }}>{message}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                aria-label={closeLabel}
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition hover:brightness-110"
                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div className="mt-6 flex items-end justify-between">
              <span className="font-display text-4xl tabular-nums" style={{ color: colors.onSurface }}>
                {percent !== undefined ? `${percent}%` : "…"}
              </span>
              {total ? (
                <span className="text-base tabular-nums" style={{ color: colors.onSurfaceVariant }}>{current ?? 0} / {total}</span>
              ) : null}
            </div>
            <div className="mt-3">{bar("h-3")}</div>

            {filename && (
              <div className="mt-5 rounded-xl px-4 py-3" style={{ backgroundColor: colors.surfaceContainer }}>
                <p className="text-[13px]" style={{ color: colors.onSurfaceVariant }}>File</p>
                <p className="text-sm font-mono mt-0.5 break-all" style={{ color: colors.onSurface }}>{filename}</p>
              </div>
            )}

            {log.length > 0 && (
              <div className="mt-5">
                <p className="text-[13px] font-semibold mb-2" style={{ color: colors.onSurfaceVariant }}>Log</p>
                <div
                  className="max-h-56 overflow-y-auto rounded-xl px-4 py-3 font-mono text-xs leading-relaxed"
                  style={{ backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                >
                  {log.map((entry, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="shrink-0 tabular-nums" style={{ color: colors.onSurfaceVariant }}>{clock(entry.at)}</span>
                      <span className="min-w-0 break-all">{entry.text}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2.5">
              {onCancel && (
                <button
                  type="button"
                  onClick={() => { setDetailsOpen(false); onCancel(); }}
                  className="h-11 px-5 rounded-xl text-[15px] font-semibold transition hover:bg-red-500/15"
                  style={{ color: colors.error || "#ef4444" }}
                >
                  {cancelLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => { setDetailsOpen(false); setMinimized(true); }}
                className="h-11 px-5 rounded-xl text-[15px] font-semibold transition hover:brightness-105"
                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
              >
                {minimizeLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
        )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

interface LauncherAppShellProps {
  colors: any;
  titleBarColors: any;
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
  t: TranslationFn;
  selectAccount: (account: AuthSession) => void | Promise<void>;
  removeAccountFromList: (account: AuthSession) => void | Promise<void>;
  setLoginDialogOpen: (open: boolean) => void;
  setLinkCatIDOpen: Dispatch<SetStateAction<boolean>>;
  handleLinkMicrosoft: () => void | Promise<void>;
  handleLogout: () => void | Promise<void>;
  updateConfig: (updates: Partial<LauncherConfig>) => void | Promise<void>;
  contentTab: string;
  settingsDialogOpen: boolean;
  onCloseSettingsDialog: () => void;
  news: NewsItem[];
  servers: Server[];
  selectedServer: Server | null;
  setSelectedServer: (server: Server | null) => void;
  setSelectedInstance: Dispatch<SetStateAction<GameInstance | null>>;
  setActiveTab: (tab: string) => void;
  serverRefreshTrigger: number;
  settingsTab: SettingsTabId;
  setSettingsTab: (tab: SettingsTabId) => void;
  setImportModpackOpen: (open: boolean) => void;
  handleShowConfirm: (...args: any[]) => void;
  handleBrowseJava: () => void | Promise<void>;
  handleBrowseMinecraftDir: () => void | Promise<void>;
  handleUnlink: (provider: "catid" | "microsoft") => void | Promise<void>;
  isAdmin: boolean;
  adminToken: string | null;
  isInstalling: boolean;
  installProgress: any;
  operationType: string | null;
  handleCancelInstall: () => void | Promise<void>;
  handleRepair: (instanceId: string) => void | Promise<void>;
}

export function LauncherAppShell({
  colors, titleBarColors, config, session, accounts, selectedInstance, inboxOpen, setInboxOpen, announcements, userNotifications, unreadCount, setInvitations, setServerRefreshTrigger, setNotificationRefreshTrigger, accountDropdownOpen, setAccountDropdownOpen, t, selectAccount, removeAccountFromList, setLoginDialogOpen, setLinkCatIDOpen, handleLinkMicrosoft, handleLogout, updateConfig, contentTab, settingsDialogOpen, onCloseSettingsDialog, news, servers, selectedServer, setSelectedServer, setSelectedInstance, setActiveTab, serverRefreshTrigger, settingsTab, setSettingsTab, setImportModpackOpen, handleShowConfirm, handleBrowseJava, handleBrowseMinecraftDir, handleUnlink, isAdmin, adminToken, isInstalling, installProgress, operationType, handleCancelInstall, handleRepair,
}: LauncherAppShellProps) {
  const m = useMotionPreset();
  const mainRef = React.useRef<HTMLElement>(null);
  const [shouldRenderSettingsDialog, setShouldRenderSettingsDialog] = React.useState(false);
  const [hoveredToastId, setHoveredToastId] = React.useState<string | null>(null);
  const immersive = useUiStore((state) => state.immersive);
  const fullBleed = useUiStore((state) => state.fullBleed);
  const transparentTitleBarColors = React.useMemo(() => ({ ...titleBarColors, background: "transparent" }), [titleBarColors]);
  const immersiveTitleBarColors = React.useMemo(() => ({
    ...titleBarColors,
    background: "transparent",
    text: "#ffffff",
    muted: "rgba(255,255,255,0.8)",
    hover: "rgba(255,255,255,0.14)",
    active: "rgba(255,255,255,0.2)",
  }), [titleBarColors]);
  
  React.useEffect(() => {
    preloadTabs();
  }, []);

  React.useEffect(() => {
    if (settingsDialogOpen) setShouldRenderSettingsDialog(true);
  }, [settingsDialogOpen]);

  // Install/export progress renders as a toast entry (same portal, stacking,
  // and gutter spacing as notification toasts) instead of a blocking modal —
  // these keep a slot alive in react-hot-toast's own queue so its
  // stacking/gutter math accounts for it.
  //
  // react-hot-toast renders a `custom` toast by resolving its *message*
  // (`resolveValue(message, toast)`) and never invokes the <Toaster> children
  // render-prop for it — that render-prop only runs for built-in toast types.
  // So the progress card has to BE the custom toast's message. We pass a
  // function-message that reads live values off a ref (updated every render),
  // and toggle the slot on the boolean transition only so the enter animation
  // isn't reset ~60×/install.
  const progressRenderRef = React.useRef<{
    install: (visible: boolean) => React.ReactElement | null;
    export: (visible: boolean) => React.ReactElement | null;
  }>({ install: () => null, export: () => null });

  progressRenderRef.current.install = (visible: boolean) => {
    if (!(isInstalling && installProgress)) return null;
    const title =
      operationType === "repair"
        ? t("repairing_instance")
        : operationType === "sync"
          ? t("checking_data")
          : t("installing");
    const translated = installProgress.type
      ? t(installProgress.type as any, {
          filename: installProgress.filename,
          current: installProgress.current,
          total: installProgress.total,
        } as any)
      : "";
    // t() echoes unknown keys (e.g. "sync-complete"); fall back to the backend's own text.
    const message =
      translated && translated !== installProgress.type
        ? translated
        : installProgress.message || installProgress.task || installProgress.type || "";
    return (
      <ProgressToastCard
        colors={colors}
        visible={visible}
        percent={installProgress.percent}
        current={installProgress.current}
        total={installProgress.total}
        title={title}
        message={message}
        filename={installProgress.filename}
        onCancel={handleCancelInstall}
        cancelLabel={t("cancel")}
        minimizeLabel={t("minimize")}
        expandLabel={t("restore")}
        detailsLabel={t("view_details")}
        closeLabel={t("close")}
      />
    );
  };

  const installToastActive = isInstalling && !!installProgress;
  React.useEffect(() => {
    const id = "install-progress-toast";
    if (installToastActive) {
      toast.custom((tItem) => progressRenderRef.current.install(tItem.visible), {
        id,
        duration: Infinity,
      });
    } else {
      toast.dismiss(id);
    }
  }, [installToastActive]);

  return (
    <>
      {createPortal(
      <Toaster
        position="bottom-right"
        gutter={10}
        containerStyle={{ bottom: 24, right: 24 }}
      >
        {(toastItem) => {
          const messageText = typeof toastItem.message === "function" ? toastItem.message(toastItem) : toastItem.message;

          const getBorderLeftColor = () => {
            if (toastItem.type === "success") return "#22c55e";
            if (toastItem.type === "error") return "#ef4444";
            if (toastItem.type === "loading") return "#3b82f6";
            if (toastItem.icon === "⚠️") return "#eab308";
            return "#3b82f6";
          };

          const getTitle = () => {
            if (toastItem.type === "success") return toastItem.icon === "⚠️" ? t("toast_warning") : t("toast_success");
            if (toastItem.type === "error") return t("toast_error");
            if (toastItem.type === "loading") return t("toast_loading");
            if (toastItem.icon === "⚠️") return t("toast_warning");
            return t("toast_info");
          };

          const accent = getBorderLeftColor();
          const isWarning = toastItem.icon === "⚠️";
          const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

          // Line icon on a soft tinted tile in the toast's accent colour.
          const renderIcon = () => {
            if (toastItem.icon && !isWarning) {
              return typeof toastItem.icon === "string"
                ? <span className="text-lg leading-none">{toastItem.icon}</span>
                : toastItem.icon;
            }
            if (isWarning) {
              return (
                <svg className="w-5 h-5" viewBox="0 0 24 24" {...stroke}>
                  <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              );
            }
            switch (toastItem.type) {
              case "success":
                return (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" {...stroke}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                );
              case "error":
                return (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" {...stroke}>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                );
              case "loading":
                return <div className="w-5 h-5 rounded-full border-[2.5px] border-current border-t-transparent animate-spin" />;
              default:
                return (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" {...stroke}>
                    <line x1="12" y1="16" x2="12" y2="11" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                );
            }
          };

          return (
            <motion.div
              layout
              variants={m.toast}
              initial="hidden"
              animate={toastItem.visible ? "show" : "exit"}
              exit="exit"
              className="group flex items-center gap-3.5 p-3.5 pr-3 rounded-2xl backdrop-blur-xl w-95 max-w-[calc(100vw-3rem)] relative overflow-hidden"
              style={{
                backgroundColor: colors.surfaceContainerHigh || colors.surfaceContainer || "#1e1e1e",
              }}
              onMouseEnter={() => setHoveredToastId(toastItem.id)}
              onMouseLeave={() => setHoveredToastId((prev) => (prev === toastItem.id ? null : prev))}
            >
              <motion.div
                initial={m.reduced ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={m.reduced ? { duration: 0.12 } : { type: "spring", stiffness: 400, damping: 20, delay: 0.06 }}
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${accent}1f`, color: accent }}
              >
                {renderIcon()}
              </motion.div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] leading-snug" style={{ color: colors.onSurface }}>
                  {getTitle()}
                </div>
                <div className="text-sm leading-snug mt-0.5 break-words" style={{ color: colors.onSurfaceVariant }}>
                  {messageText}
                </div>
              </div>
              {toastItem.type !== "loading" && (
                <div className="flex items-center gap-0.5 self-start opacity-60 group-hover:opacity-100 transition-opacity">
                  <ToastCopyButton text={typeof messageText === "string" ? messageText : ""} color={colors.onSurfaceVariant} />
                  <button
                    onClick={() => toast.dismiss(toastItem.id)}
                    aria-label={t("close")}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-black/10 transition-colors cursor-pointer"
                    style={{ color: colors.onSurfaceVariant }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" {...stroke}>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              )}
              {toastItem.type !== "loading" && (
                <ToastCountdownBar
                  duration={toastItem.duration ?? 4000}
                  color={accent}
                  paused={hoveredToastId === toastItem.id}
                />
              )}
            </motion.div>
          );
        }}
      </Toaster>,
      document.body
      )}

      <div className={`flex-1 flex flex-col overflow-hidden ml-app-shell ${config.rainbowMode ? "rainbow-mode" : ""}`}>
        <div className="relative z-30">
        <LauncherAppTitleBar
          colors={colors} titleBarColors={titleBarColors} config={config} session={session} accounts={accounts} selectedInstance={selectedInstance} inboxOpen={inboxOpen} setInboxOpen={setInboxOpen} announcements={announcements} userNotifications={userNotifications} unreadCount={unreadCount} setInvitations={setInvitations} setServerRefreshTrigger={setServerRefreshTrigger} setNotificationRefreshTrigger={setNotificationRefreshTrigger} accountDropdownOpen={accountDropdownOpen} setAccountDropdownOpen={setAccountDropdownOpen} t={t} selectAccount={selectAccount} removeAccountFromList={removeAccountFromList} setLoginDialogOpen={setLoginDialogOpen} setLinkCatIDOpen={setLinkCatIDOpen} handleLinkMicrosoft={handleLinkMicrosoft} handleLogout={handleLogout} updateConfig={updateConfig}
          nav={<Sidebar colors={colors} onTabSelect={(tabId) => { if (tabId === "modpack") setSelectedInstance(null); }} />}
        />
        </div>

        <div className="relative flex-1 flex flex-col overflow-hidden -mt-10">
          <main
            ref={mainRef}
            className={`flex-1 overflow-y-auto overflow-x-hidden px-6 relative ${fullBleed ? "pt-3 pb-6" : "pt-13 pb-6"}`}
          >
            <div className="h-full">
              {/* Tab switch: quick fade-out, then the next page fades + rises 8px in (~250ms total).
                  mode="wait" is required: the outgoing page must unmount (running its
                  fullBleed/immersive cleanup) before the incoming page mounts and sets its own.
                  The shared <main> scroller is reset in between so a page never opens mid-scroll. */}
              <AnimatePresence mode="wait" onExitComplete={() => mainRef.current?.scrollTo({ top: 0 })}>
                <motion.div
                  key={contentTab}
                  variants={m.page}
                  {...m.states}
                  className="h-full"
                >
                  <React.Suspense fallback={<TabLoadingFallback colors={colors} />}>
                    {contentTab === "home" && <Home session={session} news={news} servers={servers} selectedServer={selectedServer} setSelectedServer={setSelectedServer} setSelectedInstance={setSelectedInstance} colors={colors} setActiveTab={setActiveTab} language={config.language} />}
                    {contentTab === "servers" && <ServerMenu colors={colors} servers={servers} selectedServer={selectedServer} setSelectedServer={setSelectedServer} session={session} setActiveTab={setActiveTab} refreshTrigger={serverRefreshTrigger} language={config.language} config={config} updateConfig={updateConfig} setSettingsTab={setSettingsTab} />}
                    {contentTab === "modpack" && <ModPack colors={colors} config={config} setImportModpackOpen={setImportModpackOpen} setActiveTab={setActiveTab} setSettingsTab={setSettingsTab} onShowConfirm={handleShowConfirm} isActive={true} selectedInstance={selectedInstance} setSelectedInstance={setSelectedInstance} selectedServer={selectedServer} session={session} updateConfig={updateConfig} language={config.language} handleRepair={handleRepair} />}
                    {contentTab === "explore" && <UIErrorBoundary><Explore colors={colors} config={config} /></UIErrorBoundary>}
                    {contentTab === "admin" && isAdmin && adminToken && <AdminPanel colors={colors} adminToken={adminToken} language={config.language} />}
                    {contentTab === "about" && <About colors={colors} config={config} />}
                    {contentTab === "wardrobe" && (
                      <Wardrobe
                        colors={colors}
                        selectedInstance={selectedInstance}
                        onLinkMicrosoft={handleLinkMicrosoft}
                        setLoginDialogOpen={setLoginDialogOpen}
                      />
                    )}
                  </React.Suspense>
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>

      {shouldRenderSettingsDialog && (
        <React.Suspense fallback={settingsDialogOpen ? <TabLoadingFallback colors={colors} /> : null}>
          <SettingsDialog
            isOpen={settingsDialogOpen}
            onClose={onCloseSettingsDialog}
            config={config}
            updateConfig={updateConfig}
            colors={colors}
            setSettingsTab={setSettingsTab}
            settingsTab={settingsTab}
            handleBrowseJava={handleBrowseJava}
            handleBrowseMinecraftDir={handleBrowseMinecraftDir}
            session={session}
            accounts={accounts}
            handleLogout={handleLogout}
            selectAccount={selectAccount}
            removeAccount={removeAccountFromList}
            setLoginDialogOpen={setLoginDialogOpen}
            handleUnlink={handleUnlink}
            setLinkCatIDOpen={setLinkCatIDOpen}
            onLinkMicrosoft={handleLinkMicrosoft}
          />
        </React.Suspense>
      )}

    </>
  );
}
