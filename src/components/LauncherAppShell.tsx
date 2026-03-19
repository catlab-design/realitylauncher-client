import React, { type Dispatch, type SetStateAction } from "react";
import { Toaster } from "react-hot-toast";

import { Sidebar } from "./layout/Sidebar";
import { ErrorBoundary as UIErrorBoundary } from "./ui/ErrorBoundary";
import { LauncherAppTitleBar } from "./LauncherAppTitleBar";
import { Home, ServerMenu, ModPack, Explore, About, Wardrobe } from "./tabs";
import { SettingsDialog } from "./SettingsDialog";
import AdminPanel from "./tabs/AdminPanel";
import { InstallProgressModal } from "./tabs/ModPackTabs/InstallProgressModal";
import type {
  AuthSession,
  GameInstance,
  LauncherConfig,
  NewsItem,
  Server,
} from "../types/launcher";
import type { TranslationKey } from "../i18n/translations";

type TranslationFn = (
  key: TranslationKey,
  params?: Record<string, any>,
) => string;

type SettingsTabId =
  | "account"
  | "appearance"
  | "game"
  | "connections"
  | "language"
  | "launcher"
  | "resources"
  | "java"
  | "update";

interface LauncherAppShellProps {
  colors: any;
  titleBarColors: any;
  config: LauncherConfig;
  session: AuthSession | null;
  accounts: AuthSession[];
  selectedInstance: GameInstance | null;
  calendarOpen: boolean;
  setCalendarOpen: Dispatch<SetStateAction<boolean>>;
  hasEventsToday: boolean;
  agendas: any[];
  isLoadingAgendas: boolean;
  fetchAgendas: () => void | Promise<void>;
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
}

export function LauncherAppShell({
  colors,
  titleBarColors,
  config,
  session,
  accounts,
  selectedInstance,
  calendarOpen,
  setCalendarOpen,
  hasEventsToday,
  agendas,
  isLoadingAgendas,
  fetchAgendas,
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
  contentTab,
  settingsDialogOpen,
  onCloseSettingsDialog,
  news,
  servers,
  selectedServer,
  setSelectedServer,
  setSelectedInstance,
  setActiveTab,
  serverRefreshTrigger,
  settingsTab,
  setSettingsTab,
  setImportModpackOpen,
  handleShowConfirm,
  handleBrowseJava,
  handleBrowseMinecraftDir,
  handleUnlink,
  isAdmin,
  adminToken,
  isExporting,
  exportProgress,
  isExportMinimized,
  setExportMinimized,
  handleCancelExport,
  exportingInstanceId,
  isInstalling,
  installProgress,
  isInstallMinimized,
  setInstallMinimized,
  operationType,
  handleCancelInstall,
}: LauncherAppShellProps) {
  return (
    <>
      <Toaster
        position="top-center"
        containerStyle={{
          top: 16,
        }}
        toastOptions={{
          duration: 3000,
          style: {
            background: colors.surfaceContainer,
            color: colors.onSurface,
            borderRadius: "16px",
            padding: "12px 18px",
            fontSize: "13px",
            fontWeight: 500,
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
            maxWidth: "350px",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          },
          success: {
            style: {
              boxShadow: "0 8px 32px rgba(34, 197, 94, 0.25)",
            },
            iconTheme: {
              primary: "#22c55e",
              secondary: "#fff",
            },
          },
          error: {
            style: {
              boxShadow: "0 8px 32px rgba(239, 68, 68, 0.25)",
            },
            iconTheme: {
              primary: "#ef4444",
              secondary: "#fff",
            },
          },
          loading: {
            style: {
              boxShadow: `0 0 20px ${colors.primary}80, 0 0 40px ${colors.primary}4d`,
            },
          },
        }}
      />

      <div className={`flex-1 flex flex-col overflow-hidden ml-app-shell ${config.rainbowMode ? "rainbow-mode" : ""}`}>
        <LauncherAppTitleBar
          colors={colors}
          titleBarColors={titleBarColors}
          config={config}
          session={session}
          accounts={accounts}
          selectedInstance={selectedInstance}
          calendarOpen={calendarOpen}
          setCalendarOpen={setCalendarOpen}
          hasEventsToday={hasEventsToday}
          agendas={agendas}
          isLoadingAgendas={isLoadingAgendas}
          fetchAgendas={fetchAgendas}
          inboxOpen={inboxOpen}
          setInboxOpen={setInboxOpen}
          announcements={announcements}
          userNotifications={userNotifications}
          unreadCount={unreadCount}
          setInvitations={setInvitations}
          setServerRefreshTrigger={setServerRefreshTrigger}
          setNotificationRefreshTrigger={setNotificationRefreshTrigger}
          accountDropdownOpen={accountDropdownOpen}
          setAccountDropdownOpen={setAccountDropdownOpen}
          t={t}
          selectAccount={selectAccount}
          removeAccountFromList={removeAccountFromList}
          setLoginDialogOpen={setLoginDialogOpen}
          setLinkCatIDOpen={setLinkCatIDOpen}
          handleLinkMicrosoft={handleLinkMicrosoft}
          handleLogout={handleLogout}
          updateConfig={updateConfig}
        />

        <div className="flex-1 flex overflow-hidden">
          <Sidebar
            colors={colors}
            onTabSelect={(tabId) => {
              if (tabId === "modpack") {
                setSelectedInstance(null);
              }
            }}
          />

          <main className="flex-1 overflow-auto pt-3 px-6 pb-6 relative">
            <div key={contentTab} className="h-full animate-fade-in">
              {contentTab === "home" && (
                <Home
                  session={session}
                  news={news}
                  servers={servers}
                  selectedServer={selectedServer}
                  setSelectedServer={setSelectedServer}
                  setSelectedInstance={setSelectedInstance}
                  colors={colors}
                  setActiveTab={setActiveTab}
                  language={config.language}
                />
              )}

              {contentTab === "servers" && (
                <ServerMenu
                  colors={colors}
                  servers={servers}
                  selectedServer={selectedServer}
                  setSelectedServer={setSelectedServer}
                  session={session}
                  setActiveTab={setActiveTab}
                  refreshTrigger={serverRefreshTrigger}
                  language={config.language}
                  config={config}
                  updateConfig={updateConfig}
                  setSettingsTab={setSettingsTab}
                />
              )}

              {contentTab === "modpack" && (
                <ModPack
                  colors={colors}
                  config={config}
                  setImportModpackOpen={setImportModpackOpen}
                  setActiveTab={setActiveTab}
                  setSettingsTab={setSettingsTab}
                  onShowConfirm={handleShowConfirm}
                  isActive={true}
                  selectedInstance={selectedInstance}
                  setSelectedInstance={setSelectedInstance}
                  selectedServer={selectedServer}
                  session={session}
                  updateConfig={updateConfig}
                  language={config.language}
                />
              )}

              {contentTab === "explore" && (
                <UIErrorBoundary>
                  <Explore colors={colors} config={config} />
                </UIErrorBoundary>
              )}

              {contentTab === "admin" && isAdmin && adminToken && (
                <AdminPanel
                  colors={colors}
                  adminToken={adminToken}
                  language={config.language}
                />
              )}

              {contentTab === "about" && <About colors={colors} config={config} />}
              {contentTab === "wardrobe" && <Wardrobe colors={colors} />}
            </div>
          </main>
        </div>
      </div>

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
