import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { COLOR_THEMES } from "../../lib/constants";
import type { AuthSession, ColorTheme, LauncherConfig } from "../../types/launcher";
import { Icons } from "../ui/Icons";
import { MCHead } from "../ui/MCHead";

interface SettingsProps {
    config: LauncherConfig;
    updateConfig: (newConfig: Partial<LauncherConfig>) => void;
    colors: any;
    setSettingsTab: (tab: "account" | "appearance" | "game" | "connections" | "launcher" | "resources" | "java" | "update") => void;
    settingsTab: "account" | "appearance" | "game" | "connections" | "launcher" | "resources" | "java" | "update";
    handleBrowseJava: () => void;
    handleBrowseMinecraftDir: () => void;
    session: AuthSession | null;
    accounts: AuthSession[];
    handleLogout: () => void;
    selectAccount: (account: AuthSession) => void;
    removeAccount: (account: AuthSession) => void;
    setLoginDialogOpen: (open: boolean) => void;
}

export function Settings({
    config,
    updateConfig,
    colors,
    setSettingsTab,
    settingsTab,
    handleBrowseJava,
    handleBrowseMinecraftDir,
    session,
    accounts,
    handleLogout,
    selectAccount,
    removeAccount,
    setLoginDialogOpen,
}: SettingsProps) {
    const [customColorPending, setCustomColorPending] = useState<string | null>(null);
    const [detectedJavas, setDetectedJavas] = useState<{
        path: string;
        version: string;
        majorVersion: number;
        vendor?: string;
        isValid: boolean;
    }[]>([]);
    const [isDetectingJava, setIsDetectingJava] = useState(false);
    const [testingJavaPath, setTestingJavaPath] = useState<string | null>(null);
    const [installingJava, setInstallingJava] = useState<number | null>(null);
    const [maxRamMB, setMaxRamMB] = useState(8192);
    const [systemRamMB, setSystemRamMB] = useState(0);
    const [appVersion, setAppVersion] = useState<string>("0.0.0");
    const [isDevMode, setIsDevMode] = useState<boolean>(false);
    type UpdateStatusType = "idle" | "checking" | "available" | "downloading" | "ready";
    const [updateStatus, setUpdateStatus] = useState<UpdateStatusType>("idle");
    const [updateInfo, setUpdateInfo] = useState<{ version: string; releaseDate: string } | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<number>(0);

    // Load system RAM and app info on mount
    useEffect(() => {
        (async () => {
            const maxRam = await (window as any).api?.getMaxRam?.();
            const systemRam = await (window as any).api?.getSystemRam?.();
            const version = await (window as any).api?.getAppVersion?.();
            const devMode = await (window as any).api?.isDevMode?.();
            if (maxRam) setMaxRamMB(maxRam);
            if (systemRam) setSystemRamMB(systemRam);
            if (version) setAppVersion(version);
            if (devMode !== undefined) setIsDevMode(devMode);
        })();

        // Listen for update events
        const windowApi = (window as any).api;
        const cleanups: (() => void)[] = [];

        if (windowApi?.onUpdateAvailable) {
            cleanups.push(windowApi.onUpdateAvailable((data: { version: string; releaseDate: string }) => {
                setUpdateInfo(data);
                setUpdateStatus("available");
            }));
        }
        if (windowApi?.onUpdateProgress) {
            cleanups.push(windowApi.onUpdateProgress((data: { percent: number }) => {
                setDownloadProgress(data.percent);
                setUpdateStatus("downloading");
            }));
        }
        if (windowApi?.onUpdateDownloaded) {
            cleanups.push(windowApi.onUpdateDownloaded((data: { version: string; releaseDate: string }) => {
                setUpdateInfo(data);
                setUpdateStatus("ready");
            }));
        }
        if (windowApi?.onUpdateNotAvailable) {
            cleanups.push(windowApi.onUpdateNotAvailable(() => {
                setUpdateStatus("idle");
            }));
        }

        return () => cleanups.forEach(fn => fn());
    }, []);

    const handleAutoDetectJava = async () => {
        setIsDetectingJava(true);
        try {
            const javaPath = await (window as any).api?.autoDetectJava?.();
            if (javaPath) {
                updateConfig({ javaPath });
                toast.success(`พบ Java: ${javaPath}`);
            } else {
                toast.error("ไม่พบ Java ในระบบ กรุณาติดตั้ง Java 17 ขึ้นไป");
            }
        } catch {
            toast.error("ค้นหา Java ไม่สำเร็จ");
        } finally {
            setIsDetectingJava(false);
        }
    };

    // Window API reference for backwards compatibility with existing code
    const windowApi = (window as any).api;

    return (
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
                        { id: "update", icon: "fa-download", label: "อัปเดต" },
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
                                            <div className="font-medium flex items-center gap-1" style={{ color: colors.onSurface }}>
                                                {session.username}
                                                {session.isAdmin ? (
                                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full" style={{ backgroundColor: "#fbbf24" }}>
                                                        <Icons.Check className="w-3 h-3 text-gray-900" />
                                                    </span>
                                                ) : session.type === "catid" ? (
                                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full" style={{ backgroundColor: "#3b82f6" }}>
                                                        <Icons.Check className="w-3 h-3 text-white" />
                                                    </span>
                                                ) : session.type === "microsoft" ? (
                                                    <img src="./microsoft_icon.svg" alt="Microsoft" className="w-4 h-4" />
                                                ) : null}
                                            </div>
                                            <div className="text-xs flex items-center gap-2" style={{ color: colors.onSurfaceVariant }}>
                                                {session.type === "microsoft" ? "Microsoft Account" : session.type === "catid" ? "CatID Account" : "Offline Mode"}
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

                                {/* Account Lists */}
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {accounts.map((acc, index) => {
                                        const account = acc as AuthSession;
                                        return (
                                            <div
                                                key={index}
                                                onClick={() => selectAccount(acc)}
                                                className="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors"
                                                style={{
                                                    backgroundColor: account.uuid === session?.uuid ? colors.secondary + "20" : "transparent",
                                                    border: account.uuid === session?.uuid ? `1px solid ${colors.secondary}` : `1px solid ${colors.outline}20`
                                                }}
                                            >
                                                <MCHead username={account.username} size={32} className="rounded-lg" />
                                                <div className="flex-1">
                                                    <div className="text-sm font-medium flex items-center gap-1" style={{ color: colors.onSurface }}>
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
                                                            <img src="./microsoft_icon.svg" alt="Microsoft" className="w-4 h-4" />
                                                        ) : null}
                                                    </div>
                                                    <div className="text-xs flex items-center gap-1" style={{ color: colors.onSurfaceVariant }}>
                                                        {account.type}
                                                    </div>
                                                </div>
                                                {account.uuid !== session?.uuid && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            removeAccount(account);
                                                        }}
                                                        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-red-500 hover:text-white"
                                                        style={{ color: colors.onSurfaceVariant }}
                                                    >
                                                        <i className="fa-solid fa-trash text-xs"></i>
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <button
                                    onClick={() => setLoginDialogOpen(true)}
                                    className="w-full py-2.5 rounded-xl text-sm font-medium border border-dashed transition-all hover:bg-opacity-10"
                                    style={{
                                        borderColor: colors.secondary,
                                        color: colors.secondary,
                                    }}
                                >
                                    <i className="fa-solid fa-plus mr-2"></i>
                                    เพิ่มบัญชีใหม่
                                </button>
                            </div>
                        </div>
                    </>
                )}

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
                                        <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>เลือกโหมดสว่าง มืด หรือตามเวลา</p>
                                    </div>
                                    <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                        <button
                                            onClick={() => updateConfig({ theme: "light" })}
                                            className="px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1"
                                            style={{
                                                backgroundColor: config.theme === "light" ? colors.secondary : "transparent",
                                                color: config.theme === "light" ? "#1a1a1a" : colors.onSurfaceVariant,
                                            }}
                                            title="สว่าง"
                                        >
                                            <i className="fa-solid fa-sun"></i>
                                        </button>
                                        <button
                                            onClick={() => updateConfig({ theme: "dark" })}
                                            className="px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1"
                                            style={{
                                                backgroundColor: config.theme === "dark" ? colors.secondary : "transparent",
                                                color: config.theme === "dark" ? "#1a1a1a" : colors.onSurfaceVariant,
                                            }}
                                            title="มืด"
                                        >
                                            <i className="fa-solid fa-moon"></i>
                                        </button>
                                        <button
                                            onClick={() => updateConfig({ theme: "oled" })}
                                            className="px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1"
                                            style={{
                                                backgroundColor: config.theme === "oled" ? colors.secondary : "transparent",
                                                color: config.theme === "oled" ? "#1a1a1a" : colors.onSurfaceVariant,
                                            }}
                                            title="OLED (ดำสนิท)"
                                        >
                                            <i className="fa-solid fa-circle"></i>
                                        </button>
                                        <button
                                            onClick={() => updateConfig({ theme: "auto" })}
                                            className="px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1"
                                            style={{
                                                backgroundColor: config.theme === "auto" ? colors.secondary : "transparent",
                                                color: config.theme === "auto" ? "#1a1a1a" : colors.onSurfaceVariant,
                                            }}
                                            title="ตามเวลา"
                                        >
                                            <i className="fa-solid fa-clock"></i>
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
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="font-medium text-sm" style={{ color: colors.onSurface }}>Memory allocated</p>
                                        <input
                                            type="number"
                                            value={config.ramMB}
                                            onChange={(e) => updateConfig({ ramMB: Math.min(Math.max(512, Number(e.target.value)), maxRamMB) })}
                                            className="w-20 px-2 py-1 rounded-lg text-sm text-right"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface, border: 'none' }}
                                        />
                                    </div>
                                    <p className="text-xs mb-3" style={{ color: colors.onSurfaceVariant }}>
                                        หน่วยความจำที่จะใช้เมื่อเปิดเกม (ระบบมี {(systemRamMB / 1024).toFixed(0)} GB)
                                    </p>
                                    <input
                                        type="range"
                                        min={512}
                                        max={maxRamMB}
                                        step={256}
                                        value={config.ramMB}
                                        onChange={(e) => updateConfig({ ramMB: Number(e.target.value) })}
                                        className="w-full"
                                        style={{ accentColor: colors.secondary }}
                                    />
                                    <div className="flex justify-between text-xs mt-1" style={{ color: colors.onSurfaceVariant }}>
                                        <span>512 MB</span>
                                        <span>{maxRamMB} MB</span>
                                    </div>
                                </div>

                                <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                                {/* Java Path */}
                                <div>
                                    <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>Java Installation</p>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={config.javaPath || "อัตโนมัติ (ค้นหา Java ในระบบ)"}
                                            readOnly
                                            className="flex-1 px-4 py-2.5 rounded-xl border text-sm"
                                            style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }}
                                        />
                                        <button
                                            onClick={handleAutoDetectJava}
                                            disabled={isDetectingJava}
                                            className="px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            {isDetectingJava ? "กำลังค้นหา..." : "อัตโนมัติ"}
                                        </button>
                                        <button
                                            onClick={handleBrowseJava}
                                            className="px-4 py-2.5 rounded-xl text-sm font-medium"
                                            style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                        >
                                            เลือก
                                        </button>
                                    </div>
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
                                            windowApi?.discordRPCSetEnabled?.(newValue);
                                            if (newValue) {
                                                windowApi?.discordRPCUpdate?.("idle");
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
                                            if (!windowApi) {
                                                toast.error("ฟีเจอร์นี้ต้องใช้ใน Electron App");
                                                return;
                                            }
                                            // Toggle window maximize first
                                            await windowApi.windowMaximize();
                                            // Then sync config with actual state
                                            const isMaximized = await windowApi.windowIsMaximized();
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

                {/* ==================== UPDATE ==================== */}
                {settingsTab === "update" && (
                    <>
                        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
                            <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                                <i className="fa-solid fa-download text-lg" style={{ color: colors.secondary }}></i>
                                <h3 className="font-medium" style={{ color: colors.onSurface }}>อัปเดต Launcher</h3>
                            </div>
                            <div className="p-4 space-y-4">
                                {/* Version Info */}
                                <div className="p-4 rounded-xl" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center" style={{ backgroundColor: colors.secondary }}>
                                            <img src="./r.svg" alt="Reality" className="w-10 h-10 object-contain" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-bold text-lg" style={{ color: colors.onSurface }}>Reality Launcher</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-sm font-medium" style={{ color: colors.onSurfaceVariant }}>
                                                    v{appVersion}
                                                </span>
                                                <span
                                                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                                                    style={{
                                                        backgroundColor: isDevMode ? "#f97316" : "#22c55e",
                                                        color: "#fff"
                                                    }}
                                                >
                                                    {isDevMode ? "Pre-release (Dev)" : "Release"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                                {/* Dev Mode Warning */}
                                {isDevMode && (
                                    <div className="p-4 rounded-xl border border-orange-500/20 bg-orange-500/10 mb-4 flex items-center gap-3">
                                        <i className="fa-solid fa-flask text-orange-500 text-lg"></i>
                                        <span className="text-sm text-orange-700 dark:text-orange-300 font-medium">คุณกำลังใช้งานโหมด Development (bun run dev) - ระบบอัปเดตอัตโนมัติถูกปิดใช้งาน</span>
                                    </div>
                                )}

                                {/* Update Status */}
                                {updateStatus === "available" && updateInfo && (
                                    <div className="p-4 rounded-xl border-2" style={{ borderColor: colors.secondary, backgroundColor: colors.secondary + "15" }}>
                                        <div className="flex items-center gap-3 mb-3">
                                            <i className="fa-solid fa-gift text-xl" style={{ color: colors.secondary }}></i>
                                            <div>
                                                <p className="font-medium" style={{ color: colors.onSurface }}>มีอัปเดตใหม่!</p>
                                                <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                                                    เวอร์ชัน {updateInfo.version} พร้อมให้ดาวน์โหลด
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    await windowApi?.downloadUpdate?.();
                                                    toast.success("กำลังดาวน์โหลดอัปเดต...");
                                                } catch (error) {
                                                    toast.error("ไม่สามารถดาวน์โหลดอัปเดตได้");
                                                }
                                            }}
                                            className="w-full py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
                                            style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                        >
                                            <i className="fa-solid fa-download mr-2"></i>
                                            ดาวน์โหลดอัปเดต
                                        </button>
                                    </div>
                                )}

                                {updateStatus === "downloading" && (
                                    <div className="p-4 rounded-xl" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                                        <div className="flex items-center gap-3 mb-3">
                                            <i className="fa-solid fa-spinner fa-spin text-xl" style={{ color: colors.secondary }}></i>
                                            <div>
                                                <p className="font-medium" style={{ color: colors.onSurface }}>กำลังดาวน์โหลด...</p>
                                                <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                                                    {downloadProgress.toFixed(1)}%
                                                </p>
                                            </div>
                                        </div>
                                        <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                            <div
                                                className="h-full transition-all"
                                                style={{ width: `${downloadProgress}%`, backgroundColor: colors.secondary }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {updateStatus === "ready" && updateInfo && (
                                    <div className="p-4 rounded-xl border-2" style={{ borderColor: "#22c55e", backgroundColor: "#22c55e15" }}>
                                        <div className="flex items-center gap-3 mb-3">
                                            <i className="fa-solid fa-check-circle text-xl" style={{ color: "#22c55e" }}></i>
                                            <div>
                                                <p className="font-medium" style={{ color: colors.onSurface }}>พร้อมติดตั้ง!</p>
                                                <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                                                    เวอร์ชัน {updateInfo.version} ดาวน์โหลดเสร็จแล้ว
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    await windowApi?.installUpdate?.();
                                                } catch (error) {
                                                    toast.error("ไม่สามารถติดตั้งอัปเดตได้");
                                                }
                                            }}
                                            className="w-full py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
                                            style={{ backgroundColor: "#22c55e", color: "#fff" }}
                                        >
                                            <i className="fa-solid fa-arrow-up-right-from-square mr-2"></i>
                                            ติดตั้งและรีสตาร์ท
                                        </button>
                                    </div>
                                )}

                                {/* Auto Update Toggle */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <i className="fa-solid fa-clock-rotate-left w-6" style={{ color: colors.onSurface }}></i>
                                        <div>
                                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>อัปเดตอัตโนมัติ</p>
                                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                                ตรวจสอบและดาวน์โหลดอัปเดตใหม่อัตโนมัติ
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const newValue = !config.autoUpdateEnabled;
                                            updateConfig({ autoUpdateEnabled: newValue });
                                            toast.success(newValue ? "เปิดอัปเดตอัตโนมัติ" : "ปิดอัปเดตอัตโนมัติ");
                                        }}
                                        className="relative w-12 h-6 rounded-full transition-colors"
                                        style={{ backgroundColor: config.autoUpdateEnabled ? colors.secondary : colors.surfaceContainerHighest }}
                                    >
                                        <div
                                            className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow"
                                            style={{ left: config.autoUpdateEnabled ? "calc(100% - 20px)" : "4px" }}
                                        />
                                    </button>
                                </div>

                                <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                                {/* Manual Check for Updates Button */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium text-sm" style={{ color: colors.onSurface }}>ตรวจสอบอัปเดต</p>
                                        <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>ตรวจสอบเวอร์ชันใหม่ด้วยตนเอง</p>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            if (updateStatus === "checking") return;

                                            // Dev mode check
                                            if (isDevMode) {
                                                toast("ไม่สามารถตรวจสอบอัปเดตในโหมด Dev ได้ (ปิดใช้งาน)", { icon: "⚠️" });
                                                return;
                                            }

                                            setUpdateStatus("checking");
                                            toast.loading("กำลังตรวจสอบอัปเดต...", { id: "check-update" });
                                            try {
                                                const result = await windowApi?.checkForUpdates?.();
                                                setTimeout(() => {
                                                    if ((updateStatus as string) === "checking") {
                                                        setUpdateStatus("idle");
                                                        toast.success("คุณใช้เวอร์ชันล่าสุดแล้ว", { id: "check-update" });
                                                    } else {
                                                        toast.dismiss("check-update");
                                                    }
                                                }, 3000);
                                            } catch (error) {
                                                setUpdateStatus("idle");
                                                toast.error("ตรวจสอบอัปเดตไม่สำเร็จ", { id: "check-update" });
                                            }
                                        }}
                                        disabled={updateStatus === "checking" || isDevMode}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                    >
                                        <i className={`fa-solid ${updateStatus === "checking" ? "fa-spinner fa-spin" : "fa-sync"}`}></i>
                                        {updateStatus === "checking" ? "กำลังตรวจสอบ..." : "ตรวจสอบ"}
                                    </button>
                                </div>

                                {isDevMode && (
                                    <div className="p-3 rounded-xl flex items-center gap-3" style={{ backgroundColor: "#f9731620" }}>
                                        <i className="fa-solid fa-flask" style={{ color: "#f97316" }}></i>
                                        <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                            คุณกำลังใช้งานโหมด Development (bun run dev) - ระบบอัปเดตอัตโนมัติถูกปิดใช้งาน
                                        </p>
                                    </div>
                                )}
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
                                                if (windowApi?.openFolder) {
                                                    await windowApi.openFolder(config.minecraftDir || "");
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
                            <div className="p-4 space-y-6">
                                {/* Java 25 */}
                                <div>
                                    <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>Java 25 location</p>
                                    <input
                                        type="text"
                                        value={config.javaPaths?.java25 || "/path/to/java"}
                                        readOnly
                                        className="w-full px-4 py-2.5 rounded-xl border text-sm mb-2"
                                        style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurfaceVariant }}
                                    />
                                    <div className="flex gap-2 flex-wrap">
                                        <button
                                            onClick={async () => {
                                                setInstallingJava(25);
                                                try {
                                                    const result = await windowApi?.installJava?.(25);
                                                    if (result?.ok && result.path) {
                                                        updateConfig({ javaPaths: { ...config.javaPaths, java25: result.path } });
                                                        toast.success(`ติดตั้ง Java 25 สำเร็จ`);
                                                    } else {
                                                        toast.error(result?.error || "ติดตั้ง Java ล้มเหลว");
                                                    }
                                                } catch { toast.error("ติดตั้ง Java ล้มเหลว"); }
                                                finally { setInstallingJava(null); }
                                            }}
                                            disabled={installingJava === 25}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                        >
                                            <i className={`fa-solid ${installingJava === 25 ? "fa-spinner fa-spin" : "fa-download"}`}></i>
                                            {installingJava === 25 ? "กำลังติดตั้ง..." : "Install"}
                                        </button>
                                        <button
                                            onClick={async () => {
                                                setIsDetectingJava(true);
                                                try {
                                                    const javas = await windowApi?.detectJavaInstallations?.();
                                                    const java25 = javas?.find((j: any) => j.majorVersion >= 25);
                                                    if (java25) {
                                                        updateConfig({ javaPaths: { ...config.javaPaths, java25: java25.path } });
                                                        toast.success(`พบ Java 25: ${java25.path}`);
                                                    } else {
                                                        toast.error("ไม่พบ Java 25 ในระบบ");
                                                    }
                                                } catch { toast.error("ค้นหา Java ล้มเหลว"); }
                                                finally { setIsDetectingJava(false); }
                                            }}
                                            disabled={isDetectingJava}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <i className="fa-solid fa-magnifying-glass"></i>
                                            Detect
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const path = await windowApi?.browseJava?.();
                                                if (path) {
                                                    updateConfig({ javaPaths: { ...config.javaPaths, java25: path } });
                                                    toast.success("ตั้งค่า Java 25 เรียบร้อย");
                                                }
                                            }}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <i className="fa-solid fa-folder-open"></i>
                                            Browse
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const path = config.javaPaths?.java25;
                                                if (!path || path === "/path/to/java") {
                                                    toast.error("ยังไม่ได้ตั้งค่า Java 25");
                                                    return;
                                                }
                                                setTestingJavaPath(path);
                                                try {
                                                    const result = await windowApi?.testJavaExecution?.(path);
                                                    if (result?.ok) {
                                                        toast.success(`Java ทำงานได้ปกติ${result.version ? ` (v${result.version})` : ""}`);
                                                    } else {
                                                        toast.error(result?.error || "Java ไม่สามารถใช้งานได้");
                                                    }
                                                } catch { toast.error("ทดสอบ Java ล้มเหลว"); }
                                                finally { setTestingJavaPath(null); }
                                            }}
                                            disabled={testingJavaPath === config.javaPaths?.java25}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <i className={`fa-solid ${testingJavaPath === config.javaPaths?.java25 ? "fa-spinner fa-spin" : "fa-play"}`}></i>
                                            Test
                                        </button>
                                        {config.javaPaths?.java25 && config.javaPaths.java25 !== "/path/to/java" && (
                                            <button
                                                onClick={() => {
                                                    updateConfig({ javaPaths: { ...config.javaPaths, java25: undefined } });
                                                    toast.success("ลบ Java 25 เรียบร้อย");
                                                }}
                                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                                style={{ backgroundColor: "#ef444420", color: "#ef4444" }}
                                            >
                                                <i className="fa-solid fa-trash"></i>
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Java 21 */}
                                <div>
                                    <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>Java 21 location</p>
                                    <input
                                        type="text"
                                        value={config.javaPaths?.java21 || "/path/to/java"}
                                        readOnly
                                        className="w-full px-4 py-2.5 rounded-xl border text-sm mb-2"
                                        style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: config.javaPaths?.java21 ? colors.onSurface : colors.onSurfaceVariant }}
                                    />
                                    <div className="flex gap-2 flex-wrap">
                                        <button
                                            onClick={async () => {
                                                setInstallingJava(21);
                                                try {
                                                    const result = await windowApi?.installJava?.(21);
                                                    if (result?.ok && result.path) {
                                                        updateConfig({ javaPaths: { ...config.javaPaths, java21: result.path } });
                                                        toast.success(`ติดตั้ง Java 21 สำเร็จ`);
                                                    } else {
                                                        toast.error(result?.error || "ติดตั้ง Java ล้มเหลว");
                                                    }
                                                } catch { toast.error("ติดตั้ง Java ล้มเหลว"); }
                                                finally { setInstallingJava(null); }
                                            }}
                                            disabled={installingJava === 21}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                        >
                                            <i className={`fa-solid ${installingJava === 21 ? "fa-spinner fa-spin" : "fa-download"}`}></i>
                                            {installingJava === 21 ? "กำลังติดตั้ง..." : "Install"}
                                        </button>
                                        <button
                                            onClick={async () => {
                                                setIsDetectingJava(true);
                                                try {
                                                    const javas = await windowApi?.detectJavaInstallations?.();
                                                    const java21 = javas?.find((j: any) => j.majorVersion >= 21 && j.majorVersion < 25);
                                                    if (java21) {
                                                        updateConfig({ javaPaths: { ...config.javaPaths, java21: java21.path } });
                                                        toast.success(`พบ Java 21: ${java21.path}`);
                                                    } else {
                                                        toast.error("ไม่พบ Java 21 ในระบบ");
                                                    }
                                                } catch { toast.error("ค้นหา Java ล้มเหลว"); }
                                                finally { setIsDetectingJava(false); }
                                            }}
                                            disabled={isDetectingJava}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <i className="fa-solid fa-magnifying-glass"></i>
                                            Detect
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const path = await windowApi?.browseJava?.();
                                                if (path) {
                                                    updateConfig({ javaPaths: { ...config.javaPaths, java21: path } });
                                                    toast.success("ตั้งค่า Java 21 เรียบร้อย");
                                                }
                                            }}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <i className="fa-solid fa-folder-open"></i>
                                            Browse
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const path = config.javaPaths?.java21;
                                                if (!path || path === "/path/to/java") {
                                                    toast.error("ยังไม่ได้ตั้งค่า Java 21");
                                                    return;
                                                }
                                                setTestingJavaPath(path);
                                                try {
                                                    const result = await windowApi?.testJavaExecution?.(path);
                                                    if (result?.ok) {
                                                        toast.success(`Java ทำงานได้ปกติ${result.version ? ` (v${result.version})` : ""}`);
                                                    } else {
                                                        toast.error(result?.error || "Java ไม่สามารถใช้งานได้");
                                                    }
                                                } catch { toast.error("ทดสอบ Java ล้มเหลว"); }
                                                finally { setTestingJavaPath(null); }
                                            }}
                                            disabled={testingJavaPath === config.javaPaths?.java21}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <i className={`fa-solid ${testingJavaPath === config.javaPaths?.java21 ? "fa-spinner fa-spin" : "fa-play"}`}></i>
                                            Test
                                        </button>
                                        {config.javaPaths?.java21 && config.javaPaths.java21 !== "/path/to/java" && (
                                            <button
                                                onClick={() => {
                                                    updateConfig({ javaPaths: { ...config.javaPaths, java21: undefined } });
                                                    toast.success("ลบ Java 21 เรียบร้อย");
                                                }}
                                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                                style={{ backgroundColor: "#ef444420", color: "#ef4444" }}
                                            >
                                                <i className="fa-solid fa-trash"></i>
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Java 17 */}
                                <div>
                                    <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>Java 17 location</p>
                                    <input
                                        type="text"
                                        value={config.javaPaths?.java17 || "/path/to/java"}
                                        readOnly
                                        className="w-full px-4 py-2.5 rounded-xl border text-sm mb-2"
                                        style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: config.javaPaths?.java17 ? colors.onSurface : colors.onSurfaceVariant }}
                                    />
                                    <div className="flex gap-2 flex-wrap">
                                        <button
                                            onClick={async () => {
                                                setInstallingJava(17);
                                                try {
                                                    const result = await windowApi?.installJava?.(17);
                                                    if (result?.ok && result.path) {
                                                        updateConfig({ javaPaths: { ...config.javaPaths, java17: result.path } });
                                                        toast.success(`ติดตั้ง Java 17 สำเร็จ`);
                                                    } else {
                                                        toast.error(result?.error || "ติดตั้ง Java ล้มเหลว");
                                                    }
                                                } catch { toast.error("ติดตั้ง Java ล้มเหลว"); }
                                                finally { setInstallingJava(null); }
                                            }}
                                            disabled={installingJava === 17}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                        >
                                            <i className={`fa-solid ${installingJava === 17 ? "fa-spinner fa-spin" : "fa-download"}`}></i>
                                            {installingJava === 17 ? "กำลังติดตั้ง..." : "Install"}
                                        </button>
                                        <button
                                            onClick={async () => {
                                                setIsDetectingJava(true);
                                                try {
                                                    const javas = await windowApi?.detectJavaInstallations?.();
                                                    const java17 = javas?.find((j: any) => j.majorVersion >= 17 && j.majorVersion < 21);
                                                    if (java17) {
                                                        updateConfig({ javaPaths: { ...config.javaPaths, java17: java17.path } });
                                                        toast.success(`พบ Java 17: ${java17.path}`);
                                                    } else {
                                                        toast.error("ไม่พบ Java 17 ในระบบ");
                                                    }
                                                } catch { toast.error("ค้นหา Java ล้มเหลว"); }
                                                finally { setIsDetectingJava(false); }
                                            }}
                                            disabled={isDetectingJava}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <i className="fa-solid fa-magnifying-glass"></i>
                                            Detect
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const path = await windowApi?.browseJava?.();
                                                if (path) {
                                                    updateConfig({ javaPaths: { ...config.javaPaths, java17: path } });
                                                    toast.success("ตั้งค่า Java 17 เรียบร้อย");
                                                }
                                            }}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <i className="fa-solid fa-folder-open"></i>
                                            Browse
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const path = config.javaPaths?.java17;
                                                if (!path || path === "/path/to/java") {
                                                    toast.error("ยังไม่ได้ตั้งค่า Java 17");
                                                    return;
                                                }
                                                setTestingJavaPath(path);
                                                try {
                                                    const result = await windowApi?.testJavaExecution?.(path);
                                                    if (result?.ok) {
                                                        toast.success(`Java ทำงานได้ปกติ${result.version ? ` (v${result.version})` : ""}`);
                                                    } else {
                                                        toast.error(result?.error || "Java ไม่สามารถใช้งานได้");
                                                    }
                                                } catch { toast.error("ทดสอบ Java ล้มเหลว"); }
                                                finally { setTestingJavaPath(null); }
                                            }}
                                            disabled={testingJavaPath === config.javaPaths?.java17}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <i className={`fa-solid ${testingJavaPath === config.javaPaths?.java17 ? "fa-spinner fa-spin" : "fa-play"}`}></i>
                                            Test
                                        </button>
                                        {config.javaPaths?.java17 && config.javaPaths.java17 !== "/path/to/java" && (
                                            <button
                                                onClick={() => {
                                                    updateConfig({ javaPaths: { ...config.javaPaths, java17: undefined } });
                                                    toast.success("ลบ Java 17 เรียบร้อย");
                                                }}
                                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                                style={{ backgroundColor: "#ef444420", color: "#ef4444" }}
                                            >
                                                <i className="fa-solid fa-trash"></i>
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Java 8 */}
                                <div>
                                    <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>Java 8 location</p>
                                    <input
                                        type="text"
                                        value={config.javaPaths?.java8 || "/path/to/java"}
                                        readOnly
                                        className="w-full px-4 py-2.5 rounded-xl border text-sm mb-2"
                                        style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: config.javaPaths?.java8 ? colors.onSurface : colors.onSurfaceVariant }}
                                    />
                                    <div className="flex gap-2 flex-wrap">
                                        <button
                                            onClick={async () => {
                                                setInstallingJava(8);
                                                try {
                                                    const result = await windowApi?.installJava?.(8);
                                                    if (result?.ok && result.path) {
                                                        updateConfig({ javaPaths: { ...config.javaPaths, java8: result.path } });
                                                        toast.success(`ติดตั้ง Java 8 สำเร็จ`);
                                                    } else {
                                                        toast.error(result?.error || "ติดตั้ง Java ล้มเหลว");
                                                    }
                                                } catch { toast.error("ติดตั้ง Java ล้มเหลว"); }
                                                finally { setInstallingJava(null); }
                                            }}
                                            disabled={installingJava === 8}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                        >
                                            <i className={`fa-solid ${installingJava === 8 ? "fa-spinner fa-spin" : "fa-download"}`}></i>
                                            {installingJava === 8 ? "กำลังติดตั้ง..." : "Install"}
                                        </button>
                                        <button
                                            onClick={async () => {
                                                setIsDetectingJava(true);
                                                try {
                                                    const javas = await windowApi?.detectJavaInstallations?.();
                                                    const java8 = javas?.find((j: any) => j.majorVersion >= 8 && j.majorVersion < 17);
                                                    if (java8) {
                                                        updateConfig({ javaPaths: { ...config.javaPaths, java8: java8.path } });
                                                        toast.success(`พบ Java 8: ${java8.path}`);
                                                    } else {
                                                        toast.error("ไม่พบ Java 8 ในระบบ");
                                                    }
                                                } catch { toast.error("ค้นหา Java ล้มเหลว"); }
                                                finally { setIsDetectingJava(false); }
                                            }}
                                            disabled={isDetectingJava}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <i className="fa-solid fa-magnifying-glass"></i>
                                            Detect
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const path = await windowApi?.browseJava?.();
                                                if (path) {
                                                    updateConfig({ javaPaths: { ...config.javaPaths, java8: path } });
                                                    toast.success("ตั้งค่า Java 8 เรียบร้อย");
                                                }
                                            }}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <i className="fa-solid fa-folder-open"></i>
                                            Browse
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const path = config.javaPaths?.java8;
                                                if (!path || path === "/path/to/java") {
                                                    toast.error("ยังไม่ได้ตั้งค่า Java 8");
                                                    return;
                                                }
                                                setTestingJavaPath(path);
                                                try {
                                                    const result = await windowApi?.testJavaExecution?.(path);
                                                    if (result?.ok) {
                                                        toast.success(`Java ทำงานได้ปกติ${result.version ? ` (v${result.version})` : ""}`);
                                                    } else {
                                                        toast.error(result?.error || "Java ไม่สามารถใช้งานได้");
                                                    }
                                                } catch { toast.error("ทดสอบ Java ล้มเหลว"); }
                                                finally { setTestingJavaPath(null); }
                                            }}
                                            disabled={testingJavaPath === config.javaPaths?.java8}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <i className={`fa-solid ${testingJavaPath === config.javaPaths?.java8 ? "fa-spinner fa-spin" : "fa-play"}`}></i>
                                            Test
                                        </button>
                                        {config.javaPaths?.java8 && config.javaPaths.java8 !== "/path/to/java" && (
                                            <button
                                                onClick={() => {
                                                    updateConfig({ javaPaths: { ...config.javaPaths, java8: undefined } });
                                                    toast.success("ลบ Java 8 เรียบร้อย");
                                                }}
                                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                                style={{ backgroundColor: "#ef444420", color: "#ef4444" }}
                                            >
                                                <i className="fa-solid fa-trash"></i>
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
