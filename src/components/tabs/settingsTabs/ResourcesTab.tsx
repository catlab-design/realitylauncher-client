import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import type { LauncherConfig } from "../../../types/launcher";
import type { SettingsTabProps } from "./AccountTab";
import { useTranslation } from "../../../hooks/useTranslation";
import { SettingsPage, SettingsSection, SettingsRow, fieldClass, fieldStyle, buttonClass, buttonStyle, primaryButtonStyle } from "./SettingsUI";

export function ResourcesTab({ config, updateConfig, colors, handleBrowseMinecraftDir }: SettingsTabProps & { handleBrowseMinecraftDir?: () => void | Promise<void> }) {
    const windowApi = (window as any).api;
    const { t } = useTranslation(config.language);
    const [isClearingCache, setIsClearingCache] = useState(false);

    const [resolvedDir, setResolvedDir] = useState("");
    useEffect(() => {
        (async () => {
            const dir = await windowApi?.configGetMinecraftDir?.();
            if (dir) setResolvedDir(dir);
        })();
    }, [config.minecraftDir]);

    const handleClearCache = async () => {
        if (isClearingCache) return;
        setIsClearingCache(true);
        const toastId = toast.loading(t('clearing_cache' as any) || "กำลังล้างแคช...");
        try {
            if (windowApi?.launcherClearCache) {
                await windowApi.launcherClearCache();
            } else {
                await Promise.all([
                    windowApi?.modrinthClearCache?.(),
                    windowApi?.curseforgeClearCache?.(),
                ]);
            }
            toast.success(t('cache_cleared_successfully'), { id: toastId });
        } catch {
            toast.error(t('error_occurred'), { id: toastId });
        } finally {
            setIsClearingCache(false);
        }
    };

    return (
        <SettingsPage title={t('tab_resources')} colors={colors}>
            <SettingsSection colors={colors}>
                {}
                <SettingsRow
                    colors={colors}
                    icon={<i className="fa-solid fa-folder text-base"></i>}
                    title={t('launcher_folder')}
                    description={t('launcher_folder_desc')}
                    below={
                        <div className="flex gap-2.5">
                            <div
                                className={`${fieldClass} flex-1 min-w-0 flex items-center gap-2.5 overflow-hidden`}
                                style={fieldStyle(colors)}
                            >
                                <i className="fa-solid fa-folder text-sm shrink-0" style={{ color: colors.secondary }}></i>
                                <span className="truncate font-mono text-[13px]" title={config.minecraftDir || resolvedDir}>{config.minecraftDir || resolvedDir}</span>
                            </div>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(config.minecraftDir || resolvedDir);
                                    toast.success(t('path_copied'));
                                }}
                                className={`${buttonClass} h-11 w-11 justify-center px-0`}
                                style={buttonStyle(colors)}
                                title={t('copy')}
                            >
                                <i className="fa-solid fa-copy"></i>
                            </button>
                            <button
                                onClick={async () => {
                                    if (windowApi?.openFolder) {
                                        await windowApi.openFolder(config.minecraftDir || resolvedDir);
                                    } else {
                                        toast.success(t('open_folder_electron'));
                                    }
                                }}
                                className={`${buttonClass} h-11 w-11 justify-center px-0`}
                                style={buttonStyle(colors)}
                                title={t('open_folder')}
                            >
                                <i className="fa-solid fa-arrow-up-right-from-square"></i>
                            </button>
                            <button
                                onClick={handleBrowseMinecraftDir}
                                className={`${buttonClass} h-11`}
                                style={primaryButtonStyle(colors)}
                            >
                                {t('select')}
                            </button>
                        </div>
                    }
                />

                {}
                <SettingsRow
                    colors={colors}
                    icon={<i className="fa-solid fa-broom text-base"></i>}
                    title={t('launcher_cache')}
                    description={t('launcher_cache_desc')}
                >
                    <button
                        onClick={handleClearCache}
                        disabled={isClearingCache}
                        className={buttonClass}
                        style={{
                            ...buttonStyle(colors),
                            opacity: isClearingCache ? 0.6 : 1,
                            cursor: isClearingCache ? "not-allowed" : "pointer",
                        }}
                    >
                        <i className={`fa-solid ${isClearingCache ? "fa-spinner fa-spin" : "fa-trash"}`}></i>
                        {isClearingCache ? t('clearing' as any) || "กำลังล้าง..." : t('clear_cache')}
                    </button>
                </SettingsRow>

                <SettingsRow
                    colors={colors}
                    icon={<i className="fa-solid fa-download text-base"></i>}
                    title={t('max_concurrent_downloads')}
                    description={t('max_concurrent_downloads_desc')}
                    below={
                        <div>
                            <input
                                type="range"
                                min={1}
                                max={10}
                                step={1}
                                value={config.maxConcurrentDownloads}
                                onChange={(e) => updateConfig({ maxConcurrentDownloads: Number(e.target.value) })}
                                className="w-full h-2 cursor-pointer"
                                style={{ accentColor: colors.secondary }}
                            />
                            <div className="flex justify-between text-[13px] font-medium mt-1.5 px-0.5" style={{ color: colors.onSurfaceVariant }}>
                                <span>1</span>
                                <span>10</span>
                            </div>
                        </div>
                    }
                >
                    <span
                        className="min-w-12 h-10 px-3 inline-flex items-center justify-center rounded-lg text-base font-bold"
                        style={{ backgroundColor: colors.secondary, color: "#111" }}
                    >
                        {config.maxConcurrentDownloads}
                    </span>
                </SettingsRow>
            </SettingsSection>
        </SettingsPage>
    );
}
