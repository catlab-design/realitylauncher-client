import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import type { LauncherConfig } from "../../../types/launcher";
import type { SettingsTabProps } from "./AccountTab";
import { Icons } from "../../ui/Icons";
import { useTranslation } from "../../../hooks/useTranslation";
import {
    SettingsPage,
    SettingsSection,
    SettingsRow,
    Toggle,
    fieldClass,
    fieldStyle,
    buttonClass,
    buttonStyle,
    primaryButtonStyle,
} from "./SettingsUI";

export function ConnectionsTab({ config, updateConfig, colors }: SettingsTabProps) {
    const windowApi = (window as any).api;
    // The toggle only says what we want; this says whether Discord is actually linked.
    const [rpcConnected, setRpcConnected] = useState(false);
    useEffect(() => {
        if (!config.discordRPCEnabled) {
            setRpcConnected(false);
            return;
        }
        let cancelled = false;
        const poll = async () => {
            try {
                const ok = await windowApi?.discordRPCIsConnected?.();
                if (!cancelled) setRpcConnected(!!ok);
                // Not linked yet (Discord was closed at launch): try again, which reconnects.
                if (!ok) windowApi?.discordRPCUpdate?.("idle");
            } catch {
                if (!cancelled) setRpcConnected(false);
            }
        };
        poll();
        const id = setInterval(poll, 5000);
        return () => { cancelled = true; clearInterval(id); };
    }, [config.discordRPCEnabled]);
    const { t } = useTranslation(config.language);

    const [catskinIp, setCatskinIp] = useState("storage-skin.catlabdesign.space");
    const [showIp, setShowIp] = useState(false);

    useEffect(() => {
        if (windowApi?.catskincGetConfig) {
            windowApi.catskincGetConfig().then((cfg: any) => {
                if (cfg && cfg.ip) {
                    setCatskinIp(cfg.ip);
                }
            });
        }
    }, [windowApi]);

    const handleSaveIp = useCallback(async (val: string) => {
        const targetIp = val.trim() || "storage-skin.catlabdesign.space";
        setCatskinIp(targetIp);
        if (windowApi?.catskincSaveConfig) {
            try {
                const res = await windowApi.catskincSaveConfig({ ip: targetIp });
                if (res.ok) {
                    toast.success(t("wardrobe_catskinc_sync_success"));
                } else {
                    toast.error(res.error || t("wardrobe_apply_failed"));
                }
            } catch (err: any) {
                toast.error(err?.message || t("wardrobe_apply_failed"));
            }
        }
    }, [windowApi, t]);

    return (
        <SettingsPage title={t('tab_connections')} colors={colors}>
            <SettingsSection colors={colors}>
                {}
                <SettingsRow
                    colors={colors}
                    icon={
                        <div className="relative">
                            <Icons.Discord className="w-5 h-5" />
                            <div
                                className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2"
                                style={{
                                    backgroundColor: config.discordRPCEnabled ? (rpcConnected ? "#22c55e" : "#f59e0b") : "#6b7280",
                                    borderColor: colors.surfaceContainerHighest
                                }}
                            />
                        </div>
                    }
                    title={t('discord_rpc')}
                    description={
                        <span style={{ color: config.discordRPCEnabled ? (rpcConnected ? "#22c55e" : "#f59e0b") : colors.onSurfaceVariant }}>
                            {config.discordRPCEnabled ? (rpcConnected ? t('discord_rpc_status_showing') : t('discord_rpc_status_waiting')) : t('discord_rpc_status_off')}
                        </span>
                    }
                >
                    <Toggle
                        checked={!!config.discordRPCEnabled}
                        colors={colors}
                        label={t('discord_rpc')}
                        onChange={() => {
                            const newValue = !config.discordRPCEnabled;
                            updateConfig({ discordRPCEnabled: newValue });
                            windowApi?.discordRPCSetEnabled?.(newValue);
                            if (newValue) {
                                windowApi?.discordRPCUpdate?.("idle");
                                toast.success(t('discord_rpc_on'));
                            } else {
                                toast.success(t('discord_rpc_off'));
                            }
                        }}
                    />
                </SettingsRow>

                {}
                <SettingsRow
                    colors={colors}
                    icon={<i className="fa-solid fa-chart-line text-base"></i>}
                    title={t('telemetry')}
                    description={t('telemetry_desc')}
                >
                    <Toggle
                        checked={!!config.telemetryEnabled}
                        colors={colors}
                        label={t('telemetry')}
                        onChange={() => {
                            const newValue = !config.telemetryEnabled;
                            updateConfig({ telemetryEnabled: newValue });
                            toast.success(newValue ? t('telemetry_on') : t('telemetry_off'));
                        }}
                    />
                </SettingsRow>

                {}
                <SettingsRow
                    colors={colors}
                    icon={<i className="fa-solid fa-gauge-high text-base"></i>}
                    title={t('limit_download_speed')}
                    below={
                        <div>
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
                            <div className="flex justify-between text-sm mt-1.5" style={{ color: colors.onSurfaceVariant }}>
                                <span>{t('unlimited')}</span>
                                <span>100 MB/s</span>
                            </div>
                        </div>
                    }
                >
                    <span
                        className="text-[15px] font-semibold px-3.5 py-1.5 rounded-lg tabular-nums"
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    >
                        {config.downloadSpeedLimit === 0 ? t('unlimited') : `${config.downloadSpeedLimit} MB/s`}
                    </span>
                </SettingsRow>

                <SettingsRow
                    colors={colors}
                    icon={<i className="fa-solid fa-server text-base"></i>}
                    title={t('catskinc_server_ip')}
                    description={
                        config.language === "th"
                            ? "กำหนดที่อยู่เซิร์ฟเวอร์หลักเพื่อดึงข้อมูลสกินและเลอยอร์ปาก"
                            : "Configure the server address for retrieving skins and mouth overlays."
                    }
                    below={
                        <div className="flex items-center gap-2 w-full">
                            <div className="relative flex-1">
                                <input
                                    type={showIp ? "text" : "password"}
                                    value={catskinIp}
                                    onChange={(e) => setCatskinIp(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            handleSaveIp(e.currentTarget.value);
                                            e.currentTarget.blur();
                                        }
                                    }}
                                    placeholder="storage-skin.catlabdesign.space"
                                    className={`${fieldClass} w-full pr-12`}
                                    style={fieldStyle(colors)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowIp(!showIp)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors"
                                    style={{ color: colors.onSurfaceVariant }}
                                >
                                    {showIp ? (
                                        <i className="fa-solid fa-eye-slash text-sm"></i>
                                    ) : (
                                        <i className="fa-solid fa-eye text-sm"></i>
                                    )}
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleSaveIp(catskinIp)}
                                className={`${buttonClass} h-11 cursor-pointer active:scale-95`}
                                style={primaryButtonStyle(colors)}
                            >
                                <i className="fa-solid fa-floppy-disk text-sm"></i>
                                {t('save')}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setCatskinIp("storage-skin.catlabdesign.space");
                                    handleSaveIp("storage-skin.catlabdesign.space");
                                }}
                                className={`${buttonClass} h-11 w-11 px-0 justify-center cursor-pointer active:scale-95`}
                                style={buttonStyle(colors)}
                                title={t('reset_settings')}
                            >
                                <i className="fa-solid fa-rotate-left text-sm"></i>
                            </button>
                        </div>
                    }
                />
            </SettingsSection>
        </SettingsPage>
    );
}
