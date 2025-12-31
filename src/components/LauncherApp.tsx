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

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import gsap from "gsap";
import toast, { Toaster } from "react-hot-toast";
import { cn } from "../lib/utils";
import { Icons } from "./ui/Icons";
import { MCHead } from "./ui/MCHead";
import { ChangelogModal } from "./ui/ChangelogModal";
import { Home, Settings, ServerMenu, ModPack, Explore } from "./tabs";
import AdminPanel from "./tabs/AdminPanel";
import { type AuthSession, type Server, type NewsItem, type LauncherConfig, type ColorTheme } from "../types/launcher";

// ========================================
// Types
// ========================================

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

function getColors(colorTheme: ColorTheme, themeMode: "light" | "dark" | "oled" | "auto", customColor?: string) {
  const themeColor = customColor || COLOR_THEMES[colorTheme].primary;

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

function LoadingScreen({ onComplete, themeColor }: { onComplete: () => void; themeColor: string }) {
  const logoRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let completed = false;

    // Dev mode detection - localhost:4321 = Astro dev server
    const isDevMode = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.port === '4321');

    const completeLoading = () => {
      if (completed) return;
      completed = true;
      gsap.to(".loading-screen", { opacity: 0, duration: isDevMode ? 0.1 : 0.5, onComplete });
    };

    // Skip animation in dev mode for faster loading
    if (isDevMode) {
      console.log("[LoadingScreen] Dev mode - skipping animation");
      setProgress(100);
      setTimeout(completeLoading, 100);
      return;
    }

    // Fallback timeout in case GSAP fails
    const fallbackTimeout = setTimeout(() => {
      console.log("[LoadingScreen] Fallback timeout triggered");
      setProgress(100);
      completeLoading();
    }, 4000);

    try {
      const tl = gsap.timeline({
        onComplete: () => {
          clearTimeout(fallbackTimeout);
          completeLoading();
        },
      });

      // Animate progress with percentage counter (no logo animation to avoid opacity issues)

      // Animate progress with percentage counter
      tl.to({ val: 0 }, {
        val: 100,
        duration: 2.5,
        ease: "power2.inOut",
        onUpdate: function () {
          const value = Math.round(this.targets()[0].val);
          setProgress(value);
        }
      }, "-=0.3");
    } catch (error) {
      console.error("[LoadingScreen] GSAP error:", error);
      clearTimeout(fallbackTimeout);
      setProgress(100);
      completeLoading();
    }

    return () => {
      clearTimeout(fallbackTimeout);
    };
  }, [onComplete]);

  return (
    <div className="loading-screen fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: themeColor }}>
      {/* Title Bar Drag Region with Window Controls */}
      <div className="h-10 w-full flex-shrink-0 flex items-center justify-end pr-0 drag-region">
        {/* Window Control Buttons */}
        <div className="flex items-center gap-0 no-drag">
          {/* Minimize */}
          <button
            onClick={() => window.api?.windowMinimize()}
            className="w-12 h-10 flex items-center justify-center transition-all hover:bg-black/10"
            style={{ color: "#1a1a1a" }}
            title="ย่อหน้าต่าง"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13H5v-2h14v2z" />
            </svg>
          </button>
          {/* Maximize */}
          <button
            onClick={() => window.api?.windowMaximize()}
            className="w-12 h-10 flex items-center justify-center transition-all hover:bg-black/10"
            style={{ color: "#1a1a1a" }}
            title="ขยายหน้าต่าง"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z" />
            </svg>
          </button>
          {/* Close */}
          <button
            onClick={() => window.api?.windowClose()}
            className="w-12 h-10 flex items-center justify-center transition-all hover:bg-red-500 hover:!text-white"
            style={{ color: "#1a1a1a" }}
            title="ปิดหน้าต่าง"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom Section */}
      <div className="px-8 pb-4">
        {/* Logo + Title + Percentage Row */}
        <div className="flex items-center justify-between mb-4">
          {/* Left - Logo + Title */}
          <div ref={logoRef} className="flex items-center gap-3">
            <img src="r.svg" alt="Reality" className="w-12 h-12 object-contain" />
            <span className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Jaturat', 'Itim', sans-serif" }}>
              Reality
            </span>
          </div>

          {/* Right - Percentage */}
          <div className="text-2xl font-bold text-gray-900 tabular-nums" style={{ fontFamily: "'Jaturat', 'Itim', sans-serif" }}>
            {progress}%
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-5 bg-white/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-800 rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ========================================
// MC Head Component
// ========================================

// MCHead moved to components/ui/MCHead.tsx

// ========================================
// App Version Badge Component
// ========================================

function AppVersionBadge({ colors }: { colors: any }) {
  const [version, setVersion] = useState<string>("...");

  useEffect(() => {
    (async () => {
      try {
        const appVersion = await (window as any).api?.getAppVersion?.();
        if (appVersion) setVersion(appVersion);
      } catch {
        setVersion("0.0.0");
      }
    })();
  }, []);

  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full"
      style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}
    >
      v{version}
    </span>
  );
}

// ========================================
// Main Component
// ========================================

export default function LauncherApp() {
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
  const [isLaunching, setIsLaunching] = useState(false);
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

  // CatID register modal state
  const [catIDRegisterOpen, setCatIDRegisterOpen] = useState(false);
  const [catIDLoginOpen, setCatIDLoginOpen] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);

  // Changelog modal state
  const [changelogModalOpen, setChangelogModalOpen] = useState(false);
  const [changelogData, setChangelogData] = useState<{ version: string; changelog: string } | null>(null);

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
    // New settings defaults
    fullscreen: false,
    javaArguments: "",
    maxConcurrentDownloads: 5,
    telemetryEnabled: true,
    autoUpdateEnabled: true,
  });

  // Get colors based on current theme (memoized for performance)
  const colors = useMemo(
    () => getColors(config.colorTheme, config.theme, config.customColor),
    [config.colorTheme, config.theme, config.customColor]
  );

  // Server data (will be fetched from API)
  const [servers] = useState<Server[]>([]);

  // News data (will be fetched from API)
  const [news] = useState<NewsItem[]>([]);

  // Credits data
  const credits = [
    { name: "Sam_Su", role: "ผู้สร้างและผู้ทำลาย", description: "UI/UX Designer" },
    { name: "realnice_k", role: "ผู้ออกแบบและผู้ช่วยพัฒนา", description: "Creator & Developer" },
    { name: "MrPeachs", role: "ที่ปรึกษา", description: "Consultant" },
    { name: "Kjofex2", role: "ผู้สนับสนุนรายใหญ่", description: "BigSupporter" },
  ];

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

  // Check for version update and show changelog modal
  useEffect(() => {
    if (!isInitialized) return;

    (async () => {
      try {
        // Get current app version
        const currentVersion = await (window as any).api?.getAppVersion?.();
        if (!currentVersion) return;

        // Load saved config to get lastSeenVersion
        const savedConfig = await (window as any).api?.loadConfig?.();
        const lastSeenVersion = savedConfig?.lastSeenVersion;

        // If this is a new version, fetch changelog and show modal
        if (currentVersion !== lastSeenVersion) {
          try {
            // Fetch latest.json from CDN to get changelog
            const response = await fetch("https://cdn.reality.catlabdesign.space/client/latest.json");
            if (response.ok) {
              const data = await response.json();
              if (data.changelog && data.version === currentVersion) {
                setChangelogData({
                  version: currentVersion,
                  changelog: data.changelog
                });
                setChangelogModalOpen(true);
              }
            }
          } catch (fetchError) {
            console.log("[Changelog] Could not fetch changelog:", fetchError);
          }

          // Update lastSeenVersion even if we couldn't fetch changelog
          updateConfig({ lastSeenVersion: currentVersion });
        }
      } catch (error) {
        console.log("[Changelog] Version check error:", error);
      }
    })();
  }, [isInitialized]);

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
      toast.error(`ไม่สามารถตรวจสอบอัปเดต: ${data.message}`, { id: "check-update" });
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
          const result = await window.api.pollDeviceCodeAuth(deviceCodeData.deviceCode);

          if (result.status === "success" && result.session) {
            // Success! Add account and close modal
            const newSession: AuthSession = {
              username: result.session.username,
              uuid: result.session.uuid,
              accessToken: result.session.accessToken,
              type: "microsoft",
            };

            // Add to accounts if not exists
            setAccounts(prev => {
              const exists = prev.some(acc => acc.username === newSession.username && acc.type === newSession.type);
              if (!exists) return [...prev, newSession];
              return prev;
            });

            // Set as current session
            setSession(newSession);

            // Close modal
            setDeviceCodeModalOpen(false);
            setDeviceCodePolling(false);
            setDeviceCodeData(null);
            setDeviceCodeError(null);

            toast.success(`ยินดีต้อนรับ, ${newSession.username}!`);
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
      toast.success(`ยินดีต้อนรับ, ${newSession.username}!`);

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
      toast.success(`ยินดีต้อนรับ, ${newSession.username}!`);
    } catch (error: any) {
      toast.error(error?.message || "เข้าสู่ระบบไม่สำเร็จ");
    }
  };

  const handleCatIDRegister = async (username: string, email: string, password: string) => {
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
      const result = await window.api.registerCatID(username, email, password);
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
    setSession(account);
    setAccountManagerOpen(false);
    toast.success(`เปลี่ยนเป็นบัญชี ${account.username}`);

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

  const handleLaunch = async () => {
    if (!selectedServer || !session || isLaunching) return;
    setIsLaunching(true);
    const t = toast.loading("กำลังเปิดเกม...");

    try {
      if (config.discordRPCEnabled) {
        await window.api?.discordRPCUpdate?.("launching", selectedServer.name);
      }

      const res = await window.api?.launchGame({
        version: selectedServer.version,
        username: session.username,
        ramMB: config.ramMB,
      });

      if (res?.ok) {
        toast.success(res.message ?? "เปิดเกมแล้ว!", { id: t });
        if (config.discordRPCEnabled) {
          await window.api?.discordRPCUpdate?.("playing", selectedServer.name);
        }
      } else {
        toast.error(res?.message ?? "เปิดเกมไม่สำเร็จ", { id: t });
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด", { id: t });
    } finally {
      setIsLaunching(false);
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

  // Show loading screen
  if (isLoading) {
    return <LoadingScreen onComplete={() => setIsLoading(false)} themeColor={colors.secondary} />;
  }

  // Render tabs - split into main and bottom navigation
  const mainNavItems = [
    { id: "home", icon: Icons.Home, label: "หน้าหลัก" },
    // { id: "servers", icon: Icons.Dns, label: "เซิร์ฟเวอร์" }, // Temporarily disabled for this release
    { id: "modpack", icon: Icons.Box, label: "Mod Pack" },
    { id: "explore", icon: Icons.Search, label: "สำรวจ" },
  ];

  // Admin tab is added dynamically based on isAdmin state
  const bottomNavItems = [
    ...(isAdmin ? [{ id: "admin", icon: Icons.Admin, label: "Admin" }] : []),
    { id: "settings", icon: Icons.Settings, label: "ตั้งค่า" },
    { id: "about", icon: Icons.Info, label: "เกี่ยวกับ" },
  ];

  return (
    <div ref={rootRef} className="h-screen flex overflow-hidden" style={{ backgroundColor: colors.surface }}>
      <Toaster
        position="bottom-right"
        containerStyle={{
          bottom: 16,
          right: 16,
        }}
        toastOptions={{
          duration: 3000,
          style: {
            background: colors.surfaceContainer,
            color: colors.onSurface,
            borderRadius: '4px',
            padding: '10px 14px',
            fontSize: '13px',
            fontWeight: 400,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            maxWidth: '300px',
            borderLeft: `3px solid ${colors.primary}`,
          },
          success: {
            style: {
              borderLeft: '3px solid #22c55e',
            },
            iconTheme: {
              primary: '#22c55e',
              secondary: '#fff',
            },
          },
          error: {
            style: {
              borderLeft: '3px solid #ef4444',
            },
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
          loading: {
            style: {
              borderLeft: `3px solid ${colors.primary}`,
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

      {/* Login Modal */}
      {loginDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-3xl p-6 shadow-xl relative" style={{ backgroundColor: colors.surface }}>
            {/* X Close Button */}
            <button
              onClick={() => setLoginDialogOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20"
              style={{ color: colors.onSurfaceVariant }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.secondary }}>
                <Icons.Person className="w-6 h-6" style={{ color: "#1a1a1a" }} />
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: colors.onSurface }}>เข้าสู่ระบบ</h2>
                <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>เลือกวิธีเข้าสู่ระบบ</p>
              </div>
            </div>

            {/* Microsoft Login Button */}
            <button
              onClick={async () => {
                console.log("[Auth] Microsoft login button clicked - starting device code flow");
                setLoginDialogOpen(false);

                // Check if we're in Electron with API
                if (window.api?.startDeviceCodeAuth) {
                  try {
                    const toastId = toast.loading("กำลังขอรหัสเข้าสู่ระบบ...");
                    const result = await window.api.startDeviceCodeAuth();
                    toast.dismiss(toastId);

                    if (!result.ok || !result.deviceCode || !result.userCode) {
                      toast.error(result.error || "ไม่สามารถขอรหัสได้");
                      return;
                    }

                    // Store device code data and open modal
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
                  // Not in Electron or API not available - show message
                  toast.error("Microsoft Login ต้องการ Electron - ใช้ Offline Mode แทน");
                }
              }}
              className="w-full flex items-center justify-center gap-3 px-4 py-4 rounded-xl mb-3 transition-all hover:scale-[1.02]"
              style={{ backgroundColor: "#2f2f2f", color: "#ffffff" }}
            >
              <svg className="w-5 h-5" viewBox="0 0 21 21" fill="currentColor">
                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
              </svg>
              เข้าสู่ระบบด้วย Microsoft
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px" style={{ backgroundColor: colors.outline }} />
              <span className="text-sm" style={{ color: colors.onSurfaceVariant }}>หรือ</span>
              <div className="flex-1 h-px" style={{ backgroundColor: colors.outline }} />
            </div>

            {/* CatID Login Button */}
            <button
              onClick={() => {
                setLoginDialogOpen(false);
                setCatIDLoginOpen(true);
              }}
              className="w-full flex items-center justify-center gap-3 px-4 py-4 rounded-xl mb-3 transition-all hover:scale-[1.02]"
              style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm0 14c-2.03 0-4.43-.82-6.14-2.88C7.55 15.8 9.68 15 12 15s4.45.8 6.14 2.12C16.43 19.18 14.03 20 12 20z" />
              </svg>
              เข้าสู่ระบบด้วย CatID
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px" style={{ backgroundColor: colors.outline }} />
              <span className="text-sm" style={{ color: colors.onSurfaceVariant }}>หรือเล่นแบบออฟไลน์</span>
              <div className="flex-1 h-px" style={{ backgroundColor: colors.outline }} />
            </div>

            {/* Offline Account Button */}
            <button
              onClick={() => {
                setLoginDialogOpen(false);
                setOfflineWarningOpen(true);
              }}
              className="w-full py-3 rounded-xl font-medium transition-all hover:scale-[1.02] border border-dashed"
              style={{ borderColor: colors.outline, color: colors.onSurfaceVariant }}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
                เพิ่มบัญชีออฟไลน์
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Offline Warning Modal - Scary Design */}
      {offlineWarningOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div
            className="w-full max-w-lg rounded-3xl p-8 shadow-2xl relative overflow-hidden"
            style={{ backgroundColor: "#1a0a0a" }}
          >
            {/* Scary Background Gradient */}
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background: "radial-gradient(circle at center, #ef4444 0%, transparent 70%)",
              }}
            />

            {/* X Close Button */}
            <button
              onClick={() => setOfflineWarningOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-red-500/30 z-10"
              style={{ color: "#ef4444" }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>

            <div className="relative z-10">
              {/* Warning Icon */}
              <div className="flex justify-center mb-6">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center animate-pulse"
                  style={{ backgroundColor: "#ef444430", border: "3px solid #ef4444" }}
                >
                  <svg className="w-10 h-10" viewBox="0 0 24 24" fill="#ef4444">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                  </svg>
                </div>
              </div>

              {/* Warning Title */}
              <h2 className="text-2xl font-bold text-center mb-3" style={{ color: "#ef4444" }}>
                ⚠️ คำเตือน!
              </h2>

              {/* Warning Message */}
              <div className="space-y-4 mb-6">
                <p className="text-center text-lg" style={{ color: "#fca5a5" }}>
                  คุณกำลังจะเล่น <strong>โหมดออฟไลน์</strong>
                </p>
                <div
                  className="p-4 rounded-xl text-sm space-y-2"
                  style={{ backgroundColor: "#7f1d1d30", border: "1px solid #991b1b" }}
                >
                  <p style={{ color: "#fecaca" }}>
                    🚫 <strong>ไม่สามารถ</strong> เข้าเซิร์ฟเวอร์ออนไลน์ที่ต้องการ Premium ได้
                  </p>
                  <p style={{ color: "#fecaca" }}>
                    🚫 <strong>ไม่สามารถ</strong> ใช้สกินหรือ Cape ของคุณได้
                  </p>
                  <p style={{ color: "#fecaca" }}>
                    🚫 <strong>ไม่สนับสนุน</strong> Mojang และผู้พัฒนาเกม
                  </p>
                </div>

                <div
                  className="p-4 rounded-xl text-center"
                  style={{ backgroundColor: "#05966920", border: "1px solid #059669" }}
                >
                  <p className="text-sm mb-2" style={{ color: "#6ee7b7" }}>
                    💚 สนับสนุนผู้พัฒนาโดยการซื้อเกมของแท้!
                  </p>
                  <a
                    href="https://www.minecraft.net/store/minecraft-java-bedrock-edition-pc"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all hover:scale-105"
                    style={{ backgroundColor: "#059669", color: "#ffffff" }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                    </svg>
                    ซื้อ Minecraft ของแท้
                  </a>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setOfflineWarningOpen(false)}
                  className="flex-1 py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
                  style={{ backgroundColor: "#374151", color: "#ffffff" }}
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => {
                    setOfflineWarningOpen(false);
                    setOfflineUsernameOpen(true);
                  }}
                  className="flex-1 py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
                  style={{ backgroundColor: "#991b1b", color: "#ffffff" }}
                >
                  ฉันเข้าใจ ดำเนินการต่อ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Offline Username Input Modal */}
      {offlineUsernameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-3xl p-6 shadow-xl relative" style={{ backgroundColor: colors.surface }}>
            {/* X Close Button */}
            <button
              onClick={() => setOfflineUsernameOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20"
              style={{ color: colors.onSurfaceVariant }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                <Icons.Person className="w-6 h-6" style={{ color: colors.onSurfaceVariant }} />
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: colors.onSurface }}>บัญชีออฟไลน์</h2>
                <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>กรอกชื่อผู้ใช้สำหรับเล่นออฟไลน์</p>
              </div>
            </div>

            <div className="space-y-4">
              <input
                id="offline-username-input"
                type="text"
                placeholder="ชื่อผู้ใช้ (3-16 ตัวอักษร)"
                maxLength={16}
                className="w-full px-4 py-3 rounded-xl border text-lg"
                style={{
                  borderColor: colors.outline,
                  backgroundColor: colors.surfaceContainer,
                  color: colors.onSurface,
                }}
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
                className="w-full py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
                style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
              >
                เข้าสู่ระบบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CatID Login Modal */}
      {catIDLoginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-3xl p-6 shadow-xl relative" style={{ backgroundColor: colors.surface }}>
            {/* X Close Button */}
            <button
              onClick={() => setCatIDLoginOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20"
              style={{ color: colors.onSurfaceVariant }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#8b5cf6" }}>
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#ffffff">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm0 14c-2.03 0-4.43-.82-6.14-2.88C7.55 15.8 9.68 15 12 15s4.45.8 6.14 2.12C16.43 19.18 14.03 20 12 20z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: colors.onSurface }}>เข้าสู่ระบบ CatID</h2>
                <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>ใช้บัญชี CatID ของคุณ</p>
              </div>
            </div>

            <div className="space-y-3">
              <input
                id="catid-username"
                type="text"
                placeholder="ชื่อผู้ใช้"
                className="w-full px-4 py-3 rounded-xl border"
                style={{
                  borderColor: colors.outline,
                  backgroundColor: colors.surfaceContainer,
                  color: colors.onSurface,
                }}
              />
              <input
                id="catid-password"
                type="password"
                placeholder="รหัสผ่าน"
                className="w-full px-4 py-3 rounded-xl border"
                style={{
                  borderColor: colors.outline,
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
              {/* Forgot Password Link */}
              <button
                onClick={() => {
                  setCatIDLoginOpen(false);
                  setForgotPasswordOpen(true);
                }}
                className="text-sm text-right w-full -mt-1"
                style={{ color: colors.secondary }}
              >
                ลืมรหัสผ่าน?
              </button>
              <div className="flex gap-2">
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
                  className="flex-1 py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
                  style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
                >
                  เข้าสู่ระบบ
                </button>
                <button
                  onClick={() => {
                    setCatIDLoginOpen(false);
                    setCatIDRegisterOpen(true);
                  }}
                  className="px-4 py-3 rounded-xl border transition-all hover:scale-[1.02]"
                  style={{ borderColor: colors.outline, color: colors.onSurface }}
                >
                  สมัครใหม่
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CatID Register Modal */}
      {catIDRegisterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-3xl p-6 shadow-xl relative" style={{ backgroundColor: colors.surface }}>
            {/* X Close Button */}
            <button
              onClick={() => setCatIDRegisterOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20"
              style={{ color: colors.onSurfaceVariant }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#8b5cf6" }}>
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#ffffff">
                  <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: colors.onSurface }}>สมัครสมาชิก CatID</h2>
                <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>สร้างบัญชีใหม่</p>
              </div>
            </div>

            <div className="space-y-3">
              <input
                id="catid-reg-username"
                type="text"
                placeholder="ชื่อผู้ใช้"
                className="w-full px-4 py-3 rounded-xl border"
                style={{
                  borderColor: colors.outline,
                  backgroundColor: colors.surfaceContainer,
                  color: colors.onSurface,
                }}
              />
              <input
                id="catid-reg-email"
                type="email"
                placeholder="อีเมล"
                className="w-full px-4 py-3 rounded-xl border"
                style={{
                  borderColor: colors.outline,
                  backgroundColor: colors.surfaceContainer,
                  color: colors.onSurface,
                }}
              />
              <input
                id="catid-reg-password"
                type="password"
                placeholder="รหัสผ่าน"
                className="w-full px-4 py-3 rounded-xl border"
                style={{
                  borderColor: colors.outline,
                  backgroundColor: colors.surfaceContainer,
                  color: colors.onSurface,
                }}
              />
              <input
                id="catid-reg-confirm"
                type="password"
                placeholder="ยืนยันรหัสผ่าน"
                className="w-full px-4 py-3 rounded-xl border"
                style={{
                  borderColor: colors.outline,
                  backgroundColor: colors.surfaceContainer,
                  color: colors.onSurface,
                }}
              />

              <div className="flex gap-2 mt-4">
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
                    if (password.length < 8) {
                      toast.error("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
                      return;
                    }

                    await handleCatIDRegister(username, email, password);
                  }}
                  className="flex-1 py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
                  style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
                >
                  สมัครสมาชิก
                </button>
                <button
                  onClick={() => {
                    setCatIDRegisterOpen(false);
                    setCatIDLoginOpen(true);
                  }}
                  className="px-4 py-3 rounded-xl border transition-all hover:scale-[1.02]"
                  style={{ borderColor: colors.outline, color: colors.onSurface }}
                >
                  เข้าสู่ระบบ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Forgot Password Modal - พร้อม meme gif */}
      {forgotPasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-3xl p-6 shadow-xl text-center relative" style={{ backgroundColor: colors.surface }}>
            {/* X Close Button */}
            <button
              onClick={() => setForgotPasswordOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20"
              style={{ color: colors.onSurfaceVariant }}
            >
              <Icons.Close className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold mb-4" style={{ color: colors.onSurface }}>
              ลืมรหัสผ่าน
            </h2>

            {/* Random Meme GIF */}
            <img
              src={`https://media.giphy.com/media/${["3o7btPCcdNniyf0ArS", "l2SpMDbxEdUXtBHqM", "10h8CdMQUWoZ8Y", "xT5LMHxhOfscxPfIfm", "3og0INyCmHlNylks9O", "26FPy3QZQqGtDcrja"][Math.floor(Math.random() * 6)]}/giphy.gif`}
              alt="meme"
              className="w-48 h-48 mx-auto rounded-xl object-cover mb-4"
            />

            <p className="text-lg mb-6" style={{ color: colors.onSurfaceVariant }}>
              🧘 หายใจเข้าลึกๆ และนึกดีๆ ก่อนใส่ใหม่
            </p>

            <button
              onClick={() => {
                setForgotPasswordOpen(false);
                setCatIDLoginOpen(true);
              }}
              className="px-6 py-3 rounded-xl font-medium transition-all hover:scale-[1.02]"
              style={{ backgroundColor: colors.secondary, color: colors.onPrimary }}
            >
              ← กลับไปหน้าเข้าสู่ระบบ
            </button>
          </div>
        </div>
      )}

      {/* Account Manager Modal */}
      {accountManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-3xl p-6 shadow-xl" style={{ backgroundColor: colors.surface }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.secondary }}>
                <Icons.Person className="w-6 h-6" style={{ color: "#1a1a1a" }} />
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: colors.onSurface }}>จัดการบัญชี</h2>
                <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>เลือกหรือจัดการบัญชีที่เพิ่มไว้</p>
              </div>
            </div>

            {/* Account List */}
            <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
              {accounts.map((account, index) => (
                <div
                  key={`${account.type}-${account.username}-${index}`}
                  className="flex items-center gap-3 p-3 rounded-xl transition-all"
                  style={{
                    backgroundColor: session?.username === account.username && session?.type === account.type
                      ? colors.surfaceContainerHighest
                      : colors.surfaceContainer,
                    border: session?.username === account.username && session?.type === account.type
                      ? `2px solid ${colors.secondary}`
                      : "2px solid transparent",
                  }}
                >
                  <MCHead username={account.username} size={40} className="rounded-full" />
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-1" style={{ color: colors.onSurface }}>
                      {account.username}
                      {account.isAdmin && (
                        <span title="Admin" className="inline-flex items-center justify-center w-4 h-4 rounded-full" style={{ backgroundColor: "#fbbf24" }}>
                          <Icons.Check className="w-3 h-3 text-gray-900" />
                        </span>
                      )}
                    </div>
                    <div className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                      {account.type === "microsoft" ? "Microsoft Account" : account.type === "catid" ? "CatID Account" : "Offline Mode"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => selectAccount(account)}
                      className="px-3 py-1.5 rounded-lg text-sm"
                      style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                    >
                      เลือก
                    </button>
                    <button
                      onClick={() => removeAccount(account)}
                      className="px-3 py-1.5 rounded-lg text-sm"
                      style={{ backgroundColor: "#ef4444", color: "#ffffff" }}
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Account Button */}
            <button
              onClick={() => {
                setAccountManagerOpen(false);
                setLoginDialogOpen(true);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border mb-3"
              style={{ borderColor: colors.outline, color: colors.onSurface }}
            >
              <Icons.Login className="w-5 h-5" />
              เพิ่มบัญชีใหม่
            </button>

            {/* Close Button */}
            <button
              onClick={() => setAccountManagerOpen(false)}
              className="w-full px-4 py-3 rounded-xl"
              style={{ backgroundColor: colors.surfaceContainerHigh, color: colors.onSurface }}
            >
              ปิด
            </button>
          </div>
        </div>
      )}

      {/* Import Modpack Modal */}
      {importModpackOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-3xl p-6 shadow-xl relative" style={{ backgroundColor: colors.surface }}>
            {/* X Close Button */}
            <button
              onClick={() => {
                setImportModpackOpen(false);
                setIsDragging(false);
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20"
              style={{ color: colors.onSurfaceVariant }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.secondary }}>
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#1a1a1a">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: colors.onSurface }}>นำเข้า Mod Pack</h2>
                <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>รองรับ CurseForge (.zip) และ Modrinth (.mrpack)</p>
              </div>
            </div>

            {/* Drop Zone */}
            <div
              className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${isDragging ? "scale-105" : ""}`}
              style={{
                borderColor: isDragging ? colors.secondary : colors.outline,
                backgroundColor: isDragging ? `${colors.secondary}20` : colors.surfaceContainer,
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
                const validFile = files.find(f => f.name.endsWith('.zip') || f.name.endsWith('.mrpack'));
                if (validFile) {
                  toast.success(`กำลังนำเข้า: ${validFile.name}`);
                  setImportModpackOpen(false);
                  // TODO: Process the file
                } else {
                  toast.error("รองรับเฉพาะไฟล์ .zip และ .mrpack");
                }
              }}
            >
              <Icons.Box className="w-16 h-16 mx-auto mb-4" style={{ color: isDragging ? colors.secondary : colors.onSurfaceVariant }} />
              <p className="text-lg font-medium mb-2" style={{ color: colors.onSurface }}>
                {isDragging ? "ปล่อยไฟล์ที่นี่" : "ลากไฟล์มาวางที่นี่"}
              </p>
              <p className="text-sm mb-4" style={{ color: colors.onSurfaceVariant }}>
                หรือ
              </p>
              <button
                onClick={() => {
                  // Create hidden file input and trigger
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.zip,.mrpack';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) {
                      toast.success(`กำลังนำเข้า: ${file.name}`);
                      setImportModpackOpen(false);
                      // TODO: Process the file
                    }
                  };
                  input.click();
                }}
                className="px-6 py-3 rounded-xl font-medium transition-all hover:scale-105"
                style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
              >
                เลือกไฟล์
              </button>
            </div>

            {/* File Types */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded bg-orange-500 flex items-center justify-center text-white text-xs font-bold">CF</div>
                  <span className="font-medium" style={{ color: colors.onSurface }}>CurseForge</span>
                </div>
                <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>.zip - Modpack จาก CurseForge</p>
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded bg-green-500 flex items-center justify-center text-white text-xs font-bold">MR</div>
                  <span className="font-medium" style={{ color: colors.onSurface }}>Modrinth</span>
                </div>
                <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>.mrpack - Modpack จาก Modrinth</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Device Code Authentication Modal */}
      {deviceCodeModalOpen && deviceCodeData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-3xl p-6 shadow-xl relative" style={{ backgroundColor: colors.surface }}>
            {/* X Close Button */}
            <button
              onClick={() => {
                setDeviceCodeModalOpen(false);
                setDeviceCodePolling(false);
                setDeviceCodeData(null);
                setDeviceCodeError(null);
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20"
              style={{ color: colors.onSurfaceVariant }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#2f2f2f" }}>
                <svg className="w-6 h-6" viewBox="0 0 21 21" fill="currentColor">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: colors.onSurface }}>เข้าสู่ระบบ Microsoft</h2>
                <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>ใช้รหัสด้านล่างที่ microsoft.com/link</p>
              </div>
            </div>

            {/* User Code Display */}
            <div
              className="p-6 rounded-2xl text-center mb-4"
              style={{ backgroundColor: colors.surfaceContainer }}
            >
              <p className="text-sm mb-2" style={{ color: colors.onSurfaceVariant }}>รหัสของคุณ</p>
              <div
                className="text-4xl font-mono font-bold tracking-[0.3em] mb-3 select-all"
                style={{ color: colors.onSurface }}
              >
                {deviceCodeData.userCode}
              </div>

              {/* Copy Button */}
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(deviceCodeData.userCode);
                    toast.success("คัดลอกรหัสแล้ว!");
                  } catch {
                    toast.error("ไม่สามารถคัดลอกได้");
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm transition-all hover:scale-105"
                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
              >
                <i className="fa-solid fa-copy mr-1"></i> คัดลอกรหัส
              </button>
            </div>

            {/* Open Browser Button */}
            <button
              onClick={async () => {
                try {
                  // Copy code first
                  await navigator.clipboard.writeText(deviceCodeData.userCode);
                  toast.success("คัดลอกรหัสแล้ว!");
                  // Open microsoft.com/link in default browser
                  if ((window as any).api?.openExternal) {
                    await (window as any).api.openExternal("https://microsoft.com/link");
                  } else {
                    window.open("https://microsoft.com/link", "_blank");
                  }
                } catch (error) {
                  console.error("Failed to open browser:", error);
                  window.open("https://microsoft.com/link", "_blank");
                }
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-xl mb-4 transition-all hover:scale-[1.02]"
              style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
            >
              <i className="fa-solid fa-globe mr-2"></i> เปิด microsoft.com/link
            </button>

            {/* Error Display */}
            {deviceCodeError && (
              <div className="p-3 rounded-xl mb-4 text-center" style={{ backgroundColor: "#ef444420", color: "#ef4444" }}>
                {deviceCodeError}
              </div>
            )}

            {/* Polling Status */}
            <div className="text-center">
              {deviceCodePolling ? (
                <div className="flex items-center justify-center gap-2" style={{ color: colors.onSurfaceVariant }}>
                  <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: colors.secondary, borderTopColor: "transparent" }} />
                  <span className="text-sm">รอการยืนยัน...</span>
                </div>
              ) : (
                <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                  การเข้าสู่ระบบถูกยกเลิก
                </p>
              )}
            </div>

            {/* Expiry Timer */}
            <p className="text-xs text-center mt-4" style={{ color: colors.onSurfaceVariant }}>
              รหัสจะหมดอายุใน {Math.max(0, Math.floor((deviceCodeData.expiresAt - Date.now()) / 60000))} นาที
            </p>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <nav className="w-20 flex flex-col items-center" style={{ backgroundColor: colors.secondary }}>
        {/* Top Section - Logo and Main Nav */}
        <div className="flex-1 flex flex-col items-center gap-2">
          {/* Drag region for sidebar top */}
          <div className="w-full pt-2 pb-2 flex justify-center drag-region">
            <div className="w-12 h-12 rounded-2xl overflow-hidden">
              <img src="./r.svg" alt="Logo" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Main Navigation Items */}
          {mainNavItems.map(({ id, icon: Icon, label }) => (
            <div key={id} className="relative group">
              <button
                onClick={() => setActiveTab(id)}
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
                onClick={() => setActiveTab(id)}
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
            <h1 className="text-2xl font-bold" style={{ fontFamily: "'Jaturat', 'Itim', sans-serif", color: colors.onSurface }}>Reality</h1>
            <AppVersionBadge colors={colors} />
          </div>

          {/* Right Side - Account - Fixed at top */}
          <div className="fixed top-0 right-36 h-10 flex items-center no-drag z-[99]">
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
                {session?.isAdmin && (
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full" style={{ backgroundColor: "#fbbf24" }}>
                    <Icons.Check className="w-3 h-3 text-gray-900" />
                  </span>
                )}
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
                              {account.isAdmin && (
                                <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#fbbf24" }}>
                                  <Icons.Check className="w-2.5 h-2.5 text-gray-900" />
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
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all hover:bg-gray-500/10"
                      style={{ color: colors.onSurface }}
                    >
                      <span style={{ color: colors.secondary }}>+</span>
                      เพิ่มบัญชีผู้ใช้
                    </button>
                    {session && (
                      <button
                        onClick={() => {
                          handleLogout();
                          setAccountDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all hover:bg-gray-500/10"
                        style={{ color: colors.onSurface }}
                      >
                        <span>←</span>
                        ออกจากระบบ
                      </button>
                    )}
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
            />
          )}

          {/* Servers Tab */}
          {activeTab === "servers" && (
            <ServerMenu
              servers={servers}
              selectedServer={selectedServer}
              setSelectedServer={setSelectedServer}
              colors={colors}
            />
          )}

          {/* Modpack Tab - Always render to preserve game state */}
          <div style={{ display: activeTab === "modpack" ? "contents" : "none" }}>
            <ModPack
              colors={colors}
              setImportModpackOpen={setImportModpackOpen}
              setActiveTab={setActiveTab}
              isActive={activeTab === "modpack"}
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
            />
          )}

          {/* Admin Panel Tab - Only for admins */}
          {activeTab === "admin" && isAdmin && adminToken && (
            <AdminPanel colors={colors} adminToken={adminToken} />
          )}

          {/* About Tab - Minimal Clean Style */}
          {
            activeTab === "about" && (
              <div className="h-full flex flex-col p-8 overflow-y-auto">
                {/* Centered Content Container */}
                <div className="max-w-3xl mx-auto w-full space-y-12">

                  {/* Header - Simple & Clean */}
                  <div className="text-center space-y-4">
                    <img src="./r_background.svg" alt="Reality" className="w-16 h-16 mx-auto rounded-xl" />
                    <div>
                      <h1
                        className="text-3xl font-bold"
                        style={{ fontFamily: "'Jaturat', 'Itim', sans-serif", color: colors.onSurface }}
                      >
                        Reality
                      </h1>
                      <p className="text-sm mt-1" style={{ color: colors.onSurfaceVariant }}>
                        Minecraft Launcher · v0.1.0
                      </p>
                    </div>
                  </div>

                  {/* Mission - Simple Text */}
                  <div className="text-center max-w-md mx-auto">
                    <p className="text-base leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
                      สร้างขึ้นเพื่อให้การเข้าถึง Minecraft Server ต่างๆ ได้ง่ายขึ้น
                      และขยายโอกาสให้ทุกคนได้สนุกกับ Minecraft
                    </p>
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-px" style={{ backgroundColor: colors.outline }} />
                    <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>ทีมพัฒนา</span>
                    <div className="flex-1 h-px" style={{ backgroundColor: colors.outline }} />
                  </div>

                  {/* Team - Simple Row */}
                  <div className="flex flex-wrap justify-center gap-8">
                    {credits.map((person) => (
                      <div
                        key={person.name}
                        className="flex flex-col items-center gap-3 group"
                      >
                        <MCHead
                          username={person.name}
                          size={56}
                          className="rounded-full transition-transform duration-300 group-hover:scale-110"
                        />
                        <div className="text-center">
                          <p className="text-sm font-medium" style={{ color: colors.onSurface }}>
                            {person.name}
                          </p>
                          <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                            {person.role}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Footer - Minimal */}
                  <div className="text-center space-y-2 pt-8">
                    <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                      Made with ❤️ in Thailand
                    </p>
                    <p className="text-xs" style={{ color: colors.outline }}>
                      © 2024 Cat Lab_ Design
                    </p>
                  </div>
                </div>
              </div>
            )
          }
        </main >
      </div >

      {/* FAB */}
      {
        selectedServer && session && (
          <button
            onClick={handleLaunch}
            disabled={isLaunching}
            className="fixed bottom-6 right-6 flex items-center gap-2 px-6 py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
            style={{ backgroundColor: colors.secondary, color: colors.primary }}
          >
            <Icons.Play className="w-6 h-6" />
            <span className="font-medium">{isLaunching ? "กำลังเปิด..." : "เล่นเกม"}</span>
          </button>
        )
      }
    </div >
  );
}


