import React, { type Dispatch, type SetStateAction } from "react";
import toast, { Toaster } from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";

import { Sidebar } from "./layout/Sidebar";
import { ErrorBoundary as UIErrorBoundary } from "./ui/ErrorBoundary";
import { LauncherAppTitleBar } from "./LauncherAppTitleBar";
import { Home } from "./tabs/Home";
import { About, AdminPanel, Explore, ModPack, ServerMenu, SettingsDialog, TabLoadingFallback, Wardrobe } from "./LauncherAppLazyTabs";
import { InstallProgressModal } from "./tabs/ModPackTabs/InstallProgressModal";
import type { AuthSession, GameInstance, LauncherConfig, NewsItem, Server } from "../types/launcher";
import type { TranslationKey } from "../i18n/translations";

type TranslationFn = (key: TranslationKey, params?: Record<string, any>) => string;
type SettingsTabId = "account" | "appearance" | "game" | "connections" | "language" | "launcher" | "resources" | "java" | "update";

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
  isExporting: boolean;
  exportProgress: any;
  isExportMinimized: boolean;
  setExportMinimized: (value: boolean) => void;
  handleCancelExport: (instanceId: string) => void | Promise<void>;
  exportingInstanceId: string | null;
  isInstalling: boolean;
  installProgress: any;
  isInstallMinimized: boolean;
  setInstallMinimized: (value: boolean) => void;
  operationType: string | null;
  handleCancelInstall: () => void | Promise<void>;
  handleRepair: (instanceId: string) => void | Promise<void>;
}

export function LauncherAppShell({
  colors, titleBarColors, config, session, accounts, selectedInstance, inboxOpen, setInboxOpen, announcements, userNotifications, unreadCount, setInvitations, setServerRefreshTrigger, setNotificationRefreshTrigger, accountDropdownOpen, setAccountDropdownOpen, t, selectAccount, removeAccountFromList, setLoginDialogOpen, setLinkCatIDOpen, handleLinkMicrosoft, handleLogout, updateConfig, contentTab, settingsDialogOpen, onCloseSettingsDialog, news, servers, selectedServer, setSelectedServer, setSelectedInstance, setActiveTab, serverRefreshTrigger, settingsTab, setSettingsTab, setImportModpackOpen, handleShowConfirm, handleBrowseJava, handleBrowseMinecraftDir, handleUnlink, isAdmin, adminToken, isExporting, exportProgress, isExportMinimized, setExportMinimized, handleCancelExport, exportingInstanceId, isInstalling, installProgress, isInstallMinimized, setInstallMinimized, operationType, handleCancelInstall, handleRepair,
}: LauncherAppShellProps) {
  const [shouldRenderSettingsDialog, setShouldRenderSettingsDialog] = React.useState(false);
  React.useEffect(() => {
    if (settingsDialogOpen) setShouldRenderSettingsDialog(true);
  }, [settingsDialogOpen]);

  return (
    <>
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

          const renderIcon = () => {
            if (toastItem.icon) {
              if (typeof toastItem.icon === "string") {
                if (toastItem.icon === "⚠️") {
                  return (
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L1 21h22L12 2zm1 14h-2v-2h2v2zm0-4h-2V8h2v4z" />
                      </svg>
                    </div>
                  );
                }
                return <span className="text-base leading-none shrink-0">{toastItem.icon}</span>;
              }
              return <div className="shrink-0">{toastItem.icon}</div>;
            }

            switch (toastItem.type) {
              case "success":
                return (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#22c55e" }}>
                    <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                );
              case "error":
                return (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#ef4444" }}>
                    <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </div>
                );
              case "loading":
                return (
                  <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin shrink-0" style={{ borderColor: "#3b82f6", borderTopColor: "transparent" }} />
                );
              default:
                return (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#3b82f6" }}>
                    <span className="text-white text-[10px] font-black leading-none select-none">i</span>
                  </div>
                );
            }
          };

          return (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.85, y: 30 }}
              animate={{
                opacity: toastItem.visible ? 1 : 0,
                scale: toastItem.visible ? 1 : 0.85,
                y: toastItem.visible ? 0 : 20,
              }}
              exit={{ opacity: 0, scale: 0.85, y: 20 }}
              transition={{
                type: "spring",
                stiffness: 160,
                damping: 15,
                mass: 0.8
              }}
              className="flex items-start gap-3.5 p-4 rounded-xl shadow-2xl border max-w-sm w-[350px] relative overflow-hidden"
              style={{
                backgroundColor: colors.surfaceContainerHigh || colors.surfaceContainer || "#1e1e1e",
                borderColor: `${colors.outline}15` || "rgba(255, 255, 255, 0.08)",
                borderLeft: `4px solid ${getBorderLeftColor()}`,
              }}
            >
              <motion.div
                initial={{ scale: 0, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 15,
                  delay: 0.08
                }}
                className="mt-0.5 shrink-0"
              >
                {renderIcon()}
              </motion.div>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div 
                  className="font-bold text-sm leading-tight" 
                  style={{ color: colors.onSurface }}
                >
                  {getTitle()}
                </div>
                <div 
                  className="text-xs font-medium leading-normal break-words" 
                  style={{ color: colors.onSurfaceVariant }}
                >
                  {messageText}
                </div>
              </div>
              {toastItem.type !== "loading" && (
                <button
                  onClick={() => toast.dismiss(toastItem.id)}
                  className="shrink-0 p-0.5 rounded-lg text-opacity-60 hover:text-opacity-100 hover:bg-white/5 transition-all cursor-pointer"
                  style={{ color: colors.onSurfaceVariant }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </motion.div>
          );
        }}
      </Toaster>

      <div className={`flex-1 flex flex-col overflow-hidden ml-app-shell ${config.rainbowMode ? "rainbow-mode" : ""}`}>
        <LauncherAppTitleBar
          colors={colors} titleBarColors={titleBarColors} config={config} session={session} accounts={accounts} selectedInstance={selectedInstance} inboxOpen={inboxOpen} setInboxOpen={setInboxOpen} announcements={announcements} userNotifications={userNotifications} unreadCount={unreadCount} setInvitations={setInvitations} setServerRefreshTrigger={setServerRefreshTrigger} setNotificationRefreshTrigger={setNotificationRefreshTrigger} accountDropdownOpen={accountDropdownOpen} setAccountDropdownOpen={setAccountDropdownOpen} t={t} selectAccount={selectAccount} removeAccountFromList={removeAccountFromList} setLoginDialogOpen={setLoginDialogOpen} setLinkCatIDOpen={setLinkCatIDOpen} handleLinkMicrosoft={handleLinkMicrosoft} handleLogout={handleLogout} updateConfig={updateConfig}
        />

        <div className="flex-1 flex overflow-hidden">
          <Sidebar
            colors={colors}
            onTabSelect={(tabId) => { if (tabId === "modpack") setSelectedInstance(null); }}
          />

          <main className="flex-1 overflow-y-auto overflow-x-hidden pt-3 px-6 pb-6 relative">
            <div className="h-full">
              <AnimatePresence mode="wait">
                <motion.div
                  key={contentTab}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12, ease: "easeInOut" }}
                  className="h-full"
                >
                  <React.Suspense fallback={<TabLoadingFallback colors={colors} />}>
                    {contentTab === "home" && <Home session={session} news={news} servers={servers} selectedServer={selectedServer} setSelectedServer={setSelectedServer} setSelectedInstance={setSelectedInstance} colors={colors} setActiveTab={setActiveTab} language={config.language} />}
                    {contentTab === "servers" && <ServerMenu colors={colors} servers={servers} selectedServer={selectedServer} setSelectedServer={setSelectedServer} session={session} setActiveTab={setActiveTab} refreshTrigger={serverRefreshTrigger} language={config.language} config={config} updateConfig={updateConfig} setSettingsTab={setSettingsTab} />}
                    {contentTab === "modpack" && <ModPack colors={colors} config={config} setImportModpackOpen={setImportModpackOpen} setActiveTab={setActiveTab} setSettingsTab={setSettingsTab} onShowConfirm={handleShowConfirm} isActive={true} selectedInstance={selectedInstance} setSelectedInstance={setSelectedInstance} selectedServer={selectedServer} session={session} updateConfig={updateConfig} language={config.language} handleRepair={handleRepair} />}
                    {contentTab === "explore" && <UIErrorBoundary><Explore colors={colors} config={config} /></UIErrorBoundary>}
                    {contentTab === "admin" && isAdmin && adminToken && <AdminPanel colors={colors} adminToken={adminToken} language={config.language} />}
                    {contentTab === "about" && <About colors={colors} config={config} />}
                    {contentTab === "wardrobe" && <Wardrobe colors={colors} selectedInstance={selectedInstance} />}
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

      {isExporting && exportProgress && !isExportMinimized && (
        <InstallProgressModal
          colors={colors}
          installProgress={exportProgress}
          title={t("export_modpack")}
          isBytes={true}
          onCancel={() => handleCancelExport(exportingInstanceId || "")}
          onMinimize={() => setExportMinimized(true)}
          language={config.language}
        />
      )}

      {isExporting && exportProgress && isExportMinimized && (
        <div
          className="fixed bottom-6 right-6 z-50 w-80 rounded-2xl shadow-2xl overflow-hidden border border-white/10 animate-fade-in-up cursor-pointer transition-transform hover:scale-105"
          style={{ backgroundColor: colors.surfaceContainer }}
          onClick={() => setExportMinimized(false)}
        >
          <div className="p-4 flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center relative shrink-0"
              style={{ backgroundColor: colors.surfaceContainerHighest }}
            >
              {exportProgress.percent !== undefined ? (
                <svg className="w-10 h-10 -rotate-90 transform" viewBox="0 0 36 36">
                  <path
                    className="text-gray-200 opacity-20"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke={colors.secondary}
                    strokeWidth="3"
                    strokeDasharray={`${exportProgress.percent}, 100`}
                  />
                </svg>
              ) : (
                <div
                  className="animate-spin rounded-full h-5 w-5 border-b-2"
                  style={{ borderColor: colors.secondary }}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color: colors.onSurface }}>
                {exportProgress.percent}%
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm truncate" style={{ color: colors.onSurface }}>
                {t("exporting" as any)}
              </h4>
              <p className="text-xs truncate" style={{ color: colors.onSurfaceVariant }}>
                {exportProgress.message}
              </p>
            </div>
            <button
              onClick={(event) => {
                event.stopPropagation();
                setExportMinimized(false);
              }}
              className="p-2 rounded-lg hover:bg-white/10"
              title="Expand"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: colors.onSurfaceVariant }}>
                <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {isInstalling && installProgress && !isInstallMinimized && (
        <InstallProgressModal
          colors={colors}
          installProgress={installProgress}
          title={operationType === "repair" ? t("repairing_instance") : undefined}
          onCancel={handleCancelInstall}
          onMinimize={() => setInstallMinimized(true)}
          disableBackdropClick={operationType === "sync" || operationType === "repair"}
          language={config.language}
        />
      )}

      {isInstalling && installProgress && isInstallMinimized && (
        <div
          className="fixed bottom-6 right-6 z-50 w-80 rounded-2xl shadow-2xl overflow-hidden border border-white/10 animate-fade-in-up cursor-pointer transition-transform hover:scale-105"
          style={{ backgroundColor: colors.surfaceContainer }}
          onClick={() => setInstallMinimized(false)}
        >
          <div className="p-4 flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center relative shrink-0"
              style={{ backgroundColor: colors.surfaceContainerHighest }}
            >
              {installProgress.percent !== undefined ? (
                <svg className="w-10 h-10 -rotate-90 transform" viewBox="0 0 36 36">
                  <path
                    className="text-gray-200 opacity-20"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke={colors.secondary}
                    strokeWidth="3"
                    strokeDasharray={`${installProgress.percent}, 100`}
                  />
                </svg>
              ) : (
                <div
                  className="animate-spin rounded-full h-5 w-5 border-b-2"
                  style={{ borderColor: colors.secondary }}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color: colors.onSurface }}>
                {installProgress.percent}%
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm truncate" style={{ color: colors.onSurface }}>
                {operationType === "repair"
                  ? t("repairing_instance")
                  : operationType === "sync"
                    ? t("checking_data")
                    : t("installing")}
              </h4>
              <p className="text-xs truncate" style={{ color: colors.onSurfaceVariant }}>
                {installProgress.type
                  ? t(
                      installProgress.type as any,
                      {
                        filename: installProgress.filename,
                        current: installProgress.current,
                        total: installProgress.total,
                      } as any,
                    )
                  : installProgress.message}
              </p>
            </div>
            <button
              onClick={(event) => {
                event.stopPropagation();
                setInstallMinimized(false);
              }}
              className="p-2 rounded-lg hover:bg-white/10"
              title="Expand"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: colors.onSurfaceVariant }}>
                <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
