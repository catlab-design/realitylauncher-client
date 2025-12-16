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

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import toast, { Toaster } from "react-hot-toast";

// ========================================
// Types
// ========================================

type ColorTheme = "yellow" | "purple" | "blue" | "green" | "red" | "orange";

interface AuthSession {
  type: "offline" | "microsoft";
  username: string;
  uuid: string;
}

interface Server {
  id: string;
  name: string;
  description: string;
  image: string;
  status: "online" | "offline" | "maintenance";
  version: string;
  players?: { online: number; max: number };
}

interface NewsItem {
  id: string;
  title: string;
  content: string;
  date: string;
  type: "update" | "event" | "maintenance";
}

interface LauncherConfig {
  username: string;
  selectedVersion: string;
  ramMB: number;
  javaPath?: string;
  minecraftDir?: string;
  theme: "dark" | "light";
  colorTheme: ColorTheme;
  customColor?: string;
  language: "th" | "en";
  windowWidth: number;
  windowHeight: number;
  windowAuto: boolean;
  closeOnLaunch: boolean;
  discordRPCEnabled: boolean;
  downloadSpeedLimit: number;
}

// ========================================
// Utility
// ========================================

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function getMCHeadURL(username: string, size: number = 64): string {
  return `https://crafthead.net/avatar/${username}/${size}`;
}

// Color theme definitions
const COLOR_THEMES: Record<ColorTheme, { primary: string; name: string }> = {
  yellow: { primary: "#ffde59", name: "Yellow" },
  purple: { primary: "#8b5cf6", name: "Purple" },
  blue: { primary: "#3b82f6", name: "Blue" },
  green: { primary: "#22c55e", name: "Green" },
  red: { primary: "#ef4444", name: "Red" },
  orange: { primary: "#f97316", name: "Orange" },
};

// ========================================
// Icons
// ========================================

const Icons = {
  Home: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  ),
  Settings: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  ),
  Person: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  ),
  Play: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  Refresh: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
    </svg>
  ),
  Login: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z" />
    </svg>
  ),
  Logout: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="m17 7-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
    </svg>
  ),
  Dns: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1zM7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
    </svg>
  ),
  Info: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
    </svg>
  ),
  Folder: ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  ),
  Discord: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  ),
  Heart: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="m12 21.35-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  ),
  Box: ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18-.21 0-.41-.06-.57-.18l-7.9-4.44A.991.991 0 0 1 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18.21 0 .41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9zM12 4.15L6.04 7.5 12 10.85l5.96-3.35L12 4.15zM5 15.91l6 3.38v-6.71L5 9.21v6.7zm14 0v-6.7l-6 3.37v6.71l6-3.38z" />
    </svg>
  ),
};

// ========================================
// Colors (dynamically based on theme)
// ========================================

function getColors(colorTheme: ColorTheme, isDark: boolean, customColor?: string) {
  const themeColor = customColor || COLOR_THEMES[colorTheme].primary;

  if (isDark) {
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

    const completeLoading = () => {
      if (completed) return;
      completed = true;
      gsap.to(".loading-screen", { opacity: 0, duration: 0.5, onComplete });
    };

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
      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom Section */}
      <div className="px-8 pb-4">
        {/* Logo + Title + Percentage Row */}
        <div className="flex items-center justify-between mb-4">
          {/* Left - Logo + Title */}
          <div ref={logoRef} className="flex items-center gap-3">
            <img src="/r.png" alt="Reality" className="w-12 h-12 object-contain" />
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

function MCHead({ username, size = 48, className = "" }: { username: string; size?: number; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className={cn("rounded-xl overflow-hidden flex items-center justify-center bg-gray-200", className)} style={{ width: size, height: size }}>
      {!error ? (
        <img
          src={getMCHeadURL(username, size * 2)}
          alt={username}
          className={cn("w-full h-full object-cover transition-opacity", loaded ? "opacity-100" : "opacity-0")}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      ) : (
        <span className="text-lg font-bold text-gray-500">{username.charAt(0).toUpperCase()}</span>
      )}
    </div>
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
  });

  // Get colors based on current theme (dark/light + color)
  const colors = getColors(config.colorTheme, config.theme === "dark", config.customColor);

  // Server data (TODO: ดึงข้อมูลจาก server)
  const [servers] = useState<Server[]>([]);

  // News data (TODO: ดึงข้อมูลจาก server)
  const [news] = useState<NewsItem[]>([]);

  // Credits data
  const credits = [
    { name: "Sam_Su", role: "ผู้สร้างและผู้ทำลาย", description: "UI/UX Designer" },
    { name: "realnice_k", role: "ผู้ออกแบบและผู้ช่วยพัฒนา", description: "Creator & Developer" },
    { name: "Kjofex2", role: "ผู้สนับสนุนรายใหญ่", description: "Supporter" },
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
  const handleLogin = async (username: string) => {
    try {
      // ลอง login ผ่าน Electron API ก่อน
      let newSession = await window.api?.loginOffline(username);

      // ถ้าไม่มี API (รันใน browser) ให้สร้าง session เอง
      if (!newSession) {
        // Validate username
        const trimmedName = username.trim();
        if (trimmedName.length < 3 || trimmedName.length > 16) {
          toast.error("ชื่อผู้เล่นต้องมี 3-16 ตัวอักษร");
          return;
        }
        if (!/^[A-Za-z0-9_]+$/.test(trimmedName)) {
          toast.error("ชื่อผู้เล่นใช้ได้เฉพาะ A-Z, 0-9 และ _");
          return;
        }

        // สร้าง offline session
        newSession = {
          type: "offline" as const,
          username: trimmedName,
          uuid: `offline-${trimmedName}-${Date.now()}`,
        };
      }

      if (newSession) {
        // เพิ่มบัญชีใหม่ถ้ายังไม่มี
        setAccounts(prev => {
          const exists = prev.some(acc => acc.username === newSession!.username && acc.type === newSession!.type);
          if (!exists) {
            return [...prev, newSession!];
          }
          return prev;
        });
        // ตั้งเป็น session ที่ใช้งาน
        setSession(newSession);
        toast.success(`ยินดีต้อนรับ, ${newSession.username}!`);
      }
    } catch (error: any) {
      toast.error(error?.message || "เข้าสู่ระบบไม่สำเร็จ");
      throw error;
    }
  };

  // เลือกบัญชีที่จะใช้งาน
  const selectAccount = (account: AuthSession) => {
    setSession(account);
    setAccountManagerOpen(false);
    toast.success(`เปลี่ยนเป็นบัญชี ${account.username}`);
  };

  // ลบบัญชีออกจากรายการ
  const removeAccount = (account: AuthSession) => {
    setAccounts(prev => prev.filter(acc => !(acc.username === account.username && acc.type === account.type)));
    if (session?.username === account.username && session?.type === account.type) {
      setSession(null);
    }
    toast.success(`ลบบัญชี ${account.username} แล้ว`);
  };

  const handleLogout = async () => {
    try {
      await window.api?.logout();
      setSession(null);
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

  // Render tabs
  const navItems = [
    { id: "home", icon: Icons.Home, label: "หน้าหลัก" },
    { id: "servers", icon: Icons.Dns, label: "เซิร์ฟเวอร์" },
    { id: "modpack", icon: Icons.Box, label: "Mod Pack" },
    { id: "settings", icon: Icons.Settings, label: "ตั้งค่า" },
    { id: "about", icon: Icons.Info, label: "เกี่ยวกับ" },
  ];

  return (
    <div ref={rootRef} className="h-screen flex overflow-hidden" style={{ backgroundColor: colors.surface }}>
      <Toaster position="bottom-center" />

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
                console.log("[Auth] Microsoft login button clicked");
                const AUTH_URL = "http://localhost:3001";
                try {
                  if (window.api?.openAuthWindow) {
                    toast.loading("กำลังเปิดหน้าต่างเข้าสู่ระบบ...");
                    await window.api.openAuthWindow();
                    console.log("[Auth] Auth window opened successfully");
                  } else {
                    // Fallback: Open in new browser tab
                    console.log("[Auth] API not available, opening in browser");
                    toast.success("กำลังเปิดหน้าเว็บเข้าสู่ระบบ...");
                    window.open(AUTH_URL, "_blank");
                  }
                } catch (error) {
                  console.error("[Auth] Error opening auth window:", error);
                  // Fallback to browser
                  window.open(AUTH_URL, "_blank");
                }
                setLoginDialogOpen(false);
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

            {/* Offline Login */}
            <p className="text-sm mb-2" style={{ color: colors.onSurfaceVariant }}>เข้าสู่ระบบแบบ Offline</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="ชื่อผู้เล่น"
                className="flex-1 px-4 py-3 rounded-xl border"
                style={{
                  borderColor: colors.outline,
                  backgroundColor: colors.surfaceContainer,
                  color: colors.onSurface,
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.currentTarget.value) {
                    handleLogin(e.currentTarget.value);
                    setLoginDialogOpen(false);
                  }
                }}
              />
              {/* Arrow Submit Button */}
              <button
                onClick={() => {
                  const input = document.querySelector('input[placeholder="ชื่อผู้เล่น"]') as HTMLInputElement;
                  if (input?.value) {
                    handleLogin(input.value);
                    setLoginDialogOpen(false);
                  }
                }}
                className="w-12 h-12 rounded-xl flex items-center justify-center transition-all hover:scale-105"
                style={{ backgroundColor: colors.secondary }}
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#1a1a1a">
                  <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
                </svg>
              </button>
            </div>
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
                    <div className="font-medium" style={{ color: colors.onSurface }}>{account.username}</div>
                    <div className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                      {account.type === "microsoft" ? "Microsoft Account" : "Offline Mode"}
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

      {/* Sidebar */}
      <nav className="w-20 flex flex-col items-center py-4 gap-3" style={{ backgroundColor: colors.secondary }}>
        <div className="w-12 h-12 rounded-2xl mb-4 overflow-hidden">
          <img src="/r.png" alt="Logo" className="w-full h-full object-cover" />
        </div>
        {navItems.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            title={label}
            className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all hover:scale-105"
            style={{ backgroundColor: activeTab === id ? "rgba(255,255,255,0.9)" : "transparent", color: "#1a1a1a" }}
          >
            <Icon className="w-6 h-6" />
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6" style={{ backgroundColor: colors.surface }}>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold" style={{ fontFamily: "'Jaturat', 'Itim', sans-serif", color: colors.onSurface }}>Reality</h1>
            <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>v0.1.0</span>
          </div>
          <div className="flex items-center gap-3 relative">
            {/* Account Button */}
            <button
              onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border transition-all hover:scale-105"
              style={{ borderColor: colors.outline, color: colors.onSurface }}
            >
              {session ? (
                <MCHead username={session.username} size={28} className="rounded-full" />
              ) : (
                <Icons.Person className="w-5 h-5" />
              )}
              Account
              <svg className={`w-4 h-4 transition-transform ${accountDropdownOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="currentColor">
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
                          <div className="text-sm font-medium truncate" style={{ color: colors.onSurface }}>{account.username}</div>
                          <div className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                            {account.type === "microsoft" ? "Microsoft" : "Offline Account"}
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
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">
          {/* Home Tab */}
          {activeTab === "home" && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                {session ? <MCHead username={session.username} size={64} /> : <div className="w-16 h-16 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainerHighest }}><Icons.Person className="w-8 h-8" style={{ color: colors.onSurfaceVariant }} /></div>}
                <div>
                  <h2 className="text-2xl font-medium" style={{ color: colors.onSurface }}>{session ? `ยินดีต้อนรับกลับ, ${session.username}!` : "ยินดีต้อนรับสู่ Reality"}</h2>
                  <p style={{ color: colors.onSurfaceVariant }}>{session ? "เลือกเซิร์ฟเวอร์แล้วกดเล่น" : "เข้าสู่ระบบเพื่อเริ่มเล่น"}</p>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-3" style={{ color: colors.onSurface }}>ข่าวสาร</h3>
                {news.length === 0 ? (
                  <div className="p-6 rounded-xl text-center" style={{ backgroundColor: colors.surfaceContainer }}>
                    <p style={{ color: colors.onSurfaceVariant }}>ไม่มีข่าวสาร</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {news.map((item) => (
                      <div key={item.id} className="p-4 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: item.type === "update" ? "#e3f2fd" : "#fff3e0", color: item.type === "update" ? "#1565c0" : "#e65100" }}>
                            {item.type === "update" ? "อัปเดต" : "กิจกรรม"}
                          </span>
                          <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>{item.date}</span>
                        </div>
                        <h4 className="font-medium" style={{ color: colors.onSurface }}>{item.title}</h4>
                        <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{item.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg font-medium mb-3" style={{ color: colors.onSurface }}>เซิร์ฟเวอร์ที่เล่นล่าสุด</h3>
                {servers.length === 0 ? (
                  <div className="p-6 rounded-xl text-center" style={{ backgroundColor: colors.surfaceContainer }}>
                    <p style={{ color: colors.onSurfaceVariant }}>ไม่มีเซิร์ฟเวอร์</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {servers.slice(0, 3).map((server) => (
                      <button
                        key={server.id}
                        onClick={() => setSelectedServer(server)}
                        className="w-full p-4 rounded-xl text-left transition-all hover:shadow-md"
                        style={{ backgroundColor: colors.surfaceContainer, border: selectedServer?.id === server.id ? `2px solid ${colors.primary}` : "2px solid transparent" }}
                      >
                        <div className="flex gap-4">
                          <div className="w-16 h-16 rounded-xl bg-cover bg-center" style={{ backgroundImage: `url(${server.image})` }} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium" style={{ color: colors.onSurface }}>{server.name}</span>
                              <span className={cn("w-2 h-2 rounded-full", server.status === "online" ? "bg-green-500" : "bg-red-500")} />
                            </div>
                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{server.description}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>{server.version}</span>
                              {server.players && <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>{server.players.online}/{server.players.max}</span>}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Servers Tab */}
          {activeTab === "servers" && (
            <div>
              <h2 className="text-xl font-medium mb-4" style={{ color: colors.onSurface }}>เซิร์ฟเวอร์ทั้งหมด</h2>
              {servers.length === 0 ? (
                <div className="p-8 rounded-xl text-center" style={{ backgroundColor: colors.surfaceContainer }}>
                  <p style={{ color: colors.onSurfaceVariant }}>ไม่มีเซิร์ฟเวอร์</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {servers.map((server) => (
                    <button
                      key={server.id}
                      onClick={() => setSelectedServer(server)}
                      className="p-4 rounded-xl text-left transition-all hover:shadow-md"
                      style={{ backgroundColor: colors.surfaceContainer, border: selectedServer?.id === server.id ? `2px solid ${colors.primary}` : "2px solid transparent" }}
                    >
                      <div className="flex gap-4">
                        <div className="w-16 h-16 rounded-xl bg-cover bg-center" style={{ backgroundImage: `url(${server.image})` }} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium" style={{ color: colors.onSurface }}>{server.name}</span>
                            <span className={cn("w-2 h-2 rounded-full", server.status === "online" ? "bg-green-500" : "bg-red-500")} />
                          </div>
                          <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{server.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Modpack Tab */}
          {activeTab === "modpack" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-medium" style={{ color: colors.onSurface }}>Mod Pack</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setImportModpackOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-105 border"
                    style={{ borderColor: colors.outline, color: colors.onSurface }}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                    </svg>
                    นำเข้า
                  </button>
                  <button
                    onClick={() => toast.success("ฟีเจอร์นี้กำลังพัฒนา")}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all hover:scale-105"
                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                  >
                    <Icons.Box className="w-5 h-5" />
                    สร้าง Mod Pack ใหม่
                  </button>
                </div>
              </div>

              {/* Create Custom Modpack Card */}
              <div className="p-6 rounded-2xl" style={{ backgroundColor: colors.surfaceContainer }}>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                    <Icons.Box className="w-8 h-8" style={{ color: colors.secondary }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium" style={{ color: colors.onSurface }}>สร้าง Mod Pack ของคุณเอง</h3>
                    <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>เลือก mod ที่ต้องการและรวมเป็น pack</p>
                  </div>
                </div>
                <button
                  onClick={() => toast.success("ฟีเจอร์นี้กำลังพัฒนา")}
                  className="w-full py-3 rounded-xl border-2 border-dashed transition-all hover:bg-opacity-10"
                  style={{ borderColor: colors.outline, color: colors.onSurfaceVariant }}
                >
                  + เพิ่ม Mod ใหม่
                </button>
              </div>

              {/* Server Modpacks */}
              <div>
                <h3 className="text-lg font-medium mb-4" style={{ color: colors.onSurface }}>แก้ไข Mod ของเซิร์ฟเวอร์</h3>
                {servers.length === 0 ? (
                  <div className="p-8 rounded-xl text-center" style={{ backgroundColor: colors.surfaceContainer }}>
                    <Icons.Dns className="w-12 h-12 mx-auto mb-3" style={{ color: colors.onSurfaceVariant }} />
                    <p style={{ color: colors.onSurfaceVariant }}>ไม่มีเซิร์ฟเวอร์</p>
                    <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>เพิ่มเซิร์ฟเวอร์ก่อนเพื่อจัดการ mod</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {servers.map((server) => (
                      <div
                        key={server.id}
                        className="p-4 rounded-xl transition-all hover:shadow-md"
                        style={{ backgroundColor: colors.surfaceContainer }}
                      >
                        <div className="flex gap-4 mb-4">
                          <div className="w-14 h-14 rounded-xl bg-cover bg-center" style={{ backgroundImage: `url(${server.image})` }} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium" style={{ color: colors.onSurface }}>{server.name}</span>
                              <span className={cn("w-2 h-2 rounded-full", server.status === "online" ? "bg-green-500" : "bg-red-500")} />
                            </div>
                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>{server.version}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => toast.success("ฟีเจอร์นี้กำลังพัฒนา")}
                            className="flex-1 py-2 rounded-lg text-sm"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                          >
                            จัดการ Mod
                          </button>
                          <button
                            onClick={() => toast.success("ฟีเจอร์นี้กำลังพัฒนา")}
                            className="flex-1 py-2 rounded-lg text-sm"
                            style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                          >
                            เพิ่ม Mod
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* My Modpacks */}
              <div>
                <h3 className="text-lg font-medium mb-4" style={{ color: colors.onSurface }}>Mod Pack ของฉัน</h3>
                <div className="p-8 rounded-xl text-center" style={{ backgroundColor: colors.surfaceContainer }}>
                  <Icons.Box className="w-12 h-12 mx-auto mb-3" style={{ color: colors.onSurfaceVariant }} />
                  <p style={{ color: colors.onSurfaceVariant }}>ยังไม่มี Mod Pack</p>
                  <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>สร้าง Mod Pack แรกของคุณ</p>
                </div>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === "settings" && (
            <div className="space-y-6 max-w-2xl">
              <h2 className="text-xl font-medium" style={{ color: colors.onSurface }}>ตั้งค่า</h2>

              {/* Dark/Light Theme */}
              <div className="p-4 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                <h3 className="font-medium mb-3" style={{ color: colors.onSurface }}>ธีมพื้นหลัง</h3>
                <div className="flex gap-3">
                  <button
                    onClick={() => updateConfig({ theme: "light" })}
                    className="flex-1 py-3 rounded-xl transition-all font-medium flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: config.theme === "light" ? colors.secondary : colors.surfaceContainerHigh,
                      color: config.theme === "light" ? "#1a1a1a" : colors.onSurfaceVariant,
                    }}
                  >
                    <i className="fa-solid fa-sun"></i> สว่าง
                  </button>
                  <button
                    onClick={() => updateConfig({ theme: "dark" })}
                    className="flex-1 py-3 rounded-xl transition-all font-medium flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: config.theme === "dark" ? colors.secondary : colors.surfaceContainerHigh,
                      color: config.theme === "dark" ? "#1a1a1a" : colors.onSurfaceVariant,
                    }}
                  >
                    <i className="fa-solid fa-moon"></i> มืด
                  </button>
                </div>
              </div>

              {/* Color Theme */}
              <div className="p-4 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                <h3 className="font-medium mb-3" style={{ color: colors.onSurface }}>ธีมสี</h3>
                <div className="flex gap-3 flex-wrap items-center">
                  {(Object.keys(COLOR_THEMES) as ColorTheme[]).map((theme) => (
                    <button
                      key={theme}
                      onClick={() => {
                        updateConfig({ colorTheme: theme, customColor: undefined });
                        setCustomColorPending(null);
                      }}
                      className="w-10 h-10 rounded-full transition-all hover:scale-110"
                      style={{ backgroundColor: COLOR_THEMES[theme].primary, border: config.colorTheme === theme && !config.customColor && !customColorPending ? `3px solid ${colors.onSurface}` : "3px solid transparent" }}
                      title={COLOR_THEMES[theme].name}
                    />
                  ))}
                  {/* Custom Color Button */}
                  <div className="relative">
                    <input
                      type="color"
                      value={customColorPending || config.customColor || "#ff6b6b"}
                      onChange={(e) => setCustomColorPending(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-10 h-10"
                    />
                    <div
                      className="w-10 h-10 rounded-full transition-all hover:scale-110 flex items-center justify-center"
                      style={{
                        background: customColorPending || config.customColor || `conic-gradient(red, yellow, lime, aqua, blue, magenta, red)`,
                        border: (customColorPending || config.customColor) ? `3px solid ${colors.onSurface}` : "3px solid transparent"
                      }}
                      title="เลือกสี Custom"
                    >
                      {!customColorPending && !config.customColor && <span className="text-xs">🎨</span>}
                    </div>
                  </div>
                </div>
                {/* Pending custom color - show save/cancel */}
                {customColorPending && (
                  <div className="flex items-center gap-3 mt-3 p-3 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                    <div className="w-8 h-8 rounded-full" style={{ backgroundColor: customColorPending }} />
                    <span className="text-sm flex-1" style={{ color: colors.onSurface }}>สีใหม่: {customColorPending}</span>
                    <button
                      onClick={() => {
                        updateConfig({ customColor: customColorPending });
                        setCustomColorPending(null);
                        toast.success("บันทึกสี Custom แล้ว");
                      }}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium"
                      style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                    >
                      บันทึก
                    </button>
                    <button
                      onClick={() => setCustomColorPending(null)}
                      className="px-3 py-1.5 rounded-lg text-sm"
                      style={{ backgroundColor: colors.surfaceContainer, color: colors.onSurface }}
                    >
                      ยกเลิก
                    </button>
                  </div>
                )}
                {/* Saved custom color - show clear button */}
                {config.customColor && !customColorPending && (
                  <div className="flex items-center gap-2 mt-3">
                    <div className="w-6 h-6 rounded-full" style={{ backgroundColor: config.customColor }} />
                    <span className="text-sm" style={{ color: colors.onSurfaceVariant }}>กำลังใช้สี Custom: {config.customColor}</span>
                    <button
                      onClick={() => updateConfig({ customColor: undefined })}
                      className="text-xs px-2 py-1 rounded ml-2"
                      style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    >
                      ล้าง
                    </button>
                  </div>
                )}
              </div>

              {/* RAM */}
              <div className="p-4 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                <h3 className="font-medium mb-3" style={{ color: colors.onSurface }}>หน่วยความจำ (RAM)</h3>
                <div className="flex items-center gap-4">
                  <input type="range" min={1024} max={8192} step={256} value={config.ramMB} onChange={(e) => updateConfig({ ramMB: Number(e.target.value) })} className="flex-1" style={{ accentColor: colors.secondary }} />
                  <span className="font-medium w-20 text-right" style={{ color: colors.onSurface }}>{(config.ramMB / 1024).toFixed(1)} GB</span>
                </div>
              </div>

              {/* Download Speed Limit */}
              <div className="p-4 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                <h3 className="font-medium mb-3" style={{ color: colors.onSurface }}>ความเร็วดาวน์โหลด</h3>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={config.downloadSpeedLimit}
                    onChange={(e) => updateConfig({ downloadSpeedLimit: Number(e.target.value) })}
                    className="flex-1"
                    style={{ accentColor: colors.secondary }}
                  />
                  <span className="font-medium w-24 text-right" style={{ color: colors.onSurface }}>
                    {config.downloadSpeedLimit === 0 ? "ไม่จำกัด" : `${config.downloadSpeedLimit} MB/s`}
                  </span>
                </div>
              </div>

              {/* Java Path */}
              <div className="p-4 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                <h3 className="font-medium mb-3" style={{ color: colors.onSurface }}>Java Installation</h3>
                <div className="flex gap-3">
                  <input type="text" value={config.javaPath || "ใช้ Java ของระบบ"} readOnly className="flex-1 px-4 py-2 rounded-xl border" style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }} />
                  <button onClick={handleBrowseJava} className="px-4 py-2 rounded-xl" style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}>เลือก</button>
                </div>
              </div>

              {/* Minecraft Directory */}
              <div className="p-4 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                <h3 className="font-medium mb-3" style={{ color: colors.onSurface }}>App Directory (.minecraft)</h3>
                <div className="flex gap-3">
                  <input type="text" value={config.minecraftDir || "ใช้ค่าเริ่มต้น"} readOnly className="flex-1 px-4 py-2 rounded-xl border" style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }} />
                  <button onClick={handleBrowseMinecraftDir} className="px-4 py-2 rounded-xl" style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}>เลือก</button>
                </div>
              </div>

              {/* Window Size */}
              <div className="p-4 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium" style={{ color: colors.onSurface }}>ขนาดหน้าต่าง</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: colors.onSurfaceVariant }}>อัตโนมัติ</span>
                    <button
                      onClick={() => updateConfig({ windowAuto: !config.windowAuto })}
                      className="relative w-12 h-6 rounded-full transition-colors"
                      style={{ backgroundColor: config.windowAuto ? colors.secondary : colors.surfaceContainerHighest }}
                    >
                      <div
                        className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                        style={{ left: config.windowAuto ? "calc(100% - 20px)" : "4px" }}
                      />
                    </button>
                  </div>
                </div>
                {!config.windowAuto && (
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-sm" style={{ color: colors.onSurfaceVariant }}>กว้าง</label>
                      <input type="number" value={config.windowWidth} onChange={(e) => updateConfig({ windowWidth: Number(e.target.value) })} className="w-full px-4 py-2 rounded-xl border mt-1" style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }} />
                    </div>
                    <div className="flex-1">
                      <label className="text-sm" style={{ color: colors.onSurfaceVariant }}>สูง</label>
                      <input type="number" value={config.windowHeight} onChange={(e) => updateConfig({ windowHeight: Number(e.target.value) })} className="w-full px-4 py-2 rounded-xl border mt-1" style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }} />
                    </div>
                  </div>
                )}
                {config.windowAuto && (
                  <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>ขนาดหน้าต่างจะปรับตามหน้าจออัตโนมัติ</p>
                )}
              </div>

              {/* Discord RPC */}
              <div className="p-4 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Icons.Discord className="w-6 h-6" style={{ color: colors.onSurface }} />
                      <div
                        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                        style={{
                          backgroundColor: config.discordRPCEnabled ? "#22c55e" : "#6b7280",
                          borderColor: colors.surfaceContainer
                        }}
                      />
                    </div>
                    <div>
                      <h3 className="font-medium" style={{ color: colors.onSurface }}>Discord Rich Presence</h3>
                      <p className="text-sm" style={{ color: config.discordRPCEnabled ? "#22c55e" : colors.onSurfaceVariant }}>
                        {config.discordRPCEnabled ? "กำลังแสดงสถานะ" : "ปิดอยู่"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const newValue = !config.discordRPCEnabled;
                      updateConfig({ discordRPCEnabled: newValue });
                      window.api?.discordRPCSetEnabled?.(newValue);
                      if (newValue) {
                        window.api?.discordRPCUpdate?.("idle");
                        toast.success("เปิด Discord Rich Presence");
                      } else {
                        toast.success("ปิด Discord Rich Presence");
                      }
                    }}
                    className="relative w-12 h-6 rounded-full transition-colors"
                    style={{ backgroundColor: config.discordRPCEnabled ? colors.secondary : colors.surfaceContainerHighest }}
                  >
                    <div
                      className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                      style={{ left: config.discordRPCEnabled ? "calc(100% - 20px)" : "4px" }}
                    />
                  </button>
                </div>
              </div>

              {/* Close on Launch */}
              <div className="p-4 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium" style={{ color: colors.onSurface }}>ปิด Launcher เมื่อเปิดเกม</h3>
                    <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>ปิดหน้าต่าง launcher อัตโนมัติ</p>
                  </div>
                  <input type="checkbox" checked={config.closeOnLaunch} onChange={(e) => updateConfig({ closeOnLaunch: e.target.checked })} className="w-5 h-5" style={{ accentColor: colors.secondary }} />
                </div>
              </div>
            </div>
          )}

          {/* About Tab */}
          {activeTab === "about" && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="text-center py-8">
                <div className="w-24 h-24 rounded-3xl mx-auto mb-4 overflow-hidden shadow-lg">
                  <img src="/r.png" alt="Reality" className="w-full h-full object-cover" />
                </div>
                <h2 className="text-3xl font-bold" style={{ fontFamily: "'Jaturat', 'Itim', sans-serif", color: colors.onSurface }}>Reality</h2>
                <p className="text-lg" style={{ color: colors.onSurfaceVariant }}>Minecraft Launcher</p>
                <p className="text-sm mt-2 px-2 py-1 rounded-full inline-block" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>Version 0.1.0</p>
              </div>

              <div className="p-6 rounded-xl text-center" style={{ backgroundColor: colors.surfaceContainer }}>
                <Icons.Heart className="w-8 h-8 mx-auto mb-3" style={{ color: "#ef4444" }} />
                <h3 className="text-lg font-medium mb-2" style={{ color: colors.onSurface }}>จุดประสงค์</h3>
                <p style={{ color: colors.onSurfaceVariant }}>
                  Reality Launcher ถูกสร้างขึ้นเพื่อให้การเข้าถึง Server ต่างๆ ได้ง่ายขึ้น
                  และขยายโอกาสใหม่ๆ ให้คนรุ่นใหม่ และ Server เล็กๆ ได้มีโอกาสมากขึ้น
                </p>
              </div>

              <div className="p-6 rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
                <h3 className="text-lg font-medium mb-4 text-center" style={{ color: colors.onSurface }}>ทีมงาน</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {credits.map((person) => (
                    <div key={person.name} className="text-center p-4 rounded-xl" style={{ backgroundColor: colors.surface }}>
                      <MCHead username={person.name} size={80} className="mx-auto mb-3 rounded-xl" />
                      <h4 className="font-bold" style={{ color: colors.onSurface }}>{person.name}</h4>
                      <p className="text-sm font-medium" style={{ color: colors.primary }}>{person.role}</p>
                      <p className="text-xs mt-1" style={{ color: colors.onSurface }}>{person.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-center text-sm" style={{ color: colors.onSurfaceVariant }}>
                <p>Made by Cat Lab_ Design</p>
                <p className="mt-1">Powered by Q Team Studio</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* FAB */}
      {selectedServer && session && (
        <button
          onClick={handleLaunch}
          disabled={isLaunching}
          className="fixed bottom-6 right-6 flex items-center gap-2 px-6 py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
          style={{ backgroundColor: colors.secondary, color: colors.primary }}
        >
          <Icons.Play className="w-6 h-6" />
          <span className="font-medium">{isLaunching ? "กำลังเปิด..." : "เล่นเกม"}</span>
        </button>
      )}
    </div>
  );
}
