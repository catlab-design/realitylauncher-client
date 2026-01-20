import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import type { LauncherConfig } from "../../../types/launcher";
import type { SettingsTabProps } from "./AccountTab";
import rIcon from "../../../assets/r.svg";

export function UpdateTab({ config, updateConfig, colors }: SettingsTabProps) {
    const [appVersion, setAppVersion] = useState<string>("0.0.0");
    const [isDevMode, setIsDevMode] = useState<boolean>(false);
    type UpdateStatusType = "idle" | "checking" | "available" | "downloading" | "ready";
    const [updateStatus, setUpdateStatus] = useState<UpdateStatusType>("idle");
    const [updateInfo, setUpdateInfo] = useState<{ version: string; releaseDate: string } | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<number>(0);

    const windowApi = (window as any).api;

    useEffect(() => {
        (async () => {
            const version = await windowApi?.getAppVersion?.();
            const devMode = await windowApi?.isDevMode?.();
            if (version) setAppVersion(version);
            if (devMode !== undefined) setIsDevMode(devMode);
        })();

        const cleanups: (() => void)[] = [];

        if (windowApi?.onUpdateAvailable) {
            cleanups.push(windowApi.onUpdateAvailable((data: { version: string; releaseDate: string }) => {
                setUpdateInfo(data);
                setUpdateStatus("available");
            }));
        }
        if (windowApi?.onUpdateProgress) {
            cleanups.push(windowApi.onUpdateProgress((data: { percent: number }) => {
                setDownloadProgress(data.percent);
                setUpdateStatus("downloading");
            }));
        }
        if (windowApi?.onUpdateDownloaded) {
            cleanups.push(windowApi.onUpdateDownloaded((data: { version: string; releaseDate: string }) => {
                setUpdateInfo(data);
                setUpdateStatus("ready");
            }));
        }
        if (windowApi?.onUpdateNotAvailable) {
            cleanups.push(windowApi.onUpdateNotAvailable(() => {
                setUpdateStatus("idle");
            }));
        }

        return () => cleanups.forEach(fn => fn());
    }, []);

    return (
        <>
            {/* Version Info Card */}
            <div
                className="rounded-lg overflow-hidden"
                style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.outline}30` }}
            >
                <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "30" }}>
                    <i className="fa-solid fa-download" style={{ color: colors.secondary }}></i>
                    <span className="font-medium text-sm" style={{ color: colors.onSurface }}>อัปเดต Launcher</span>
                </div>
                <div className="p-4">
                    <div className="flex items-center gap-4">
                        <div
                            className="w-12 h-12 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: colors.secondary }}
                        >
                            <img src={rIcon.src} alt="Reality" className="w-7 h-7 object-contain" />
                        </div>
                        <div className="flex-1">
                            <p className="font-semibold text-sm" style={{ color: colors.onSurface }}>Reality Launcher</p>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>v{appVersion}</span>
                                <span
                                    className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                    style={{
                                        backgroundColor: isDevMode ? "#f9731620" : "#22c55e20",
                                        color: isDevMode ? "#f97316" : "#22c55e"
                                    }}
                                >
                                    {isDevMode ? "Dev" : "Stable"}
                                </span>
                            </div>
                        </div>
                        <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: updateStatus === "available" ? "#f59e0b" : "#22c55e" }}
                            title={updateStatus === "available" ? "มีอัปเดตใหม่" : "เวอร์ชันล่าสุด"}
                        />
                    </div>
                </div>
            </div>

            {/* Dev Mode Warning */}
            {isDevMode && (
                <div
                    className="rounded-md p-3 flex items-center gap-3 mt-3"
                    style={{ backgroundColor: "#f9731610", border: "1px solid #f9731630" }}
                >
                    <i className="fa-solid fa-flask text-sm" style={{ color: "#f97316" }}></i>
                    <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                        ระบบอัปเดตถูกปิดใช้งานในโหมด Development
                    </span>
                </div>
            )}

            {/* Update Available */}
            {updateStatus === "available" && updateInfo && (
                <div
                    className="rounded-lg p-4 mt-3"
                    style={{ backgroundColor: colors.surfaceContainer, border: `1px solid ${colors.secondary}50` }}
                >
                    <div className="flex items-center gap-3 mb-3">
                        <i className="fa-solid fa-arrow-up" style={{ color: colors.secondary }}></i>
                        <div className="flex-1">
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>มีอัปเดตใหม่</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>เวอร์ชัน {updateInfo.version}</p>
                        </div>
                    </div>
                    <button
                        onClick={async () => {
                            try {
                                await windowApi?.downloadUpdate?.();
                                toast.success("กำลังดาวน์โหลดอัปเดต...");
                            } catch (error) {
                                toast.error("ไม่สามารถดาวน์โหลดอัปเดตได้");
                            }
                        }}
                        className="w-full py-2 rounded-md text-sm font-medium"
                        style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                    >
                        <i className="fa-solid fa-download mr-2 text-xs"></i>
                        ดาวน์โหลด
                    </button>
                </div>
            )}

            {/* Downloading */}
            {updateStatus === "downloading" && (
                <div
                    className="rounded-lg p-4 mt-3"
                    style={{ backgroundColor: colors.surfaceContainer }}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <i className="fa-solid fa-spinner fa-spin text-sm" style={{ color: colors.secondary }}></i>
                        <span className="font-medium text-sm" style={{ color: colors.onSurface }}>กำลังดาวน์โหลด...</span>
                        <span className="ml-auto text-sm font-medium" style={{ color: colors.secondary }}>{downloadProgress.toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                        <div
                            className="h-full transition-all duration-300"
                            style={{ width: `${downloadProgress}%`, backgroundColor: colors.secondary }}
                        />
                    </div>
                </div>
            )}

            {/* Ready to Install */}
            {updateStatus === "ready" && updateInfo && (
                <div
                    className="rounded-lg p-4 mt-3"
                    style={{ backgroundColor: colors.surfaceContainer, border: "1px solid #22c55e50" }}
                >
                    <div className="flex items-center gap-3 mb-3">
                        <i className="fa-solid fa-check" style={{ color: "#22c55e" }}></i>
                        <div className="flex-1">
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>พร้อมติดตั้ง</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>เวอร์ชัน {updateInfo.version}</p>
                        </div>
                    </div>
                    <button
                        onClick={async () => {
                            try {
                                await windowApi?.installUpdate?.();
                            } catch (error) {
                                toast.error("ไม่สามารถติดตั้งอัปเดตได้");
                            }
                        }}
                        className="w-full py-2 rounded-md text-sm font-medium"
                        style={{ backgroundColor: "#22c55e", color: "#fff" }}
                    >
                        <i className="fa-solid fa-play mr-2 text-xs"></i>
                        ติดตั้งและรีสตาร์ท
                    </button>
                </div>
            )}

            {/* Update Settings */}
            <div className="rounded-lg overflow-hidden mt-3" style={{ backgroundColor: colors.surfaceContainer }}>
                <div className="p-4 space-y-4">
                    {/* Auto Update Toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>อัปเดตอัตโนมัติ</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>ตรวจสอบและดาวน์โหลดอัปเดตใหม่อัตโนมัติ</p>
                        </div>
                        <button
                            onClick={() => {
                                const newValue = !config.autoUpdateEnabled;
                                updateConfig({ autoUpdateEnabled: newValue });
                                toast.success(newValue ? "เปิดอัปเดตอัตโนมัติ" : "ปิดอัปเดตอัตโนมัติ");
                            }}
                            className="relative w-10 h-5 rounded-full transition-colors"
                            style={{ backgroundColor: config.autoUpdateEnabled ? colors.secondary : colors.surfaceContainerHighest }}
                        >
                            <div
                                className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm"
                                style={{ left: config.autoUpdateEnabled ? "calc(100% - 18px)" : "2px" }}
                            />
                        </button>
                    </div>

                    <div className="h-px" style={{ backgroundColor: colors.outline + "20" }} />

                    {/* Manual Check */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>ตรวจสอบอัปเดต</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>ค้นหาเวอร์ชันใหม่ด้วยตนเอง</p>
                        </div>
                        <button
                            onClick={async () => {
                                if (updateStatus === "checking") return;

                                if (isDevMode) {
                                    toast("ไม่สามารถตรวจสอบในโหมด Dev ได้", { icon: "⚠️" });
                                    return;
                                }

                                setUpdateStatus("checking");
                                toast.loading("กำลังตรวจสอบ...", { id: "check-update" });
                                try {
                                    await windowApi?.checkForUpdates?.();
                                    setTimeout(() => {
                                        if ((updateStatus as string) === "checking") {
                                            setUpdateStatus("idle");
                                            toast.success("เวอร์ชันล่าสุดแล้ว", { id: "check-update" });
                                        } else {
                                            toast.dismiss("check-update");
                                        }
                                    }, 3000);
                                } catch (error) {
                                    setUpdateStatus("idle");
                                    toast.error("ตรวจสอบไม่สำเร็จ", { id: "check-update" });
                                }
                            }}
                            disabled={updateStatus === "checking" || isDevMode}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                        >
                            <i className={`fa-solid ${updateStatus === "checking" ? "fa-spinner fa-spin" : "fa-sync"} text-[10px]`}></i>
                            {updateStatus === "checking" ? "กำลังตรวจสอบ..." : "ตรวจสอบ"}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
