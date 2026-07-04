import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import type { LauncherConfig } from "../../../types/launcher";
import type { SettingsTabProps } from "./AccountTab";
import { useTranslation } from "../../../hooks/useTranslation";

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
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
            <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                <i className="fa-solid fa-hard-drive text-lg" style={{ color: colors.secondary }}></i>
                <h3 className="font-medium" style={{ color: colors.onSurface }}>{t('tab_resources')}</h3>
            </div>
            <div className="p-4 space-y-4">
                {}
                <div>
                    <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>{t('launcher_folder')}</p>
                    <p className="text-xs mb-2" style={{ color: colors.onSurfaceVariant }}>{t('launcher_folder_desc')}</p>
                    <div className="flex gap-2">
                        <div
                            className="flex-1 px-4 py-2.5 rounded-md border text-sm flex items-center gap-2 overflow-hidden"
                            style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }}
                        >
                            <i className="fa-solid fa-folder" style={{ color: colors.secondary }}></i>
                            <span className="truncate" title={config.minecraftDir || resolvedDir}>{config.minecraftDir || resolvedDir}</span>
                        </div>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(config.minecraftDir || resolvedDir);
                                toast.success(t('path_copied'));
                            }}
                            className="px-4 py-2.5 rounded-md text-sm"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
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
                            className="px-4 py-2.5 rounded-md text-sm"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            title={t('open_folder')}
                        >
                            <i className="fa-solid fa-arrow-up-right-from-square"></i>
                        </button>
                        <button
                            onClick={handleBrowseMinecraftDir}
                            className="px-4 py-2.5 rounded-md text-sm font-medium"
                            style={{ backgroundColor: colors.secondary, color: colors.onSurface }}
                        >
                            {t('select')}
                        </button>
                    </div>
                </div>

                <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                {}
                <div>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>{t('launcher_cache')}</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>{t('launcher_cache_desc')}</p>
                        </div>
                        <button
                            onClick={handleClearCache}
                            disabled={isClearingCache}
                            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all"
                            style={{
                                backgroundColor: colors.surfaceContainerHighest,
                                color: colors.onSurface,
                                opacity: isClearingCache ? 0.6 : 1,
                                cursor: isClearingCache ? "not-allowed" : "pointer",
                            }}
                        >
                            <i className={`fa-solid ${isClearingCache ? "fa-spinner fa-spin" : "fa-trash"}`}></i>
                            {isClearingCache ? t('clearing' as any) || "กำลังล้าง..." : t('clear_cache')}
                        </button>
                    </div>
                </div>

                <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>{t('max_concurrent_downloads')}</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>{t('max_concurrent_downloads_desc')}</p>
                        </div>
                        <span className="text-sm font-medium px-3 py-1 rounded-md" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.secondary }}>
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
    );
}
