import toast from "react-hot-toast";
import type { LauncherConfig } from "../../../types/launcher";
import type { SettingsTabProps } from "./AccountTab";
import { Icons } from "../../ui/Icons";

export function ConnectionsTab({ config, updateConfig, colors }: SettingsTabProps) {
    const windowApi = (window as any).api;

    return (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
            <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                <i className="fa-solid fa-wifi text-lg" style={{ color: colors.secondary }}></i>
                <h3 className="font-medium" style={{ color: colors.onSurface }}>การเชื่อมต่อ</h3>
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
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>Discord Rich Presence</p>
                            <p className="text-xs" style={{ color: config.discordRPCEnabled ? "#22c55e" : colors.onSurfaceVariant }}>
                                {config.discordRPCEnabled ? "กำลังแสดงสถานะ" : "ปิดอยู่"}
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
                                    toast.success("เปิด Discord Rich Presence");
                                } else {
                                    toast.success("ปิด Discord Rich Presence");
                                }
                            }}
                            className="relative w-11 h-6 bg-black/20 rounded-full transition-all duration-300 shadow-inner"
                            style={{ backgroundColor: config.discordRPCEnabled ? colors.secondary : undefined }}
                        >
                            <div
                                className="absolute left-[2px] top-[2px] w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300"
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
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>Telemetry</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                                เก็บข้อมูลการใช้งานเพื่อปรับปรุง Launcher
                            </p>
                        </div>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer">
                        <button
                            onClick={() => {
                                const newValue = !config.telemetryEnabled;
                                updateConfig({ telemetryEnabled: newValue });
                                toast.success(newValue ? "เปิด Telemetry" : "ปิด Telemetry");
                            }}
                            className="relative w-11 h-6 bg-black/20 rounded-full transition-all duration-300 shadow-inner"
                            style={{ backgroundColor: config.telemetryEnabled ? colors.secondary : undefined }}
                        >
                            <div
                                className="absolute left-[2px] top-[2px] w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300"
                                style={{ transform: config.telemetryEnabled ? "translateX(20px)" : "translateX(0)" }}
                            />
                        </button>
                    </div>
                </div>

                <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                {/* Download Speed */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-sm" style={{ color: colors.onSurface }}>จำกัดความเร็วดาวน์โหลด</p>
                        <span className="text-sm font-medium px-3 py-1 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.secondary }}>
                            {config.downloadSpeedLimit === 0 ? "ไม่จำกัด" : `${config.downloadSpeedLimit} MB/s`}
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
                        <span>ไม่จำกัด</span>
                        <span>100 MB/s</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
