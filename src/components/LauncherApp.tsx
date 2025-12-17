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
  // Game launch settings
  fullscreen: boolean;
  javaArguments: string;
  maxConcurrentDownloads: number;
  telemetryEnabled: boolean;
  // Java installations
  java8Path?: string;
  java17Path?: string;
  java21Path?: string;
  // Auto Java selection
  autoJavaSelection: boolean;
  selectedJavaVersion?: "8" | "17" | "21" | "custom";
  // File verification
  verifyFilesBeforeLaunch: boolean;
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
  const [settingsTab, setSettingsTab] = useState<"appearance" | "game" | "connections" | "launcher" | "resources" | "java" | "account">("account");
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
    // Game launch settings
    fullscreen: false,
    javaArguments: "",
    maxConcurrentDownloads: 5,
    telemetryEnabled: true,
    // Java auto-selection
    autoJavaSelection: true,
    // File verification
    verifyFilesBeforeLaunch: true,
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

  // Render tabs - split into main and bottom navigation
  const mainNavItems = [
    { id: "home", icon: Icons.Home, label: "หน้าหลัก" },
    { id: "servers", icon: Icons.Dns, label: "เซิร์ฟเวอร์" },
    { id: "modpack", icon: Icons.Box, label: "Mod Pack" },
  ];

  const bottomNavItems = [
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
      <nav className="w-20 flex flex-col items-center" style={{ backgroundColor: colors.secondary }}>
        {/* Top Section - Logo and Main Nav */}
        <div className="flex-1 flex flex-col items-center gap-2">
          {/* Drag region for sidebar top */}
          <div className="w-full pt-2 pb-2 flex justify-center drag-region">
            <div className="w-12 h-12 rounded-2xl overflow-hidden">
              <img src="r.svg" alt="Logo" className="w-full h-full object-cover" />
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
          className="h-10 flex items-center justify-between pl-6 pr-0 drag-region"
          style={{ backgroundColor: colors.surface }}
        >
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold" style={{ fontFamily: "'Jaturat', 'Itim', sans-serif", color: colors.onSurface }}>Reality</h1>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>v0.1.0</span>
          </div>

          {/* Right Side - Account + Window Controls */}
          <div className="flex items-center gap-3 no-drag">
            {/* Account Section */}
            <div className="relative">
              {/* Account Button */}
              <button
                onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-all hover:scale-105"
                style={{ borderColor: colors.outline, color: colors.onSurface }}
              >
                {session ? (
                  <MCHead username={session.username} size={22} className="rounded-full" />
                ) : (
                  <Icons.Person className="w-4 h-4" />
                )}
                {session?.username || "Account"}
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

            {/* Window Control Buttons */}
            <div className="flex items-center gap-0 ml-3 relative z-50" style={{ pointerEvents: "auto" }}>
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
          {/* Home Tab */}
          {activeTab === "home" && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                {session ? <MCHead username={session.username} size={64} /> : <div className="w-16 h-16 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainerHighest }}><Icons.Person className="w-8 h-8" style={{ color: colors.onSurfaceVariant }} /></div>}
                <div>
                  <h2 className="text-2xl font-medium" style={{ color: colors.onSurface }}>{session ? `ยินดีต้อนรับกลับ, ${session.username}!` : "ยินดีต้อนรับสู่ Reality"}</h2>
                  <p style={{ color: colors.onSurfaceVariant }}>{session ? "launcher ที่เป็นมากกว่า..." : "เข้าสู่ระบบเพื่อเริ่มเล่น"}</p>
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
            <div className="flex gap-6 h-full">
              {/* Sidebar Navigation */}
              <div className={`${config.fullscreen ? "w-64" : "w-56"} flex-shrink-0 pr-4 transition-all`}>
                <div className="sticky top-0 space-y-1">
                  {[
                    { id: "account", icon: "fa-user", label: "บัญชีผู้ใช้" },
                    { id: "appearance", icon: "fa-palette", label: "การแสดงผล" },
                    { id: "game", icon: "fa-gamepad", label: "เกมและประสิทธิภาพ" },
                    { id: "connections", icon: "fa-wifi", label: "การเชื่อมต่อ" },
                    { id: "launcher", icon: "fa-rocket", label: "Launcher" },
                    { id: "resources", icon: "fa-hard-drive", label: "จัดการทรัพยากร" },
                    { id: "java", icon: "fa-brands fa-java", label: "Java" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSettingsTab(item.id as typeof settingsTab)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-left"
                      style={{
                        backgroundColor: settingsTab === item.id ? colors.secondary : "transparent",
                        color: settingsTab === item.id ? "#1a1a1a" : colors.onSurfaceVariant,
                      }}
                    >
                      <i className={`fa-solid ${item.icon} w-5`}></i>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 space-y-6 overflow-auto">
                {/* ==================== APPEARANCE ==================== */}
                {settingsTab === "appearance" && (
                  <>
                    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
                      <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                        <i className="fa-solid fa-palette text-lg" style={{ color: colors.secondary }}></i>
                        <h3 className="font-medium" style={{ color: colors.onSurface }}>การแสดงผล</h3>
                      </div>
                      <div className="p-4 space-y-4">
                        {/* Theme Toggle */}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>ธีมพื้นหลัง</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>เลือกโหมดสว่างหรือมืด</p>
                          </div>
                          <div className="flex gap-2 p-1 rounded-xl" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                            <button
                              onClick={() => updateConfig({ theme: "light" })}
                              className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
                              style={{
                                backgroundColor: config.theme === "light" ? colors.secondary : "transparent",
                                color: config.theme === "light" ? "#1a1a1a" : colors.onSurfaceVariant,
                              }}
                            >
                              <i className="fa-solid fa-sun"></i> สว่าง
                            </button>
                            <button
                              onClick={() => updateConfig({ theme: "dark" })}
                              className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
                              style={{
                                backgroundColor: config.theme === "dark" ? colors.secondary : "transparent",
                                color: config.theme === "dark" ? "#1a1a1a" : colors.onSurfaceVariant,
                              }}
                            >
                              <i className="fa-solid fa-moon"></i> มืด
                            </button>
                          </div>
                        </div>

                        <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                        {/* Color Theme */}
                        <div>
                          <p className="font-medium text-sm mb-3" style={{ color: colors.onSurface }}>ธีมสี</p>
                          <div className="flex gap-3 flex-wrap items-center">
                            {(Object.keys(COLOR_THEMES) as ColorTheme[]).map((theme) => (
                              <button
                                key={theme}
                                onClick={() => {
                                  updateConfig({ colorTheme: theme, customColor: undefined });
                                  setCustomColorPending(null);
                                }}
                                className="w-10 h-10 rounded-full transition-all hover:scale-110 relative"
                                style={{ backgroundColor: COLOR_THEMES[theme].primary }}
                                title={COLOR_THEMES[theme].name}
                              >
                                {config.colorTheme === theme && !config.customColor && !customColorPending && (
                                  <i className="fa-solid fa-check absolute inset-0 flex items-center justify-center text-white text-sm drop-shadow"></i>
                                )}
                              </button>
                            ))}
                            {/* Custom Color */}
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
                                }}
                                title="เลือกสี Custom"
                              >
                                {(customColorPending || config.customColor) && (
                                  <i className="fa-solid fa-check text-white text-sm drop-shadow"></i>
                                )}
                                {!customColorPending && !config.customColor && <i className="fa-solid fa-palette text-white text-sm drop-shadow"></i>}
                              </div>
                            </div>
                          </div>
                          {/* Pending custom color */}
                          {customColorPending && (
                            <div className="flex items-center gap-3 mt-3 p-3 rounded-xl" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                              <div className="w-6 h-6 rounded-full" style={{ backgroundColor: customColorPending }} />
                              <span className="text-sm flex-1" style={{ color: colors.onSurface }}>{customColorPending}</span>
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
                          {config.customColor && !customColorPending && (
                            <div className="flex items-center gap-2 mt-3">
                              <div className="w-5 h-5 rounded-full" style={{ backgroundColor: config.customColor }} />
                              <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>สี Custom: {config.customColor}</span>
                              <button
                                onClick={() => updateConfig({ customColor: undefined })}
                                className="text-xs px-2 py-0.5 rounded"
                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                              >
                                ล้าง
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ==================== GAME & PERFORMANCE ==================== */}
                {settingsTab === "game" && (
                  <>
                    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
                      <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                        <i className="fa-solid fa-gamepad text-lg" style={{ color: colors.secondary }}></i>
                        <h3 className="font-medium" style={{ color: colors.onSurface }}>เกมและประสิทธิภาพ</h3>
                      </div>
                      <div className="p-4 space-y-4">
                        {/* RAM */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>หน่วยความจำ (RAM)</p>
                            <span className="text-sm font-medium px-3 py-1 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.secondary }}>
                              {(config.ramMB / 1024).toFixed(1)} GB
                            </span>
                          </div>
                          <input
                            type="range"
                            min={1024}
                            max={8192}
                            step={256}
                            value={config.ramMB}
                            onChange={(e) => updateConfig({ ramMB: Number(e.target.value) })}
                            className="w-full"
                            style={{ accentColor: colors.secondary }}
                          />
                          <div className="flex justify-between text-xs mt-1" style={{ color: colors.onSurfaceVariant }}>
                            <span>1 GB</span>
                            <span>8 GB</span>
                          </div>
                        </div>

                        <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                        {/* Auto Java Selection */}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>เลือก Java อัตโนมัติ</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                              เลือก Java ให้เหมาะกับเวอร์ชัน MC (8/17/21)
                            </p>
                          </div>
                          <button
                            onClick={() => updateConfig({ autoJavaSelection: !config.autoJavaSelection })}
                            className="relative w-12 h-6 rounded-full transition-colors"
                            style={{ backgroundColor: config.autoJavaSelection ? colors.secondary : colors.surfaceContainerHighest }}
                          >
                            <div
                              className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow"
                              style={{ left: config.autoJavaSelection ? "calc(100% - 20px)" : "4px" }}
                            />
                          </button>
                        </div>

                        {/* Manual Java Path (only shown when auto is off) */}
                        {!config.autoJavaSelection && (
                          <>
                            <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />
                            <div>
                              <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>Java Installation</p>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={config.javaPath || "ใช้ Java ของระบบ"}
                                  readOnly
                                  className="flex-1 px-4 py-2.5 rounded-xl border text-sm"
                                  style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }}
                                />
                                <button
                                  onClick={handleBrowseJava}
                                  className="px-4 py-2.5 rounded-xl text-sm font-medium"
                                  style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                >
                                  เลือก
                                </button>
                              </div>
                            </div>
                          </>
                        )}

                        <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                        {/* File Verification Toggle */}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>ตรวจสอบไฟล์ก่อนเปิดเกม</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                              ตรวจความสมบูรณ์ของไฟล์เกมก่อน launch
                            </p>
                          </div>
                          <button
                            onClick={() => updateConfig({ verifyFilesBeforeLaunch: !config.verifyFilesBeforeLaunch })}
                            className="relative w-12 h-6 rounded-full transition-colors"
                            style={{ backgroundColor: config.verifyFilesBeforeLaunch ? colors.secondary : colors.surfaceContainerHighest }}
                          >
                            <div
                              className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow"
                              style={{ left: config.verifyFilesBeforeLaunch ? "calc(100% - 20px)" : "4px" }}
                            />
                          </button>
                        </div>

                        <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                        {/* Minecraft Directory */}
                        <div>
                          <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>โฟลเดอร์เกม (.minecraft)</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={config.minecraftDir || "ใช้ค่าเริ่มต้น"}
                              readOnly
                              className="flex-1 px-4 py-2.5 rounded-xl border text-sm"
                              style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }}
                            />
                            <button
                              onClick={handleBrowseMinecraftDir}
                              className="px-4 py-2.5 rounded-xl text-sm font-medium"
                              style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                            >
                              เลือก
                            </button>
                          </div>
                        </div>

                        <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                        {/* Java Arguments */}
                        <div>
                          <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>Java Arguments</p>
                          <p className="text-xs mb-2" style={{ color: colors.onSurfaceVariant }}>
                            เพิ่ม JVM arguments สำหรับ Minecraft (เช่น -XX:+UseG1GC)
                          </p>
                          <input
                            type="text"
                            value={config.javaArguments}
                            onChange={(e) => updateConfig({ javaArguments: e.target.value })}
                            placeholder="เพิ่ม Java arguments..."
                            className="w-full px-4 py-2.5 rounded-xl border text-sm"
                            style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ==================== CONNECTIONS ==================== */}
                {settingsTab === "connections" && (
                  <>
                    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
                      <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                        <i className="fa-solid fa-wifi text-lg" style={{ color: colors.secondary }}></i>
                        <h3 className="font-medium" style={{ color: colors.onSurface }}>การเชื่อมต่อ</h3>
                      </div>
                      <div className="p-4 space-y-4">
                        {/* Discord RPC */}
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
                              <p className="font-medium text-sm" style={{ color: colors.onSurface }}>Discord Rich Presence</p>
                              <p className="text-xs" style={{ color: config.discordRPCEnabled ? "#22c55e" : colors.onSurfaceVariant }}>
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
                              className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow"
                              style={{ left: config.discordRPCEnabled ? "calc(100% - 20px)" : "4px" }}
                            />
                          </button>
                        </div>

                        <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                        {/* Telemetry Toggle */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <i className="fa-solid fa-chart-line w-6" style={{ color: colors.onSurface }}></i>
                            <div>
                              <p className="font-medium text-sm" style={{ color: colors.onSurface }}>Telemetry</p>
                              <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                เก็บข้อมูลการใช้งานเพื่อปรับปรุง Launcher
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const newValue = !config.telemetryEnabled;
                              updateConfig({ telemetryEnabled: newValue });
                              toast.success(newValue ? "เปิด Telemetry" : "ปิด Telemetry");
                            }}
                            className="relative w-12 h-6 rounded-full transition-colors"
                            style={{ backgroundColor: config.telemetryEnabled ? colors.secondary : colors.surfaceContainerHighest }}
                          >
                            <div
                              className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow"
                              style={{ left: config.telemetryEnabled ? "calc(100% - 20px)" : "4px" }}
                            />
                          </button>
                        </div>

                        <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                        {/* Download Speed */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>จำกัดความเร็วดาวน์โหลด</p>
                            <span className="text-sm font-medium px-3 py-1 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.secondary }}>
                              {config.downloadSpeedLimit === 0 ? "ไม่จำกัด" : `${config.downloadSpeedLimit} MB/s`}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={config.downloadSpeedLimit}
                            onChange={(e) => updateConfig({ downloadSpeedLimit: Number(e.target.value) })}
                            className="w-full"
                            style={{ accentColor: colors.secondary }}
                          />
                          <div className="flex justify-between text-xs mt-1" style={{ color: colors.onSurfaceVariant }}>
                            <span>ไม่จำกัด</span>
                            <span>100 MB/s</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ==================== LAUNCHER ==================== */}
                {settingsTab === "launcher" && (
                  <>
                    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
                      <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                        <i className="fa-solid fa-rocket text-lg" style={{ color: colors.secondary }}></i>
                        <h3 className="font-medium" style={{ color: colors.onSurface }}>Launcher</h3>
                      </div>
                      <div className="p-4 space-y-4">
                        {/* Fullscreen Toggle */}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>เต็มหน้าจอ (Fullscreen)</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>ขยายหน้าต่าง Launcher เต็มจอ</p>
                          </div>
                          <button
                            onClick={async () => {
                              if (!window.api) {
                                toast.error("ฟีเจอร์นี้ต้องใช้ใน Electron App");
                                return;
                              }
                              // Toggle window maximize first
                              await window.api.windowMaximize();
                              // Then sync config with actual state
                              const isMaximized = await window.api.windowIsMaximized();
                              updateConfig({ fullscreen: isMaximized });
                            }}
                            className="relative w-12 h-6 rounded-full transition-colors"
                            style={{ backgroundColor: config.fullscreen ? colors.secondary : colors.surfaceContainerHighest }}
                          >
                            <div
                              className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow"
                              style={{ left: config.fullscreen ? "calc(100% - 20px)" : "4px" }}
                            />
                          </button>
                        </div>

                        <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                        {/* Window Size */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-medium text-sm" style={{ color: colors.onSurface }}>ขนาดหน้าต่างเกม</p>
                              <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>กำหนดขนาดหน้าต่างเมื่อเปิดเกม</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>อัตโนมัติ</span>
                              <button
                                onClick={() => updateConfig({ windowAuto: !config.windowAuto })}
                                className="relative w-12 h-6 rounded-full transition-colors"
                                style={{ backgroundColor: config.windowAuto ? colors.secondary : colors.surfaceContainerHighest }}
                              >
                                <div
                                  className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow"
                                  style={{ left: config.windowAuto ? "calc(100% - 20px)" : "4px" }}
                                />
                              </button>
                            </div>
                          </div>
                          {!config.windowAuto && (
                            <div className="flex gap-3 mt-3">
                              <div className="flex-1">
                                <label className="text-xs mb-1 block" style={{ color: colors.onSurfaceVariant }}>กว้าง (px)</label>
                                <input
                                  type="number"
                                  value={config.windowWidth}
                                  onChange={(e) => updateConfig({ windowWidth: Number(e.target.value) })}
                                  className="w-full px-4 py-2.5 rounded-xl border text-sm"
                                  style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }}
                                />
                              </div>
                              <div className="flex-1">
                                <label className="text-xs mb-1 block" style={{ color: colors.onSurfaceVariant }}>สูง (px)</label>
                                <input
                                  type="number"
                                  value={config.windowHeight}
                                  onChange={(e) => updateConfig({ windowHeight: Number(e.target.value) })}
                                  className="w-full px-4 py-2.5 rounded-xl border text-sm"
                                  style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                        {/* Close on Launch */}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>ปิด Launcher เมื่อเปิดเกม</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>ปิดหน้าต่าง Launcher อัตโนมัติหลังเริ่มเกม</p>
                          </div>
                          <button
                            onClick={() => updateConfig({ closeOnLaunch: !config.closeOnLaunch })}
                            className="relative w-12 h-6 rounded-full transition-colors"
                            style={{ backgroundColor: config.closeOnLaunch ? colors.secondary : colors.surfaceContainerHighest }}
                          >
                            <div
                              className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow"
                              style={{ left: config.closeOnLaunch ? "calc(100% - 20px)" : "4px" }}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ==================== RESOURCE MANAGEMENT ==================== */}
                {settingsTab === "resources" && (
                  <>
                    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
                      <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                        <i className="fa-solid fa-hard-drive text-lg" style={{ color: colors.secondary }}></i>
                        <h3 className="font-medium" style={{ color: colors.onSurface }}>จัดการทรัพยากร</h3>
                      </div>
                      <div className="p-4 space-y-4">
                        {/* App Directory */}
                        <div>
                          <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>โฟลเดอร์ Launcher</p>
                          <p className="text-xs mb-2" style={{ color: colors.onSurfaceVariant }}>โฟลเดอร์ที่เก็บไฟล์ทั้งหมดของ Launcher</p>
                          <div className="flex gap-2">
                            <div
                              className="flex-1 px-4 py-2.5 rounded-xl border text-sm flex items-center gap-2 overflow-hidden"
                              style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }}
                            >
                              <i className="fa-solid fa-folder" style={{ color: colors.secondary }}></i>
                              <span className="truncate">{config.minecraftDir || "%APPDATA%/RealityLauncher"}</span>
                            </div>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(config.minecraftDir || "%APPDATA%/RealityLauncher");
                                toast.success("คัดลอก path แล้ว");
                              }}
                              className="px-4 py-2.5 rounded-xl text-sm"
                              style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                              title="คัดลอก"
                            >
                              <i className="fa-solid fa-copy"></i>
                            </button>
                            <button
                              onClick={async () => {
                                const api = window.api as any;
                                if (api?.openDirectory) {
                                  await api.openDirectory(config.minecraftDir || "");
                                } else {
                                  toast.success("เปิดโฟลเดอร์... (ฟีเจอร์นี้ต้องใช้ใน Electron)");
                                }
                              }}
                              className="px-4 py-2.5 rounded-xl text-sm"
                              style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                              title="เปิดโฟลเดอร์"
                            >
                              <i className="fa-solid fa-arrow-up-right-from-square"></i>
                            </button>
                          </div>
                        </div>

                        <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                        {/* Cache Management */}
                        <div>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm" style={{ color: colors.onSurface }}>แคช Launcher</p>
                              <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>ล้างแคชเพื่อเพิ่มพื้นที่เก็บข้อมูล</p>
                            </div>
                            <button
                              onClick={() => {
                                toast.success("ล้างแคชเรียบร้อยแล้ว");
                              }}
                              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105"
                              style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                              <i className="fa-solid fa-trash"></i>
                              ล้างแคช
                            </button>
                          </div>
                        </div>

                        <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                        {/* Max Concurrent Downloads */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-medium text-sm" style={{ color: colors.onSurface }}>ดาวน์โหลดพร้อมกันสูงสุด</p>
                              <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>จำนวนไฟล์ที่ดาวน์โหลดพร้อมกันได้</p>
                            </div>
                            <span className="text-sm font-medium px-3 py-1 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.secondary }}>
                              {config.maxConcurrentDownloads}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={10}
                            step={1}
                            value={config.maxConcurrentDownloads}
                            onChange={(e) => updateConfig({ maxConcurrentDownloads: Number(e.target.value) })}
                            className="w-full"
                            style={{ accentColor: colors.secondary }}
                          />
                          <div className="flex justify-between text-xs mt-1" style={{ color: colors.onSurfaceVariant }}>
                            <span>1</span>
                            <span>10</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ==================== JAVA INSTALLATIONS ==================== */}
                {settingsTab === "java" && (
                  <>
                    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
                      <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                        <i className="fa-brands fa-java text-lg" style={{ color: colors.secondary }}></i>
                        <h3 className="font-medium" style={{ color: colors.onSurface }}>Java Installations</h3>
                      </div>
                      <div className="p-4 space-y-4">
                        {/* Java 21 */}
                        <div>
                          <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>Java 21 (แนะนำ)</p>
                          <div className="flex gap-2 mb-2">
                            <input
                              type="text"
                              value={config.java21Path || "ไม่ได้ตั้งค่า"}
                              readOnly
                              className="flex-1 px-4 py-2.5 rounded-xl border text-sm"
                              style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }}
                            />
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <button
                              onClick={() => toast.success("ฟีเจอร์ติดตั้ง Java กำลังพัฒนา")}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                              <i className="fa-solid fa-download"></i>
                              ติดตั้ง
                            </button>
                            <button
                              onClick={() => toast.success("ค้นหา Java ในระบบ...")}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                              <i className="fa-solid fa-magnifying-glass"></i>
                              ค้นหา
                            </button>
                            <button
                              onClick={async () => {
                                const path = await window.api?.browseJava?.();
                                if (path) updateConfig({ java21Path: path });
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                              <i className="fa-solid fa-folder-open"></i>
                              เลือก
                            </button>
                            <button
                              onClick={() => toast.success("ทดสอบ Java...")}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                              <i className="fa-solid fa-play"></i>
                              ทดสอบ
                            </button>
                          </div>
                        </div>

                        <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                        {/* Java 17 */}
                        <div>
                          <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>Java 17</p>
                          <div className="flex gap-2 mb-2">
                            <input
                              type="text"
                              value={config.java17Path || "ไม่ได้ตั้งค่า"}
                              readOnly
                              className="flex-1 px-4 py-2.5 rounded-xl border text-sm"
                              style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }}
                            />
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <button
                              onClick={() => toast.success("ฟีเจอร์ติดตั้ง Java กำลังพัฒนา")}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                              <i className="fa-solid fa-download"></i>
                              ติดตั้ง
                            </button>
                            <button
                              onClick={() => toast.success("ค้นหา Java ในระบบ...")}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                              <i className="fa-solid fa-magnifying-glass"></i>
                              ค้นหา
                            </button>
                            <button
                              onClick={async () => {
                                const path = await window.api?.browseJava?.();
                                if (path) updateConfig({ java17Path: path });
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                              <i className="fa-solid fa-folder-open"></i>
                              เลือก
                            </button>
                            <button
                              onClick={() => toast.success("ทดสอบ Java...")}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                              <i className="fa-solid fa-play"></i>
                              ทดสอบ
                            </button>
                          </div>
                        </div>

                        <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                        {/* Java 8 */}
                        <div>
                          <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>Java 8 (Legacy)</p>
                          <div className="flex gap-2 mb-2">
                            <input
                              type="text"
                              value={config.java8Path || "ไม่ได้ตั้งค่า"}
                              readOnly
                              className="flex-1 px-4 py-2.5 rounded-xl border text-sm"
                              style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }}
                            />
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <button
                              onClick={() => toast.success("ฟีเจอร์ติดตั้ง Java กำลังพัฒนา")}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                              <i className="fa-solid fa-download"></i>
                              ติดตั้ง
                            </button>
                            <button
                              onClick={() => toast.success("ค้นหา Java ในระบบ...")}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                              <i className="fa-solid fa-magnifying-glass"></i>
                              ค้นหา
                            </button>
                            <button
                              onClick={async () => {
                                const path = await window.api?.browseJava?.();
                                if (path) updateConfig({ java8Path: path });
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                              <i className="fa-solid fa-folder-open"></i>
                              เลือก
                            </button>
                            <button
                              onClick={() => toast.success("ทดสอบ Java...")}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            >
                              <i className="fa-solid fa-play"></i>
                              ทดสอบ
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ==================== ACCOUNT ==================== */}
                {settingsTab === "account" && (
                  <>
                    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
                      <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                        <i className="fa-solid fa-user text-lg" style={{ color: colors.secondary }}></i>
                        <h3 className="font-medium" style={{ color: colors.onSurface }}>บัญชีผู้ใช้</h3>
                      </div>
                      <div className="p-4 space-y-3">
                        {/* Current Account */}
                        {session ? (
                          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                            <MCHead username={session.username} size={48} className="rounded-xl" />
                            <div className="flex-1">
                              <div className="font-medium" style={{ color: colors.onSurface }}>{session.username}</div>
                              <div className="text-xs flex items-center gap-2" style={{ color: colors.onSurfaceVariant }}>
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                {session.type === "microsoft" ? "Microsoft Account" : "Offline Mode"}
                              </div>
                            </div>
                            <button
                              onClick={handleLogout}
                              className="px-3 py-1.5 rounded-lg text-sm transition-all hover:scale-105"
                              style={{ backgroundColor: "#ef444420", color: "#ef4444" }}
                            >
                              ออกจากระบบ
                            </button>
                          </div>
                        ) : (
                          <div className="p-4 rounded-xl text-center" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                            <Icons.Person className="w-10 h-10 mx-auto mb-2" style={{ color: colors.onSurfaceVariant }} />
                            <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>ยังไม่ได้เข้าสู่ระบบ</p>
                          </div>
                        )}

                        {/* Other Accounts */}
                        {accounts.length > 1 && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium" style={{ color: colors.onSurfaceVariant }}>บัญชีอื่นๆ</p>
                            {accounts.filter(acc => acc.username !== session?.username).map((account, index) => (
                              <div
                                key={`${account.type}-${account.username}-${index}`}
                                className="flex items-center gap-3 p-2 rounded-xl transition-all hover:bg-opacity-80"
                                style={{ backgroundColor: colors.surfaceContainerHigh }}
                              >
                                <MCHead username={account.username} size={32} className="rounded-lg" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate" style={{ color: colors.onSurface }}>{account.username}</div>
                                  <div className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                    {account.type === "microsoft" ? "Microsoft" : "Offline"}
                                  </div>
                                </div>
                                <button
                                  onClick={() => selectAccount(account)}
                                  className="px-2 py-1 rounded-lg text-xs font-medium"
                                  style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                >
                                  เปลี่ยน
                                </button>
                                <button
                                  onClick={() => removeAccount(account)}
                                  className="px-2 py-1 rounded-lg text-xs"
                                  style={{ backgroundColor: "#ef444420", color: "#ef4444" }}
                                >
                                  ลบ
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add Account Button */}
                        <button
                          onClick={() => setLoginDialogOpen(true)}
                          className="w-full py-3 rounded-xl border-2 border-dashed transition-all hover:bg-opacity-10 flex items-center justify-center gap-2 text-sm font-medium"
                          style={{ borderColor: colors.outline, color: colors.onSurfaceVariant }}
                        >
                          <i className="fa-solid fa-plus"></i>
                          เพิ่มบัญชีใหม่
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* About Tab */}
          {activeTab === "about" && (
            <div className="max-w-4xl mx-auto space-y-8 pb-8">
              {/* Hero Section with Gradient Background */}
              <div
                className="relative rounded-3xl overflow-hidden p-8"
                style={{
                  background: `linear-gradient(135deg, ${colors.secondary}40 0%, ${colors.secondary}10 50%, ${colors.surfaceContainer} 100%)`,
                }}
              >
                {/* Decorative Elements */}
                <div
                  className="absolute top-4 right-4 w-32 h-32 rounded-full opacity-20 blur-3xl"
                  style={{ backgroundColor: colors.secondary }}
                />
                <div
                  className="absolute bottom-4 left-4 w-24 h-24 rounded-full opacity-15 blur-2xl"
                  style={{ backgroundColor: colors.secondary }}
                />

                <div className="relative text-center">
                  {/* Logo with Glow Effect */}
                  <div className="relative inline-block mb-6">
                    <div
                      className="absolute inset-0 rounded-3xl blur-xl opacity-50"
                      style={{ backgroundColor: colors.secondary }}
                    />
                    <div className="relative w-28 h-28 rounded-3xl mx-auto overflow-hidden shadow-2xl ring-4 ring-white/20">
                      <img src="r_background.svg" alt="Reality" className="w-full h-full object-cover" />
                    </div>
                  </div>

                  <h2
                    className="text-4xl font-bold mb-2"
                    style={{
                      fontFamily: "'Jaturat', 'Itim', sans-serif",
                      color: colors.onSurface,
                      textShadow: `0 2px 20px ${colors.secondary}50`
                    }}
                  >
                    Reality
                  </h2>
                  <p className="text-xl mb-4" style={{ color: colors.onSurfaceVariant }}>
                    Minecraft Launcher
                  </p>

                  {/* Version Badge */}
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full"
                    style={{
                      backgroundColor: colors.surfaceContainerHighest,
                      boxShadow: `0 4px 20px ${colors.secondary}20`
                    }}>
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#22c55e" }} />
                    <span className="text-sm font-medium" style={{ color: colors.onSurface }}>Version 0.1.0</span>
                  </div>
                </div>
              </div>

              {/* Mission Card with Glassmorphism */}
              <div
                className="relative p-8 rounded-3xl overflow-hidden"
                style={{
                  backgroundColor: `${colors.surfaceContainer}ee`,
                  backdropFilter: "blur(20px)",
                  boxShadow: `0 8px 32px ${colors.secondary}15`
                }}
              >
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div
                    className="w-20 h-20 rounded-2xl flex items-center justify-center shrink-0"
                    style={{
                      background: `linear-gradient(135deg, #ef4444 0%, #f97316 100%)`,
                      boxShadow: "0 8px 24px rgba(239, 68, 68, 0.3)"
                    }}
                  >
                    <Icons.Heart className="w-10 h-10" style={{ color: "#ffffff" }} />
                  </div>
                  <div className="text-center md:text-left">
                    <h3 className="text-2xl font-bold mb-3" style={{ color: colors.onSurface }}>
                      จุดประสงค์ของเรา
                    </h3>
                    <p className="text-base leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
                      Reality Launcher ถูกสร้างขึ้นเพื่อให้การเข้าถึง Server ต่างๆ ได้ง่ายขึ้น
                      และขยายโอกาสใหม่ๆ ให้คนรุ่นใหม่ และ Server เล็กๆ ได้มีโอกาสมากขึ้น
                      เราเชื่อว่าทุกคนควรมีโอกาสที่เท่าเทียมกันในการสนุกกับ Minecraft
                    </p>
                  </div>
                </div>
              </div>

              {/* Team Section */}
              <div
                className="p-8 rounded-3xl"
                style={{
                  backgroundColor: colors.surfaceContainer,
                  boxShadow: `0 4px 24px ${colors.secondary}10`
                }}
              >
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold mb-2" style={{ color: colors.onSurface }}>
                    ทีมพัฒนา
                  </h3>
                  <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                    คนเบื้องหลังที่ทำให้ Reality เกิดขึ้น
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {credits.map((person, index) => (
                    <div
                      key={person.name}
                      className="group relative p-6 rounded-2xl text-center transition-all duration-300 hover:scale-105"
                      style={{
                        backgroundColor: colors.surface,
                        boxShadow: `0 4px 20px ${colors.secondary}10`
                      }}
                    >
                      {/* Hover Glow Effect */}
                      <div
                        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          boxShadow: `0 0 30px ${colors.secondary}30`,
                        }}
                      />

                      {/* Avatar with Ring */}
                      <div className="relative inline-block mb-4">
                        <div
                          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-50 transition-opacity duration-300 blur-lg"
                          style={{ backgroundColor: colors.secondary }}
                        />
                        <div
                          className="relative ring-4 rounded-2xl overflow-hidden"
                          style={{
                            ["--tw-ring-color" as string]: `${colors.secondary}40`,
                          }}
                        >
                          <MCHead username={person.name} size={100} className="rounded-2xl" />
                        </div>
                      </div>

                      <h4 className="text-lg font-bold mt-2" style={{ color: colors.onSurface }}>
                        {person.name}
                      </h4>
                      <p
                        className="text-sm font-medium mt-1"
                        style={{ color: colors.secondary }}
                      >
                        {person.role}
                      </p>
                      <p className="text-xs mt-2 opacity-80" style={{ color: colors.onSurfaceVariant }}>
                        {person.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>



              {/* Footer */}
              <div className="text-center py-6">
                <div className="inline-flex items-center gap-3 mb-4">
                  <img src="/r.svg" alt="Reality" className="w-8 h-8 opacity-50" />
                  <div
                    className="h-px w-12"
                    style={{ backgroundColor: colors.outline }}
                  />
                  <span className="text-sm" style={{ color: colors.onSurfaceVariant }}>Made with ❤️ in Thailand</span>
                  <div
                    className="h-px w-12"
                    style={{ backgroundColor: colors.outline }}
                  />
                  <img src="/r.svg" alt="Reality" className="w-8 h-8 opacity-50" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium" style={{ color: colors.onSurfaceVariant }}>
                    Cat Lab_ Design × Q Team Studio
                  </p>
                  <p className="text-xs" style={{ color: colors.outline }}>
                    © 2024 Reality Launcher. All rights reserved.
                  </p>
                </div>
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


