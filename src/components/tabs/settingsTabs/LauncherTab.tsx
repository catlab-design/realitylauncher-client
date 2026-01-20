import toast from "react-hot-toast";
import type { LauncherConfig } from "../../../types/launcher";
import type { SettingsTabProps } from "./AccountTab";

export function LauncherTab({ config, updateConfig, colors }: SettingsTabProps) {
    const windowApi = (window as any).api;

    return (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
            <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                <i className="fa-solid fa-rocket text-lg" style={{ color: colors.secondary }}></i>
                <h3 className="font-medium" style={{ color: colors.onSurface }}>Launcher</h3>
            </div>
            <div className="p-4 space-y-4">
                {/* Fullscreen Toggle */}
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-sm" style={{ color: colors.onSurface }}>เต็มหน้าจอ (Fullscreen)</p>
                        <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>ขยายหน้าต่าง Launcher เต็มจอ</p>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer">
                        <button
                            onClick={async () => {
                                if (!windowApi) {
                                    toast.error("ฟีเจอร์นี้ต้องใช้ใน Electron App");
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

                {/* Window Size */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>ขนาดหน้าต่างเกม</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>กำหนดขนาดหน้าต่างเมื่อเปิดเกม</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>อัตโนมัติ</span>
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
                                <label className="text-xs mb-1 block" style={{ color: colors.onSurfaceVariant }}>กว้าง (px)</label>
                                <input
                                    type="number"
                                    value={config.windowWidth}
                                    onChange={(e) => updateConfig({ windowWidth: Number(e.target.value) })}
                                    className="w-full px-4 py-2.5 rounded-xl border text-sm"
                                    style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }}
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs mb-1 block" style={{ color: colors.onSurfaceVariant }}>สูง (px)</label>
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

                {/* Close on Launch */}
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-sm" style={{ color: colors.onSurface }}>ปิด Launcher เมื่อเปิดเกม</p>
                        <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>ปิดหน้าต่าง Launcher อัตโนมัติหลังเริ่มเกม</p>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer">
                        <button
                            onClick={() => updateConfig({ closeOnLaunch: !config.closeOnLaunch })}
                            className="relative w-11 h-6 rounded-full transition-all duration-300 shadow-inner"
                            style={{ backgroundColor: config.closeOnLaunch ? colors.secondary : colors.outline + "40" }}
                        >
                            <div
                                className="absolute left-[2px] top-[2px] w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300"
                                style={{ transform: config.closeOnLaunch ? "translateX(20px)" : "translateX(0)" }}
                            />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
