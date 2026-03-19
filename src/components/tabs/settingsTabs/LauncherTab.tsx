import toast from "react-hot-toast";
import type { SettingsTabProps } from "./AccountTab";
import { useTranslation } from "../../../hooks/useTranslation";
import { Icons } from "../../ui/Icons";

export function LauncherTab({ config, updateConfig, colors }: SettingsTabProps) {
    const windowApi = (window as any).api;
    const { t } = useTranslation(config.language);

    return (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
            <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                <i className="fa-solid fa-rocket text-lg" style={{ color: colors.secondary }}></i>
                <h3 className="font-medium" style={{ color: colors.onSurface }}>{t("launcher_settings")}</h3>
            </div>
            <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-sm" style={{ color: colors.onSurface }}>{t("fullscreen")}</p>
                        <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>{t("fullscreen_desc")}</p>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer">
                        <button
                            onClick={async () => {
                                if (!windowApi) {
                                    toast.error(t("electron_required"));
                                    return;
                                }
                                await windowApi.windowMaximize();
                                const isMaximized = await windowApi.windowIsMaximized();
                                updateConfig({ fullscreen: isMaximized });
                            }}
                            className="relative w-11 h-6 rounded-full transition-all duration-300 shadow-inner"
                            style={{ backgroundColor: config.fullscreen ? colors.secondary : colors.outline + "40" }}
                        >
                            <div
                                className="absolute left-[2px] top-[2px] w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300"
                                style={{ transform: config.fullscreen ? "translateX(20px)" : "translateX(0)" }}
                            />
                        </button>
                    </div>
                </div>

                <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>{t("window_size")}</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>{t("window_size_desc")}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>{t("auto")}</span>
                            <div className="relative inline-flex items-center cursor-pointer">
                                <button
                                    onClick={() => updateConfig({ windowAuto: !config.windowAuto })}
                                    className="relative w-11 h-6 rounded-full transition-all duration-300 shadow-inner"
                                    style={{ backgroundColor: config.windowAuto ? colors.secondary : colors.outline + "40" }}
                                >
                                    <div
                                        className="absolute left-[2px] top-[2px] w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300"
                                        style={{ transform: config.windowAuto ? "translateX(20px)" : "translateX(0)" }}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                    {!config.windowAuto && (
                        <div className="flex gap-3 mt-3">
                            <div className="flex-1">
                                <label className="text-xs mb-1 block" style={{ color: colors.onSurfaceVariant }}>{t("width")}</label>
                                <input
                                    type="number"
                                    value={config.windowWidth}
                                    onChange={(e) => updateConfig({ windowWidth: Number(e.target.value) })}
                                    className="w-full px-4 py-2.5 rounded-xl border text-sm"
                                    style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }}
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs mb-1 block" style={{ color: colors.onSurfaceVariant }}>{t("height")}</label>
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

                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-sm" style={{ color: colors.onSurface }}>{t("close_on_launch")}</p>
                        <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>{t("close_on_launch_desc")}</p>
                    </div>
                    <div className="flex gap-1">
                        {[
                            { value: "keep-open", label: t("keep_open") },
                            { value: "hide-reopen", label: t("hide_reopen") },
                            { value: "close", label: t("close_launcher") },
                        ].map((option) => (
                            <button
                                key={option.value}
                                onClick={() => updateConfig({ closeOnLaunch: option.value as any })}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border"
                                style={{
                                    backgroundColor: config.closeOnLaunch === option.value ? colors.secondary + "20" : "transparent",
                                    borderColor: config.closeOnLaunch === option.value ? colors.secondary : "transparent",
                                    color: config.closeOnLaunch === option.value ? colors.secondary : colors.onSurfaceVariant,
                                }}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-sm text-red-500">{t("reset_settings")}</p>
                        <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>{t("reset_settings_desc")}</p>
                    </div>
                    <button
                        onClick={async () => {
                            if (confirm(t("reset_settings_confirm"))) {
                                try {
                                    const { useConfigStore } = await import("../../../store/configStore");
                                    useConfigStore.getState().resetConfig();

                                    if (windowApi?.resetConfig) {
                                        await windowApi.resetConfig();
                                    }

                                    toast.success(t("settings_reset_success_reload"));
                                    setTimeout(() => window.location.reload(), 500);
                                } catch (err) {
                                    console.error("Reset failed:", err);
                                    toast.error(t("settings_reset_failed"));
                                }
                            }
                        }}
                        className="p-2 rounded-xl transition-all hover:bg-red-500/10 text-red-500 hover:text-red-400 group"
                        title={t("reset_settings")}
                    >
                        <Icons.Trash className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
