import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
    const [detectedJavasForModal, setDetectedJavasForModal] = useState<{ targetKey: "java25" | "java21" | "java17" | "java8"; versionLabel: string; javas: any[] } | null>(null);
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
                                const filtered = javas?.filter((j: any) => detectCondition(j.majorVersion));
                                if (filtered && filtered.length > 0) {
                                    setDetectedJavasForModal({ targetKey: pathKey, versionLabel: label, javas: filtered });
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

            {/* Selection Modal */}
            <AnimatePresence>
                {detectedJavasForModal && (
                    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 backdrop-blur-sm" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="w-full max-w-4xl rounded-2xl flex flex-col overflow-hidden shadow-2xl"
                            style={{ backgroundColor: colors.surface, border: `1px solid ${colors.outline}40` }}
                        >
                            <div className="px-5 py-4 flex items-center justify-between border-b" style={{ borderColor: `${colors.outline}40` }}>
                                <h3 className="font-semibold text-lg" style={{ color: colors.onSurface }}>
                                    Select Java Version
                                </h3>
                                <button
                                    onClick={() => { if (config.clickSoundEnabled) playClick(); setDetectedJavasForModal(null); }}
                                    className="opacity-70 hover:opacity-100 transition-opacity flex items-center justify-center w-8 h-8 rounded-full"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                >
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>
                            <div className="p-4 overflow-y-auto max-h-[50vh] custom-scrollbar">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead>
                                        <tr style={{ color: colors.onSurfaceVariant }}>
                                            <th className="font-medium pb-3 pr-4">Version</th>
                                            <th className="font-medium pb-3 pr-4 w-full">Path</th>
                                            <th className="font-medium pb-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y" style={{ borderColor: `${colors.outline}20` }}>
                                        {detectedJavasForModal.javas.map((java, idx) => {
                                            const isSelected = config.javaPaths?.[detectedJavasForModal.targetKey] === java.path;
                                            return (
                                                <tr key={idx} style={{ color: colors.onSurface }}>
                                                    <td className="py-3 pr-4 font-mono">{java.majorVersion}</td>
                                                    <td className="py-3 pr-4">
                                                        <div className="max-w-[400px] sm:max-w-[500px] md:max-w-[700px] truncate overflow-hidden text-ellipsis" title={java.path}>
                                                            {java.path}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 text-right">
                                                        <button
                                                            onClick={() => {
                                                                if (config.clickSoundEnabled) playClick();
                                                                updateConfig({ javaPaths: { ...config.javaPaths, [detectedJavasForModal.targetKey]: java.path } });
                                                                toast.success(t('java_configured_successfully').replace('{version}', detectedJavasForModal.versionLabel));
                                                                setDetectedJavasForModal(null);
                                                            }}
                                                            disabled={isSelected}
                                                            className="px-4 py-1.5 rounded-lg font-medium text-xs transition-colors whitespace-nowrap flex items-center justify-center gap-2 ml-auto"
                                                            style={{
                                                                backgroundColor: isSelected ? "transparent" : colors.surfaceContainerHighest,
                                                                color: isSelected ? colors.onSurfaceVariant : colors.onSurface,
                                                                border: isSelected ? `1px solid ${colors.outline}40` : "1px solid transparent",
                                                                opacity: isSelected ? 0.8 : 1
                                                            }}
                                                        >
                                                            <i className={`fa-solid ${isSelected ? "fa-check" : "fa-plus"}`}></i>
                                                            {isSelected ? "Selected" : "Select"}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-5 py-4 flex justify-end" style={{ backgroundColor: colors.surfaceContainer, borderTop: `1px solid ${colors.outline}40` }}>
                                <button
                                    onClick={() => { if (config.clickSoundEnabled) playClick(); setDetectedJavasForModal(null); }}
                                    className="px-5 py-2 rounded-xl text-sm font-medium transition-colors"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
