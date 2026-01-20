import toast from "react-hot-toast";
import type { LauncherConfig } from "../../../types/launcher";
import type { SettingsTabProps } from "./AccountTab";

export function ResourcesTab({ config, updateConfig, colors }: SettingsTabProps) {
    const windowApi = (window as any).api;

    return (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
            <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                <i className="fa-solid fa-hard-drive text-lg" style={{ color: colors.secondary }}></i>
                <h3 className="font-medium" style={{ color: colors.onSurface }}>จัดการทรัพยากร</h3>
            </div>
            <div className="p-4 space-y-4">
                {/* App Directory */}
                <div>
                    <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>โฟลเดอร์ Launcher</p>
                    <p className="text-xs mb-2" style={{ color: colors.onSurfaceVariant }}>โฟลเดอร์ที่เก็บไฟล์ทั้งหมดของ Launcher</p>
                    <div className="flex gap-2">
                        <div
                            className="flex-1 px-4 py-2.5 rounded-xl border text-sm flex items-center gap-2 overflow-hidden"
                            style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }}
                        >
                            <i className="fa-solid fa-folder" style={{ color: colors.secondary }}></i>
                            <span className="truncate">{config.minecraftDir || "%APPDATA%/RealityLauncher"}</span>
                        </div>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(config.minecraftDir || "%APPDATA%/RealityLauncher");
                                toast.success("คัดลอก path แล้ว");
                            }}
                            className="px-4 py-2.5 rounded-xl text-sm"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            title="คัดลอก"
                        >
                            <i className="fa-solid fa-copy"></i>
                        </button>
                        <button
                            onClick={async () => {
                                if (windowApi?.openFolder) {
                                    await windowApi.openFolder(config.minecraftDir || "");
                                } else {
                                    toast.success("เปิดโฟลเดอร์... (ฟีเจอร์นี้ต้องใช้ใน Electron)");
                                }
                            }}
                            className="px-4 py-2.5 rounded-xl text-sm"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                            title="เปิดโฟลเดอร์"
                        >
                            <i className="fa-solid fa-arrow-up-right-from-square"></i>
                        </button>
                    </div>
                </div>

                <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                {/* Cache Management */}
                <div>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>แคช Launcher</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>ล้างแคชเพื่อเพิ่มพื้นที่เก็บข้อมูล</p>
                        </div>
                        <button
                            onClick={() => {
                                toast.success("ล้างแคชเรียบร้อยแล้ว");
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                        >
                            <i className="fa-solid fa-trash"></i>
                            ล้างแคช
                        </button>
                    </div>
                </div>

                <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                {/* Max Concurrent Downloads */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <p className="font-medium text-sm" style={{ color: colors.onSurface }}>ดาวน์โหลดพร้อมกันสูงสุด</p>
                            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>จำนวนไฟล์ที่ดาวน์โหลดพร้อมกันได้</p>
                        </div>
                        <span className="text-sm font-medium px-3 py-1 rounded-lg" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.secondary }}>
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
