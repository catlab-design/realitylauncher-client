import toast from "react-hot-toast";
import type { SettingsTabProps } from "./AccountTab";
import { useTranslation } from "../../../hooks/useTranslation";
import { Icons } from "../../ui/Icons";
import { SettingsPage, SettingsSection, SettingsRow, Toggle, Segmented, fieldClass, fieldStyle } from "./SettingsUI";

export function LauncherTab({ config, updateConfig, colors }: SettingsTabProps) {
    const windowApi = (window as any).api;
    const { t } = useTranslation(config.language);

    return (
        <SettingsPage title={t("launcher_settings")} colors={colors}>
            <SettingsSection colors={colors}>
                <SettingsRow title={t("fullscreen")} description={t("fullscreen_desc")} colors={colors}>
                    <Toggle
                        checked={!!config.fullscreen}
                        label={t("fullscreen")}
                        colors={colors}
                        onChange={async () => {
                            if (!windowApi) {
                                toast.error(t("electron_required"));
                                return;
                            }
                            await windowApi.windowMaximize();
                            const isMaximized = await windowApi.windowIsMaximized();
                            updateConfig({ fullscreen: isMaximized });
                        }}
                    />
                </SettingsRow>

                <SettingsRow
                    title={t("window_size")}
                    description={t("window_size_desc")}
                    colors={colors}
                    below={!config.windowAuto ? (
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-sm font-medium mb-1.5 block" style={{ color: colors.onSurfaceVariant }}>{t("width")}</label>
                                <input
                                    type="number"
                                    value={config.windowWidth}
                                    onChange={(e) => updateConfig({ windowWidth: Number(e.target.value) })}
                                    className={`${fieldClass} w-full`}
                                    style={fieldStyle(colors)}
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-sm font-medium mb-1.5 block" style={{ color: colors.onSurfaceVariant }}>{t("height")}</label>
                                <input
                                    type="number"
                                    value={config.windowHeight}
                                    onChange={(e) => updateConfig({ windowHeight: Number(e.target.value) })}
                                    className={`${fieldClass} w-full`}
                                    style={fieldStyle(colors)}
                                />
                            </div>
                        </div>
                    ) : undefined}
                >
                    <span className="text-sm font-medium" style={{ color: colors.onSurfaceVariant }}>{t("auto")}</span>
                    <Toggle
                        checked={!!config.windowAuto}
                        label={t("auto")}
                        colors={colors}
                        onChange={() => updateConfig({ windowAuto: !config.windowAuto })}
                    />
                </SettingsRow>

                <SettingsRow
                    title={t("close_on_launch")}
                    description={t("close_on_launch_desc")}
                    colors={colors}
                    below={
                        <Segmented
                            value={config.closeOnLaunch as string}
                            colors={colors}
                            options={[
                                { value: "keep-open", label: t("keep_open") },
                                { value: "hide-reopen", label: t("hide_reopen") },
                                { value: "close", label: t("close_launcher") },
                            ]}
                            onChange={(value) => updateConfig({ closeOnLaunch: value as any })}
                        />
                    }
                />
            </SettingsSection>

            <SettingsSection colors={colors}>
                <SettingsRow
                    title={t("reset_settings")}
                    description={t("reset_settings_desc")}
                    colors={colors}
                    danger
                    icon={<Icons.Trash className="w-5 h-5" />}
                >
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
                        className="h-10 px-4 rounded-lg border text-sm font-semibold transition inline-flex items-center gap-2 whitespace-nowrap text-red-500 border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
                        title={t("reset_settings")}
                    >
                        <Icons.Trash className="w-4 h-4" />
                        {t("reset_settings")}
                    </button>
                </SettingsRow>
            </SettingsSection>
        </SettingsPage>
    );
}
