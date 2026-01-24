import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { playClick } from "../../../lib/sounds";
import type { LauncherConfig } from "../../../types/launcher";
import type { SettingsTabProps } from "./AccountTab";
import { useTranslation } from "../../../hooks/useTranslation";

interface JavaInstallProgress {
    majorVersion: number;
    phase: string;
    percent: number;
    message: string;
}

export function JavaTab({ config, updateConfig, colors }: SettingsTabProps) {
    const [isDetectingJava, setIsDetectingJava] = useState(false);
    const [testingJavaPath, setTestingJavaPath] = useState<string | null>(null);
    const [installingJava, setInstallingJava] = useState<number | null>(null);
    const [deletingJava, setDeletingJava] = useState<number | null>(null);
    const [installProgress, setInstallProgress] = useState<JavaInstallProgress | null>(null);
    const { t } = useTranslation(config.language);

    const windowApi = (window as any).api;

    // Listen for Java install progress
    useEffect(() => {
        const unsubscribe = windowApi?.onJavaInstallProgress?.((data: JavaInstallProgress) => {
            setInstallProgress(data);
            if (data.phase === "complete" || data.phase === "error") {
                // Clear progress after a short delay
                setTimeout(() => setInstallProgress(null), 2000);
            }
        });
        return () => unsubscribe?.();
    }, []);

    // Helper function to render Java version section
    const renderJavaSection = (
        version: number,
        label: string,
        pathKey: "java25" | "java21" | "java17" | "java8",
        detectCondition: (majorVersion: number) => boolean
    ) => {
        const progressForThis = installProgress?.majorVersion === version ? installProgress : null;
        const isInstallingThis = installingJava === version || !!progressForThis;

        return (
            <div>
                <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>{t('java_install_path').replace('{version}', label)}</p>
                <input
                    type="text"
                    value={config.javaPaths?.[pathKey] || "/path/to/java"}
                    readOnly
                    className="w-full px-4 py-2.5 rounded-xl border text-sm mb-2"
                    style={{
                        borderColor: colors.outline,
                        backgroundColor: colors.surface,
                        color: config.javaPaths?.[pathKey] ? colors.onSurface : colors.onSurfaceVariant
                    }}
                />

                {/* Progress bar for installation */}
                {isInstallingThis && progressForThis && (
                    <div className="mb-3">
                        <div className="flex justify-between text-xs mb-1" style={{ color: colors.onSurfaceVariant }}>
                            <span>{progressForThis.message}</span>
                            <span>{progressForThis.percent}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                            <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                    width: `${progressForThis.percent}%`,
                                    backgroundColor: progressForThis.phase === "error" ? "#ef4444" : colors.secondary
                                }}
                            />
                        </div>
                    </div>
                )}

                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={async () => {
                            if (config.clickSoundEnabled) playClick();
                            setInstallingJava(version);
                            try {
                                const result = await windowApi?.installJava?.(version);
                                if (result?.ok && result.path) {
                                    updateConfig({ javaPaths: { ...config.javaPaths, [pathKey]: result.path } });
                                    toast.success(t('java_install_success').replace('{version}', label));
                                } else {
                                    toast.error(result?.error || t('java_install_failed'));
                                }
                            } catch { toast.error(t('java_install_failed')); }
                            finally { setInstallingJava(null); }
                        }}
                        disabled={isInstallingThis}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity"
                        style={{
                            backgroundColor: colors.secondary,
                            color: "#1a1a1a",
                            opacity: isInstallingThis ? 0.7 : 1
                        }}
                    >
                        <i className={`fa-solid ${isInstallingThis ? "fa-spinner fa-spin" : "fa-download"}`}></i>
                        {isInstallingThis ? (progressForThis?.message?.substring(0, 20) || t('installing')) : t('install')}
                    </button>
                    <button
                        onClick={async () => {
                            if (config.clickSoundEnabled) playClick();
                            setIsDetectingJava(true);
                            try {
                                const javas = await windowApi?.detectJavaInstallations?.();
                                const java = javas?.find((j: any) => detectCondition(j.majorVersion));
                                if (java) {
                                    updateConfig({ javaPaths: { ...config.javaPaths, [pathKey]: java.path } });
                                    toast.success(t('java_found_with_version').replace('{version}', label).replace('{path}', java.path));
                                } else {
                                    toast.error(t('java_not_found_with_version').replace('{version}', label));
                                }
                            } catch { toast.error(t('java_detect_failed')); }
                            finally { setIsDetectingJava(false); }
                        }}
                        disabled={isDetectingJava}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    >
                        <i className="fa-solid fa-magnifying-glass"></i>
                        {t('detect')}
                    </button>
                    <button
                        onClick={async () => {
                            if (config.clickSoundEnabled) playClick();
                            const path = await windowApi?.browseJava?.();
                            if (path) {
                                updateConfig({ javaPaths: { ...config.javaPaths, [pathKey]: path } });
                                toast.success(t('java_configured_successfully').replace('{version}', label));
                            }
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    >
                        <i className="fa-solid fa-folder-open"></i>
                        {t('browse')}
                    </button>
                    <button
                        onClick={async () => {
                            if (config.clickSoundEnabled) playClick();
                            const path = config.javaPaths?.[pathKey];
                            if (!path || path === "/path/to/java") {
                                toast.error(t('java_not_configured').replace('{version}', label));
                                return;
                            }
                            setTestingJavaPath(path);
                            try {
                                const result = await windowApi?.testJavaExecution?.(path);
                                if (result?.ok) {
                                    toast.success(t('java_test_success').replace('{version}', result.version ? ` (v${result.version})` : ""));
                                } else {
                                    toast.error(result?.error || t('java_test_failed'));
                                }
                            } catch { toast.error(t('java_test_failed')); }
                            finally { setTestingJavaPath(null); }
                        }}
                        disabled={testingJavaPath === config.javaPaths?.[pathKey]}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    >
                        <i className={`fa-solid ${testingJavaPath === config.javaPaths?.[pathKey] ? "fa-spinner fa-spin" : "fa-play"}`}></i>
                        {t('test')}
                    </button>
                    {config.javaPaths?.[pathKey] && config.javaPaths[pathKey] !== "/path/to/java" && (
                        <button
                            onClick={async () => {
                                if (config.clickSoundEnabled) playClick();
                                setDeletingJava(version);
                                try {
                                    // ลบโฟลเดอร์ Java ที่ launcher ติดตั้งไว้ (ถ้ามี)
                                    await windowApi?.deleteJava?.(version);
                                    // ลบ config
                                    updateConfig({ javaPaths: { ...config.javaPaths, [pathKey]: undefined } });
                                    toast.success(t('java_deleted_successfully').replace('{version}', label));
                                } catch {
                                    toast.error(t('java_delete_failed').replace('{version}', label));
                                } finally {
                                    setDeletingJava(null);
                                }
                            }}
                            disabled={deletingJava === version}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                            style={{ backgroundColor: "#ef444420", color: "#ef4444" }}
                        >
                            <i className={`fa-solid ${deletingJava === version ? "fa-spinner fa-spin" : "fa-trash"}`}></i>
                            {deletingJava === version ? t('deleting') : t('clear')}
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
            <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                <i className="fa-brands fa-java text-lg" style={{ color: colors.secondary }}></i>
                <h3 className="font-medium" style={{ color: colors.onSurface }}>{t('tab_java')}</h3>
            </div>
            <div className="p-4 space-y-6">
                {renderJavaSection(25, "25", "java25", (v) => v >= 25)}
                {renderJavaSection(21, "21", "java21", (v) => v >= 21 && v < 25)}
                {renderJavaSection(17, "17", "java17", (v) => v >= 17 && v < 21)}
                {renderJavaSection(8, "8", "java8", (v) => v >= 8 && v < 17)}
            </div>
        </div>
    );
}
