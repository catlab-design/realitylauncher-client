/**
 * ========================================
 * Reality Launcher - Complete UI
 * ========================================
 * 
 * Features:
 * - MC Head Avatar (crafthead.net)
 * - Loading Screen
 * - News Section
 * - Full Settings Page
 * - About Page with Credits
 * - Discord RPC Integration
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import gsap from "gsap";
import { toast } from "react-hot-toast";

import { LoadingScreen } from "./ui/LoadingScreen";
import { ErrorBoundary as UIErrorBoundary } from "./ui/ErrorBoundary";
import { LauncherAppOverlays } from "./LauncherAppOverlays";
import { LauncherAppShell } from "./LauncherAppShell";
import { getColors } from "./launcherTheme";

import { type AuthSession, type Server, type NewsItem, type LauncherConfig, type GameInstance } from "../types/launcher";
import { playClick, playSucceed, playNotification, setSoundConfig } from "../lib/sounds";
import { useTranslation } from "../hooks/useTranslation";
import { useConfigStore } from "../store/configStore";
import { useAuthStore } from "../store/authStore";
import { useUiStore } from "../store/uiStore";
import { useProgressStore } from "../store/progressStore";

// ========================================
// Error Boundary
// ========================================

// Types moved to types/launcher.ts

// ========================================
// Utility
// ========================================

// Utility functions moved to lib/utils.ts (cn) and internal helpers
// getMCHeadURL handled by MCHead component

// Color theme definitions

// ========================================
// Icons
// ========================================

// Icons moved to components/ui/Icons.tsx

// ========================================
// Colors (dynamically based on theme)
// ========================================

// ========================================
// Loading Screen
// ========================================

// LoadingScreen moved to components/ui/LoadingScreen.tsx

// ========================================
// MC Head Component
// ========================================

// MCHead moved to components/ui/MCHead.tsx

// ========================================
// App Version Badge Component
// ========================================

// AppVersionBadge moved to components/ui/AppVersionBadge.tsx

// ========================================
// ========================================
// Main Component Content
// ========================================

function LauncherAppContent() {
  const rootRef = useRef<HTMLDivElement>(null);

  // Stores
  const config = useConfigStore();
  const {
      isExporting,
      exportProgress,
      isExportMinimized,
      setExportMinimized,
      exportingInstanceId,

      // Install/Repair State
      isInstalling, setInstalling,
      installProgress, setInstallProgress,
      isInstallMinimized, setInstallMinimized,
      operationType, setOperationType,
      installingInstanceId, setInstallingInstanceId
  } = useProgressStore();

  const handleCancelExport = async (instanceId: string) => {
      playClick();
      try {
          await window.api?.instancesExportCancel?.(instanceId);
      } catch (error) {
          console.error("Failed to cancel export:", error);
      }
  };

  const handleCancelInstall = async () => {
      try {
          if (installingInstanceId) {
              await (window.api as any)?.instanceCancelAction?.(installingInstanceId);
          }
          await (window.api as any)?.modpackCancelInstall?.();
          toast.error(t('cancel_install_success'));
          
          // Reset state (Optimistic)
          setInstalling(false);
          setInstallProgress(null);
          setInstallingInstanceId(null);
          setOperationType(null);
      } catch (error) {
          console.error("Failed to cancel install:", error);
      }
  };

  const { session, accounts, setSession, addAccount, updateAccount, removeAccount: removeAccountAction } = useAuthStore();
  const { activeTab, setActiveTab, settingsTab, setSettingsTab, modals, openModal, closeModal } = useUiStore();

  const [isLoading, setIsLoading] = useState(true);
  // activeTab & settingsTab moved to UI Store
  const [lastContentTab, setLastContentTab] = useState("home");

  const { t } = useTranslation(config.language);
  const settingsDialogOpen = activeTab === "settings";
  const contentTab = activeTab === "settings" ? lastContentTab : activeTab;

  // session & accounts moved to Auth Store

  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<GameInstance | null>(null);

  useEffect(() => {
      // console.log("[LauncherApp] selectedInstance changed:", selectedInstance?.name || "null");
  }, [selectedInstance]);

  useEffect(() => {
    if (activeTab !== "settings") {
      setLastContentTab(activeTab);
    }
  }, [activeTab]);

  // Modals state mapping (local variables for backward compatibility during refactor, or we switch to using store values directly)
  // For now, let's keep the usage of 'loginDialogOpen' etc. by deriving them from store if strictly necessary, 
  // BUT the best way is to Replace the usage sites. 
  // However, there are MANY usages.
  // Strategy: Map store values to the old variable names to minimize diffs in this specific step.
  const loginDialogOpen = modals.login;
  const setLoginDialogOpen = (open: boolean) => open ? openModal('login') : closeModal('login');

  const accountManagerOpen = modals.accountManager;
  const setAccountManagerOpen = (open: boolean) => open ? openModal('accountManager') : closeModal('accountManager');

  const importModpackOpen = modals.importModpack;
  const setImportModpackOpen = (open: boolean) => open ? openModal('importModpack') : closeModal('importModpack');

  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [customColorPending, setCustomColorPending] = useState<string | null>(null);

  // Offline login warning states
  const [offlineWarningOpen, setOfflineWarningOpen] = useState(false);
  const [offlineUsernameOpen, setOfflineUsernameOpen] = useState(false);

  // Device code authentication state
  const [deviceCodeModalOpen, setDeviceCodeModalOpen] = useState(false);
  const [deviceCodeData, setDeviceCodeData] = useState<{
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    expiresAt: number;
  } | null>(null);
  const [deviceCodePolling, setDeviceCodePolling] = useState(false);
  const [deviceCodeError, setDeviceCodeError] = useState<string | null>(null);
  const [isLinkingMicrosoft, setIsLinkingMicrosoft] = useState(false);
  const [serverRefreshTrigger, setServerRefreshTrigger] = useState(0);
  const [notificationRefreshTrigger, setNotificationRefreshTrigger] = useState(0);

  // CatID register modal state
  const [catIDRegisterOpen, setCatIDRegisterOpen] = useState(false);
  const [catIDLoginOpen, setCatIDLoginOpen] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState<'email' | 'reset'>('email');
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordOtp, setForgotPasswordOtp] = useState("");
  const [forgotPasswordNewPassword, setForgotPasswordNewPassword] = useState("");
  const [showLinkPassword, setShowLinkPassword] = useState(false);
  const [forgotPasswordConfirmNewPassword, setForgotPasswordConfirmNewPassword] = useState("");
  const [isForgotPasswordLoading, setIsForgotPasswordLoading] = useState(false);
  const [linkCatIDOpen, setLinkCatIDOpen] = useState(false);

  // Registration verification waiting state
  const [verificationWaiting, setVerificationWaiting] = useState(false);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [verificationExpiresAt, setVerificationExpiresAt] = useState<Date | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);

  // Changelog modal state
  const [changelogModalOpen, setChangelogModalOpen] = useState(false);
  const [changelogData, setChangelogData] = useState<{ version: string; changelog: string } | null>(null);

  // Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
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
  }>({
    open: false,
    title: "",
    message: "",
    onConfirm: () => { },
  });
  const handleShowConfirm = useCallback((options: {
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    confirmColor?: string;
    tertiaryText?: string;
    tertiaryColor?: string;
    onTertiary?: () => void;
  }) => {
    setConfirmDialog({
      ...options,
      open: true,
    });
  }, []);

  const handleCloseSettingsDialog = useCallback(() => {
    setActiveTab(contentTab);
  }, [contentTab, setActiveTab]);


  // Inbox/Notifications modal state
  const [inboxOpen, setInboxOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [inboxTab, setInboxTab] = useState<'news' | 'system'>('news');
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [userNotifications, setUserNotifications] = useState<any[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [processingInvitationId, setProcessingInvitationId] = useState<string | null>(null);
  // Refs to detect new items when polling
  const prevInvRef = useRef<string[]>([]);
  const prevNotificationIdsRef = useRef<string[]>([]);

  // State for CatID Register form
  const [catIDRegisterData, setCatIDRegisterData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [isRegistering, setIsRegistering] = useState(false);

  // Get colors based on current theme (memoized for performance)
  const colors = useMemo(
    () => getColors(config.colorTheme, config.theme, config.customColor, config.rainbowMode),
    [config.colorTheme, config.theme, config.customColor, config.rainbowMode]
  );

  // Derive effective theme mode for CSS (used by scrollbar styling etc.)
  const effectiveThemeMode = useMemo(() => {
    if (config.theme === "auto") {
      const hour = new Date().getHours();
      return hour >= 6 && hour < 18 ? "light" : "dark";
    }
    return config.theme;
  }, [config.theme]);

  const titleBarColors = useMemo(() => {
    return {
      background: colors.surface,
      border: colors.outlineVariant,
      text: colors.onSurface,
      muted: colors.onSurfaceVariant,
      hover: colors.surfaceContainerHigh,
      active: colors.surfaceContainerHighest,
      accent: colors.primary,
      dotRing: colors.surface,
      versionBg: effectiveThemeMode === 'light' ? colors.primaryContainer : colors.surfaceContainerHighest,
      versionText: colors.onSurface,
    };
  }, [colors, effectiveThemeMode]);

  // Set data-theme attribute on <html> so global CSS can respond to theme changes
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", effectiveThemeMode);
  }, [effectiveThemeMode]);

  // Sync sound config
  useEffect(() => {
    setSoundConfig({
      clickSoundEnabled: config.clickSoundEnabled,
      notificationSoundEnabled: config.notificationSoundEnabled
    });
  }, [config.clickSoundEnabled, config.notificationSoundEnabled]);

  // Global auto-update toast notifications
  useEffect(() => {
    const windowApi = (window as any).api;
    const cleanups: (() => void)[] = [];

    if (windowApi?.onUpdateAvailable) {
      cleanups.push(windowApi.onUpdateAvailable((data: { version: string }) => {
        if (!config.autoUpdateEnabled) {
          // Auto-update OFF: just show toast with version info
          toast(t('update_available_toast').replace('{version}', data.version), {
            icon: "\u2b06\ufe0f",
            duration: 8000,
            id: "global-update-available",
          });
        }
      }));
    }

    if (windowApi?.onUpdateDownloaded) {
      cleanups.push(windowApi.onUpdateDownloaded((data: { version: string }) => {
        if (config.autoUpdateEnabled) {
          // Auto-update ON: notify that update will install on next launch
          toast.success(t('update_ready_next_restart').replace('{version}', data.version), {
            duration: 8000,
            id: "global-update-downloaded",
          });
        }
      }));
    }

    return () => cleanups.forEach(fn => fn());
  }, [config.autoUpdateEnabled, config.language]);

  // Server data (will be fetched from API)
  const [servers] = useState<Server[]>([]);

  // News data (will be fetched from API)
  const [news] = useState<NewsItem[]>([]);

  // Agenda/Calendar data pre-fetching
  const [agendas, setAgendas] = useState<any[]>([]);
  const [isLoadingAgendas, setIsLoadingAgendas] = useState(false);

  const fetchAgendas = useCallback(async () => {
    setIsLoadingAgendas(true);
    try {
        const res = await (window as any).api?.fetchAllAgendas?.();
        if (res && res.ok) {
            setAgendas(res.agendas || []);
            console.log("[LauncherApp] Refreshed global agendas:", res.agendas?.length);
        }
    } catch (err) {
        console.error("[LauncherApp] Failed to fetch agendas:", err);
    } finally {
        setIsLoadingAgendas(false);
    }
  }, [t]);

  useEffect(() => {
    fetchAgendas();
  }, [fetchAgendas]);

  // Check for events today to show red dot on calendar button
  const hasEventsToday = useMemo(() => {
    if (!agendas || agendas.length === 0) return false;
    const now = new Date();
    const dayOfWeek = now.getDay();
    const dateStr = now.toLocaleDateString('en-CA'); // YYYY-MM-DD

    return agendas.some(item => {
      // 1. Recurring items (dayOfWeek matches)
      if (item.dayOfWeek !== null && item.dayOfWeek !== undefined && item.dayOfWeek === dayOfWeek) {
        // If recurringUntil is set, check if target date is within range
        if (item.recurringUntil) {
          const untilDate = new Date(item.recurringUntil);
          untilDate.setHours(23, 59, 59, 999);
          if (now > untilDate) return false;
        }
        return true;
      }
      
      // 2. One-time date items
      if (item.date) {
        const itemDate = new Date(item.date).toLocaleDateString('en-CA');
        return itemDate === dateStr;
      }
      return false;
    });
  }, [agendas]);


  // Sync Config/Session from Electron API on mount (if available)
  // LocalStorage persistence is now handled by Zustand middleware
  useEffect(() => {
    (async () => {
      // Try Electron API for config
      try {
        const savedConfig = await window.api?.getConfig();
        if (savedConfig) {
          config.setConfig(savedConfig);
          console.log("[Config] Synced from Electron API");
        }
      } catch { }

      // Try Electron API for session
      try {
        const savedSession = await window.api?.getSession();
        if (savedSession) {
          setSession(savedSession);
          // Add to accounts if not already there
          addAccount(savedSession);
        }
      } catch { }
    })();
  }, []);

  // Track if initial load is complete
  const [isInitialized, setIsInitialized] = useState(false);

  // Mark as initialized after first mount
  useEffect(() => {
    const timer = setTimeout(() => setIsInitialized(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const getRpcStatusFromTab = useCallback(
    (
      tab: string,
    ):
      | "idle"
      | "playing"
      | "launching"
      | "browsing_home"
      | "browsing_explore"
      | "browsing_settings"
      | "browsing_wardrobe"
      | "browsing_about"
      | "browsing_admin"
      | "browsing_modpacks"
      | "browsing_servers" => {
      switch (tab) {
        case "home":
          return "browsing_home";
        case "servers":
          return "browsing_servers";
        case "modpack":
          return "browsing_modpacks";
        case "explore":
          return "browsing_explore";
        case "settings":
          return "browsing_settings";
        case "wardrobe":
          return "browsing_wardrobe";
        case "about":
          return "browsing_about";
        case "admin":
          return "browsing_admin";
        default:
          return "idle";
      }
    },
    [],
  );

  // Persistence is now handled by Zustand middleware
  // Removed explicit localStorage.setItem calls for accounts

  // Persistence is now handled by Zustand middleware
  // Removed explicit localStorage.setItem calls for session

  // Sync Discord RPC with current tab activity
  useEffect(() => {
    if (!isInitialized || !window.api) return;

    if (config.discordRPCEnabled) {
      window.api.discordRPCSetEnabled?.(true);
      window.api.discordRPCUpdate?.(getRpcStatusFromTab(activeTab));
    } else {
      window.api.discordRPCSetEnabled?.(false);
    }
  }, [activeTab, config.discordRPCEnabled, getRpcStatusFromTab, isInitialized]);

  // When game exits, immediately restore RPC to the current tab context.
  useEffect(() => {
    if (!isInitialized || !window.api || !config.discordRPCEnabled) return;

    const removeStoppedListener = window.api.onGameStopped?.(() => {
      window.api?.discordRPCUpdate?.(getRpcStatusFromTab(activeTab));
    });

    return () => {
      removeStoppedListener?.();
    };
  }, [activeTab, config.discordRPCEnabled, getRpcStatusFromTab, isInitialized]);

  // Fetch announcements on app load
  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const data = await window.api?.notificationsFetchAnnouncements?.();
        if (data) {
          setAnnouncements(data);
          console.log("[Notifications] Loaded announcements:", data.length);
        }
      } catch (error) {
        console.error("[Notifications] Error fetching announcements:", error);
      }
    };

    fetchAnnouncements();
  }, []);

  // Poll notifications + invitations together (reduced request volume)
  useEffect(() => {
    let pollTimer: NodeJS.Timeout | null = null;
    let expirationTimer: NodeJS.Timeout | null = null;
    let cancelled = false;

    const clearInboxState = () => {
      setUserNotifications([]);
      setInvitations([]);
      prevNotificationIdsRef.current = [];
      prevInvRef.current = [];
    };

    const syncInbox = async () => {
      if (!session) {
        clearInboxState();
        return;
      }

      setNotificationsLoading(true);
      try {
        const syncData = await window.api?.notificationsSync?.();
        const notificationsData = (syncData && Array.isArray(syncData.notifications))
          ? syncData.notifications
          : (await window.api?.notificationsFetchUser?.()) || [];
        const invitationsData = (syncData && Array.isArray(syncData.invitations))
          ? syncData.invitations
          : (await window.api?.invitationsFetch?.()) || [];

        const prevNotificationIds = prevNotificationIdsRef.current || [];
        const addedNotifications = notificationsData.filter(
          (n: any) => !prevNotificationIds.includes(n.id),
        );
        if (addedNotifications.length > 0 && prevNotificationIds.length > 0) {
          addedNotifications.forEach((n: any) => {
            if (!n.isRead) {
              toast(t('notification_prefix').replace('{title}', n.title));
            }
          });
        }

        const prevInvitationIds = prevInvRef.current || [];
        const addedInvitations = invitationsData.filter(
          (inv: any) => !prevInvitationIds.includes(inv.id),
        );
        if (addedInvitations.length > 0 && prevInvitationIds.length > 0) {
          addedInvitations.forEach((inv: any) => {
            const name = inv.inviterName || t('user_label');
            toast.success(
              t('new_invitation_msg')
                .replace('{name}', name)
                .replace('{instance}', inv.instanceName),
            );
          });
        }

        if (!cancelled) {
          prevNotificationIdsRef.current = notificationsData.map((d: any) => d.id);
          prevInvRef.current = invitationsData.map((d: any) => d.id);
          setUserNotifications(notificationsData);
          setInvitations(invitationsData);
        }
      } catch (error) {
        console.error("[Notifications] Sync error:", error);
      } finally {
        if (!cancelled) {
          setNotificationsLoading(false);
        }
      }
    };

    const getPollDelay = () =>
      typeof document !== "undefined" && document.visibilityState === "hidden"
        ? 120000
        : 30000;

    const scheduleNextPoll = () => {
      if (cancelled) return;
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = setTimeout(async () => {
        await syncInbox();
        scheduleNextPoll();
      }, getPollDelay());
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncInbox();
        scheduleNextPoll();
      }
    };

    const checkExpiration = () => {
      if (session?.type === "catid" && session.tokenExpiresAt) {
        if (Date.now() >= session.tokenExpiresAt) {
          console.log("[Auth] Session expired, logging out...");
           // Call logout action
           removeAccountAction(session.uuid, session.type); 
           setSession(null);
           window.api?.logout?.(); // Clear backend/electron session too
           toast.error(t('session_expired'));
       }
      }
    };

    syncInbox();
    checkExpiration();
    scheduleNextPoll();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    expirationTimer = setInterval(checkExpiration, 10000);

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (expirationTimer) clearInterval(expirationTimer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }, [session, notificationRefreshTrigger, t]);

  const unreadCount = useMemo(() => {
    const notificationsUnread = userNotifications.filter(n => !n.isRead).length;
    return notificationsUnread + invitations.length;
  }, [userNotifications, invitations]);


  // Handle Deep Link Login
  useEffect(() => {
    if (!window.api?.onDeepLinkAuthCallback) return;

    const cleanup = window.api.onDeepLinkAuthCallback(async ({ token }) => {
      console.log("[Auth] Received deep link auth token");
      const loadingId = toast.loading(t('logging_in'));

      try {
        const result = await window.api?.loginCatIDToken?.(token);
        if (result?.ok && result.session) {
          // Set session
          if (result.session.type === "catid") {
            setSession(result.session);
            // Also update accounts list if needed, or rely on internal logic of setActiveSession (which is likely abstracted in main process but here we might need to update local state)
            // Wait, LauncherApp prop has 'session' passed from parent?
            // No, LauncherApp seems to manage session or receive it.
            // Let's check how 'handleCatIDLogin' does it.
          }
          toast.success(t('login_success'), { id: loadingId });
        } else {
          toast.error(result?.error || t('login_failed'), { id: loadingId });
        }
      } catch (error) {
        console.error("[Auth] Deep link login error:", error);
        toast.error(t('login_failed'), { id: loadingId });
      }
    });

    return cleanup;
  }, []);

  // Handle accepting invitation
  const handleAcceptInvitation = async (invitationId: string) => {
    setProcessingInvitationId(invitationId);
    try {
      const success = await window.api?.invitationsAccept?.(invitationId);
      if (success) {
        setInvitations(prev => prev.filter(inv => inv.id !== invitationId));
        toast.success(t('invitation_accepted'));
      }
    } catch (error) {
      console.error("[Invitations] Error accepting:", error);
      toast.error(t('invitation_accept_failed'));
    } finally {
      setProcessingInvitationId(null);
    }
  };

  // Handle rejecting invitation
  const handleRejectInvitation = async (invitationId: string) => {
    setProcessingInvitationId(invitationId);
    try {
      const success = await window.api?.invitationsReject?.(invitationId);
      if (success) {
        setInvitations(prev => prev.filter(inv => inv.id !== invitationId));
        toast.success(t('invitation_rejected'));
      }
    } catch (error) {
      console.error("[Invitations] Error rejecting:", error);
      toast.error(t('invitation_reject_failed'));
    } finally {
      setProcessingInvitationId(null);
    }
  };

  // Check for post-update notification
  useEffect(() => {
    const checkPostUpdate = async () => {
      const currentVersion = await window.api?.getAppVersion?.();
      if (!currentVersion) return; // Not in Electron or not ready

      // Prevent showing multiple times in same session
      if (sessionStorage.getItem("reality_update_shown")) {
        return;
      }

      // Get the version we last NOTIFIED the user about
      // Also check old key for migration
      let notifiedVersion = localStorage.getItem("reality_notified_version");
      if (!notifiedVersion) {
        notifiedVersion = localStorage.getItem("reality_last_version");
      }

      // If we already notified about this exact version, do nothing
      if (notifiedVersion === currentVersion) {
        return;
      }

      // If notifiedVersion exists (not first run) AND differs from current -> show changelog modal
      if (notifiedVersion && notifiedVersion !== currentVersion) {
        // Fetch changelog and show modal (similar to the version check effect)
        try {
          const response = await fetch("https://cdn.reality.catlabdesign.space/client/latest.json");
          if (response.ok) {
            const data = await response.json();
            if (data.changelog) {
              setChangelogData({
                version: currentVersion,
                changelog: data.changelog
              });
              setChangelogModalOpen(true);
            }
          }
        } catch (fetchError) {
          console.log("[Changelog] Could not fetch changelog:", fetchError);
          // Show modal anyway with default message
          setChangelogData({
            version: currentVersion,
            changelog: t('welcome_new_version')
          });
          setChangelogModalOpen(true);
        }

        // Mark as shown in this session
        sessionStorage.setItem("reality_update_shown", "true");
      }

      // Always mark this version as notified (handles both first run and update cases)
      localStorage.setItem("reality_notified_version", currentVersion);
    };

    checkPostUpdate();
  }, []);

  // Auto-update notification listeners
  useEffect(() => {
    if (!window.api) return;

    // Listen for update available
    const unsubscribeAvailable = window.api.onUpdateAvailable?.((data: { version: string }) => {
      toast.success(
        t('update_available_msg').replace('{version}', data.version),
        { duration: 6000, id: "update-available" }
      );
    });

    // Listen for update downloaded
    const unsubscribeDownloaded = window.api.onUpdateDownloaded?.((data: { version: string }) => {
      toast.success(
        t('update_downloaded_msg').replace('{version}', data.version),
        { duration: 8000, id: "update-downloaded" }
      );
    });

    // Listen for update not available
    const unsubscribeNotAvailable = window.api.onUpdateNotAvailable?.(() => {
      toast.success(t('already_latest_version'), { id: "check-update" });
    });

    // Listen for update error
    const unsubscribeError = window.api.onUpdateError?.((data: { message: string }) => {
      toast.error(t('update_check_failed_msg').replace('{message}', data.message), { id: "check-update" });
    });

    return () => {
      unsubscribeAvailable?.();
      unsubscribeDownloaded?.();
      unsubscribeNotAvailable?.();
      unsubscribeError?.();
    };
  }, []);

  // Device code polling effect
  useEffect(() => {
    if (!deviceCodePolling || !deviceCodeData) return;

    const pollInterval = setInterval(async () => {
      // Check if expired
      if (Date.now() >= deviceCodeData.expiresAt) {
        setDeviceCodePolling(false);
        setDeviceCodeError(t('code_expired_retry'));
        return;
      }

      // Poll for completion
      if (window.api?.pollDeviceCodeAuth) {
        try {
          const result = await window.api.pollDeviceCodeAuth(deviceCodeData.deviceCode, isLinkingMicrosoft);

          if (result.status === "success" && result.session) {
            // Success! Add account and close modal
            const newSession: AuthSession = {
              username: result.session.username,
              uuid: result.session.uuid,
              accessToken: result.session.accessToken,
              refreshToken: result.session.refreshToken,
              tokenExpiresAt: result.session.expiresIn ? Date.now() + (result.session.expiresIn * 1000) : undefined,
              apiToken: result.session.apiToken,  // Reality API token from CatID link
              apiTokenExpiresAt: result.session.apiTokenExpiresAt ? new Date(result.session.apiTokenExpiresAt).getTime() : undefined,
              type: "microsoft",
              createdAt: Date.now(),  // Add createdAt for session tracking
            };

            addAccount(newSession);

            // Set as current session
            setSession(newSession);

            // Close modal
            setDeviceCodeModalOpen(false);
            setDeviceCodePolling(false);
            setDeviceCodeData(null);
            setDeviceCodeError(null);
            setIsLinkingMicrosoft(false);

            if (result.linkSwitched) {
              toast.success(
                t('link_success') +
                ' ' +
                t('link_migrated_from').replace('{oldCatID}', String(result.oldCatID))
              );
            } else {
              toast.success(t('welcome_user').replace('{username}', newSession.username));
            }
          } else if (result.status === "expired") {
            setDeviceCodePolling(false);
            setDeviceCodeError(result.error || t('error_expired_code'));
            setIsLinkingMicrosoft(false);
          } else if (result.status === "error") {
            setDeviceCodePolling(false);
            setDeviceCodeError(result.error || t('error_occurred'));
            setIsLinkingMicrosoft(false);
          }
          // If status === "pending", continue polling
        } catch (error) {
          console.error("[Auth] Polling error:", error);
        }
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [deviceCodePolling, deviceCodeData, isLinkingMicrosoft]);

  // Save config helper - อัพเดท state ทันทีก่อน แล้วค่อยบันทึก
  // Save config helper - อัพเดท state ทันทีก่อน แล้วค่อยบันทึก
  const updateConfig = async (newConfig: Partial<LauncherConfig>) => {
    // อัพเดท state ทันที (ทำให้ UI update ทันที)
    // Zustand persist middleware handles localStorage
    config.setConfig(newConfig);

    try {
      // พยายามบันทึกไปที่ Electron (ถ้ามี API)
      if (window.api?.setConfig) {
        const saved = await window.api.setConfig(newConfig);
        if (saved) config.setConfig(saved);
      }
      console.log("[Config] Saved config:", Object.keys(newConfig).join(", "));
    } catch (error) {
      console.error("[Config] Error saving:", error);
    }
  };

  // Handlers
  // Minecraft username regex: 2-16 characters, letters/numbers/underscore only
  const MINECRAFT_USERNAME_REGEX = /^[a-zA-Z0-9_]{2,16}$/;

  const handleCatIDLogin = async (username: string, password: string) => {
    try {
      // Validate username format
      if (!MINECRAFT_USERNAME_REGEX.test(username)) {
        toast.error(t('username_invalid_format'));
        return false;
      }

      // Login via Electron CatID API
      if (!window.api?.loginCatID) {
        toast.error(t('catid_required_electron'));
        return false;
      }

      const toastId = toast.loading(t('loading'));
      const result = await window.api.loginCatID(username, password);
      toast.dismiss(toastId);

      if (!result.ok || !result.session) {
        toast.error(result.error || t('login_failed'));
        return false;
      }

      // Create session object
      const newSession: AuthSession = {
        type: "catid",
        username: result.session.username,
        uuid: result.session.uuid,
        minecraftUuid: result.session.minecraftUuid,  // Real Minecraft UUID if linked
        accessToken: result.session.token,
      };

      // Add to accounts using robust store action
      addAccount(newSession);

      // Set as active session
      setSession(newSession);
      toast.success(t('welcome_user').replace('{username}', newSession.username));

      // Check if user is admin (CatID only)
      if (result.session.token) {
        setAdminToken(result.session.token);
        try {
          const adminCheck = await window.api?.checkAdminStatus(result.session.token);
          if (adminCheck?.isAdmin) {
            setIsAdmin(true);
            console.log("[Admin] User is admin:", result.session.username);
            updateAccount({ ...newSession, isAdmin: true });
          }
        } catch (e) {
          console.log("[Admin] Could not check admin status");
        }
      }
      return true;
    } catch (error: any) {
      toast.error(error?.message || t('login_failed'));
      return false;
    }
  };

  const handleOfflineLogin = async (username: string) => {
    try {
      // Validate username format
      if (!MINECRAFT_USERNAME_REGEX.test(username)) {
        toast.error(t('username_invalid_format'));
        return false;
      }

      // Login via Electron Offline API
      if (!window.api?.loginOffline) {
        toast.error(t('offline_required_electron'));
        return false;
      }

      const result = await window.api.loginOffline(username);

      if (!result.ok || !result.session) {
        toast.error(result.error || t('login_failed'));
        return false;
      }

      // Create session object
      const newSession: AuthSession = {
        type: "offline",
        username: result.session.username,
        uuid: result.session.uuid,
        accessToken: "",
      };

      // Add to accounts
      addAccount(newSession);

      // Set as active session
      setSession(newSession);
      toast.success(t('welcome_user').replace('{username}', newSession.username));
      return true;
    } catch (error: any) {
      toast.error(error?.message || t('login_failed'));
      return false;
    }
  };

  const handleCatIDRegister = async () => {
    setIsRegistering(true);
    try {
      // Validate username format
      if (!MINECRAFT_USERNAME_REGEX.test(catIDRegisterData.username)) {
        toast.error(t('username_invalid_format'));
        return false;
      }

      // Register via Electron CatID API
      if (!window.api?.registerCatID) {
        toast.error(t('register_required_electron'));
        return false;
      }

      const toastId = toast.loading(t('registering'));
      const result = await window.api.registerCatID(
        catIDRegisterData.username,
        catIDRegisterData.email,
        catIDRegisterData.password,
        catIDRegisterData.confirmPassword
      );
      toast.dismiss(toastId);

      if (!result.ok) {
        toast.error(result.error || t('register_failed'));
        return false;
      }

      if (result.requiresVerification && result.verifyToken) {
        // Show verification waiting screen
        setCatIDRegisterOpen(false);
        setVerificationWaiting(true);
        setVerificationToken(result.verifyToken);
        setVerificationEmail(catIDRegisterData.email);
        setVerificationExpiresAt(result.expiresAt ? new Date(result.expiresAt) : new Date(Date.now() + 3 * 60 * 1000));

        toast.success(t('verify_email_prompt'), { duration: 5000 });
        return true;
      }

      toast.success(t('register_success'));
      setCatIDRegisterOpen(false);
      setLoginDialogOpen(true);
      return true;
    } catch (error: any) {
      toast.error(error?.message || t('register_failed'));
      return false;
    } finally {
      setIsRegistering(false);
    }
  };

  // Poll verification status (Optional: Just to keep token alive or check expiry)
  useEffect(() => {
    if (!verificationWaiting || !verificationToken) return;

    // We don't auto-login anymore, but we can check for expiry
    const pollInterval = setInterval(async () => {
      // Logic for expiry check is handled by the other useEffect (timeout)
      // We can also poll status just to update UI state if we wanted, but for now we rely on manual button.
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [verificationWaiting, verificationToken]);

  // Auto-close verification waiting when expired
  useEffect(() => {
    if (!verificationWaiting || !verificationExpiresAt) return;

    const timeout = setTimeout(() => {
      if (verificationExpiresAt < new Date()) {
        setVerificationWaiting(false);
        setVerificationToken(null);
        toast.error(t('verification_expired_prompt'));
      }
    }, verificationExpiresAt.getTime() - Date.now() + 1000);

    return () => clearTimeout(timeout);
  }, [verificationWaiting, verificationExpiresAt]);

  const handleManualVerificationCheck = async () => {
    if (!verificationToken) return;

    const toastId = toast.loading(t('checking_status'));

    try {
      const result = await window.api?.checkRegistrationStatus?.(verificationToken);

      if (result?.status === "verified" && result.token) {
        // Success! Login
        toast.success(t('verification_success_login'), { id: toastId });
        setVerificationWaiting(false);
        setVerificationToken(null);

        if (result.user) {
          const session: AuthSession = {
            type: "catid",
            username: result.user.username,
            uuid: `catid-${result.user.id}`,
            accessToken: result.token,
            createdAt: Date.now(),
          };
          addAccount(session);
          setSession(session);
          await window.api?.setActiveSession?.(session);
        }
      } else if (result?.status === "expired") {
        toast.error(t('verification_expired_prompt'), { id: toastId });
        setVerificationWaiting(false);
        setVerificationToken(null);
      } else {
        toast.error(t('email_not_verified_yet'), { id: toastId });
      }
    } catch (error) {
      console.error("[Verification] Error:", error);
      toast.error(t('verification_check_error'), { id: toastId });
    }
  };

  // Select account to use
  const selectAccount = async (account: AuthSession) => {
    // Optimistically update UI to prevent freezing
    setSession(account);
    setAccountManagerOpen(false);
    toast.success(t('switched_to_account').replace('{username}', account.username));

    // Sync session with backend in the background
    // The backend may auto-refresh the token if expired
    let finalSession: AuthSession = account;

    try {
      const refreshedSession = await window.api?.setActiveSession?.(account);
      if (refreshedSession) {
        console.log("[Auth] Backend returned refreshed session:", refreshedSession.username);
        finalSession = refreshedSession as AuthSession;
        // Also update in accounts list
        updateAccount(refreshedSession);
        // Ensure the active session is also updated if it refreshed
        setSession(finalSession);
      }
    } catch (err) {
      console.error("[Auth] Failed to sync session with backend:", err);
    }

    // Check admin status if switching to CatID account
    if (finalSession.type === "catid" && finalSession.accessToken) {
      setAdminToken(finalSession.accessToken);
      try {
        const adminCheck = await window.api?.checkAdminStatus(finalSession.accessToken);
        setIsAdmin(adminCheck?.isAdmin || false);
        if (adminCheck?.isAdmin) {
          console.log("[Admin] Switched to admin account:", finalSession.username);
          // Ensure admin status is saved in account
          if (!finalSession.isAdmin) {
             updateAccount({ ...finalSession, isAdmin: true });
          }
        }
      } catch (e) {
        setIsAdmin(false);
        console.log("[Admin] Could not check admin status on account switch");
      }
    } else {
      // Non-CatID account - reset admin state
      setIsAdmin(false);
      setAdminToken(null);
    }
  };

  // Remove account from list
  const removeAccountFromList = async (account: AuthSession) => { // Renamed to avoid specific conflict if I imported removeAccount (I didn't)
    // Use store setAccounts or removeAccount action
    // I didn't import removeAccount action, so manual:
    removeAccountAction(account.uuid, account.type);
    if (session?.username === account.username && session?.type === account.type) {
      // If deleting active account, call logout to remove session.json
      await window.api?.logout();
      setSession(null);
    }
    toast.success(t('account_deleted').replace('{username}', account.username));
  };

  const handleLogout = async () => {
    try {
      await window.api?.logout();
      setSession(null);
      // Reset admin state on logout
      setIsAdmin(false);
      setAdminToken(null);
      toast.success(t('logout_success'));
    } catch {
      toast.error(t('logout_failed'));
    }
  };

  const handleLinkCatID = async (username: string, password: string) => {
    const loader = toast.loading(t('loading'));
    try {
      if (!(window as any).api?.linkCatID) {
        toast.error(t('function_not_found_restart'), { id: loader });
        return;
      }

      const res = await (window as any).api.linkCatID(username, password);
      if (res?.ok) {
        if (res.linkSwitched) {
          toast.success(
            t('link_success') +
            ' ' +
            t('link_migrated_from').replace('{oldCatID}', String(res.oldCatID)),
            { id: loader, icon: '🔄' }
          );
        } else {
          toast.success(t('link_success'), { id: loader });
        }
        setLinkCatIDOpen(false);

        // Refresh session
        const updatedSession = await window.api?.getSession?.();
        if (updatedSession) {
          setSession(updatedSession);
          // Update in accounts list too
          updateAccount(updatedSession);
        }
      } else {
        toast.error(res?.error || t('link_failed'), { id: loader });
      }
    } catch {
      toast.error(t('error_occurred'), { id: loader });
    }
  };



  const handleBrowseJava = async () => {
    const path = await window.api?.browseJava();
    if (path) {
      updateConfig({ javaPath: path });
    }
  };

  const handleBrowseMinecraftDir = async () => {
    const path = await window.api?.browseDirectory(t('browse_minecraft_title'));
    if (path) {
      updateConfig({ minecraftDir: path });
    }
  };

  const handleUnlink = (provider: "catid" | "microsoft") => {
    const isCatID = provider === "catid";
    setConfirmDialog({
      open: true,
      title: isCatID ? t('unlink_catid_title') : t('unlink_microsoft_title'),
      message: isCatID ? t('unlink_catid_msg') : t('unlink_microsoft_msg'),
      confirmText: t('unlink_confirm'),
      confirmColor: "#ef4444",
      onConfirm: async () => {
        try {
          const res = await window.api?.authUnlink(provider);
          if (res?.ok) {
            toast.success(t('unlink_success'));
            
            // Refresh session and accounts
            const updatedSession = (await window.api?.getSession()) ?? null;
            setSession(updatedSession);

            // Important: updateAccount handles robust deduplication AND matches the account in the list
            if (res.updatedAccount) {
              updateAccount(res.updatedAccount);
            } else if (updatedSession) {
              updateAccount(updatedSession);
            }
          } else {
            toast.error(`${res?.error || t('unlink_failed')} (Token: ${session?.apiToken})`);
          }
        } catch (err) {
          toast.error(t('error_occurred'));
        }
      }
    });
  };

  const handleLinkMicrosoft = async () => {
    console.log("[Auth] Link Microsoft clicked");
    if (window.api?.startDeviceCodeAuth) {
      try {
        const toastId = toast.loading(t('requesting_link_code'));
        const result = await window.api.startDeviceCodeAuth();
        toast.dismiss(toastId);

        if (!result.ok || !result.deviceCode || !result.userCode) {
          toast.error(result.error || t('request_code_failed'));
          return;
        }

        setDeviceCodeData({
          deviceCode: result.deviceCode,
          userCode: result.userCode,
          verificationUri: result.verificationUri || "https://microsoft.com/link",
          expiresAt: Date.now() + ((result.expiresIn || 900) * 1000),
        });
        setDeviceCodePolling(true);
        setDeviceCodeModalOpen(true);
        setIsLinkingMicrosoft(true);
      } catch (error) {
        toast.error(t('error_occurred'));
      }
    }
  };

  // Show loading screen
  if (isLoading) {
    return <LoadingScreen onComplete={() => {
        setIsLoading(false);
        if (window.api?.windowSetMainMode) window.api.windowSetMainMode();
    }} themeColor={colors.secondary} />;
  }

  // Render tabs - split into main and bottom navigation
  // Render tabs - split into main and bottom navigation (Now handled in Sidebar)

  return (
    <div ref={rootRef} className="h-screen flex flex-col overflow-hidden bg-surface" style={{ backgroundColor: colors.surface }}>
      <LauncherAppOverlays
        colors={colors}
        t={t}
        changelogModalOpen={changelogModalOpen}
        setChangelogModalOpen={setChangelogModalOpen}
        changelogData={changelogData}
        confirmDialog={confirmDialog}
        setConfirmDialog={setConfirmDialog}
        loginDialogOpen={loginDialogOpen}
        setLoginDialogOpen={setLoginDialogOpen}
        offlineUsernameOpen={offlineUsernameOpen}
        setOfflineUsernameOpen={setOfflineUsernameOpen}
        catIDLoginOpen={catIDLoginOpen}
        setCatIDLoginOpen={setCatIDLoginOpen}
        deviceCodeModalOpen={deviceCodeModalOpen}
        setDeviceCodeModalOpen={setDeviceCodeModalOpen}
        deviceCodeData={deviceCodeData}
        setDeviceCodeData={setDeviceCodeData}
        setDeviceCodeError={setDeviceCodeError}
        setDeviceCodePolling={setDeviceCodePolling}
        setIsLinkingMicrosoft={setIsLinkingMicrosoft}
        handleOfflineLogin={handleOfflineLogin}
        handleCatIDLogin={handleCatIDLogin}
        catIDRegisterOpen={catIDRegisterOpen}
        setCatIDRegisterOpen={setCatIDRegisterOpen}
        catIDRegisterData={catIDRegisterData}
        setCatIDRegisterData={setCatIDRegisterData}
        isRegistering={isRegistering}
        handleCatIDRegister={handleCatIDRegister}
        verificationWaiting={verificationWaiting}
        setVerificationWaiting={setVerificationWaiting}
        verificationEmail={verificationEmail}
        handleManualVerificationCheck={handleManualVerificationCheck}
        setVerificationToken={setVerificationToken}
        forgotPasswordOpen={forgotPasswordOpen}
        setForgotPasswordOpen={setForgotPasswordOpen}
        forgotPasswordStep={forgotPasswordStep}
        setForgotPasswordStep={setForgotPasswordStep}
        forgotPasswordEmail={forgotPasswordEmail}
        setForgotPasswordEmail={setForgotPasswordEmail}
        forgotPasswordOtp={forgotPasswordOtp}
        setForgotPasswordOtp={setForgotPasswordOtp}
        forgotPasswordNewPassword={forgotPasswordNewPassword}
        setForgotPasswordNewPassword={setForgotPasswordNewPassword}
        forgotPasswordConfirmNewPassword={forgotPasswordConfirmNewPassword}
        setForgotPasswordConfirmNewPassword={setForgotPasswordConfirmNewPassword}
        isForgotPasswordLoading={isForgotPasswordLoading}
        setIsForgotPasswordLoading={setIsForgotPasswordLoading}
        linkCatIDOpen={linkCatIDOpen}
        setLinkCatIDOpen={setLinkCatIDOpen}
        showLinkPassword={showLinkPassword}
        setShowLinkPassword={setShowLinkPassword}
        handleLinkCatID={handleLinkCatID}
        accountManagerOpen={accountManagerOpen}
        setAccountManagerOpen={setAccountManagerOpen}
        accounts={accounts}
        session={session}
        selectAccount={selectAccount}
        removeAccountFromList={removeAccountFromList}
        importModpackOpen={importModpackOpen}
        setImportModpackOpen={setImportModpackOpen}
        isDragging={isDragging}
        setIsDragging={setIsDragging}
      />

      <LauncherAppShell
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
        contentTab={contentTab}
        settingsDialogOpen={settingsDialogOpen}
        onCloseSettingsDialog={handleCloseSettingsDialog}
        news={news}
        servers={servers}
        selectedServer={selectedServer}
        setSelectedServer={setSelectedServer}
        setSelectedInstance={setSelectedInstance}
        setActiveTab={setActiveTab}
        serverRefreshTrigger={serverRefreshTrigger}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        setImportModpackOpen={setImportModpackOpen}
        handleShowConfirm={handleShowConfirm}
        handleBrowseJava={handleBrowseJava}
        handleBrowseMinecraftDir={handleBrowseMinecraftDir}
        handleUnlink={handleUnlink}
        isAdmin={isAdmin}
        adminToken={adminToken}
        isExporting={isExporting}
        exportProgress={exportProgress}
        isExportMinimized={isExportMinimized}
        setExportMinimized={setExportMinimized}
        handleCancelExport={handleCancelExport}
        exportingInstanceId={exportingInstanceId}
        isInstalling={isInstalling}
        installProgress={installProgress}
        isInstallMinimized={isInstallMinimized}
        setInstallMinimized={setInstallMinimized}
        operationType={operationType}
        handleCancelInstall={handleCancelInstall}
      />
    </div>
  );
}

// Export the wrapped component
export default function LauncherApp() {
  return (
    <UIErrorBoundary>
      <LauncherAppContent />
    </UIErrorBoundary>
  );
}


