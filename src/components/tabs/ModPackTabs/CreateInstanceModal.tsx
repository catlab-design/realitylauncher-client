/**
 * CreateInstanceModal - Modal สำหรับสร้าง Instance ใหม่
 * ปรับปรุง UX: เพิ่มคำอธิบาย, tooltips, และ preview
 */

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Icons } from "../../ui/Icons";
import minecraftIcon from "../../../assets/minecraft.svg";
import fabricIcon from "../../../assets/fabric.svg";
import forgeIcon from "../../../assets/forge.svg";
import neoforgeIcon from "../../../assets/neoforge.svg";
import quiltIcon from "../../../assets/quilt.svg";

import { playClick } from "../../../lib/sounds";
import { useTranslation } from "../../../hooks/useTranslation";
import type { LauncherConfig } from "../../../types/launcher";
import { Portal } from "../../ui/Portal";

export interface CreateInstanceModalProps {
    colors: any;
    config?: LauncherConfig;
    onClose: () => void;
    onCreated: () => void;
    language: "th" | "en";
}

// NOTE: LOADER_INFO uses translations, so build inside component using `t()`

export function CreateInstanceModal({ colors, config, onClose, onCreated, language }: CreateInstanceModalProps) {
    const { t } = useTranslation(language);
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
            toast.error(t('please_enter_instance_name'));
            return;
        }
        if (!minecraftVersion) {
            toast.error(t('please_select_mc_version'));
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

            toast.success(t('instance_created_success'));
            onCreated();
        } catch (error) {
            toast.error(t('error_occurred'));
        } finally {
            setIsLoading(false);
        }
    };

    const filteredVersions = showAllVersions
        ? gameVersions
        : gameVersions.filter((v) => v.version_type === "release");

    // Loader info with descriptions (use translations)
    const LOADER_INFO: Record<string, { name: string; description: string; color: string }> = {
        vanilla: { name: t('vanilla'), description: t('vanilla_desc'), color: "#4CAF50" },
        fabric: { name: t('fabric'), description: t('fabric_desc'), color: "#DBD0AB" },
        forge: { name: t('forge'), description: t('forge_desc'), color: "#1E3A5F" },
        neoforge: { name: t('neoforge'), description: t('neoforge_desc'), color: "#F97316" },
        quilt: { name: t('quilt'), description: t('quilt_desc'), color: "#9B59B6" },
    };

    const loaders = [
        { id: "vanilla", icon: <img src={minecraftIcon.src} alt={t('vanilla')} className="w-6 h-6" /> },
        { id: "fabric", icon: <img src={fabricIcon.src} alt={t('fabric')} className="w-6 h-6" /> },
        { id: "forge", icon: <img src={forgeIcon.src} alt={t('forge')} className="w-6 h-6" /> },
        { id: "neoforge", icon: <img src={neoforgeIcon.src} alt={t('neoforge')} className="w-6 h-6" /> },
        { id: "quilt", icon: <img src={quiltIcon.src} alt={t('quilt')} className="w-6 h-6" /> },
    ];

    const currentLoaderInfo = LOADER_INFO[hoveredLoader || loader];

    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div
                    className="w-[80%] max-w-4xl rounded-2xl p-8 relative shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
                    style={{ backgroundColor: colors.surface }}
                >
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:bg-gray-500/20 active:scale-90"
                        style={{ color: colors.onSurfaceVariant }}
                        title="Close"
                    >
                        <Icons.Close className="w-5 h-5" />
                    </button>

                    {/* Header */}
                    <div className="mb-6">
                        <h2 className="text-xl font-bold" style={{ color: colors.onSurface }}>
                            {t('create_new_instance_title')}
                        </h2>
                        <p className="text-sm mt-1" style={{ color: colors.onSurfaceVariant }}>
                            {t('instance_desc')}
                        </p>
                    </div>

                    {/* Name Input */}
                    <div className="mb-6">
                        <label className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: colors.onSurfaceVariant }}>
                            <Icons.Edit className="w-4 h-4" />
                            {t('instance_name')}
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t('instance_name_placeholder')}
                            className="w-full px-4 py-4 rounded-xl border transition-all focus:ring-2 focus:ring-offset-2 outline-none"
                            style={{
                                backgroundColor: colors.surfaceContainer,
                                borderColor: colors.outline,
                                color: colors.onSurface,
                            }}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {/* Minecraft Version */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: colors.onSurfaceVariant }}>
                                    <Icons.Compass className="w-4 h-4" />
                                    {t('minecraft_version_label')}
                                </label>
                                <label className="flex items-center gap-2 text-xs cursor-pointer select-none transition-opacity hover:opacity-100 opacity-70" style={{ color: colors.onSurfaceVariant }}>
                                    <input
                                        type="checkbox"
                                        checked={showAllVersions}
                                        onChange={(e) => { handleSound(); setShowAllVersions(e.target.checked); }}
                                        className="w-4 h-4 rounded-md accent-primary"
                                    />
                                    {t('include_snapshots')}
                                </label>
                            </div>
                            <select
                                value={minecraftVersion}
                                onChange={(e) => { handleSound(); setMinecraftVersion(e.target.value); }}
                                className="w-full px-4 py-3.5 rounded-xl border cursor-pointer transition-colors focus:border-primary outline-none"
                                style={{ backgroundColor: colors.surfaceContainer, borderColor: colors.outline, color: colors.onSurface }}
                            >
                                {filteredVersions.map((v) => (
                                    <option key={v.version} value={v.version}>
                                        {v.version} {v.version_type !== "release" ? `(${v.version_type})` : ""}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Loader Version Selection (if not vanilla) */}
                        {loader !== "vanilla" && (
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: colors.onSurfaceVariant }}>
                                    <Icons.Terminal className="w-4 h-4" />
                                    {t('loader_version')}
                                    {loadingLoaderVersions && (
                                        <span className="text-xs opacity-60 animate-pulse">{t('loading')}</span>
                                    )}
                                </label>
                                <select
                                    value={loaderVersion || ""}
                                    onChange={(e) => setLoaderVersion(e.target.value)}
                                    disabled={loadingLoaderVersions}
                                    className="w-full px-4 py-3.5 rounded-xl border cursor-pointer disabled:opacity-50 transition-colors focus:border-primary outline-none"
                                    style={{
                                        backgroundColor: colors.surfaceContainer,
                                        borderColor: colors.outline,
                                        color: colors.onSurface
                                    }}
                                >
                                    {loadingLoaderVersions && <option>{t('loading')}</option>}
                                    {!loadingLoaderVersions && loaderVersions.length === 0 && (
                                        <option value="">{t('no_loader_version_found')} {minecraftVersion}</option>
                                    )}
                                    {loaderVersions.map((v) => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Loader Selection */}
                    <div className="mb-8">
                        <label className="flex items-center gap-2 text-sm font-semibold mb-4" style={{ color: colors.onSurfaceVariant }}>
                            <Icons.Box className="w-4 h-4" />
                            {t('mod_loader')}
                            <span className="text-xs font-normal opacity-60">({t('select_to_add_mods')})</span>
                        </label>

                        <div className="grid grid-cols-5 gap-3 mb-4">
                            {loaders.map((l) => {
                                const info = LOADER_INFO[l.id];
                                const isSelected = loader === l.id;
                                return (
                                    <button
                                        key={l.id}
                                        onClick={() => { handleSound(); setLoader(l.id as any); }}
                                        onMouseEnter={() => setHoveredLoader(l.id)}
                                        onMouseLeave={() => setHoveredLoader(null)}
                                        className="flex flex-col items-center py-4 px-2 rounded-2xl text-center transition-all relative border-2"
                                        style={{
                                            backgroundColor: isSelected ? colors.secondary + "15" : colors.surfaceContainer,
                                            borderColor: isSelected ? colors.secondary : "transparent",
                                            color: isSelected ? colors.onSurface : colors.onSurfaceVariant,
                                            transform: isSelected ? "translateY(-4px)" : "none",
                                            boxShadow: isSelected ? `0 12px 24px ${colors.secondary}20` : "none",
                                        }}
                                    >
                                        <div className="w-10 h-10 mb-2 flex items-center justify-center">
                                            {l.icon}
                                        </div>
                                        <div className="text-xs font-bold uppercase tracking-wider">{info.name}</div>
                                        {isSelected && (
                                            <div
                                                className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 rounded-full"
                                                style={{ backgroundColor: colors.secondary }}
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Loader Description Box */}
                        <div
                            className="px-4 py-3 rounded-xl text-sm transition-all border shadow-sm"
                            style={{
                                backgroundColor: colors.surfaceContainerLow,
                                borderColor: colors.outlineVariant,
                                borderLeft: `4px solid ${currentLoaderInfo.color}`,
                            }}
                        >
                            <span className="font-medium" style={{ color: colors.onSurface }}>{currentLoaderInfo.name}: </span>
                            <span style={{ color: colors.onSurfaceVariant }}>{currentLoaderInfo.description}</span>
                        </div>
                    </div>

                    {/* Create Button */}
                    <button
                        onClick={() => { handleSound(); handleCreate(); }}
                        disabled={isLoading || !name.trim() || (loader !== "vanilla" && !loaderVersion && loaderVersions.length > 0)}
                        className="w-full py-4 rounded-2xl font-bold text-lg transition-all shadow-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                        style={{ 
                            backgroundColor: colors.secondary, 
                            color: "#1a1a1a",
                            boxShadow: `0 8px 30px ${colors.secondary}40`
                        }}
                    >
                        {isLoading ? (
                            <>
                                <Icons.Refresh className="w-6 h-6 animate-spin text-black/60" />
                                {t('creating_dot')}
                            </>
                        ) : (
                            <>
                                <Icons.Add className="w-6 h-6" />
                                {t('create_instance')}
                            </>
                        )}
                    </button>

                    {/* Help Text */}
                    <p className="text-xs text-center mt-4 opacity-50" style={{ color: colors.onSurfaceVariant }}>
                        {t('create_instance_footer')}
                    </p>
                </div>
            </div>
        </Portal>
    );
}
