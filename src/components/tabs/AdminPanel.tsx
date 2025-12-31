/**
 * AdminPanel - หน้า Admin Settings สำหรับบัญชี CatID Admin
 * 
 * Features:
 * - Microsoft OAuth Settings (Client ID, Device Client ID, Secret)
 * - CurseForge API Key
 * - System Info
 */

import { useState, useEffect } from "react";
import { Icons } from "../ui/Icons";
import UserManagement from "./UserManagement";

interface AppSettings {
    microsoftClientId: string | null;
    microsoftDeviceClientId: string | null;
    hasMicrosoftSecret: boolean;
    microsoftSecretUpdatedAt: string | null;
    hasCurseforgeApiKey: boolean;
    curseforgeApiKeyUpdatedAt: string | null;
}

interface AdminPanelProps {
    colors: {
        primary: string;
        onPrimary: string;
        surface: string;
        surfaceContainer: string;
        surfaceContainerHigh: string;
        onSurface: string;
        onSurfaceVariant: string;
        outline: string;
        secondary: string;
    };
    adminToken: string;
}

export default function AdminPanel({ colors, adminToken }: AdminPanelProps) {
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Editing states
    const [editingClientId, setEditingClientId] = useState(false);
    const [editingDeviceClientId, setEditingDeviceClientId] = useState(false);
    const [clientIdInput, setClientIdInput] = useState("");
    const [deviceClientIdInput, setDeviceClientIdInput] = useState("");
    const [saving, setSaving] = useState(false);

    // Secret modal
    const [secretModalOpen, setSecretModalOpen] = useState(false);
    const [secretType, setSecretType] = useState<"microsoft" | "curseforge">("microsoft");
    const [secretInput, setSecretInput] = useState("");

    // System info
    const [systemInfo, setSystemInfo] = useState<{ apiUrl: string; version: string } | null>(null);

    useEffect(() => {
        loadSettings();
        loadSystemInfo();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await window.api?.getAdminSettings(adminToken);
            if (result?.ok && result.settings) {
                setSettings(result.settings);
                setClientIdInput(result.settings.microsoftClientId || "");
                setDeviceClientIdInput(result.settings.microsoftDeviceClientId || "");
            } else {
                setError(result?.error || "ไม่สามารถโหลด settings ได้");
            }
        } catch (err: any) {
            setError(err.message || "เกิดข้อผิดพลาด");
        } finally {
            setLoading(false);
        }
    };

    const loadSystemInfo = async () => {
        try {
            const info = await window.api?.getSystemInfo();
            if (info) {
                setSystemInfo(info);
            }
        } catch { }
    };

    const saveClientId = async () => {
        setSaving(true);
        try {
            const result = await window.api?.saveAdminSetting(adminToken, "microsoft-client-id", clientIdInput);
            if (result?.ok) {
                setEditingClientId(false);
                loadSettings();
            } else {
                alert(result?.error || "บันทึกไม่สำเร็จ");
            }
        } catch {
            alert("เกิดข้อผิดพลาด");
        } finally {
            setSaving(false);
        }
    };

    const saveDeviceClientId = async () => {
        setSaving(true);
        try {
            const result = await window.api?.saveAdminSetting(adminToken, "microsoft-device-client-id", deviceClientIdInput);
            if (result?.ok) {
                setEditingDeviceClientId(false);
                loadSettings();
            } else {
                alert(result?.error || "บันทึกไม่สำเร็จ");
            }
        } catch {
            alert("เกิดข้อผิดพลาด");
        } finally {
            setSaving(false);
        }
    };

    const saveSecret = async () => {
        setSaving(true);
        try {
            const settingKey = secretType === "microsoft" ? "microsoft-secret" : "curseforge-api-key";
            const result = await window.api?.saveAdminSetting(adminToken, settingKey, secretInput);
            if (result?.ok) {
                setSecretModalOpen(false);
                setSecretInput("");
                loadSettings();
            } else {
                alert(result?.error || "บันทึกไม่สำเร็จ");
            }
        } catch {
            alert("เกิดข้อผิดพลาด");
        } finally {
            setSaving(false);
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "ยังไม่เคยตั้งค่า";
        return new Date(dateStr).toLocaleString("th-TH");
    };

    const openSecretModal = (type: "microsoft" | "curseforge") => {
        setSecretType(type);
        setSecretInput("");
        setSecretModalOpen(true);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Icons.Spinner className="w-8 h-8 animate-spin" style={{ color: colors.primary }} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <p style={{ color: colors.onSurface }}>{error}</p>
                <button
                    onClick={loadSettings}
                    className="px-4 py-2 rounded-lg"
                    style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                >
                    ลองใหม่
                </button>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 overflow-y-auto max-h-full">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: colors.onSurface }}>
                        <Icons.Settings className="w-6 h-6" style={{ color: colors.secondary }} />
                        Admin Panel
                    </h1>
                    <p className="text-sm mt-1" style={{ color: colors.onSurfaceVariant }}>
                        ตั้งค่าระบบและ API Keys
                    </p>
                </div>
                <button
                    onClick={loadSettings}
                    className="p-2 rounded-lg transition-colors hover:opacity-80"
                    style={{ backgroundColor: colors.surfaceContainerHigh }}
                    title="รีเฟรช"
                >
                    <Icons.Refresh className="w-5 h-5" style={{ color: colors.onSurface }} />
                </button>
            </div>

            {/* Microsoft OAuth Card */}
            <div className="rounded-xl p-5" style={{ backgroundColor: colors.surfaceContainer }}>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: colors.onSurface }}>
                    <Icons.Microsoft className="w-5 h-5" style={{ color: "#00a4ef" }} />
                    Microsoft OAuth
                </h3>

                <div className="space-y-4">
                    {/* Client ID */}
                    <div className="p-3 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                        <div className="flex items-center justify-between mb-2">
                            <span style={{ color: colors.onSurfaceVariant }}>Client ID (Web)</span>
                            {!editingClientId && (
                                <button
                                    onClick={() => setEditingClientId(true)}
                                    className="text-sm flex items-center gap-1 hover:underline"
                                    style={{ color: colors.secondary }}
                                >
                                    <Icons.Edit className="w-3 h-3" />
                                    แก้ไข
                                </button>
                            )}
                        </div>
                        {editingClientId ? (
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={clientIdInput}
                                    onChange={(e) => setClientIdInput(e.target.value)}
                                    className="flex-1 px-3 py-2 rounded text-sm"
                                    style={{
                                        backgroundColor: colors.surface,
                                        color: colors.onSurface,
                                        border: `1px solid ${colors.outline}`
                                    }}
                                    placeholder="ใส่ Client ID"
                                />
                                <button
                                    onClick={saveClientId}
                                    disabled={saving}
                                    className="px-3 py-2 rounded"
                                    style={{ backgroundColor: colors.secondary, color: colors.onPrimary }}
                                >
                                    {saving ? <Icons.Spinner className="w-4 h-4 animate-spin" /> : <Icons.Check className="w-4 h-4" />}
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingClientId(false);
                                        setClientIdInput(settings?.microsoftClientId || "");
                                    }}
                                    className="px-3 py-2 rounded"
                                    style={{ backgroundColor: colors.surfaceContainerHigh }}
                                >
                                    <Icons.Close className="w-4 h-4" style={{ color: colors.onSurface }} />
                                </button>
                            </div>
                        ) : (
                            <code className="text-sm break-all" style={{ color: colors.secondary }}>
                                {settings?.microsoftClientId || <span style={{ color: colors.onSurfaceVariant }}>ยังไม่ได้ตั้งค่า</span>}
                            </code>
                        )}
                    </div>

                    {/* Device Client ID */}
                    <div className="p-3 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <span style={{ color: colors.onSurfaceVariant }}>Device Client ID</span>
                                <p className="text-xs mt-0.5" style={{ color: colors.onSurfaceVariant }}>
                                    สำหรับ Launcher (Device Code Flow)
                                </p>
                            </div>
                            {!editingDeviceClientId && (
                                <button
                                    onClick={() => setEditingDeviceClientId(true)}
                                    className="text-sm flex items-center gap-1 hover:underline"
                                    style={{ color: colors.secondary }}
                                >
                                    <Icons.Edit className="w-3 h-3" />
                                    แก้ไข
                                </button>
                            )}
                        </div>
                        {editingDeviceClientId ? (
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={deviceClientIdInput}
                                    onChange={(e) => setDeviceClientIdInput(e.target.value)}
                                    className="flex-1 px-3 py-2 rounded text-sm"
                                    style={{
                                        backgroundColor: colors.surface,
                                        color: colors.onSurface,
                                        border: `1px solid ${colors.outline}`
                                    }}
                                    placeholder="ใส่ Device Client ID"
                                />
                                <button
                                    onClick={saveDeviceClientId}
                                    disabled={saving}
                                    className="px-3 py-2 rounded"
                                    style={{ backgroundColor: colors.secondary, color: colors.onPrimary }}
                                >
                                    {saving ? <Icons.Spinner className="w-4 h-4 animate-spin" /> : <Icons.Check className="w-4 h-4" />}
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingDeviceClientId(false);
                                        setDeviceClientIdInput(settings?.microsoftDeviceClientId || "");
                                    }}
                                    className="px-3 py-2 rounded"
                                    style={{ backgroundColor: colors.surfaceContainerHigh }}
                                >
                                    <Icons.Close className="w-4 h-4" style={{ color: colors.onSurface }} />
                                </button>
                            </div>
                        ) : (
                            <code className="text-sm break-all" style={{ color: colors.secondary }}>
                                {settings?.microsoftDeviceClientId || <span style={{ color: colors.onSurfaceVariant }}>ยังไม่ได้ตั้งค่า</span>}
                            </code>
                        )}
                    </div>

                    {/* Client Secret */}
                    <div className="p-3 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                        <div className="flex items-center justify-between">
                            <div>
                                <span style={{ color: colors.onSurfaceVariant }}>Client Secret</span>
                                <div className="flex items-center gap-2 mt-1">
                                    {settings?.hasMicrosoftSecret ? (
                                        <>
                                            <span className="text-sm flex items-center gap-1 text-green-500">
                                                <Icons.Check className="w-3 h-3" />
                                                ตั้งค่าแล้ว
                                            </span>
                                            <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                                ({formatDate(settings?.microsoftSecretUpdatedAt)})
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-sm text-yellow-500">ยังไม่ได้ตั้งค่า</span>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => openSecretModal("microsoft")}
                                className="px-3 py-2 rounded flex items-center gap-2 text-sm"
                                style={{ backgroundColor: colors.surface, color: colors.onSurface }}
                            >
                                <Icons.Key className="w-4 h-4" />
                                {settings?.hasMicrosoftSecret ? "เปลี่ยน" : "ตั้งค่า"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* CurseForge API Card */}
            <div className="rounded-xl p-5" style={{ backgroundColor: colors.surfaceContainer }}>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: colors.onSurface }}>
                    <Icons.Box className="w-5 h-5" style={{ color: "#f16436" }} />
                    CurseForge API
                </h3>

                <div className="p-3 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                    <div className="flex items-center justify-between">
                        <div>
                            <span style={{ color: colors.onSurfaceVariant }}>API Key</span>
                            <div className="flex items-center gap-2 mt-1">
                                {settings?.hasCurseforgeApiKey ? (
                                    <>
                                        <span className="text-sm flex items-center gap-1 text-green-500">
                                            <Icons.Check className="w-3 h-3" />
                                            ตั้งค่าแล้ว
                                        </span>
                                        <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                            ({formatDate(settings?.curseforgeApiKeyUpdatedAt)})
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-sm text-yellow-500">ยังไม่ได้ตั้งค่า</span>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={() => openSecretModal("curseforge")}
                            className="px-3 py-2 rounded flex items-center gap-2 text-sm"
                            style={{ backgroundColor: colors.surface, color: colors.onSurface }}
                        >
                            <Icons.Key className="w-4 h-4" />
                            {settings?.hasCurseforgeApiKey ? "เปลี่ยน" : "ตั้งค่า"}
                        </button>
                    </div>
                </div>
            </div>

            {/* System Info Card */}
            <div className="rounded-xl p-5" style={{ backgroundColor: colors.surfaceContainer }}>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: colors.onSurface }}>
                    <Icons.Info className="w-5 h-5" style={{ color: colors.secondary }} />
                    System Info
                </h3>

                <div className="space-y-3">
                    <div className="flex justify-between p-3 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                        <span style={{ color: colors.onSurfaceVariant }}>API URL</span>
                        <code className="text-sm" style={{ color: colors.secondary }}>
                            {systemInfo?.apiUrl || "N/A"}
                        </code>
                    </div>
                    <div className="flex justify-between p-3 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHigh }}>
                        <span style={{ color: colors.onSurfaceVariant }}>Version</span>
                        <span style={{ color: colors.onSurface }}>{systemInfo?.version || "N/A"}</span>
                    </div>
                </div>
            </div>

            {/* User Management Section */}
            <UserManagement colors={colors} adminToken={adminToken} />

            {/* Secret Modal */}
            {secretModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div
                        className="rounded-xl p-6 w-full max-w-md mx-4"
                        style={{ backgroundColor: colors.surfaceContainer }}
                    >
                        <h3 className="text-lg font-bold mb-4" style={{ color: colors.onSurface }}>
                            {secretType === "microsoft" ? "ตั้งค่า Client Secret" : "ตั้งค่า CurseForge API Key"}
                        </h3>

                        <input
                            type="password"
                            value={secretInput}
                            onChange={(e) => setSecretInput(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg text-sm mb-4"
                            style={{
                                backgroundColor: colors.surface,
                                color: colors.onSurface,
                                border: `1px solid ${colors.outline}`
                            }}
                            placeholder={secretType === "microsoft" ? "ใส่ Client Secret ใหม่" : "ใส่ API Key ใหม่"}
                        />

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setSecretModalOpen(false)}
                                className="px-4 py-2 rounded-lg"
                                style={{ backgroundColor: colors.surfaceContainerHigh, color: colors.onSurface }}
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={saveSecret}
                                disabled={saving || !secretInput}
                                className="px-4 py-2 rounded-lg flex items-center gap-2"
                                style={{
                                    backgroundColor: colors.secondary,
                                    color: colors.onPrimary,
                                    opacity: saving || !secretInput ? 0.5 : 1
                                }}
                            >
                                {saving ? <Icons.Spinner className="w-4 h-4 animate-spin" /> : null}
                                บันทึก
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
