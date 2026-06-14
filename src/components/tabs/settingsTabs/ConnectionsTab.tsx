import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import type { LauncherConfig } from "../../../types/launcher";
import type { SettingsTabProps } from "./AccountTab";
import { Icons } from "../../ui/Icons";
import { useTranslation } from "../../../hooks/useTranslation";

export function ConnectionsTab({ config, updateConfig, colors }: SettingsTabProps) {
    const windowApi = (window as any).api;
    const { t } = useTranslation(config.language);

    const [catskinIp, setCatskinIp] = useState("storage-api.catskin.space");
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
        const targetIp = val.trim() || "storage-api.catskin.space";
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
        <div className="rounded-lg overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
            <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                <i className="fa-solid fa-wifi text-lg" style={{ color: colors.secondary }}></i>
                <h3 className="font-medium" style={{ color: colors.onSurface }}>{t('tab_connections')}</h3>
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
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>{t('discord_rpc')}</p>
                            <p className="text-xs" style={{ color: config.discordRPCEnabled ? "#22c55e" : colors.onSurfaceVariant }}>
                                {config.discordRPCEnabled ? t('discord_rpc_status_showing') : t('discord_rpc_status_off')}
                            </p>
                        </div>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer">
                        <button
                            onClick={() => {
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
                            className="relative w-11 h-6 bg-black/20 rounded-full transition-all duration-300"
                            style={{ backgroundColor: config.discordRPCEnabled ? colors.secondary : undefined }}
                        >
                            <div
                                className="absolute left-[2px] top-[2px] w-5 h-5 bg-white rounded-full transition-transform duration-300"
                                style={{ transform: config.discordRPCEnabled ? "translateX(20px)" : "translateX(0)" }}
                            />
                        </button>
                    </div>
                </div>

                <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                {/* Telemetry Toggle */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <i className="fa-solid fa-chart-line w-6" style={{ color: colors.onSurface }}></i>
                        <div>
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>{t('telemetry')}</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                {t('telemetry_desc')}
                            </p>
                        </div>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer">
                        <button
                            onClick={() => {
                                const newValue = !config.telemetryEnabled;
                                updateConfig({ telemetryEnabled: newValue });
                                toast.success(newValue ? t('telemetry_on') : t('telemetry_off'));
                            }}
                            className="relative w-11 h-6 bg-black/20 rounded-full transition-all duration-300"
                            style={{ backgroundColor: config.telemetryEnabled ? colors.secondary : undefined }}
                        >
                            <div
                                className="absolute left-[2px] top-[2px] w-5 h-5 bg-white rounded-full transition-transform duration-300"
                                style={{ transform: config.telemetryEnabled ? "translateX(20px)" : "translateX(0)" }}
                            />
                        </button>
                    </div>
                </div>

                <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                {/* Download Speed */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-sm" style={{ color: colors.onSurface }}>{t('limit_download_speed')}</p>
                        <span className="text-sm font-medium px-3 py-1 rounded-md" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}>
                            {config.downloadSpeedLimit === 0 ? t('unlimited') : `${config.downloadSpeedLimit} MB/s`}
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
                        <span>{t('unlimited')}</span>
                        <span>100 MB/s</span>
                    </div>
                </div>

                <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                {/* CatSkin Server IP */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                        <p className="font-medium text-sm" style={{ color: colors.onSurface }}>{t('catskinc_server_ip')}</p>
                        <p className="text-xs mt-0.5" style={{ color: colors.onSurfaceVariant }}>
                            {config.language === "th" 
                                ? "กำหนดที่อยู่เซิร์ฟเวอร์หลักเพื่อดึงข้อมูลสกินและเลอยอร์ปาก" 
                                : "Configure the server address for retrieving skins and mouth overlays."}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-[360px] shrink-0">
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
                                placeholder="storage-api.catskin.space"
                                className="w-full px-4 py-2.5 pr-10 text-sm rounded-md border outline-none transition-all"
                                style={{
                                    borderColor: colors.outline,
                                    backgroundColor: colors.surface,
                                    color: colors.onSurface,
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowIp(!showIp)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center p-1 rounded hover:bg-white/10 transition-colors"
                                style={{ color: colors.onSurfaceVariant }}
                            >
                                {showIp ? (
                                    <i className="fa-solid fa-eye-slash text-xs"></i>
                                ) : (
                                    <i className="fa-solid fa-eye text-xs"></i>
                                )}
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => handleSaveIp(catskinIp)}
                            className="px-3.5 py-2.5 rounded-md text-xs font-semibold transition-all hover:opacity-90 active:scale-95 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                            style={{
                                backgroundColor: colors.secondary,
                                color: "#1a1a1a"
                            }}
                        >
                            <i className="fa-solid fa-floppy-disk text-[10px]"></i>
                            {t('save')}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setCatskinIp("storage-api.catskin.space");
                                handleSaveIp("storage-api.catskin.space");
                            }}
                            className="p-2.5 rounded-md border transition-all hover:bg-white/5 active:scale-95 flex items-center justify-center cursor-pointer"
                            style={{
                                borderColor: colors.outline,
                                color: colors.onSurfaceVariant
                            }}
                            title={t('reset_settings')}
                        >
                            <i className="fa-solid fa-rotate-left text-xs"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
