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
import { Toaster, toast } from "react-hot-toast";

import { Icons } from "./ui/Icons";
import { MCHead } from "./ui/MCHead";
import { translations } from "../i18n/translations";
import { ChangelogModal } from "./ui/ChangelogModal";
import { NotificationInbox } from "./ui/NotificationInbox";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { LoadingScreen } from "./ui/LoadingScreen";
import { OfflineLoginModal } from "./auth/OfflineLoginModal";
import { CatIDLoginModal } from "./auth/CatIDLoginModal";
import { LoginModal } from "./auth/LoginModal";
import { MicrosoftVerificationModal } from "./auth/MicrosoftVerificationModal";
import { AppVersionBadge } from "./ui/AppVersionBadge";
import microsoftIcon from "../assets/microsoft_icon.svg";
import { Sidebar } from "./layout/Sidebar";
import { ErrorBoundary as UIErrorBoundary } from "./ui/ErrorBoundary";

import { Home, Settings, ServerMenu, ModPack, Explore, About } from "./tabs";
import { StateDebug } from "./StateDebug";
import AdminPanel from "./tabs/AdminPanel";
import { type AuthSession, type Server, type NewsItem, type LauncherConfig, type ColorTheme, type GameInstance } from "../types/launcher";
import { playClick, playSucceed, playNotification, setSoundConfig } from "../lib/sounds";
import { useTranslation } from "../hooks/useTranslation";
import { useConfigStore } from "../store/configStore";
import { useAuthStore } from "../store/authStore";
import { useUiStore } from "../store/uiStore";
import { useProgressStore } from "../store/progressStore";
import { InstallProgressModal } from "./tabs/ModPackTabs/InstallProgressModal";
import { CalendarWidget } from "./ui/CalendarWidget";

// ========================================
// Error Boundary
// ========================================

// Read current language from persisted config (localStorage fallback)
function getCurrentLanguage(): "th" | "en" {
  try {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("reality_config");
      if (raw) {
        const parsed = JSON.parse(raw as string);
        if (parsed && parsed.language) return parsed.language === "en" ? "en" : "th";
      }
    }
  } catch (e) {
    // ignore and fallback
  }
  return "th";
}






// Types moved to types/launcher.ts

// ========================================
// Utility
// ========================================

// Utility functions moved to lib/utils.ts (cn) and internal helpers
// getMCHeadURL handled by MCHead component

// Color theme definitions
import { COLOR_THEMES } from "../lib/constants";

// ========================================
// Icons
// ========================================

// Icons moved to components/ui/Icons.tsx

// ========================================
// Colors (dynamically based on theme)
// ========================================

function getColors(colorTheme: ColorTheme, themeMode: "light" | "dark" | "oled" | "auto", customColor?: string, rainbowMode?: boolean) {
  const themeColor = rainbowMode ? "var(--secondary-color)" : (customColor || COLOR_THEMES[colorTheme].primary);

  // Determine effective theme mode for "auto" - light during 6am-6pm, dark otherwise
  let effectiveMode: "light" | "dark" | "oled" = themeMode === "auto"
    ? new Date().getHours() >= 6 && new Date().getHours() < 18 ? "light" : "dark"
    : themeMode;

  if (effectiveMode === "oled") {
    // OLED theme - pure black background for OLED screens
    return {
      primary: themeColor,
      onPrimary: "#000000",
      primaryContainer: "#0a0a0a",
      onPrimaryContainer: "#ffffff",
      secondary: themeColor,
      secondaryContainer: themeColor,
      surface: "#000000",
      surfaceContainer: "#0a0a0a",
      surfaceContainerHigh: "#141414",
      surfaceContainerHighest: "#1e1e1e",
      onSurface: "#ffffff",
      onSurfaceVariant: "#a0a0a0",
      outline: "#333333",
      outlineVariant: "#222222",
    };
  } else if (effectiveMode === "dark") {
    // Dark theme - พื้นดำ ฟอนต์ขาว
    return {
      primary: themeColor,
      onPrimary: "#1a1a1a",
      primaryContainer: "#2a2a2a",
      onPrimaryContainer: "#ffffff",
      secondary: themeColor,
      secondaryContainer: themeColor,
      surface: "#1a1a1a",
      surfaceContainer: "#242424",
      surfaceContainerHigh: "#2e2e2e",
      surfaceContainerHighest: "#3a3a3a",
      onSurface: "#ffffff",
      onSurfaceVariant: "#b3b3b3",
      outline: "#4a4a4a",
      outlineVariant: "#3a3a3a",
    };
  } else {
    // Light theme - พื้นขาว ฟอนต์ดำ
    return {
      primary: "#1a1a1a",
      onPrimary: "#ffffff",
      primaryContainer: "#f5f5f5",
      onPrimaryContainer: "#1a1a1a",
      secondary: themeColor,
      secondaryContainer: themeColor,
      surface: "#ffffff",
      surfaceContainer: "#f8f8f8",
      surfaceContainerHigh: "#f0f0f0",
      surfaceContainerHighest: "#e8e8e8",
      onSurface: "#1a1a1a",
      onSurfaceVariant: "#666666",
      outline: "#cccccc",
      outlineVariant: "#e0e0e0",
    };
  }
}

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
      exportingInstanceId
  } = useProgressStore();

  const handleCancelExport = async (instanceId: string) => {
      playClick();
      try {
          await window.api?.instancesExportCancel?.(instanceId);
      } catch (error) {
          console.error("Failed to cancel export:", error);
      }
  };
  const { session, accounts, setSession, setAccounts, addAccount, updateAccount, removeAccount: removeAccountAction } = useAuthStore();
  const { activeTab, setActiveTab, settingsTab, setSettingsTab, modals, openModal, closeModal } = useUiStore();

  const [isLoading, setIsLoading] = useState(true);
  // activeTab & settingsTab moved to UI Store

  const { t } = useTranslation(config.language);

  // session & accounts moved to Auth Store

  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<GameInstance | null>(null);

  useEffect(() => {
      // console.log("[LauncherApp] selectedInstance changed:", selectedInstance?.name || "null");
  }, [selectedInstance]);

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
  const prevNotifRef = useRef<string[]>([]);

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

  // Persistence is now handled by Zustand middleware
  // Removed explicit localStorage.setItem calls for accounts

  // Persistence is now handled by Zustand middleware
  // Removed explicit localStorage.setItem calls for session

  // Update Discord RPC when toggle changes
  useEffect(() => {
    // รอให้ config โหลดเสร็จก่อน ไม่งั้นจะใช้ค่า default (true) แทนค่าที่บันทึกไว้
    if (!isInitialized) return;

    if (config.discordRPCEnabled) {
      // เปิดใช้งาน RPC และแสดงสถานะ idle
      window.api?.discordRPCSetEnabled?.(true);
      window.api?.discordRPCUpdate?.("idle");
    } else {
      // ปิดใช้งาน RPC (disconnect จาก Discord)
      window.api?.discordRPCSetEnabled?.(false);
    }
  }, [config.discordRPCEnabled, isInitialized]);

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

  // Poll user notifications when logged in (detect new notifications)
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    const fetchAndNotify = async () => {
      if (!session) {
        setUserNotifications([]);
        prevNotifRef.current = [];
        return;
      }

      setNotificationsLoading(true);
      try {
        const data = await window.api?.notificationsFetchUser?.();
        if (data) {
          const prevIds = prevNotifRef.current || [];
          const added = data.filter((n: any) => !prevIds.includes(n.id));

          // Only show toast for newly added unread notifications
          if (added.length > 0 && prevIds.length > 0) {
            added.forEach((n: any) => {
              if (!n.isRead) {
                toast(t('notification_prefix').replace('{title}', n.title));
              }
            });
          }

          prevNotifRef.current = data.map((d: any) => d.id);
          setUserNotifications(data);
          console.log("[Notifications] Loaded user notifications:", data.length);
        }
      } catch (error) {
        console.error("[Notifications] Error fetching user notifications:", error);
      } finally {
        setNotificationsLoading(false);
      }
    };

    fetchAndNotify();
    timer = setInterval(fetchAndNotify, 10000);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [session, notificationRefreshTrigger]);

  // Poll pending invitations when logged in (detect new ones)
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    let expirationTimer: NodeJS.Timeout | null = null;

    const fetchAndNotifyInvitations = async () => {
      if (!session) {
        setInvitations([]);
        prevInvRef.current = [];
        return;
      }

      try {
        const data = await window.api?.invitationsFetch?.();
        if (data) {
          // Detect newly added invitation IDs
          const prevIds = prevInvRef.current || [];
          const added = data.filter((inv: any) => !prevIds.includes(inv.id));

          // If there are new invitations (and not the initial load), notify user
          if (added.length > 0 && prevIds.length > 0) {
            added.forEach((inv: any) => {
              const name = inv.inviterName || t('user_label');
              toast.success(t('new_invitation_msg').replace('{name}', name).replace('{instance}', inv.instanceName));
            });
          }

          prevInvRef.current = data.map((d: any) => d.id);
          setInvitations(data);
          console.log("[Invitations] Loaded pending invitations:", data.length);
        }
      } catch (error) {
        console.error("[Invitations] Error fetching invitations:", error);
      }
    };

    // Auto-logout check for CatID sessions with checking every 1s
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

    // Initial load + polling
    fetchAndNotifyInvitations();
    checkExpiration();
    
    timer = setInterval(fetchAndNotifyInvitations, 10000);
    expirationTimer = setInterval(checkExpiration, 1000);

    return () => {
      if (timer) clearInterval(timer);
      if (expirationTimer) clearInterval(expirationTimer);
    };
  }, [session]);


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
          toast.error(result?.error || "Login Failed", { id: loadingId });
        }
      } catch (error) {
        console.error("[Auth] Deep link login error:", error);
        toast.error("Login Error", { id: loadingId });
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
    const unsubAvailable = window.api.onUpdateAvailable?.((data: { version: string }) => {
      toast.success(
        t('update_available_msg').replace('{version}', data.version),
        { duration: 6000, id: "update-available" }
      );
    });

    // Listen for update downloaded
    const unsubDownloaded = window.api.onUpdateDownloaded?.((data: { version: string }) => {
      toast.success(
        t('update_downloaded_msg').replace('{version}', data.version),
        { duration: 8000, id: "update-downloaded" }
      );
    });

    // Listen for update not available
    const unsubNotAvailable = window.api.onUpdateNotAvailable?.(() => {
      toast.success(t('already_latest_version'), { id: "check-update" });
    });

    // Listen for update error
    const unsubError = window.api.onUpdateError?.((data: { message: string }) => {
      toast.error(t('update_check_failed_msg').replace('{message}', data.message), { id: "check-update" });
    });

    return () => {
      unsubAvailable?.();
      unsubDownloaded?.();
      unsubNotAvailable?.();
      unsubError?.();
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

            toast.success(t('welcome_user').replace('{username}', newSession.username));
          } else if (result.status === "expired") {
            setDeviceCodePolling(false);
            setDeviceCodeError(result.error || t('error_expired_code'));
          } else if (result.status === "error") {
            setDeviceCodePolling(false);
            setDeviceCodeError(result.error || t('error_occurred'));
          }
          // If status === "pending", continue polling
        } catch (error) {
          console.error("[Auth] Polling error:", error);
        }
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [deviceCodePolling, deviceCodeData]);

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
          // Add to accounts using addAccount (which handles uniqueness)
          // But here logic was "filter existing then add".
          // addAccount simply checks if exists and returns if so.
          // But we want to UPDATE if exists (re-login case).
          // So strict equality:
          addAccount(session); // Store's addAccount doesn't update if exists.
          // To ensure update, we should remove then add, or update.
          // Let's rely on simple add for now, or use:
          // setAccounts([...accounts.filter(a => a.uuid !== session.uuid), session]); // This is safe given 'accounts' is in scope
          // Wait, 'accounts' variable from hook effectively replaces 'prev'.
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
    // Sync session with backend FIRST to ensure data consistency
    try {
      await window.api?.setActiveSession?.(account);
    } catch (err) {
      console.error("[Auth] Failed to sync session with backend:", err);
    }

    setSession(account);
    setAccountManagerOpen(false);
    toast.success(t('switched_to_account').replace('{username}', account.username));

    // Check admin status if switching to CatID account
    if (account.type === "catid" && account.accessToken) {
      setAdminToken(account.accessToken);
      try {
        const adminCheck = await window.api?.checkAdminStatus(account.accessToken);
        setIsAdmin(adminCheck?.isAdmin || false);
        if (adminCheck?.isAdmin) {
          console.log("[Admin] Switched to admin account:", account.username);
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
        toast.success(t('link_success'), { id: loader });
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
            // Refresh session and accounts without hard reload
            const updatedSession = (await window.api?.getSession()) ?? null;
            setSession(updatedSession);
            if (updatedSession) {
              setAccounts(accounts.map(acc =>
                acc.uuid === updatedSession.uuid ? updatedSession : acc
              ));
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


  // Show loading screen
  if (isLoading) {
    return <LoadingScreen onComplete={() => setIsLoading(false)} themeColor={colors.secondary} />;
  }

  // Render tabs - split into main and bottom navigation
  // Render tabs - split into main and bottom navigation (Now handled in Sidebar)

  return (
    <div ref={rootRef} className="h-screen flex flex-col overflow-hidden bg-surface" style={{ backgroundColor: colors.surface }}>
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
            borderRadius: '16px',
            padding: '12px 18px',
            fontSize: '13px',
            fontWeight: 500,
            boxShadow: `0 0 20px rgba(255, 0, 128, 0.5), 0 0 40px rgba(0, 255, 255, 0.3), 0 0 60px rgba(128, 0, 255, 0.2)`,
            maxWidth: '350px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          },
          success: {
            style: {
              boxShadow: `0 0 20px rgba(34, 197, 94, 0.5), 0 0 40px rgba(34, 197, 94, 0.3)`,
            },
            iconTheme: {
              primary: '#22c55e',
              secondary: '#fff',
            },
          },
          error: {
            style: {
              boxShadow: `0 0 20px rgba(239, 68, 68, 0.5), 0 0 40px rgba(239, 68, 68, 0.3)`,
            },
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
          loading: {
            style: {
              boxShadow: `0 0 20px ${colors.primary}80, 0 0 40px ${colors.primary}4d`,
            },
          },
        }}
      />

      {/* Changelog Modal - Shows after update */}
      <ChangelogModal
        isOpen={changelogModalOpen}
        onClose={() => setChangelogModalOpen(false)}
        version={changelogData?.version || ""}
        changelog={changelogData?.changelog || ""}
        colors={colors}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
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
          console.log("[Auth] Microsoft login button clicked - starting device code flow");
          setLoginDialogOpen(false);
          if (window.api?.startDeviceCodeAuth) {
            try {
              const toastId = toast.loading(t('requesting_login_code'));
              const result = await window.api.startDeviceCodeAuth();
              toast.dismiss(toastId);
              if (!result.ok || !result.deviceCode || !result.userCode) {
                toast.error(result.error || t('request_code_failed'));
                return;
              }
              setDeviceCodeData({
                deviceCode: result.deviceCode,
                userCode: result.userCode,
                verificationUri: result.verificationUri || "https://microsoft.com/devicelogin",
                expiresAt: Date.now() + (result.expiresIn || 900) * 1000,
              });
              setDeviceCodeError(null);
              setDeviceCodeModalOpen(true);
              setDeviceCodePolling(true);
            } catch (error) {
              console.error("[Auth] Error starting device code flow:", error);
              toast.error(t('start_login_failed'));
            }
          } else {
            toast.error(t('ms_login_requires_electron'));
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
        }}
        colors={colors}
      />



      {catIDRegisterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="flex w-full max-w-2xl h-[520px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden" style={{ backgroundColor: colors.surface }}>
            {/* Left Branding Side */}
            <div className="w-[35%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5" style={{ backgroundColor: `${"#8b5cf6"}10` }}>
              <div className="absolute top-0 left-0 w-full h-full bg-linear-to-b from-purple-500/10 to-transparent pointer-events-none" />
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-purple-500/30 z-10" style={{ backgroundColor: "#8b5cf6" }}>
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="#ffffff">
                  <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
              <h2 className="text-2xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>{t('join_the_journey')}</h2>
              <div className="mt-2 px-3 py-1 rounded-full bg-purple-500/20 text-[10px] font-black uppercase tracking-widest z-10" style={{ color: "#8b5cf6" }}>{t('create_new_id')}</div>
              <p className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10" style={{ color: colors.onSurface }}>{t('create_your_identity_catlab')}</p>
            </div>

            {/* Right Form Side */}
            <div className="flex-1 p-10 flex flex-col relative">
              {/* Close Button */}
              <button
                onClick={() => setCatIDRegisterOpen(false)}
                className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors z-20"
                style={{ color: colors.onSurfaceVariant }}
              >
                <Icons.Close className="w-6 h-6" />
              </button>

              <div className="mb-6">
                <h3 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>{t('create_new_account')}</h3>
                <p className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>{t('start_new_journey')}</p>
              </div>

              <div className="space-y-3.5 flex-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>{t('username')}</label>
                    <input
                      id="catid-reg-username"
                      type="text"
                      placeholder={t('username_placeholder')}
                      className="w-full px-4 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-purple-500/10"
                      style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                      value={catIDRegisterData.username}
                      onChange={(e) => setCatIDRegisterData(prev => ({ ...prev, username: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>{t('email')}</label>
                    <input
                      id="catid-reg-email"
                      type="email"
                      placeholder={t('email')}
                      className="w-full px-4 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-purple-500/10"
                      style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                      value={catIDRegisterData.email}
                      onChange={(e) => setCatIDRegisterData(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>{t('password')}</label>
                  <input
                    id="catid-reg-password"
                    type="password"
                    placeholder={t('password')}
                    className="w-full px-5 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-purple-500/10"
                    style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                    value={catIDRegisterData.password}
                    onChange={(e) => setCatIDRegisterData(prev => ({ ...prev, password: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>{t('confirm_password')}</label>
                  <input
                    id="catid-reg-confirm"
                    type="password"
                    placeholder={t('confirm_password')}
                    className="w-full px-5 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-purple-500/10"
                    style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                    value={catIDRegisterData.confirmPassword}
                    onChange={(e) => setCatIDRegisterData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 mt-8">
                <button
                  onClick={handleCatIDRegister}
                  disabled={isRegistering}
                  className="w-full py-4 rounded-2xl font-black text-lg transition-all hover:scale-[1.02] shadow-lg shadow-purple-500/20 disabled:opacity-50"
                  style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
                >
                  {t('register_now')}
                </button>
                <button
                  onClick={() => {
                    setCatIDRegisterOpen(false);
                    setCatIDLoginOpen(true);
                  }}
                  className="w-full py-3 rounded-2xl font-bold opacity-60 hover:opacity-100 transition-all text-sm"
                  style={{ color: colors.onSurface }}
                >
                  {t('already_have_account')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Verification Waiting Modal */}
      {verificationWaiting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-md rounded-4xl shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden p-8" style={{ backgroundColor: colors.surface }}>
            <div className="flex-1 p-10 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-4xl flex items-center justify-center mb-8 relative" style={{ backgroundColor: `${colors.secondary}20` }}>
                <Icons.Email className="w-10 h-10 animate-bounce" style={{ color: colors.secondary }} />
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center animate-pulse" style={{ backgroundColor: colors.secondary }}>
                  <Icons.Timer className="w-3.5 h-3.5" style={{ color: "#1a1a1a" }} />
                </div>
              </div>

              <h3 className="text-3xl font-black tracking-tight mb-4" style={{ color: colors.onSurface }}>{t('verification_waiting')}</h3>

              <div className="space-y-4 max-w-sm">
                <p className="text-base font-medium opacity-80" style={{ color: colors.onSurface }}>
                  {t('verification_check_email')}
                </p>
                <div className="px-4 py-3 rounded-2xl bg-white/5 border border-white/5">
                  <span className="text-sm font-black opacity-40 mr-2" style={{ color: colors.onSurface }}>EMAIL:</span>
                  <span className="text-sm font-bold" style={{ color: colors.secondary }}>{verificationEmail}</span>
                </div>
                <p className="text-xs opacity-50 leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
                  {t('verification_spam_hint')}
                </p>
              </div>

              <div className="w-full h-px my-10 bg-white/5" />

              <div className="flex flex-col gap-3 w-full">
                <button
                  onClick={handleManualVerificationCheck}
                  className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-yellow-500/10"
                  style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                >
                  {t('verification_confirm_btn')}
                </button>

                <button
                  onClick={() => {
                    setVerificationWaiting(false);
                    setVerificationToken(null);
                  }}
                  className="w-full py-4 rounded-2xl font-bold text-sm opacity-50 hover:opacity-100 hover:bg-white/5 transition-all"
                  style={{ color: colors.onSurface }}
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {forgotPasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="flex w-full max-w-2xl h-[480px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden" style={{ backgroundColor: colors.surface }}>
            {/* Left Branding Side */}
            <div className="w-[38%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5" style={{ backgroundColor: `${colors.secondary}10` }}>
              <div className="absolute top-0 left-0 w-full h-full bg-linear-to-b from-yellow-500/10 to-transparent pointer-events-none" />
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-yellow-500/30 z-10" style={{ backgroundColor: colors.secondary }}>
                {forgotPasswordStep === 'email' ? (
                  <Icons.Info className="w-10 h-10 text-black" />
                ) : (
                  <Icons.Key className="w-10 h-10 text-black" />
                )}
              </div>
              <h2 className="text-2xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>
                {forgotPasswordStep === 'email' ? t('recovery_id') : t('reset_password')}
              </h2>
              <div className="mt-2 px-3 py-1 rounded-full bg-yellow-500/20 text-[10px] font-black uppercase tracking-widest z-10" style={{ color: colors.secondary }}>{t('support_team')}</div>
              <p className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10" style={{ color: colors.onSurface }}>
                {forgotPasswordStep === 'email' ? t('forgot_password_desc') : t('check_email_otp')}
              </p>
            </div>

            {/* Right Side */}
            <div className="flex-1 p-10 flex flex-col relative justify-center">
              {/* Close Button */}
              <button
                onClick={() => {
                  setForgotPasswordOpen(false);
                  setForgotPasswordStep('email');
                  setForgotPasswordEmail("");
                  setForgotPasswordOtp("");
                  setForgotPasswordNewPassword("");
                }}
                className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors z-20"
                style={{ color: colors.onSurfaceVariant }}
              >
                <Icons.Close className="w-6 h-6" />
              </button>

              {forgotPasswordStep === 'email' ? (
                <>
                  <div className="mb-6">
                    <h3 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>{t('forgot_password_title')}</h3>
                    <p className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>{t('enter_email_recovery')}</p>
                  </div>

                  <div className="space-y-4 w-full">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>{t('email')}</label>
                      <input
                        type="email"
                        value={forgotPasswordEmail}
                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        placeholder={t('email_placeholder')}
                        className="w-full px-5 py-3.5 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-yellow-500/10"
                        style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                      />
                    </div>

                    <button
                      onClick={async () => {
                        if (!forgotPasswordEmail) {
                          toast.error(t('fill_email'));
                          return;
                        }
                        setIsForgotPasswordLoading(true);
                        try {
                          const result = await window.api?.forgotPassword?.(forgotPasswordEmail);
                          if (result?.ok) {
                            setForgotPasswordStep('reset');
                            toast.success(result.message || t('otp_sent'));
                          } else {
                            toast.error(result?.error || t('error_occurred'));
                          }
                        } catch (err) {
                          console.error(err);
                          toast.error(t('error_occurred'));
                        } finally {
                          setIsForgotPasswordLoading(false);
                        }
                      }}
                      disabled={isForgotPasswordLoading}
                      className="w-full py-4 rounded-2xl font-black text-lg transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-yellow-500/20 disabled:opacity-50"
                      style={{ backgroundColor: colors.secondary, color: colors.onPrimary }}
                    >
                      {isForgotPasswordLoading ? t('sending') : t('send_otp')}
                    </button>

                    <button
                      onClick={() => {
                        setForgotPasswordOpen(false);
                        setCatIDLoginOpen(true);
                      }}
                      className="w-full py-2 font-bold opacity-60 hover:opacity-100 transition-all text-sm"
                      style={{ color: colors.onSurface }}
                    >
                      {t('back_to_login')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4">
                    <h3 className="text-xl font-black tracking-tight" style={{ color: colors.onSurface }}>{t('set_new_password')}</h3>
                    <p className="text-xs font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>
                      {t('sent_to')} <span style={{ color: colors.secondary }}>{forgotPasswordEmail}</span>
                    </p>
                  </div>

                  <div className="space-y-3 w-full">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>OTP Code (6 Digits)</label>
                      <input
                        type="text"
                        value={forgotPasswordOtp}
                        onChange={(e) => setForgotPasswordOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                        placeholder="######"
                        className="w-full px-5 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-yellow-500/10 tracking-widest font-mono text-center text-xl"
                        style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.secondary }}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>{t('new_password')}</label>
                      <input
                        type="password"
                        value={forgotPasswordNewPassword}
                        onChange={(e) => setForgotPasswordNewPassword(e.target.value)}
                        placeholder={t('password_placeholder')}
                        className="w-full px-5 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-yellow-500/10"
                        style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>{t('confirm_password')}</label>
                      <input
                        type="password"
                        value={forgotPasswordConfirmNewPassword}
                        onChange={(e) => setForgotPasswordConfirmNewPassword(e.target.value)}
                        placeholder={t('confirm_password')}
                        className="w-full px-5 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-yellow-500/10"
                        style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                      />
                    </div>

                    <button
                      onClick={async () => {
                        if (!forgotPasswordOtp || !forgotPasswordNewPassword || !forgotPasswordConfirmNewPassword) {
                          toast.error(t('fill_all_fields'));
                          return;
                        }

                        if (forgotPasswordNewPassword !== forgotPasswordConfirmNewPassword) {
                          toast.error(t('passwords_do_not_match') || "Passwords do not match");
                          return;
                        }
                        setIsForgotPasswordLoading(true);
                        try {
                          const result = await window.api?.resetPassword?.(forgotPasswordEmail, forgotPasswordOtp, forgotPasswordNewPassword);
                          if (result?.ok) {
                            toast.success(result.message || t('password_reset_success'));
                            setForgotPasswordOpen(false);
                            setForgotPasswordStep('email');
                            setCatIDLoginOpen(true);
                          } else {
                            toast.error(result?.error || t('error_occurred'));
                          }
                        } catch (err) {
                          console.error(err);
                          toast.error(t('error_occurred'));
                        } finally {
                          setIsForgotPasswordLoading(false);
                        }
                      }}
                      disabled={isForgotPasswordLoading}
                      className="w-full py-4 rounded-2xl font-black text-lg transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-yellow-500/20 disabled:opacity-50 mt-2"
                      style={{ backgroundColor: colors.secondary, color: colors.onPrimary }}
                    >
                      {isForgotPasswordLoading ? t('processing') : t('reset_password')}
                    </button>

                    <button
                      onClick={() => setForgotPasswordStep('email')}
                      className="w-full py-1 font-bold opacity-60 hover:opacity-100 transition-all text-xs"
                      style={{ color: colors.onSurface }}
                    >
                      {t('wrong_email')}
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
          <div className="flex w-full max-w-2xl h-[450px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden" style={{ backgroundColor: colors.surface }}>
            {/* Left Branding Side */}
            <div className="w-[38%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5" style={{ backgroundColor: `${colors.secondary}10` }}>
              <div className="absolute top-0 left-0 w-full h-full bg-linear-to-b from-yellow-500/10 to-transparent pointer-events-none" />
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-yellow-500/30 z-10" style={{ backgroundColor: colors.secondary }}>
                <Icons.Refresh className="w-10 h-10" style={{ color: colors.onPrimary }} />
              </div>
              <h2 className="text-2xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>{t('connect_account')}</h2>
              <div className="mt-2 px-3 py-1 rounded-full bg-yellow-500/20 text-[10px] font-black uppercase tracking-widest z-10" style={{ color: colors.secondary }}>{t('sync_account')}</div>
              <p className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10" style={{ color: colors.onSurface }}>{t('sync_progress')}</p>
            </div>

            {/* Right Form Side */}
            <div className="flex-1 p-10 flex flex-col relative">
              {/* Close Button */}
              <button
                onClick={() => setLinkCatIDOpen(false)}
                className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors z-20"
                style={{ color: colors.onSurfaceVariant }}
              >
                <Icons.Close className="w-6 h-6" />
              </button>

              <div className="mb-8">
                <h3 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>{t('connect_with_catid')}</h3>
                <p className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>{t('enter_catid_password_to_connect')}</p>
              </div>

              <div className="space-y-4 flex-1">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>{t('catid_username')}</label>
                  <input
                    id="link-catid-username"
                    type="text"
                    placeholder={t('catid_username')}
                    className="w-full px-5 py-3.5 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-yellow-500/10"
                    style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>{t('password')}</label>
                  <div className="relative">
                    <input
                      id="link-catid-password"
                      type={showLinkPassword ? "text" : "password"}
                      placeholder={t('password')}
                      className="w-full px-5 py-3.5 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-yellow-500/10 pr-12"
                      style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
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
                  const username = (document.getElementById("link-catid-username") as HTMLInputElement)?.value;
                  const password = (document.getElementById("link-catid-password") as HTMLInputElement)?.value;

                  if (!username || !password) {
                    toast.error(t('fill_all_fields'));
                    return;
                  }
                  await handleLinkCatID(username, password);
                }}
                className="w-full py-4 rounded-2xl font-black text-lg transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-yellow-500/20 mt-8"
                style={{ backgroundColor: colors.secondary, color: colors.onPrimary }}
              >
                {t('connect_now')}
              </button>
            </div>
          </div>
        </div>
      )}
      {accountManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="flex w-full max-w-3xl h-[600px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden" style={{ backgroundColor: colors.surface }}>
            {/* Left Branding Side */}
            <div className="w-[30%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5" style={{ backgroundColor: `${colors.secondary}10` }}>
              <div className="absolute top-0 left-0 w-full h-full bg-linear-to-b from-yellow-500/10 to-transparent pointer-events-none" />
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-yellow-500/30 z-10" style={{ backgroundColor: colors.secondary }}>
                <Icons.Person className="w-10 h-10" style={{ color: "#1a1a1a" }} />
              </div>
              <h2 className="text-2xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>{t('account_manager')}</h2>
              <div className="mt-2 px-3 py-1 rounded-full bg-yellow-500/20 text-[10px] font-black uppercase tracking-widest z-10" style={{ color: colors.secondary }}>{t('account_management')}</div>
              <p className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10" style={{ color: colors.onSurface }}>{t('manage_accounts_hint')}</p>
            </div>

            {/* Right Side - Account List */}
            <div className="flex-1 p-10 flex flex-col relative">
              {/* Close Button */}
              <button
                onClick={() => setAccountManagerOpen(false)}
                className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors z-20"
                style={{ color: colors.onSurfaceVariant }}
              >
                <Icons.Close className="w-6 h-6" />
              </button>

              <div className="mb-8">
                <h3 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>{t('account_manager')}</h3>
                <p className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>{t('manage_accounts_desc')}</p>
              </div>

              <div className="space-y-3 flex-1 overflow-y-auto px-1 custom-scrollbar mb-6">
                {accounts.map((account, index) => {
                  const isActive = session?.username === account.username && session?.type === account.type;
                  return (
                    <div
                      key={`${account.type}-${account.username}-${index}`}
                      className="group flex items-center gap-4 p-4 rounded-3xl transition-all border-2 relative overflow-hidden"
                      style={{
                        backgroundColor: isActive ? `${colors.secondary}15` : colors.surfaceContainer,
                        borderColor: isActive ? colors.secondary : 'transparent',
                      }}
                    >
                      <div className="relative shrink-0">
                        <MCHead username={account.username} size={54} className="rounded-2xl shadow-lg border-2 border-white/5" />
                        {isActive && (
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 border-4 border-[#1e1e2e] flex items-center justify-center shadow-lg">
                            <Icons.Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-black text-lg flex items-center gap-2" style={{ color: colors.onSurface }}>
                          <span className="truncate">{account.username}</span>
                          {account.isAdmin && (
                            <div className="bg-yellow-500/20 px-2 py-0.5 rounded text-[10px] font-black text-yellow-500 uppercase">{t('admin')}</div>
                          )}
                        </div>
                        <div className="text-xs font-bold uppercase tracking-widest opacity-30 mt-0.5" style={{ color: colors.onSurface }}>
                          {t('account_type_label')} {account.type}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {!isActive && (
                          <button
                            onClick={() => {
                              playClick();
                              selectAccount(account);
                            }}
                            className="bg-white/5 hover:bg-yellow-500 hover:text-black w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-lg active:scale-90"
                          >
                            <Icons.Play className="w-5 h-5 ml-0.5" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            playClick();
                            removeAccountFromList(account);
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
                    <p className="font-black uppercase tracking-widest">{t('no_account_found')}</p>
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
                {t('back_to_main')}
              </button>
            </div>
          </div>
        </div>
      )
      }

      {/* Import Modpack Modal - Horizontal */}
      {
        importModpackOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="flex w-full max-w-3xl h-[520px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden" style={{ backgroundColor: colors.surface }}>
              {/* Left Branding Side */}
              <div className="w-[32%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5" style={{ backgroundColor: `${colors.secondary}10` }}>
                <div className="absolute top-0 left-0 w-full h-full bg-linear-to-b from-yellow-500/10 to-transparent pointer-events-none" />
                <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-yellow-500/30 z-10" style={{ backgroundColor: colors.secondary }}>
                  <Icons.Download className="w-10 h-10 -rotate-180" style={{ color: "#1a1a1a" }} />
                </div>
                <h2 className="text-2xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>{t('import')}</h2>
                <div className="mt-2 px-3 py-1 rounded-full bg-yellow-500/20 text-[10px] font-black uppercase tracking-widest z-10" style={{ color: colors.secondary }}>{t('modpacks')}</div>
                <p className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10" style={{ color: colors.onSurface }}>{t('expand_your_world')}</p>
              </div>

              {/* Right Content Side */}
              <div className="flex-1 p-10 flex flex-col relative">
                {/* Close Button */}
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
                  <h3 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>{t('import_content')}</h3>
                  <p className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>{t('drag_and_drop_or_select')}</p>
                </div>

                {/* Drop Zone */}
                <div
                  className={`relative flex-1 border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center transition-all ${isDragging ? "scale-105" : "hover:border-yellow-500/30"}`}
                  style={{
                    borderColor: isDragging ? colors.secondary : colors.outline,
                    backgroundColor: isDragging ? `${colors.secondary}15` : colors.surfaceContainer,
                  }}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const files = Array.from(e.dataTransfer.files);
                    const validFile = files.find(f => f.name.endsWith('.zip') || f.name.endsWith('.mrpack'));
                    if (validFile) {
                      toast.success(`${t('importing')}: ${validFile.name}`);
                      setImportModpackOpen(false);
                    } else {
                      toast.error(t('support_zip_mrpack'));
                    }
                  }}
                >
                  <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Icons.Box className="w-10 h-10 opacity-40" style={{ color: isDragging ? colors.secondary : colors.onSurface }} />
                  </div>
                  <p className="text-lg font-black tracking-tight" style={{ color: colors.onSurface }}>
                    {isDragging ? t('drop_now_to_import') : t('drag_file_here')}
                  </p>
                  <p className="text-xs font-bold opacity-30 mt-1 uppercase tracking-widest">{t('support_zip_mrpack')}</p>

                  <button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.zip,.mrpack';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          toast.success(`${t('importing')}: ${file.name}`);
                          setImportModpackOpen(false);
                        }
                      };
                      input.click();
                    }}
                    className="mt-6 px-8 py-3 rounded-2xl font-black text-sm transition-all hover:scale-105 shadow-xl"
                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                  >
                    {t('select_file_from_machine')}
                  </button>
                </div>

                {/* Platform Info */}
                <div className="mt-6 flex gap-4">
                  <div className="flex-1 p-3 rounded-2xl flex items-center gap-3 border border-white/5" style={{ backgroundColor: colors.surfaceContainer }}>
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 font-black text-xs">CF</div>
                    <div>
                      <div className="text-xs font-black" style={{ color: colors.onSurface }}>CurseForge</div>
                      <div className="text-[10px] opacity-40 uppercase font-bold">Standard .ZIP</div>
                    </div>
                  </div>
                  <div className="flex-1 p-3 rounded-2xl flex items-center gap-3 border border-white/5" style={{ backgroundColor: colors.surfaceContainer }}>
                    <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500 font-black text-xs">MR</div>
                    <div>
                      <div className="text-xs font-black" style={{ color: colors.onSurface }}>Modrinth</div>
                      <div className="text-[10px] opacity-40 uppercase font-bold">Native .MRPACK</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}



      {/* Inbox/Notifications Modal */}


      {/* Main App Layout */}
      <div className={`flex-1 flex overflow-hidden ${config.rainbowMode ? 'rainbow-mode' : ''}`}>
        {/* Sidebar */}
        {/* Sidebar */}
        <Sidebar 
          colors={colors} 
          onTabSelect={(tabId) => {
            // When user manually clicks Modpack tab, reset to list view
            if (tabId === 'modpack') {
              setSelectedInstance(null);
            }
          }}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header with Drag Region */}
          <header
            className="h-16 flex items-center justify-between pl-6 pr-0 drag-region"
            style={{ backgroundColor: colors.surface }}
          >
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold" style={{ fontFamily: "'Inter', sans-serif", color: colors.onSurface }}>Reality</h1>
              <AppVersionBadge colors={colors} />
            </div>

            {/* Right Side - Notifications and Account - Fixed at top */}
            <div className="fixed top-0 right-36 h-10 flex items-center gap-2 no-drag z-99">
              {/* Calendar Button */}
              {session && (
                <div className="relative">
                  <button
                    onClick={() => setCalendarOpen(!calendarOpen)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 hover:bg-black/10 ${calendarOpen ? 'bg-black/10 scale-110' : ''}`}
                    style={{ color: colors.onSurfaceVariant }}
                    title={config.language === 'th' ? "ปฏิทิน" : "Calendar"}
                  >
                    <Icons.Calendar className="w-5 h-5" />
                  </button>
                  {calendarOpen && (
                    <CalendarWidget
                      isOpen={calendarOpen}
                      onClose={() => setCalendarOpen(false)}
                      colors={colors}
                      language={config.language}
                    />
                  )}
                </div>
              )}

              {/* Notifications/Inbox Button - Only show when logged in */}
              {session && (
                <div className="relative">
                  <button
                    onClick={() => setInboxOpen(!inboxOpen)}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 hover:bg-black/10 relative"
                    style={{ color: colors.onSurfaceVariant }}
                    title={t('news_and_notifications')}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {invitations.length > 0 && (
                      <span
                        className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold"
                        style={{ backgroundColor: '#22c55e', color: 'white' }}
                      >
                        {invitations.length > 9 ? '9+' : invitations.length}
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
                      if (window.api?.invitationsFetch) {
                        window.api.invitationsFetch().then(setInvitations);
                      }
                      setServerRefreshTrigger(prev => prev + 1);
                    }}
                    onNotificationChanged={() => setNotificationRefreshTrigger(prev => prev + 1)}
                  />
                </div>
              )}

              {/* Account Section */}
              <div className="relative">
                {/* Account Button */}
                <button
                  onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all hover:scale-105 hover:bg-black/5"
                  style={{ color: colors.onSurface }}
                >
                  {session ? (
                    <MCHead username={session.username} size={22} className="rounded-full" />
                  ) : (
                    <Icons.Person className="w-4 h-4" />
                  )}
                  {session?.username || "Account"}
                  {session?.isAdmin ? (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full" style={{ backgroundColor: "#fbbf24" }}>
                      <Icons.Check className="w-3 h-3 text-gray-900" />
                    </span>
                  ) : session?.type === "catid" ? (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full" style={{ backgroundColor: "#3b82f6" }}>
                      <Icons.Check className="w-3 h-3 text-white" />
                    </span>
                  ) : session?.type === "microsoft" ? (
                    <>
                      <img src={microsoftIcon.src} alt="Microsoft" className="w-5 h-5" />
                      {session.apiToken && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full" style={{ backgroundColor: "#fbbf24" }}>
                          <Icons.Check className="w-3 h-3 text-white" />
                        </span>
                      )}
                    </>
                  ) : null}
                  <svg className={`w-3 h-3 transition-transform ${accountDropdownOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 10l5 5 5-5z" />
                  </svg>
                </button>

                {/* Account Dropdown */}
                {accountDropdownOpen && (
                  <div
                    className="absolute top-full right-0 mt-2 w-64 rounded-2xl shadow-xl p-4 z-50"
                    style={{ backgroundColor: colors.surface, border: `1px solid ${colors.outline}` }}
                  >
                    <p className="text-xs font-medium mb-3" style={{ color: colors.onSurfaceVariant }}>Account</p>

                    {/* Account List */}
                    <div className="space-y-2 mb-4">
                      {accounts.length > 0 ? (
                        accounts.map((account, index) => (
                          <div
                            key={`${account.type}-${account.username}-${index}`}
                            className="flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all hover:bg-gray-500/10"
                            style={{
                              backgroundColor: session?.username === account.username ? colors.surfaceContainerHighest : "transparent",
                              border: session?.username === account.username ? `1px solid ${colors.secondary}` : "1px solid transparent",
                            }}
                            onClick={() => {
                              selectAccount(account);
                              setAccountDropdownOpen(false);
                            }}
                          >
                            <MCHead username={account.username} size={32} className="rounded-full" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate flex items-center gap-1" style={{ color: colors.onSurface }}>
                                {account.username}
                                {account.isAdmin ? (
                                  <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: "#fbbf24" }}>
                                    <Icons.Check className="w-2.5 h-2.5 text-gray-900" />
                                  </span>
                                ) : account.type === "catid" ? (
                                  <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: "#3b82f6" }}>
                                    <Icons.Check className="w-2.5 h-2.5 text-white" />
                                  </span>
                                ) : account.type === "microsoft" ? (
                                  <img src={microsoftIcon.src} alt="Microsoft" className="w-5 h-5" />
                                ) : null}
                                {account.type === "microsoft" && account.apiToken && (
                                  <span title={t('linked_with_catid')} className="ml-1 opacity-80 inline-flex items-center justify-center w-4 h-4 rounded-full" style={{ backgroundColor: "#fbbf24" }}>
                                    <Icons.Check className="w-3 h-3 text-white" />
                                  </span>
                                )}
                              </div>
                              <div className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                {account.type === "microsoft" ? "Microsoft" : account.type === "catid" ? "CatID Account" : "Offline Account"}
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeAccountFromList(account);
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
                        <p className="text-sm text-center py-2" style={{ color: colors.onSurfaceVariant }}>{t('no_accounts_yet')}</p>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="h-px mb-3" style={{ backgroundColor: colors.outline }} />

                    {/* Actions */}
                    <p className="text-xs font-medium mb-2" style={{ color: colors.onSurfaceVariant }}>Actions</p>
                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          setAccountDropdownOpen(false);
                          setLoginDialogOpen(true);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all hover:bg-gray-500/10"
                        style={{ color: colors.onSurface }}
                      >
                        <span className="flex items-center justify-center w-5 h-5 text-lg" style={{ color: colors.secondary }}>+</span>
                        <span className="text-sm">{t('add_account')}</span>
                      </button>

                      {/* Link CatID (for Microsoft users) */}
                      {session && session.type === "microsoft" && !session.apiToken && (
                        <button
                          onClick={() => {
                            setAccountDropdownOpen(false);
                            setLinkCatIDOpen(true);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all hover:bg-gray-500/10"
                          style={{ color: colors.onSurface }}
                        >
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full" style={{ backgroundColor: "#fbbf24" }}>
                            <Icons.Check className="w-3.5 h-3.5 text-white" />
                          </span>
                          <span className="text-sm">{t('link_catid')}</span>
                        </button>
                      )}

                      {/* Disconnect buttons moved to Settings > Account */}


                      {/* Link Microsoft (for CatID users) */}
                      {session && session.type === "catid" && (
                        <button
                          onClick={async () => {
                            playClick();
                            setAccountDropdownOpen(false);
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
                                // Set flag for linking mode if I add it to state, or just reuse modal 
                                // For now, I'll rely on the modal's polling call checking a new state or just standard poll
                                // I need to update the polling logic to pass 'isLinking'
                                setDeviceCodePolling(true);
                                setDeviceCodeModalOpen(true);
                                // Actually, I need a state to tell the modal this is a LINK operation, not a LOGIN
                                setIsLinkingMicrosoft(true);
                              } catch (error) {
                                toast.error(t('error_occurred'));
                              }
                            }
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all hover:bg-gray-500/10"
                          style={{ color: colors.onSurface }}
                        >
                          {/* Use Microsoft Icon */}
                          <svg className="w-5 h-5" viewBox="0 0 21 21" fill="currentColor">
                            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                          </svg>
                          <span className="text-sm">{t('link_microsoft')}</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          playClick();
                          handleLogout();
                          setAccountDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all hover:bg-gray-500/10"
                        style={{ color: colors.onSurface }}
                      >
                        <span className="w-5 h-5 flex items-center justify-center text-lg">←</span>
                        <span className="text-sm">{t('logout')}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Backdrop to close dropdown */}
                {accountDropdownOpen && (
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setAccountDropdownOpen(false)}
                  />
                )}
              </div>

              {/* Window Control Buttons - Fixed at top-right corner */}
              <div className="fixed top-0 right-0 flex items-center gap-0 z-100 no-drag" style={{ pointerEvents: "auto" }}>
                {/* Minimize */}
                <button
                  onClick={() => window.api?.windowMinimize()}
                  className="w-12 h-10 flex items-center justify-center transition-all hover:bg-black/10"
                  style={{ color: colors.onSurfaceVariant }}
                  title={t('minimize')}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 13H5v-2h14v2z" />
                  </svg>
                </button>
                {/* Maximize / Fullscreen */}
                <button
                  onClick={async () => {
                    await window.api?.windowMaximize();
                    // Sync with fullscreen setting
                    const isMaximized = await window.api?.windowIsMaximized?.();
                    updateConfig({ fullscreen: isMaximized ?? false });
                  }}
                  className="w-12 h-10 flex items-center justify-center transition-all hover:bg-black/10"
                  style={{ color: config.fullscreen ? colors.secondary : colors.onSurfaceVariant }}
                  title={config.fullscreen ? t('restore') : t('maximize')}
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
                {/* Close */}
                <button
                  onClick={() => window.api?.windowClose()}
                  className="w-12 h-10 flex items-center justify-center transition-all hover:bg-red-500 hover:text-white!"
                  style={{ color: colors.onSurfaceVariant }}
                  title={t('close')}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-auto p-6">
            {activeTab === "home" && (
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

            {activeTab === "servers" && (
              <ServerMenu
                colors={colors}
                servers={servers}
                selectedServer={selectedServer}
                setSelectedServer={setSelectedServer}
                session={session}
                setActiveTab={setActiveTab}
                refreshTrigger={serverRefreshTrigger}
                language={config.language}
              />
            )}



            {/* Modpack Tab - Always render to preserve game state */}
            <div key="modpack-tab" className="h-full" style={{ display: activeTab === "modpack" ? "block" : "none" }}>
              <ModPack
                colors={colors}
                config={config}
                setImportModpackOpen={setImportModpackOpen}
                setActiveTab={setActiveTab}
                setSettingsTab={setSettingsTab}
                onShowConfirm={handleShowConfirm}
                isActive={activeTab === "modpack"}
                selectedInstance={selectedInstance}
                setSelectedInstance={setSelectedInstance}
                selectedServer={selectedServer}
                session={session}
                updateConfig={updateConfig}
                language={config.language}
              />
            </div>

            {/* Explore Tab */}
            {activeTab === "explore" && (
              <UIErrorBoundary>
                <Explore colors={colors} config={config} />
              </UIErrorBoundary>
            )}

            {/* Settings Tab */}
            {activeTab === "settings" && (
              <Settings
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
              />
            )}

            {/* Admin Panel Tab - Only for admins */}
            {activeTab === "admin" && isAdmin && adminToken && (
              <AdminPanel
                colors={colors}
                adminToken={adminToken}
                language={config.language}
              />
            )}

            {/* About Tab - New Premium Component */}
            {activeTab === "about" && <About colors={colors} config={config} />}
          </main>
        </div>
      </div>

      {/* Global Export Progress Modal */}
      {isExporting && exportProgress && !isExportMinimized && (
        <InstallProgressModal
          colors={colors}
          installProgress={exportProgress}
          title={t('export_modpack')}
          isBytes={true}
          onCancel={() => handleCancelExport(exportingInstanceId || "")}
          onMinimize={() => setExportMinimized(true)}
          language={config.language}
        />
      )}

      {/* Global Minimized Export Widget */}
      {isExporting && exportProgress && isExportMinimized && (
        <div
          className="fixed bottom-6 right-6 z-50 w-80 rounded-2xl shadow-2xl overflow-hidden border border-white/10 animate-fade-in-up cursor-pointer transition-transform hover:scale-105"
          style={{ backgroundColor: colors.surfaceContainer }}
          onClick={() => setExportMinimized(false)}
        >
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center relative shrink-0"
              style={{ backgroundColor: colors.surfaceContainerHighest }}>
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
                <div className="animate-spin rounded-full h-5 w-5 border-b-2" style={{ borderColor: colors.secondary }}></div>
              )}
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color: colors.onSurface }}>
                {exportProgress.percent}%
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm truncate" style={{ color: colors.onSurface }}>{t('exporting' as any)}</h4>
              <p className="text-xs truncate" style={{ color: colors.onSurfaceVariant }}>
                {exportProgress.message}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setExportMinimized(false); }}
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

