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
import toast, { Toaster } from "react-hot-toast";
import { cn } from "../lib/utils";
import { Icons } from "./ui/Icons";
import { MCHead } from "./ui/MCHead";
import { ChangelogModal } from "./ui/ChangelogModal";
import { NotificationInbox } from "./ui/NotificationInbox";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { LoadingScreen } from "./ui/LoadingScreen";
import { AppVersionBadge } from "./ui/AppVersionBadge";
import microsoftIcon from "../assets/microsoft_icon.svg";
import rIcon from "../assets/r.svg";

import { Home, Settings, ServerMenu, ModPack, Explore, About } from "./tabs";
import AdminPanel from "./tabs/AdminPanel";
import { type AuthSession, type Server, type NewsItem, type LauncherConfig, type ColorTheme } from "../types/launcher";
import { playClick, playSucceed, playNotification, setSoundConfig } from "../lib/sounds";

// ========================================
// Error Boundary
// ========================================

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black text-white p-8">
          <div className="max-w-2xl w-full bg-[#1a1a1a] p-8 rounded-3xl border border-red-500/20 shadow-2xl">
            <h1 className="text-3xl font-black text-red-500 mb-4">Critical Error</h1>
            <p className="text-gray-400 mb-6">เกิดข้อผิดพลาดร้ายแรง ทำให้โปรแกรมไม่สามารถทำงานต่อได้</p>

            <div className="bg-black/50 p-4 rounded-xl border border-white/5 font-mono text-xs text-red-400 overflow-auto max-h-[200px] mb-6 select-text">
              {this.state.error && this.state.error.toString()}
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-xl font-bold transition-colors"
              >
                Reload App
              </button>
              <button
                onClick={() => {
                  window.api?.openExternal("https://discord.gg/your-discord"); // TODO: Add support link
                }}
                className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-colors"
              >
                Contact Support
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
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

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("home");
  const [settingsTab, setSettingsTab] = useState<"appearance" | "game" | "connections" | "launcher" | "resources" | "java" | "account" | "update">("account");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [accounts, setAccounts] = useState<AuthSession[]>([]);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [accountManagerOpen, setAccountManagerOpen] = useState(false);
  const [importModpackOpen, setImportModpackOpen] = useState(false);
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
  const [linkCatIDOpen, setLinkCatIDOpen] = useState(false);

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
  const [inboxTab, setInboxTab] = useState<'news' | 'system'>('news');
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [userNotifications, setUserNotifications] = useState<any[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [processingInvitationId, setProcessingInvitationId] = useState<string | null>(null);
  // Refs to detect new items when polling
  const prevInvRef = useRef<string[]>([]);
  const prevNotifRef = useRef<string[]>([]);

  // Config state
  const [config, setConfig] = useState<LauncherConfig>({
    username: "Player",
    selectedVersion: "1.20.1",
    ramMB: 2048,
    theme: "light",
    colorTheme: "yellow",
    language: "th",
    windowWidth: 1024,
    windowHeight: 700,
    windowAuto: true,
    closeOnLaunch: false,
    downloadSpeedLimit: 0,
    discordRPCEnabled: true,
    clickSoundEnabled: true,
    notificationSoundEnabled: true,
    rainbowMode: false,
    // New settings defaults
    fullscreen: false,
    javaArguments: "",
    maxConcurrentDownloads: 5,
    telemetryEnabled: true,
    autoUpdateEnabled: true,
  });

  // Get colors based on current theme (memoized for performance)
  const colors = useMemo(
    () => getColors(config.colorTheme, config.theme, config.customColor, config.rainbowMode),
    [config.colorTheme, config.theme, config.customColor, config.rainbowMode]
  );

  // Sync sound config
  useEffect(() => {
    setSoundConfig({
      clickSoundEnabled: config.clickSoundEnabled,
      notificationSoundEnabled: config.notificationSoundEnabled
    });
  }, [config.clickSoundEnabled, config.notificationSoundEnabled]);

  // Server data (will be fetched from API)
  const [servers] = useState<Server[]>([]);

  // News data (will be fetched from API)
  const [news] = useState<NewsItem[]>([]);


  // Load config, session, and accounts on mount
  useEffect(() => {
    (async () => {
      // Load config from localStorage FIRST (for dev mode and persistence)
      try {
        const localConfig = localStorage.getItem("reality_config");
        if (localConfig) {
          const parsedConfig = JSON.parse(localConfig);
          setConfig(prev => ({ ...prev, ...parsedConfig }));
          console.log("[Config] Loaded from localStorage:", Object.keys(parsedConfig).length, "keys");
        }
      } catch (e) {
        console.error("[Config] Error loading from localStorage:", e);
      }

      // Then try Electron API (will override localStorage if available)
      try {
        const savedConfig = await window.api?.getConfig();
        if (savedConfig) {
          setConfig(prev => ({ ...prev, ...savedConfig }));
          console.log("[Config] Loaded from Electron API");
        }
      } catch { }

      // Load accounts and session from localStorage FIRST
      let sessionRestored = false;
      try {
        const savedAccounts = localStorage.getItem("reality_accounts");
        if (savedAccounts) {
          const parsedAccounts = JSON.parse(savedAccounts);
          setAccounts(parsedAccounts);

          // Load last selected session
          const lastSessionUsername = localStorage.getItem("reality_last_session");
          if (lastSessionUsername) {
            const lastSession = parsedAccounts.find((acc: AuthSession) => acc.username === lastSessionUsername);
            if (lastSession) {
              setSession(lastSession);
              sessionRestored = true;
            }
          }
        }
      } catch { }

      // Only use API session if localStorage didn't have one
      if (!sessionRestored) {
        try {
          const savedSession = await window.api?.getSession();
          if (savedSession) {
            setSession(savedSession);
            // Add to accounts if not already there
            setAccounts(prev => {
              const exists = prev.some(acc => acc.username === savedSession.username && acc.type === savedSession.type);
              if (!exists) return [...prev, savedSession];
              return prev;
            });
          }
        } catch { }
      }
    })();
  }, []);

  // Track if initial load is complete
  const [isInitialized, setIsInitialized] = useState(false);

  // Mark as initialized after first mount
  useEffect(() => {
    const timer = setTimeout(() => setIsInitialized(true), 500);
    return () => clearTimeout(timer);
  }, []);

  // Save accounts to localStorage when they change (only after initialization)
  useEffect(() => {
    if (!isInitialized) return;

    if (accounts.length > 0) {
      localStorage.setItem("reality_accounts", JSON.stringify(accounts));
      console.log("[Session] Saved accounts:", accounts.map(a => a.username));
    } else {
      // Clear localStorage when all accounts are removed
      localStorage.removeItem("reality_accounts");
      localStorage.removeItem("reality_last_session");
      console.log("[Session] Cleared all accounts");
    }
  }, [accounts, isInitialized]);

  // Save selected session to localStorage (only after initialization)
  useEffect(() => {
    if (!isInitialized) return;

    if (session) {
      localStorage.setItem("reality_last_session", session.username);
      console.log("[Session] Saved last session:", session.username);
    } else {
      localStorage.removeItem("reality_last_session");
      console.log("[Session] Cleared last session");
    }
  }, [session, isInitialized]);

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
                toast(`การแจ้งเตือน: ${n.title}`);
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
              const name = inv.inviterName || 'ผู้ใช้';
              toast.success(`คำเชิญใหม่จาก ${name} สำหรับ ${inv.instanceName}`);
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

    // Initial load + polling
    fetchAndNotifyInvitations();
    timer = setInterval(fetchAndNotifyInvitations, 10000);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [session]);

  // Handle accepting invitation
  const handleAcceptInvitation = async (invitationId: string) => {
    setProcessingInvitationId(invitationId);
    try {
      const success = await window.api?.invitationsAccept?.(invitationId);
      if (success) {
        setInvitations(prev => prev.filter(inv => inv.id !== invitationId));
        toast.success("รับคำเชิญเรียบร้อย!");
      }
    } catch (error) {
      console.error("[Invitations] Error accepting:", error);
      toast.error("ไม่สามารถรับคำเชิญได้");
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
        toast.success("ปฏิเสธคำเชิญแล้ว");
      }
    } catch (error) {
      console.error("[Invitations] Error rejecting:", error);
      toast.error("ไม่สามารถปฏิเสธคำเชิญได้");
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
            changelog: "ยินดีต้อนรับสู่เวอร์ชันใหม่!"
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
        `🚀 มีเวอร์ชันใหม่ ${data.version} พร้อมดาวน์โหลด`,
        { duration: 6000, id: "update-available" }
      );
    });

    // Listen for update downloaded
    const unsubDownloaded = window.api.onUpdateDownloaded?.((data: { version: string }) => {
      toast.success(
        `✅ เวอร์ชัน ${data.version} ดาวน์โหลดเสร็จแล้ว จะติดตั้งเมื่อปิด Launcher`,
        { duration: 8000, id: "update-downloaded" }
      );
    });

    // Listen for update not available
    const unsubNotAvailable = window.api.onUpdateNotAvailable?.(() => {
      toast.success("คุณใช้เวอร์ชันล่าสุดแล้ว", { id: "check-update" });
    });

    // Listen for update error
    const unsubError = window.api.onUpdateError?.((data: { message: string }) => {
      toast.error(`ไม่สามารถตรวจสอบอัปเดต: ${data.message} `, { id: "check-update" });
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
        setDeviceCodeError("รหัสหมดอายุ กรุณาลองใหม่");
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
              type: "microsoft",
              createdAt: Date.now(),  // Add createdAt for session tracking
            };

            // Add to accounts if not exists, or update existing
            setAccounts(prev => {
              const existingIndex = prev.findIndex(acc => acc.uuid === newSession.uuid && acc.type === newSession.type);
              if (existingIndex >= 0) {
                // Update existing account with new token
                const updated = [...prev];
                updated[existingIndex] = {
                  ...updated[existingIndex],
                  accessToken: newSession.accessToken,
                  refreshToken: newSession.refreshToken,
                  tokenExpiresAt: newSession.tokenExpiresAt,
                  apiToken: newSession.apiToken,
                  createdAt: newSession.createdAt
                };
                return updated;
              }
              return [...prev, newSession];
            });

            // Set as current session
            setSession(newSession);

            // Close modal
            setDeviceCodeModalOpen(false);
            setDeviceCodePolling(false);
            setDeviceCodeData(null);
            setDeviceCodeError(null);

            toast.success(`ยินดีต้อนรับ, ${newSession.username} !`);
          } else if (result.status === "expired") {
            setDeviceCodePolling(false);
            setDeviceCodeError(result.error || "รหัสหมดอายุ");
          } else if (result.status === "error") {
            setDeviceCodePolling(false);
            setDeviceCodeError(result.error || "เกิดข้อผิดพลาด");
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
  const updateConfig = async (newConfig: Partial<LauncherConfig>) => {
    // อัพเดท state ทันที (ทำให้ UI update ทันที)
    const updatedConfig = { ...config, ...newConfig };
    setConfig(updatedConfig);

    try {
      // พยายามบันทึกไปที่ Electron (ถ้ามี API)
      if (window.api?.setConfig) {
        const saved = await window.api.setConfig(newConfig);
        if (saved) setConfig(prev => ({ ...prev, ...saved }));
      }
      // บันทึกลง localStorage ด้วย (fallback สำหรับ dev mode)
      localStorage.setItem("reality_config", JSON.stringify(updatedConfig));
      console.log("[Config] Saved config:", Object.keys(newConfig).join(", "));
    } catch (error) {
      console.error("[Config] Error saving:", error);
      // ยังคงบันทึกลง localStorage
      localStorage.setItem("reality_config", JSON.stringify(updatedConfig));
    }
  };

  // Handlers
  // Minecraft username regex: 2-16 characters, letters/numbers/underscore only
  const MINECRAFT_USERNAME_REGEX = /^[a-zA-Z0-9_]{2,16}$/;

  const handleCatIDLogin = async (username: string, password: string) => {
    try {
      // Validate username format
      if (!MINECRAFT_USERNAME_REGEX.test(username)) {
        toast.error("ชื่อผู้ใช้ต้องมี 2-16 ตัวอักษร (a-z, 0-9, _)");
        return;
      }

      // Login via Electron CatID API
      if (!window.api?.loginCatID) {
        toast.error("CatID Login ต้องการ Electron");
        return;
      }

      const toastId = toast.loading("กำลังเข้าสู่ระบบ...");
      const result = await window.api.loginCatID(username, password);
      toast.dismiss(toastId);

      if (!result.ok || !result.session) {
        toast.error(result.error || "เข้าสู่ระบบไม่สำเร็จ");
        return;
      }

      // Create session object
      const newSession: AuthSession = {
        type: "catid",
        username: result.session.username,
        uuid: result.session.uuid,
        minecraftUuid: result.session.minecraftUuid,  // Real Minecraft UUID if linked
        accessToken: result.session.token,
      };

      // Add to accounts if not exists
      setAccounts(prev => {
        const exists = prev.some(acc => acc.username === newSession.username && acc.type === newSession.type);
        if (!exists) {
          return [...prev, newSession];
        }
        return prev;
      });

      // Set as active session
      setSession(newSession);
      setLoginDialogOpen(false);
      toast.success(`ยินดีต้อนรับ, ${newSession.username} !`);

      // Check if user is admin (CatID only)
      if (result.session.token) {
        setAdminToken(result.session.token);
        try {
          const adminCheck = await window.api?.checkAdminStatus(result.session.token);
          if (adminCheck?.isAdmin) {
            setIsAdmin(true);
            console.log("[Admin] User is admin:", result.session.username);
            // Update session and accounts with admin status
            const adminSession = { ...newSession, isAdmin: true };
            setSession(adminSession);
            // Update accounts list to include isAdmin
            setAccounts(prev => prev.map(acc =>
              acc.username === newSession.username && acc.type === newSession.type
                ? { ...acc, isAdmin: true }
                : acc
            ));
          }
        } catch (e) {
          console.log("[Admin] Could not check admin status");
        }
      }
    } catch (error: any) {
      toast.error(error?.message || "เข้าสู่ระบบไม่สำเร็จ");
    }
  };

  const handleOfflineLogin = async (username: string) => {
    try {
      // Validate username format
      if (!MINECRAFT_USERNAME_REGEX.test(username)) {
        toast.error("ชื่อผู้ใช้ต้องมี 2-16 ตัวอักษร (a-z, 0-9, _)");
        return;
      }

      // Login via Electron Offline API
      if (!window.api?.loginOffline) {
        toast.error("Offline Login ต้องการ Electron");
        return;
      }

      const result = await window.api.loginOffline(username);

      if (!result.ok || !result.session) {
        toast.error(result.error || "เข้าสู่ระบบไม่สำเร็จ");
        return;
      }

      // Create session object
      const newSession: AuthSession = {
        type: "offline",
        username: result.session.username,
        uuid: result.session.uuid,
        accessToken: "",
      };

      // Add to accounts if not exists
      setAccounts(prev => {
        const exists = prev.some(acc => acc.username === newSession.username && acc.type === newSession.type);
        if (!exists) {
          return [...prev, newSession];
        }
        return prev;
      });

      // Set as active session
      setSession(newSession);
      setLoginDialogOpen(false);
      toast.success(`ยินดีต้อนรับ, ${newSession.username} !`);
    } catch (error: any) {
      toast.error(error?.message || "เข้าสู่ระบบไม่สำเร็จ");
    }
  };

  const handleCatIDRegister = async (username: string, email: string, password: string, confirmPassword?: string) => {
    try {
      // Validate username format
      if (!MINECRAFT_USERNAME_REGEX.test(username)) {
        toast.error("ชื่อผู้ใช้ต้องมี 2-16 ตัวอักษร (a-z, 0-9, _)");
        return false;
      }

      // Register via Electron CatID API
      if (!window.api?.registerCatID) {
        toast.error("CatID Register ต้องการ Electron");
        return false;
      }

      const toastId = toast.loading("กำลังสมัครสมาชิก...");
      const result = await window.api.registerCatID(username, email, password, confirmPassword);
      toast.dismiss(toastId);

      if (!result.ok) {
        toast.error(result.error || "สมัครสมาชิกไม่สำเร็จ");
        return false;
      }

      toast.success("สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ");
      setCatIDRegisterOpen(false);
      setLoginDialogOpen(true);
      return true;
    } catch (error: any) {
      toast.error(error?.message || "สมัครสมาชิกไม่สำเร็จ");
      return false;
    }
  };

  // เลือกบัญชีที่จะใช้งาน
  const selectAccount = async (account: AuthSession) => {
    // Sync session with backend FIRST to ensure data consistency
    try {
      await window.api?.setActiveSession?.(account);
    } catch (err) {
      console.error("[Auth] Failed to sync session with backend:", err);
    }

    setSession(account);
    setAccountManagerOpen(false);
    toast.success(`เปลี่ยนเป็นบัญชี ${account.username} `);

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

  // ลบบัญชีออกจากรายการ
  const removeAccount = async (account: AuthSession) => {
    setAccounts(prev => prev.filter(acc => !(acc.username === account.username && acc.type === account.type)));
    if (session?.username === account.username && session?.type === account.type) {
      // ถ้าลบบัญชีที่กำลังใช้อยู่ ให้เรียก logout เพื่อลบ session.json ด้วย
      await window.api?.logout();
      setSession(null);
    }
    toast.success(`ลบบัญชี ${account.username} แล้ว`);
  };

  const handleLogout = async () => {
    try {
      await window.api?.logout();
      setSession(null);
      // Reset admin state on logout
      setIsAdmin(false);
      setAdminToken(null);
      toast.success("ออกจากระบบแล้ว");
    } catch {
      toast.error("ออกจากระบบไม่สำเร็จ");
    }
  };

  const handleLinkCatID = async (username: string, password: string) => {
    const t = toast.loading("กำลังเชื่อมต่อ...");
    try {
      if (!(window as any).api?.linkCatID) {
        toast.error("ไม่พบฟังก์ชันเชื่อมต่อ กรุณารีสตาร์ท Launcher", { id: t });
        return;
      }

      const res = await (window as any).api.linkCatID(username, password);
      if (res?.ok) {
        toast.success("เชื่อมต่อสำเร็จ!", { id: t });
        setLinkCatIDOpen(false);

        // Refresh session
        const updatedSession = await window.api?.getSession?.();
        if (updatedSession) {
          setSession(updatedSession);
          // Update in accounts list too
          setAccounts(prev => prev.map(acc =>
            acc.username === updatedSession.username && acc.type === "microsoft"
              ? updatedSession
              : acc
          ));
        }
      } else {
        toast.error(res?.error || "เชื่อมต่อไม่สำเร็จ", { id: t });
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด", { id: t });
    }
  };



  const handleBrowseJava = async () => {
    const path = await window.api?.browseJava();
    if (path) {
      updateConfig({ javaPath: path });
    }
  };

  const handleBrowseMinecraftDir = async () => {
    const path = await window.api?.browseDirectory("เลือกโฟลเดอร์ .minecraft");
    if (path) {
      updateConfig({ minecraftDir: path });
    }
  };

  const handleUnlink = (provider: "catid" | "microsoft") => {
    const isCatID = provider === "catid";
    setConfirmDialog({
      open: true,
      title: isCatID ? "ยกเลิกการเชื่อมต่อ CatID" : "ยกเลิกการเชื่อมต่อ Microsoft",
      message: isCatID
        ? "คุณต้องการยกเลิกการเชื่อมต่อกับบัญชี CatID หรือไม่? คุณจะไม่สามารถเข้าถึงฟีเจอร์ออนไลน์บางอย่างได้จนกว่าจะเชื่อมต่อใหม่"
        : "คุณต้องการยกเลิกการเชื่อมต่อกับบัญชี Microsoft หรือไม่? ระบบจะกลับไปใช้บัญชี CatID เดิมของคุณ",
      confirmText: "ยกเลิกการเชื่อมต่อ",
      confirmColor: "#ef4444",
      onConfirm: async () => {
        try {
          const res = await window.api?.authUnlink(provider);
          if (res?.ok) {
            toast.success("ยกเลิกการเชื่อมต่อสำเร็จ");
            // Refresh session and accounts without hard reload
            const updatedSession = (await window.api?.getSession()) ?? null;
            setSession(updatedSession);
            // Refresh accounts list if necessary (or just let the user re-login if session is gone?)
            // Actually, getSession returns the *active* session.
            // If we unlinked CatID, we should still be Microsoft.
            if (updatedSession) {
              setAccounts(prev => prev.map(acc =>
                acc.uuid === updatedSession.uuid ? updatedSession : acc
              ));
            }
          } else {
            toast.error(`${res?.error || "ไม่สามารถยกเลิกการเชื่อมต่อได้"} (Token: ${session?.apiToken})`);
          }
        } catch (err) {
          toast.error("เกิดข้อผิดพลาด");
        }
      }
    });
  };


  // Show loading screen
  if (isLoading) {
    return <LoadingScreen onComplete={() => setIsLoading(false)} themeColor={colors.secondary} />;
  }

  // Render tabs - split into main and bottom navigation
  const mainNavItems = [
    { id: "home", icon: Icons.Home, label: "หน้าหลัก" },
    { id: "servers", icon: Icons.Dns, label: "เซิร์ฟเวอร์" },
    { id: "modpack", icon: Icons.Box, label: "มอดแพ็ค" },
    { id: "explore", icon: Icons.Search, label: "สำรวจ" },
  ];

  // Admin tab is added dynamically based on isAdmin state
  const bottomNavItems = [
    ...(isAdmin ? [{ id: "admin", icon: Icons.Admin, label: "ผู้ดูแล" }] : []),
    { id: "settings", icon: Icons.Settings, label: "ตั้งค่า" },
    { id: "about", icon: Icons.Info, label: "เกี่ยวกับ" },
  ];

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



      {/* Login Dialog - Horizontal Selection */}
      {loginDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="flex w-full max-w-2xl h-[480px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden" style={{ backgroundColor: colors.surface }}>
            {/* Left Branding Side */}
            <div className="w-[35%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5" style={{ backgroundColor: `${colors.secondary}10` }}>
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none" />
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-yellow-500/30 z-10" style={{ backgroundColor: colors.secondary }}>
                <Icons.Login className="w-10 h-10" style={{ color: "#1a1a1a" }} />
              </div>
              <h2 className="text-2xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>Access</h2>
              <div className="mt-2 px-3 py-1 rounded-full bg-yellow-500/20 text-[10px] font-black uppercase tracking-widest z-10" style={{ color: colors.secondary }}>Access Point</div>
              <p className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10" style={{ color: colors.onSurface }}>เลือกวิธีการเข้าสู่ระบบ<br />ที่คุณต้องการ</p>
            </div>

            {/* Right Side - Buttons */}
            <div className="flex-1 p-10 flex flex-col relative">
              {/* Close Button */}
              <button
                onClick={() => setLoginDialogOpen(false)}
                className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors z-20"
                style={{ color: colors.onSurfaceVariant }}
              >
                <Icons.Close className="w-6 h-6" />
              </button>

              <div className="mb-8">
                <h3 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>เข้าสู่ระบบ</h3>
                <p className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>ก้าวเข้าสู่โลกของ Minecraft ในแบบที่คุณเลือก</p>
              </div>

              <div className="space-y-3.5 flex-1">
                {/* Microsoft Login Button */}
                <button
                  onClick={async () => {
                    console.log("[Auth] Microsoft login button clicked - starting device code flow");
                    setLoginDialogOpen(false);
                    if (window.api?.startDeviceCodeAuth) {
                      try {
                        const toastId = toast.loading("กำลังขอรหัสเข้าสู่ระบบ...");
                        const result = await window.api.startDeviceCodeAuth();
                        toast.dismiss(toastId);
                        if (!result.ok || !result.deviceCode || !result.userCode) {
                          toast.error(result.error || "ไม่สามารถขอรหัสได้");
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
                        toast.error("ไม่สามารถเริ่มการเข้าสู่ระบบได้");
                      }
                    } else {
                      toast.error("Microsoft Login ต้องการ Electron - ใช้ Offline Mode แทน");
                    }
                  }}
                  className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] border border-white/5 shadow-lg group"
                  style={{ backgroundColor: "#2f2f2f", color: "#ffffff" }}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                    <svg className="w-6 h-6" viewBox="0 0 21 21" fill="currentColor">
                      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="font-black text-base">บัญชี Microsoft</div>
                    <div className="text-[10px] uppercase font-bold tracking-widest opacity-40">ของแท้ Premium</div>
                  </div>
                </button>

                {/* CatID Login Button */}
                <button
                  onClick={() => {
                    setLoginDialogOpen(false);
                    setCatIDLoginOpen(true);
                  }}
                  className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] border border-white/5 shadow-lg group"
                  style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Icons.Person className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <div className="font-black text-base">บัญชี CatID</div>
                    <div className="text-[10px] uppercase font-bold tracking-widest opacity-60">บัญชี CatLab</div>
                  </div>
                </button>

                {/* Offline Account Button */}
                <button
                  onClick={() => {
                    setLoginDialogOpen(false);
                    setOfflineUsernameOpen(true);
                  }}
                  className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all border-2 border-dashed hover:bg-white/5 group"
                  style={{ borderColor: colors.outline, color: colors.onSurface }}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                    <Icons.Lock className="w-6 h-6 opacity-40" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-black text-base opacity-80">โหมดออฟไลน์</div>
                    <div className="text-[10px] uppercase font-bold tracking-widest opacity-30">เล่นในเครื่องเท่านั้น</div>
                  </div>
                  <Icons.ArrowDown className="w-5 h-5 -rotate-90 opacity-40 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {offlineUsernameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="flex w-full max-w-xl h-[380px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden" style={{ backgroundColor: colors.surface }}>
            {/* Left Branding Side */}
            <div className="w-[35%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5" style={{ backgroundColor: `${colors.secondary}10` }}>
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none" />
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-2xl shadow-yellow-500/30 z-10" style={{ backgroundColor: colors.secondary }}>
                <Icons.Person className="w-8 h-8" style={{ color: "#1a1a1a" }} />
              </div>
              <h2 className="text-xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>โหมดเล่นจำกัด</h2>
              <div className="mt-2 px-3 py-0.5 rounded-full bg-yellow-500/20 text-[9px] font-black uppercase tracking-widest z-10" style={{ color: colors.secondary }}>Local Play</div>
            </div>

            {/* Right Form Side */}
            <div className="flex-1 p-10 flex flex-col relative justify-center">
              {/* Close Button */}
              <button
                onClick={() => setOfflineUsernameOpen(false)}
                className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors z-20"
                style={{ color: colors.onSurfaceVariant }}
              >
                <Icons.Close className="w-6 h-6" />
              </button>

              <div className="mb-6 mt-2">
                <h3 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>ตั้งชื่อเข้าเล่น</h3>
                <p className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>กำหนดชื่อตัวละครของคุณ (ออฟไลน์)</p>
              </div>

              <div className="space-y-4 flex-1">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>ชื่อที่ต้องการใช้</label>
                  <input
                    id="offline-username-input"
                    type="text"
                    placeholder="ชื่อผู้ใช้ (3-16 ตัวอักษร)"
                    maxLength={16}
                    className="w-full px-5 py-3.5 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-yellow-500/10 text-lg"
                    style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                    autoFocus
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        const username = e.currentTarget.value.trim();
                        if (username && username.length >= 3) {
                          setOfflineUsernameOpen(false);
                          await handleOfflineLogin(username);
                        } else {
                          toast.error("ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร");
                        }
                      }
                    }}
                  />
                </div>
              </div>

              <button
                onClick={async () => {
                  const usernameInput = document.getElementById("offline-username-input") as HTMLInputElement;
                  const username = usernameInput?.value.trim();
                  if (username && username.length >= 3) {
                    setOfflineUsernameOpen(false);
                    await handleOfflineLogin(username);
                  } else {
                    toast.error("ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร");
                  }
                }}
                className="w-full py-4 rounded-2xl font-black text-lg transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-yellow-500/20"
                style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
              >
                เข้าเล่นเลย
              </button>
            </div>
          </div>
        </div>
      )}
      {catIDLoginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="flex w-full max-w-2xl h-[450px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden" style={{ backgroundColor: colors.surface }}>
            {/* Left Branding Side */}
            <div className="w-[38%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5" style={{ backgroundColor: `${"#8b5cf6"}10` }}>
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-purple-500/10 to-transparent pointer-events-none" />
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-purple-500/30 z-10" style={{ backgroundColor: "#8b5cf6" }}>
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="#ffffff">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm0 14c-2.03 0-4.43-.82-6.14-2.88C7.55 15.8 9.68 15 12 15s4.45.8 6.14 2.12C16.43 19.18 14.03 20 12 20z" />
                </svg>
              </div>
              <h2 className="text-2xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>ID CatLab</h2>
              <div className="mt-2 px-3 py-1 rounded-full bg-purple-500/20 text-[10px] font-black uppercase tracking-widest z-10" style={{ color: "#8b5cf6" }}>ยืนยันตัวตน</div>
              <p className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10" style={{ color: colors.onSurface }}>ประตูสู่สังคมคุณภาพของ<br />ชุมชน CatLab DESIGN</p>
            </div>

            {/* Right Form Side */}
            <div className="flex-1 p-10 flex flex-col relative">
              {/* Close Button */}
              <button
                onClick={() => setCatIDLoginOpen(false)}
                className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors z-20"
                style={{ color: colors.onSurfaceVariant }}
              >
                <Icons.Close className="w-6 h-6" />
              </button>

              <div className="mb-8">
                <h3 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>ยินดีต้อนรับกลับมา</h3>
                <p className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>เข้าสู่ระบบด้วยบัญชี CatID ของคุณ</p>
              </div>

              <div className="space-y-4 flex-1">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>ชื่อผู้ใช้</label>
                  <input
                    id="catid-username"
                    type="text"
                    placeholder="ชื่อผู้ใช้"
                    className="w-full px-5 py-3.5 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-purple-500/10"
                    style={{
                      borderColor: 'transparent',
                      backgroundColor: colors.surfaceContainer,
                      color: colors.onSurface,
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>รหัสผ่าน</label>
                  <input
                    id="catid-password"
                    type="password"
                    placeholder="รหัสผ่าน"
                    className="w-full px-5 py-3.5 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-purple-500/10"
                    style={{
                      borderColor: 'transparent',
                      backgroundColor: colors.surfaceContainer,
                      color: colors.onSurface,
                    }}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        const usernameInput = document.getElementById("catid-username") as HTMLInputElement;
                        const passwordInput = e.currentTarget;
                        if (usernameInput?.value && passwordInput?.value) {
                          await handleCatIDLogin(usernameInput.value, passwordInput.value);
                        }
                      }
                    }}
                  />
                </div>

                <button
                  onClick={() => {
                    setCatIDLoginOpen(false);
                    setForgotPasswordOpen(true);
                  }}
                  className="text-xs font-black text-right w-full hover:underline transition-all tracking-wide opacity-80"
                  style={{ color: "#8b5cf6" }}
                >
                  ลืมรหัสผ่าน?
                </button>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={async () => {
                    const usernameInput = document.getElementById("catid-username") as HTMLInputElement;
                    const passwordInput = document.getElementById("catid-password") as HTMLInputElement;
                    if (usernameInput?.value && passwordInput?.value) {
                      await handleCatIDLogin(usernameInput.value, passwordInput.value);
                      setCatIDLoginOpen(false);
                    } else {
                      toast.error("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
                    }
                  }}
                  className="flex-[2] py-4 rounded-2xl font-black text-lg transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-purple-500/20"
                  style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
                >
                  เข้าสู่ระบบ
                </button>
                <button
                  onClick={() => {
                    setCatIDLoginOpen(false);
                    setCatIDRegisterOpen(true);
                  }}
                  className="flex-1 py-4 rounded-2xl font-bold border-2 transition-all hover:bg-white/5"
                  style={{ borderColor: colors.outline, color: colors.onSurface }}
                >
                  สมัครใหม่
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {catIDRegisterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="flex w-full max-w-2xl h-[520px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden" style={{ backgroundColor: colors.surface }}>
            {/* Left Branding Side */}
            <div className="w-[35%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5" style={{ backgroundColor: `${"#8b5cf6"}10` }}>
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-purple-500/10 to-transparent pointer-events-none" />
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-purple-500/30 z-10" style={{ backgroundColor: "#8b5cf6" }}>
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="#ffffff">
                  <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
              <h2 className="text-2xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>ร่วมเดินทัพ</h2>
              <div className="mt-2 px-3 py-1 rounded-full bg-purple-500/20 text-[10px] font-black uppercase tracking-widest z-10" style={{ color: "#8b5cf6" }}>สร้างไอดีใหม่</div>
              <p className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10" style={{ color: colors.onSurface }}>สร้างตัวตนของคุณใน<br />โลกของ CatLab ได้แล้ววันนี้</p>
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
                <h3 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>สร้างบัญชีใหม่</h3>
                <p className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>เริ่มต้นการเดินทางครั้งใหม่กับเรา</p>
              </div>

              <div className="space-y-3.5 flex-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>ชื่อผู้ใช้</label>
                    <input
                      id="catid-reg-username"
                      type="text"
                      placeholder="ชื่อผู้ใช้"
                      className="w-full px-4 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-purple-500/10"
                      style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>อีเมล</label>
                    <input
                      id="catid-reg-email"
                      type="email"
                      placeholder="อีเมล"
                      className="w-full px-4 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-purple-500/10"
                      style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>รหัสผ่าน</label>
                  <input
                    id="catid-reg-password"
                    type="password"
                    placeholder="รหัสผ่าน"
                    className="w-full px-5 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-purple-500/10"
                    style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>ยืนยันรหัสผ่านอีกครั้ง</label>
                  <input
                    id="catid-reg-confirm"
                    type="password"
                    placeholder="ยืนยันรหัสผ่าน"
                    className="w-full px-5 py-3 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-purple-500/10"
                    style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 mt-8">
                <button
                  onClick={async () => {
                    const username = (document.getElementById("catid-reg-username") as HTMLInputElement)?.value;
                    const email = (document.getElementById("catid-reg-email") as HTMLInputElement)?.value;
                    const password = (document.getElementById("catid-reg-password") as HTMLInputElement)?.value;
                    const confirm = (document.getElementById("catid-reg-confirm") as HTMLInputElement)?.value;

                    if (!username || !email || !password || !confirm) {
                      toast.error("กรุณากรอกข้อมูลให้ครบ");
                      return;
                    }
                    if (password !== confirm) {
                      toast.error("รหัสผ่านไม่ตรงกัน");
                      return;
                    }
                    if (password.length < 6) {
                      toast.error("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
                      return;
                    }
                    await handleCatIDRegister(username, email, password, confirm);
                  }}
                  className="w-full py-4 rounded-2xl font-black text-lg transition-all hover:scale-[1.02] shadow-lg shadow-purple-500/20"
                  style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
                >
                  สมัครสมาชิกตอนนี้
                </button>
                <button
                  onClick={() => {
                    setCatIDRegisterOpen(false);
                    setCatIDLoginOpen(true);
                  }}
                  className="w-full py-3 rounded-2xl font-bold opacity-60 hover:opacity-100 transition-all text-sm"
                  style={{ color: colors.onSurface }}
                >
                  มีบัญชีอยู่แล้ว? เข้าสู่ระบบ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {forgotPasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="flex w-full max-w-2xl h-[450px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden" style={{ backgroundColor: colors.surface }}>
            {/* Left Branding Side */}
            <div className="w-[38%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5" style={{ backgroundColor: `${colors.secondary}10` }}>
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none" />
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-yellow-500/30 z-10" style={{ backgroundColor: colors.secondary }}>
                <Icons.Info className="w-10 h-10 text-black" />
              </div>
              <h2 className="text-2xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>กู้คืนไอดี</h2>
              <div className="mt-2 px-3 py-1 rounded-full bg-yellow-500/20 text-[10px] font-black uppercase tracking-widest z-10" style={{ color: colors.secondary }}>ฝ่ายสนับสนุน</div>
              <p className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10" style={{ color: colors.onSurface }}>หายใจเข้าลึกๆ<br />แล้วพยายามนึกให้ออกนะครับ</p>
            </div>

            {/* Right Side */}
            <div className="flex-1 p-10 flex flex-col items-center justify-center relative">
              {/* Close Button */}
              <button
                onClick={() => setForgotPasswordOpen(false)}
                className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors z-20"
                style={{ color: colors.onSurfaceVariant }}
              >
                <Icons.Close className="w-6 h-6" />
              </button>

              <h2 className="text-2xl font-black mb-8 tracking-tight" style={{ color: colors.onSurface }}>
                ลืมรหัสผ่านใช่ไหม?
              </h2>

              {/* Random Meme GIF - Modern Container */}
              <div className="relative w-44 h-44 mb-8 rounded-3xl overflow-hidden shadow-2xl border-4 border-white/5 group">
                <img
                  src={`https://media.giphy.com/media/${["3o7btPCcdNniyf0ArS", "l2SpMDbxEdUXtBHqM", "10h8CdMQUWoZ8Y", "xT5LMHxhOfscxPfIfm", "3og0INyCmHlNylks9O", "26FPy3QZQqGtDcrja"][Math.floor(Math.random() * 6)]}/giphy.gif`}
                  alt="meme"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
              </div>

              <p className="text-lg font-bold mb-8 opacity-60 text-center" style={{ color: colors.onSurface }}>
                <span>หายใจเข้าลึกๆ และนึกดีๆ ก่อนใส่ใหม่นะ</span>
              </p>

              <button
                onClick={() => {
                  setForgotPasswordOpen(false);
                  setCatIDLoginOpen(true);
                }}
                className="w-full py-4 rounded-2xl font-black text-lg transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-yellow-500/20"
                style={{ backgroundColor: colors.secondary, color: colors.onPrimary }}
              >
                ← กลับไปหน้าเข้าสู่ระบบ
              </button>
            </div>
          </div>
        </div>
      )}
      {linkCatIDOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="flex w-full max-w-2xl h-[450px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden" style={{ backgroundColor: colors.surface }}>
            {/* Left Branding Side */}
            <div className="w-[38%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5" style={{ backgroundColor: `${colors.secondary}10` }}>
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none" />
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-yellow-500/30 z-10" style={{ backgroundColor: colors.secondary }}>
                <Icons.Refresh className="w-10 h-10" style={{ color: colors.onPrimary }} />
              </div>
              <h2 className="text-2xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>Connect account</h2>
              <div className="mt-2 px-3 py-1 rounded-full bg-yellow-500/20 text-[10px] font-black uppercase tracking-widest z-10" style={{ color: colors.secondary }}>ซิงค์บัญชี</div>
              <p className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10" style={{ color: colors.onSurface }}>ซิงค์ความคืบหน้า<br />การเล่นเกมของคุณ</p>
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
                <h3 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>เชื่อมต่อกับบัญชี CatID</h3>
                <p className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>ใส่รหัสผ่าน CatID ของคุณเพื่อทำการเชื่อมต่อ</p>
              </div>

              <div className="space-y-4 flex-1">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>ชื่อผู้ใช้ CatID</label>
                  <input
                    id="link-catid-username"
                    type="text"
                    placeholder="ชื่อผู้ใช้ CatID"
                    className="w-full px-5 py-3.5 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-yellow-500/10"
                    style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase ml-1 opacity-40 tracking-wider" style={{ color: colors.onSurface }}>รหัสผ่าน</label>
                  <input
                    id="link-catid-password"
                    type="password"
                    placeholder="รหัสผ่าน CatID"
                    className="w-full px-5 py-3.5 rounded-2xl border-2 transition-all outline-none focus:ring-4 focus:ring-yellow-500/10"
                    style={{ borderColor: 'transparent', backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                  />
                </div>
              </div>

              <button
                onClick={async () => {
                  const username = (document.getElementById("link-catid-username") as HTMLInputElement)?.value;
                  const password = (document.getElementById("link-catid-password") as HTMLInputElement)?.value;

                  if (!username || !password) {
                    toast.error("กรุณากรอกข้อมูลให้ครบ");
                    return;
                  }
                  await handleLinkCatID(username, password);
                }}
                className="w-full py-4 rounded-2xl font-black text-lg transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-yellow-500/20 mt-8"
                style={{ backgroundColor: colors.secondary, color: colors.onPrimary }}
              >
                เชื่อมต่อทันที
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
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none" />
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-yellow-500/30 z-10" style={{ backgroundColor: colors.secondary }}>
                <Icons.Person className="w-10 h-10" style={{ color: "#1a1a1a" }} />
              </div>
              <h2 className="text-2xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>บัญชี</h2>
              <div className="mt-2 px-3 py-1 rounded-full bg-yellow-500/20 text-[10px] font-black uppercase tracking-widest z-10" style={{ color: colors.secondary }}>การจัดการ</div>
              <p className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10" style={{ color: colors.onSurface }}>สลับหรือลบบัญชี<br />ที่คุณมีอยู่ในเครื่อง</p>
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
                <h3 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>จัดการบัญชี</h3>
                <p className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>เลือกบัญชีที่คุณต้องการเล่น</p>
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
                            <div className="bg-yellow-500/20 px-2 py-0.5 rounded text-[10px] font-black text-yellow-500 uppercase">ผู้ดูแล</div>
                          )}
                        </div>
                        <div className="text-xs font-bold uppercase tracking-widest opacity-30 mt-0.5" style={{ color: colors.onSurface }}>
                          บัญชีแบบ {account.type}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {!isActive && (
                          <button
                            onClick={() => selectAccount(account)}
                            className="bg-white/5 hover:bg-yellow-500 hover:text-black w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-lg active:scale-90"
                          >
                            <Icons.Play className="w-5 h-5 ml-0.5" />
                          </button>
                        )}
                        <button
                          onClick={() => removeAccount(account)}
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
                    <p className="font-black uppercase tracking-widest">ไม่พบบัญชีผู้ใช้</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => setAccountManagerOpen(false)}
                className="w-full py-4 rounded-2xl font-black text-lg transition-all hover:bg-white/5 border-2 border-white/5 active:scale-[0.98]"
                style={{ color: colors.onSurface }}
              >
                กลับสู่หน้าหลัก
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
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none" />
                <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-yellow-500/30 z-10" style={{ backgroundColor: colors.secondary }}>
                  <Icons.Download className="w-10 h-10 -rotate-180" style={{ color: "#1a1a1a" }} />
                </div>
                <h2 className="text-2xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>นำเข้า</h2>
                <div className="mt-2 px-3 py-1 rounded-full bg-yellow-500/20 text-[10px] font-black uppercase tracking-widest z-10" style={{ color: colors.secondary }}>มอดแพ็ค</div>
                <p className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10" style={{ color: colors.onSurface }}>ขยายโลกของคุณ<br />ด้วยเนื้อหาใหม่ๆ</p>
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
                  <h3 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>นำเข้าเนื้อหา</h3>
                  <p className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>ลากและวางไฟล์ หรือเลือกไฟล์จากเครื่องของคุณ</p>
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
                      toast.success(`กำลังนำเข้า: ${validFile.name}`);
                      setImportModpackOpen(false);
                    } else {
                      toast.error("รองรับเฉพาะไฟล์ .zip และ .mrpack");
                    }
                  }}
                >
                  <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Icons.Box className="w-10 h-10 opacity-40" style={{ color: isDragging ? colors.secondary : colors.onSurface }} />
                  </div>
                  <p className="text-lg font-black tracking-tight" style={{ color: colors.onSurface }}>
                    {isDragging ? "ปล่อยทันทีเพื่อนำเข้า" : "ลากไฟล์มาวางที่นี่"}
                  </p>
                  <p className="text-xs font-bold opacity-30 mt-1 uppercase tracking-widest">รองรับไฟล์ .zip และ .mrpack</p>

                  <button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.zip,.mrpack';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          toast.success(`กำลังนำเข้า: ${file.name}`);
                          setImportModpackOpen(false);
                        }
                      };
                      input.click();
                    }}
                    className="mt-6 px-8 py-3 rounded-2xl font-black text-sm transition-all hover:scale-105 shadow-xl"
                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                  >
                    เลือกไฟล์จากเครื่อง
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

      {deviceCodeModalOpen && deviceCodeData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="flex w-full max-w-2xl h-[450px] rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative border border-white/10 overflow-hidden" style={{ backgroundColor: colors.surface }}>
            {/* Left Branding Side */}
            <div className="w-[35%] relative flex flex-col items-center justify-center p-8 overflow-hidden border-r border-white/5" style={{ backgroundColor: "#2f2f2f10" }}>
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl z-10" style={{ backgroundColor: "#2f2f2f" }}>
                <svg className="w-10 h-10" viewBox="0 0 21 21" fill="currentColor">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
              </div>
              <h2 className="text-2xl font-black tracking-tighter text-center z-10" style={{ color: colors.onSurface }}>ยืนยันตัวตน</h2>
              <div className="mt-2 px-3 py-1 rounded-full bg-white/5 text-[10px] font-black uppercase tracking-widest z-10" style={{ color: colors.onSurfaceVariant }}>ระบบตรวจสอบสิทธิ์</div>
              <p className="mt-8 text-xs font-bold opacity-30 text-center leading-relaxed z-10" style={{ color: colors.onSurface }}>เชื่อมต่อไอดีของคุณ<br />ผ่านเซิร์ฟเวอร์ MICROSOFT</p>
            </div>

            {/* Right Side */}
            <div className="flex-1 p-10 flex flex-col relative justify-center">
              {/* Close Button */}
              <button
                onClick={() => {
                  setDeviceCodeModalOpen(false);
                  setDeviceCodePolling(false);
                  setDeviceCodeData(null);
                  setDeviceCodeError(null);
                }}
                className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors z-20"
                style={{ color: colors.onSurfaceVariant }}
              >
                <Icons.Close className="w-6 h-6" />
              </button>

              <div className="mb-8">
                <h3 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>ยืนยันตัวตน</h3>
                <p className="text-sm font-medium opacity-60" style={{ color: colors.onSurfaceVariant }}>ทำตามขั้นตอนด้านล่างเพื่อเชื่อมต่อบัญชี</p>
              </div>

              <div className="space-y-6 flex-1">
                <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
                  <p className="text-sm font-bold mb-4 opacity-70" style={{ color: colors.onSurface }}>1. ไปที่เว็บไซต์ Microsoft</p>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      window.api?.openExternal?.(deviceCodeData.verificationUri);
                    }}
                    className="text-blue-400 font-black text-lg underline break-all hover:text-blue-300 transition-colors cursor-pointer"
                  >
                    {deviceCodeData.verificationUri}
                  </a>
                </div>

                <div>
                  <p className="text-sm font-bold mb-2 opacity-70 ml-1" style={{ color: colors.onSurface }}>2. ใส่รหัสต่อไปนี้</p>
                  <div
                    className="w-full py-5 rounded-2xl text-center text-4xl font-black tracking-[0.3em] shadow-inner select-all cursor-copy group relative"
                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.primary }}
                    onClick={() => {
                      navigator.clipboard.writeText(deviceCodeData.userCode);
                      toast.success("คัดลอกรหัสแล้ว!");
                    }}
                  >
                    {deviceCodeData.userCode}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 backdrop-blur-sm rounded-2xl transition-opacity">
                      <span className="text-sm font-black text-white tracking-normal uppercase">คลิกเพื่อคัดลอกรหัส</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(deviceCodeData.userCode);
                  window.api?.openExternal?.(deviceCodeData.verificationUri);
                  toast.success("คัดลอกรหัสแล้ว!");
                }}
                className="w-full mt-6 py-3 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
              >
                คัดลอกรหัสและเปิดหน้าเข้าสู่ระบบ
              </button>

              <div className="mt-6 flex items-center justify-center gap-3 opacity-40">
                <Icons.Spinner className="w-5 h-5 animate-spin" />
                <span className="text-xs font-bold uppercase tracking-widest">กำลังรอการอนุมัติ</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inbox/Notifications Modal */}


      {/* Main App Layout */}
      <div className={`flex-1 flex overflow-hidden ${config.rainbowMode ? 'rainbow-mode' : ''}`}>
        {/* Sidebar */}
        <nav className="w-20 flex flex-col items-center" style={{ backgroundColor: colors.secondary }}>
          {/* Top Section - Logo and Main Nav */}
          <div className="flex-1 flex flex-col items-center gap-2">
            {/* Drag region for sidebar top */}
            <div className="w-full pt-2 pb-2 flex justify-center drag-region">
              <div className="w-12 h-12 rounded-2xl overflow-hidden">
                <img src={rIcon.src} alt="Logo" className="w-full h-full object-cover" />
              </div>
            </div>

            {/* Main Navigation Items */}
            {mainNavItems.map(({ id, icon: Icon, label }) => (
              <div key={id} className="relative group">
                <button
                  onClick={() => { playClick(); setActiveTab(id); }}
                  className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all hover:scale-105 no-drag"
                  style={{
                    backgroundColor: activeTab === id ? "rgba(255,255,255,0.9)" : "transparent",
                    color: "#1a1a1a"
                  }}
                >
                  <Icon className="w-6 h-6" />
                </button>
                {/* Hover Tooltip */}
                <div
                  className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-200 pointer-events-none z-50"
                  style={{
                    backgroundColor: "rgba(0,0,0,0.8)",
                    color: "#fff",
                    fontSize: "0.75rem"
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Section - Settings and About */}
          <div className="flex flex-col items-center gap-2 pb-4">
            {bottomNavItems.map(({ id, icon: Icon, label }) => (
              <div key={id} className="relative group">
                <button
                  onClick={() => { playClick(); setActiveTab(id); }}
                  className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all hover:scale-105 no-drag"
                  style={{
                    backgroundColor: activeTab === id ? "rgba(255,255,255,0.9)" : "transparent",
                    color: "#1a1a1a"
                  }}
                >
                  <Icon className="w-6 h-6" />
                </button>
                {/* Hover Tooltip */}
                <div
                  className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-200 pointer-events-none z-50"
                  style={{
                    backgroundColor: "rgba(0,0,0,0.8)",
                    color: "#fff",
                    fontSize: "0.75rem"
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </nav>

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
            <div className="fixed top-0 right-36 h-10 flex items-center gap-2 no-drag z-[99]">
              {/* Notifications/Inbox Button - Only show when logged in */}
              {session && (
                <div className="relative">
                  <button
                    onClick={() => setInboxOpen(!inboxOpen)}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 hover:bg-black/10 relative"
                    style={{ color: colors.onSurfaceVariant }}
                    title="ข่าวสารและการแจ้งเตือน"
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
                                  <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#fbbf24" }}>
                                    <Icons.Check className="w-2.5 h-2.5 text-gray-900" />
                                  </span>
                                ) : account.type === "catid" ? (
                                  <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#3b82f6" }}>
                                    <Icons.Check className="w-2.5 h-2.5 text-white" />
                                  </span>
                                ) : account.type === "microsoft" ? (
                                  <img src={microsoftIcon.src} alt="Microsoft" className="w-5 h-5" />
                                ) : null}
                                {account.type === "microsoft" && account.apiToken && (
                                  <span title="เชื่อมต่อกับ CatID แล้ว" className="ml-1 opacity-80 inline-flex items-center justify-center w-4 h-4 rounded-full" style={{ backgroundColor: "#fbbf24" }}>
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
                                removeAccount(account);
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
                        <p className="text-sm text-center py-2" style={{ color: colors.onSurfaceVariant }}>ยังไม่มีบัญชี</p>
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
                        <span className="text-sm">เพิ่มบัญชีผู้ใช้</span>
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
                          <span className="text-sm">เชื่อมต่อ CatID</span>
                        </button>
                      )}

                      {/* Disconnect buttons moved to Settings > Account */}


                      {/* Link Microsoft (for CatID users) */}
                      {session && session.type === "catid" && (
                        <button
                          onClick={async () => {
                            setAccountDropdownOpen(false);
                            console.log("[Auth] Link Microsoft clicked");

                            if (window.api?.startDeviceCodeAuth) {
                              try {
                                const t = toast.loading("กำลังขอรหัสเชื่อมต่อ...");
                                const result = await window.api.startDeviceCodeAuth();
                                toast.dismiss(t);

                                if (!result.ok || !result.deviceCode || !result.userCode) {
                                  toast.error(result.error || "ไม่สามารถขอรหัสได้");
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
                                toast.error("เกิดข้อผิดพลาด");
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
                          <span className="text-sm">เชื่อมต่อ Microsoft</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          handleLogout();
                          setAccountDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all hover:bg-gray-500/10"
                        style={{ color: colors.onSurface }}
                      >
                        <span className="w-5 h-5 flex items-center justify-center text-lg">←</span>
                        <span className="text-sm">ออกจากระบบ</span>
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
              <div className="fixed top-0 right-0 flex items-center gap-0 z-[100] no-drag" style={{ pointerEvents: "auto" }}>
                {/* Minimize */}
                <button
                  onClick={() => window.api?.windowMinimize()}
                  className="w-12 h-10 flex items-center justify-center transition-all hover:bg-black/10"
                  style={{ color: colors.onSurfaceVariant }}
                  title="ย่อหน้าต่าง"
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
                  title={config.fullscreen ? "ย่อกลับ" : "ขยายหน้าต่าง"}
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
                  className="w-12 h-10 flex items-center justify-center transition-all hover:bg-red-500 hover:!text-white"
                  style={{ color: colors.onSurfaceVariant }}
                  title="ปิดหน้าต่าง"
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
                colors={colors}
                setActiveTab={setActiveTab}
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
              />
            )}



            {/* Modpack Tab - Always render to preserve game state */}
            <div style={{ display: activeTab === "modpack" ? "contents" : "none" }}>
              <ModPack
                colors={colors}
                config={config}
                setImportModpackOpen={setImportModpackOpen}
                setActiveTab={setActiveTab}
                setSettingsTab={setSettingsTab}
                onShowConfirm={handleShowConfirm}
                isActive={activeTab === "modpack"}
                selectedServer={selectedServer}
                session={session}
                updateConfig={updateConfig}
              />
            </div>

            {/* Explore Tab */}
            {activeTab === "explore" && (
              <Explore colors={colors} />
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
                removeAccount={removeAccount}
                setLoginDialogOpen={setLoginDialogOpen}
                handleUnlink={handleUnlink}
                setLinkCatIDOpen={setLinkCatIDOpen}
              />
            )}

            {/* Admin Panel Tab - Only for admins */}
            {activeTab === "admin" && isAdmin && adminToken && (
              <AdminPanel colors={colors} adminToken={adminToken} />
            )}

            {/* About Tab - New Premium Component */}
            {activeTab === "about" && <About colors={colors} />}
          </main>
        </div>
      </div>
    </div>
  );
}

// Export the wrapped component
export default function LauncherApp() {
  return (
    <ErrorBoundary>
      <LauncherAppContent />
    </ErrorBoundary>
  );
}

