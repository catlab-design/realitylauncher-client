/**
 * CreateInstanceModal - Modal สำหรับสร้าง Instance ใหม่
 * ปรับปรุง UX: เพิ่มคำอธิบาย, tooltips, และ preview
 */

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import minecraftIcon from "../../../assets/minecraft.svg";
import fabricIcon from "../../../assets/fabric.svg";
import forgeIcon from "../../../assets/forge.svg";
import neoforgeIcon from "../../../assets/neoforge.svg";
import quiltIcon from "../../../assets/quilt.svg";

import { playClick } from "../../../lib/sounds";
import type { LauncherConfig } from "../../../types/launcher";

export interface CreateInstanceModalProps {
    colors: any;
    config?: LauncherConfig;
    onClose: () => void;
    onCreated: () => void;
}

// Loader info with descriptions
const LOADER_INFO: Record<string, { name: string; description: string; color: string }> = {
    vanilla: {
        name: "Vanilla",
        description: "Minecraft แท้ ไม่มี mod — เล่นได้ทันที",
        color: "#4CAF50"
    },
    fabric: {
        name: "Fabric",
        description: "เบา รวดเร็ว เหมาะกับ mod สมัยใหม่",
        color: "#DBD0AB"
    },
    forge: {
        name: "Forge",
        description: "ได้รับความนิยมมากที่สุด รองรับ mod จำนวนมาก",
        color: "#1E3A5F"
    },
    neoforge: {
        name: "NeoForge",
        description: "Forge เวอร์ชันใหม่ สำหรับ 1.20.1+",
        color: "#F97316"
    },
    quilt: {
        name: "Quilt",
        description: "ต่อยอดจาก Fabric รองรับ mod Fabric ได้",
        color: "#9B59B6"
    }
};

export function CreateInstanceModal({ colors, config, onClose, onCreated }: CreateInstanceModalProps) {
    const [name, setName] = useState("");
    const [minecraftVersion, setMinecraftVersion] = useState("");
    const [loader, setLoader] = useState<"vanilla" | "fabric" | "forge" | "neoforge" | "quilt">("vanilla");
    const [gameVersions, setGameVersions] = useState<{ version: string; version_type: string }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showAllVersions, setShowAllVersions] = useState(false);
    const [hoveredLoader, setHoveredLoader] = useState<string | null>(null);

    const handleSound = () => {
        if (config?.clickSoundEnabled) playClick();
    };

    // Loader Version State
    const [loaderVersion, setLoaderVersion] = useState<string | undefined>(undefined);
    const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
    const [loadingLoaderVersions, setLoadingLoaderVersions] = useState(false);

    // Fetch loader versions when loader or mc version changes
    useEffect(() => {
        if (loader === "vanilla") {
            setLoaderVersions([]);
            setLoaderVersion(undefined);
            return;
        }

        const fetchVersions = async () => {
            setLoadingLoaderVersions(true);
            try {
                if (window.api?.modrinthGetLoaderVersions) {
                    const versions = await window.api.modrinthGetLoaderVersions(loader, minecraftVersion);
                    setLoaderVersions(versions);
                    if (versions.length > 0) {
                        setLoaderVersion(versions[0]);
                    } else {
                        setLoaderVersion(undefined);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch loader versions:", error);
                setLoaderVersions([]);
            } finally {
                setLoadingLoaderVersions(false);
            }
        };

        fetchVersions();
    }, [loader, minecraftVersion]);

    useEffect(() => {
        loadGameVersions();
    }, []);

    const loadGameVersions = async () => {
        try {
            const versions = await window.api?.modrinthGetGameVersions?.();
            if (versions) {
                setGameVersions(versions);
                const latest = versions.find((v: { version: string; version_type: string }) => v.version_type === "release");
                if (latest) setMinecraftVersion(latest.version);
            }
        } catch (error) {
            console.error("[CreateInstance] Failed to load versions:", error);
        }
    };

    const handleCreate = async () => {
        if (!name.trim()) {
            toast.error("กรุณาใส่ชื่อ Instance");
            return;
        }
        if (!minecraftVersion) {
            toast.error("กรุณาเลือก Minecraft version");
            return;
        }

        setIsLoading(true);
        try {
            await window.api?.instancesCreate?.({
                name: name.trim(),
                minecraftVersion,
                loader,
                loaderVersion: loader === "vanilla" ? undefined : loaderVersion,
            });

            toast.success(`สร้าง ${name.trim()} เรียบร้อย`);
            onCreated();
        } catch (error) {
            toast.error("สร้าง Instance ไม่สำเร็จ");
        } finally {
            setIsLoading(false);
        }
    };

    const filteredVersions = showAllVersions
        ? gameVersions
        : gameVersions.filter((v) => v.version_type === "release");

    const loaders = [
        { id: "vanilla", icon: <img src={minecraftIcon.src} alt="Minecraft" className="w-6 h-6" /> },
        { id: "fabric", icon: <img src={fabricIcon.src} alt="Fabric" className="w-6 h-6" /> },
        { id: "forge", icon: <img src={forgeIcon.src} alt="Forge" className="w-6 h-6" /> },
        { id: "neoforge", icon: <img src={neoforgeIcon.src} alt="NeoForge" className="w-6 h-6" /> },
        { id: "quilt", icon: <img src={quiltIcon.src} alt="Quilt" className="w-6 h-6" /> },
    ];

    const currentLoaderInfo = LOADER_INFO[hoveredLoader || loader];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div
                className="w-full max-w-md rounded-2xl p-5 relative shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
                style={{ backgroundColor: colors.surface }}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20 transition-colors"
                    style={{ color: colors.onSurfaceVariant }}
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                </button>

                {/* Header */}
                <div className="mb-4">
                    <h2 className="text-lg font-bold" style={{ color: colors.onSurface }}>
                        ✨ สร้าง Instance ใหม่
                    </h2>
                    <p className="text-xs mt-0.5" style={{ color: colors.onSurfaceVariant }}>
                        Instance คือ Minecraft แยกเวอร์ชัน ใส่ mod แยกกันได้
                    </p>
                </div>

                {/* Name Input */}
                <div className="mb-5">
                    <label className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: colors.onSurfaceVariant }}>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                        </svg>
                        ชื่อ Instance
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="เช่น Survival World, Modded SMP"
                        className="w-full px-4 py-3 rounded-xl border transition-all focus:ring-2 focus:ring-offset-1"
                        style={{
                            backgroundColor: colors.surfaceContainer,
                            borderColor: colors.outline,
                            color: colors.onSurface,
                            outline: "none"
                        }}
                    />
                </div>

                {/* Minecraft Version */}
                <div className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-2 text-sm font-medium" style={{ color: colors.onSurfaceVariant }}>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                            </svg>
                            Minecraft Version
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: colors.onSurfaceVariant }}>
                            <input
                                type="checkbox"
                                checked={showAllVersions}
                                onChange={(e) => { handleSound(); setShowAllVersions(e.target.checked); }}
                                className="w-3.5 h-3.5 rounded"
                            />
                            รวม Snapshot
                        </label>
                    </div>
                    <select
                        value={minecraftVersion}
                        onChange={(e) => { handleSound(); setMinecraftVersion(e.target.value); }}
                        className="w-full px-4 py-3 rounded-xl border cursor-pointer"
                        style={{ backgroundColor: colors.surfaceContainer, borderColor: colors.outline, color: colors.onSurface }}
                    >
                        {filteredVersions.map((v) => (
                            <option key={v.version} value={v.version}>
                                {v.version} {v.version_type !== "release" ? `(${v.version_type})` : ""}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Loader Selection */}
                <div className="mb-5">
                    <label className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: colors.onSurfaceVariant }}>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 10H6v-2h8v2zm4-4H6v-2h12v2z" />
                        </svg>
                        Mod Loader
                        <span className="text-xs opacity-60">(เลือกเพื่อใส่ mod)</span>
                    </label>

                    <div className="grid grid-cols-5 gap-2 mb-3">
                        {loaders.map((l) => {
                            const info = LOADER_INFO[l.id];
                            const isSelected = loader === l.id;
                            return (
                                <button
                                    key={l.id}
                                    onClick={() => { handleSound(); setLoader(l.id as any); }}
                                    onMouseEnter={() => setHoveredLoader(l.id)}
                                    onMouseLeave={() => setHoveredLoader(null)}
                                    className="flex flex-col items-center py-3 px-1 rounded-xl text-center transition-all relative"
                                    style={{
                                        backgroundColor: isSelected ? colors.secondary : colors.surfaceContainerHighest,
                                        color: isSelected ? "#1a1a1a" : colors.onSurface,
                                        transform: isSelected ? "scale(1.05)" : "scale(1)",
                                        boxShadow: isSelected ? `0 4px 12px ${info.color}40` : "none",
                                    }}
                                >
                                    {l.icon}
                                    <div className="text-xs mt-1.5 font-medium">{info.name}</div>
                                    {isSelected && (
                                        <div
                                            className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                                            style={{ backgroundColor: info.color }}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Loader Description Box */}
                    <div
                        className="px-3 py-2 rounded-lg text-sm transition-all"
                        style={{
                            backgroundColor: colors.surfaceContainerHighest,
                            borderLeft: `3px solid ${currentLoaderInfo.color}`,
                        }}
                    >
                        <span style={{ color: colors.onSurface }}>{currentLoaderInfo.description}</span>
                    </div>
                </div>

                {/* Loader Version Selection (if not vanilla) */}
                {loader !== "vanilla" && (
                    <div className="mb-5">
                        <label className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: colors.onSurfaceVariant }}>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                            </svg>
                            Loader Version
                            {loadingLoaderVersions && (
                                <span className="text-xs opacity-60 animate-pulse">กำลังโหลด...</span>
                            )}
                        </label>
                        <select
                            value={loaderVersion || ""}
                            onChange={(e) => setLoaderVersion(e.target.value)}
                            disabled={loadingLoaderVersions}
                            className="w-full px-4 py-3 rounded-xl border cursor-pointer disabled:opacity-50"
                            style={{
                                backgroundColor: colors.surfaceContainer,
                                borderColor: colors.outline,
                                color: colors.onSurface
                            }}
                        >
                            {loadingLoaderVersions && <option>กำลังโหลด...</option>}
                            {!loadingLoaderVersions && loaderVersions.length === 0 && (
                                <option value="">ไม่พบ version สำหรับ MC {minecraftVersion}</option>
                            )}
                            {loaderVersions.map((v) => (
                                <option key={v} value={v}>{v}</option>
                            ))}
                        </select>
                        {!loadingLoaderVersions && loaderVersions.length === 0 && (
                            <p className="text-xs mt-1.5 text-amber-500">
                                💡 ลองเปลี่ยน Minecraft version หรือใช้ loader อื่น
                            </p>
                        )}
                    </div>
                )}



                {/* Create Button */}
                <button
                    onClick={() => { handleSound(); handleCreate(); }}
                    disabled={isLoading || !name.trim() || (loader !== "vanilla" && !loaderVersion && loaderVersions.length > 0)}
                    className="w-full py-3.5 rounded-xl font-medium transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                >
                    {isLoading ? (
                        <>
                            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                            </svg>
                            กำลังสร้าง...
                        </>
                    ) : (
                        <>
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                            </svg>
                            สร้าง Instance
                        </>
                    )}
                </button>

                {/* Help Text */}
                <p className="text-xs text-center mt-3" style={{ color: colors.onSurfaceVariant }}>
                    สร้างแล้วสามารถเพิ่ม mod, resource pack, shader ได้ภายหลัง
                </p>
            </div>
        </div>
    );
}
