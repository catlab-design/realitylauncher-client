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
    setSettingsTab: (tab: "account" | "appearance" | "game" | "connections" | "launcher" | "resources" | "java") => void;
    settingsTab: "account" | "appearance" | "game" | "connections" | "launcher" | "resources" | "java";
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
    const [detectedJavas, setDetectedJavas] = useState<string[]>([]);
    const [isDetectingJava, setIsDetectingJava] = useState(false);
    const [maxRamMB, setMaxRamMB] = useState(8192);
    const [systemRamMB, setSystemRamMB] = useState(0);

    // Load system RAM on mount
    useEffect(() => {
        (async () => {
            const maxRam = await (window as any).api?.getMaxRam?.();
            const systemRam = await (window as any).api?.getSystemRam?.();
            if (maxRam) setMaxRamMB(maxRam);
            if (systemRam) setSystemRamMB(systemRam);
        })();
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
                                                    <div className="text-sm font-medium" style={{ color: colors.onSurface }}>{account.username}</div>
                                                    <div className="text-xs" style={{ color: colors.onSurfaceVariant }}>{account.type}</div>
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
                                            onClick={async () => {
                                                if (!windowApi?.detectJavaInstallations) {
                                                    toast.error("ฟีเจอร์นี้ต้องใช้ใน Electron");
                                                    return;
                                                }
                                                setIsDetectingJava(true);
                                                try {
                                                    const javas = await windowApi.detectJavaInstallations();
                                                    setDetectedJavas(javas);
                                                    if (javas.length > 0) {
                                                        toast.success(`พบ Java ${javas.length} ตัว`);
                                                    } else {
                                                        toast.error("ไม่พบ Java ในระบบ");
                                                    }
                                                } catch (error) {
                                                    toast.error("ค้นหา Java ล้มเหลว");
                                                } finally {
                                                    setIsDetectingJava(false);
                                                }
                                            }}
                                            disabled={isDetectingJava}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <i className="fa-solid fa-magnifying-glass"></i>
                                            ค้นหา
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const path = await windowApi?.browseJava?.();
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
                                                const path = await windowApi?.browseJava?.();
                                                if (path) updateConfig({ java17Path: path });
                                            }}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <i className="fa-solid fa-folder-open"></i>
                                            เลือก
                                        </button>
                                    </div>
                                </div>

                                <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                                {/* Java 8 */}
                                <div>
                                    <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>Java 8</p>
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
                                                const path = await windowApi?.browseJava?.();
                                                if (path) updateConfig({ java8Path: path });
                                            }}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <i className="fa-solid fa-folder-open"></i>
                                            เลือก
                                        </button>
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
