import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { playClick } from "../../../lib/sounds";
import type { LauncherConfig } from "../../../types/launcher";
import type { SettingsTabProps } from "./AccountTab";

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
                <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>ตำแหน่งติดตั้ง Java {label}</p>
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
                                    toast.success(`ติดตั้ง Java ${label} สำเร็จ`);
                                } else {
                                    toast.error(result?.error || "ติดตั้ง Java ล้มเหลว");
                                }
                            } catch { toast.error("ติดตั้ง Java ล้มเหลว"); }
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
                        {isInstallingThis ? (progressForThis?.message?.substring(0, 20) || "กำลังติดตั้ง...") : "ติดตั้ง (Install)"}
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
                                    toast.success(`พบ Java ${label}: ${java.path}`);
                                } else {
                                    toast.error(`ไม่พบ Java ${label} ในระบบ`);
                                }
                            } catch { toast.error("ค้นหา Java ล้มเหลว"); }
                            finally { setIsDetectingJava(false); }
                        }}
                        disabled={isDetectingJava}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    >
                        <i className="fa-solid fa-magnifying-glass"></i>
                        ค้นหา (Detect)
                    </button>
                    <button
                        onClick={async () => {
                            if (config.clickSoundEnabled) playClick();
                            const path = await windowApi?.browseJava?.();
                            if (path) {
                                updateConfig({ javaPaths: { ...config.javaPaths, [pathKey]: path } });
                                toast.success(`ตั้งค่า Java ${label} เรียบร้อย`);
                            }
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    >
                        <i className="fa-solid fa-folder-open"></i>
                        เลือกไฟล์ (Browse)
                    </button>
                    <button
                        onClick={async () => {
                            if (config.clickSoundEnabled) playClick();
                            const path = config.javaPaths?.[pathKey];
                            if (!path || path === "/path/to/java") {
                                toast.error(`ยังไม่ได้ตั้งค่า Java ${label}`);
                                return;
                            }
                            setTestingJavaPath(path);
                            try {
                                const result = await windowApi?.testJavaExecution?.(path);
                                if (result?.ok) {
                                    toast.success(`Java ทำงานได้ปกติ${result.version ? ` (v${result.version})` : ""}`);
                                } else {
                                    toast.error(result?.error || "Java ไม่สามารถใช้งานได้");
                                }
                            } catch { toast.error("ทดสอบ Java ล้มเหลว"); }
                            finally { setTestingJavaPath(null); }
                        }}
                        disabled={testingJavaPath === config.javaPaths?.[pathKey]}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                    >
                        <i className={`fa-solid ${testingJavaPath === config.javaPaths?.[pathKey] ? "fa-spinner fa-spin" : "fa-play"}`}></i>
                        ทดสอบ (Test)
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
                                    toast.success(`ลบ Java ${label} เรียบร้อย`);
                                } catch {
                                    toast.error(`ลบ Java ${label} ล้มเหลว`);
                                } finally {
                                    setDeletingJava(null);
                                }
                            }}
                            disabled={deletingJava === version}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                            style={{ backgroundColor: "#ef444420", color: "#ef4444" }}
                        >
                            <i className={`fa-solid ${deletingJava === version ? "fa-spinner fa-spin" : "fa-trash"}`}></i>
                            {deletingJava === version ? "กำลังลบ..." : "ล้างค่า (Clear)"}
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
                <h3 className="font-medium" style={{ color: colors.onSurface }}>การจัดการเวอร์ชัน Java</h3>
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
