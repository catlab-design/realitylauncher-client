import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import type { LauncherConfig } from "../../../types/launcher";
import type { SettingsTabProps } from "./AccountTab";

export interface GameTabProps extends SettingsTabProps {
    handleBrowseJava: () => void;
    handleBrowseMinecraftDir: () => void;
}

export function GameTab({ config, updateConfig, colors, handleBrowseJava, handleBrowseMinecraftDir }: GameTabProps) {
    const [maxRamMB, setMaxRamMB] = useState(8192);
    const [systemRamMB, setSystemRamMB] = useState(0);
    const [isDetectingJava, setIsDetectingJava] = useState(false);

    useEffect(() => {
        (async () => {
            const maxRam = await (window as any).api?.getMaxRam?.();
            const systemRam = await (window as any).api?.getSystemRam?.();
            if (maxRam) setMaxRamMB(maxRam);
            if (systemRam) setSystemRamMB(systemRam);
        })();
    }, []);

    const handleAutoDetectJava = async () => {
        setIsDetectingJava(true);
        try {
            const javaPath = await (window as any).api?.autoDetectJava?.();
            if (javaPath) {
                updateConfig({ javaPath });
                toast.success(`พบ Java: ${javaPath}`);
            } else {
                toast.error("ไม่พบ Java ในระบบ กรุณาติดตั้ง Java 17 ขึ้นไป");
            }
        } catch {
            toast.error("ค้นหา Java ไม่สำเร็จ");
        } finally {
            setIsDetectingJava(false);
        }
    };

    return (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
            <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                <i className="fa-solid fa-gamepad text-lg" style={{ color: colors.secondary }}></i>
                <h3 className="font-medium" style={{ color: colors.onSurface }}>เกมและประสิทธิภาพ</h3>
            </div>
            <div className="p-4 space-y-4">
                {/* RAM */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-sm" style={{ color: colors.onSurface }}>Memory allocated</p>
                        <input
                            type="number"
                            value={config.ramMB}
                            onChange={(e) => updateConfig({ ramMB: Math.min(Math.max(512, Number(e.target.value)), maxRamMB) })}
                            className="w-20 px-2 py-1 rounded-lg text-sm text-right"
                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface, border: 'none' }}
                        />
                    </div>
                    <p className="text-xs mb-3" style={{ color: colors.onSurfaceVariant }}>
                        หน่วยความจำที่จะใช้เมื่อเปิดเกม (ระบบมี {(systemRamMB / 1024).toFixed(0)} GB)
                    </p>
                    <input
                        type="range"
                        min={512}
                        max={maxRamMB}
                        step={256}
                        value={config.ramMB}
                        onChange={(e) => updateConfig({ ramMB: Number(e.target.value) })}
                        className="w-full"
                        style={{ accentColor: colors.secondary }}
                    />
                    <div className="flex justify-between text-xs mt-1" style={{ color: colors.onSurfaceVariant }}>
                        <span>512 MB</span>
                        <span>{maxRamMB} MB</span>
                    </div>
                </div>

                <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                {/* Minecraft Directory */}
                <div>
                    <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>โฟลเดอร์เกม (.minecraft)</p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={config.minecraftDir || "ใช้ค่าเริ่มต้น"}
                            readOnly
                            className="flex-1 px-4 py-2.5 rounded-xl border text-sm"
                            style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }}
                        />
                        <button
                            onClick={handleBrowseMinecraftDir}
                            className="px-4 py-2.5 rounded-xl text-sm font-medium"
                            style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                        >
                            เลือก
                        </button>
                    </div>
                </div>

                <div className="h-px" style={{ backgroundColor: colors.outline + "30" }} />

                {/* Java Arguments */}
                <div>
                    <p className="font-medium text-sm mb-2" style={{ color: colors.onSurface }}>Java Arguments</p>
                    <p className="text-xs mb-2" style={{ color: colors.onSurfaceVariant }}>
                        เพิ่ม JVM arguments สำหรับ Minecraft (เช่น -XX:+UseG1GC)
                    </p>
                    <input
                        type="text"
                        value={config.javaArguments}
                        onChange={(e) => updateConfig({ javaArguments: e.target.value })}
                        placeholder="เพิ่ม Java arguments..."
                        className="w-full px-4 py-2.5 rounded-xl border text-sm"
                        style={{ borderColor: colors.outline, backgroundColor: colors.surface, color: colors.onSurface }}
                    />
                </div>
            </div>
        </div>
    );
}
