import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Icons } from "../../ui/Icons";
import type { GameInstance } from "../../../types/launcher";
import { playClick } from "../../../lib/sounds";
import { useTranslation } from "../../../hooks/useTranslation";
import { AnimatePresence, motion } from "framer-motion";
import { Portal } from "../../ui/Portal";
import { useMotionPreset } from "../../../lib/motion";
import { SettingsSection, SettingsRow, Toggle, fieldClass, fieldStyle, buttonClass, buttonStyle } from "../settingsTabs/SettingsUI";
import { RamSlider, RamPresetChips, RAM_PRESETS, formatRam, recommendedRamFor } from "../settingsTabs/RamSlider";

import modrinthIcon from "../../../assets/modrinth.svg";
import curseforgeIcon from "../../../assets/curseforge.svg";
import type { LauncherConfig } from "../../../types/launcher";

type SettingsTab = "general" | "installation" | "java";
type LoaderType = "vanilla" | "fabric" | "forge" | "neoforge" | "quilt";

export interface InstanceSettingsModalProps {
    colors: any;
    instance: GameInstance;
    onClose: () => void;
    onUpdate: (id: string, updates: Partial<GameInstance>) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    language: "th" | "en";
    config: LauncherConfig;
    onRepair?: (id: string) => void;
}

export function InstanceSettingsModal({
    colors,
    instance,
    onClose,
    onUpdate,
    onDelete,
    onDuplicate,
    language,
    config,
    onRepair,
}: InstanceSettingsModalProps) {
    const { t } = useTranslation(language);
    const m = useMotionPreset();
    const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
    const [editedName, setEditedName] = useState(instance.name);
    const [deleteConfirm, setDeleteConfirm] = useState(false);



    const [editedLoader, setEditedLoader] = useState<LoaderType>(instance.loader as LoaderType);
    const [editedVersion, setEditedVersion] = useState(instance.minecraftVersion);
    const [editedLoaderVersion, setEditedLoaderVersion] = useState(instance.loaderVersion);
    const [editedJavaPath, setEditedJavaPath] = useState(instance.javaPath || "");
    const [editedRam, setEditedRam] = useState(instance.ramMB || config.ramMB);
    const [editedJavaArgs, setEditedJavaArgs] = useState(instance.javaArguments || instance.javaArguments === "" ? instance.javaArguments : config.javaArguments);
    const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
    const [loadingLoaderVersions, setLoadingLoaderVersions] = useState(false);
    const [maxRamMB, setMaxRamMB] = useState(16384);

    useEffect(() => {
        (async () => {
            if (window.api) {
                const sysRam = await (window.api as any).getSystemRam?.();
                if (sysRam) setMaxRamMB(sysRam);
            }
        })();
    }, []);

    // Sync local state with instance prop (e.g. when background sync updates loader/version)
    useEffect(() => {
        setEditedName(instance.name);
        setEditedLoader(instance.loader as LoaderType);
        setEditedVersion(instance.minecraftVersion);
        setEditedLoaderVersion(instance.loaderVersion);
        setEditedJavaPath(instance.javaPath || "");
        setEditedRam(instance.ramMB || config.ramMB);
        setEditedJavaArgs(instance.javaArguments || instance.javaArguments === "" ? instance.javaArguments : config.javaArguments);
    }, [instance, config]);

    useEffect(() => {
        if (editedLoader === "vanilla") {
            setLoaderVersions([]);
            setEditedLoaderVersion(undefined);
            return;
        }

        const fetchVersions = async () => {
            if (!window.api) return;
            setLoadingLoaderVersions(true);
            try {
                const versions = await window.api.modrinthGetLoaderVersions(editedLoader, editedVersion);
                setLoaderVersions(versions);

                // If current selection is invalid or empty, default to latest
                // But if we are editing an existing instance, try to keep current if possible
                // If switching loader type or MC version, default to latest
                if ((!editedLoaderVersion || !versions.includes(editedLoaderVersion)) && versions.length > 0) {
                    setEditedLoaderVersion(versions[0]);
                }
            } catch (error) {
                console.error("Failed to fetch loader versions:", error);
            } finally {
                setLoadingLoaderVersions(false);
            }
        };

        fetchVersions();
    }, [editedLoader, editedVersion]);
    const [gameVersions, setGameVersions] = useState<{ version: string; version_type: string }[]>([]);
    const [showAllVersions, setShowAllVersions] = useState(false);
    const [isSavingInstallation, setIsSavingInstallation] = useState(false);

    const hasInstallationChanges = editedLoader !== instance.loader || editedVersion !== instance.minecraftVersion || editedLoaderVersion !== instance.loaderVersion;

    useEffect(() => {
        if (settingsTab === "installation" && gameVersions.length === 0) {
            loadGameVersions();
        }
    }, [settingsTab]);

    const loadGameVersions = async () => {
        try {
            const versions = await window.api?.modrinthGetGameVersions?.();
            if (versions) {
                setGameVersions(versions);
            }
        } catch (error) {
            console.error("[InstanceSettings] Failed to load versions:", error);
        }
    };

    const handleSaveInstallation = async () => {
        if (!hasInstallationChanges) return;

        setIsSavingInstallation(true);
        try {
            onUpdate(instance.id, {
                loader: editedLoader,
                loaderVersion: editedLoader === "vanilla" ? undefined : editedLoaderVersion,
                minecraftVersion: editedVersion,
            });
            toast.success(t('settings_saved_success'));
        } catch (error) {
            toast.error(t('save_failed'));
        } finally {
            setIsSavingInstallation(false);
        }
    };

    const handleSaveJava = () => {
        const updates: Partial<GameInstance> = {};
        if (editedJavaPath !== (instance.javaPath || "")) updates.javaPath = editedJavaPath;
        if (editedRam !== (instance.ramMB || config.ramMB)) updates.ramMB = editedRam;
        if (editedJavaArgs !== (instance.javaArguments || instance.javaArguments === "" ? instance.javaArguments : config.javaArguments)) updates.javaArguments = editedJavaArgs;

        if (Object.keys(updates).length > 0) {
            onUpdate(instance.id, updates);
            toast.success(t('settings_saved_success'));
        }
    };


    // RAM: instance.ramMB === 0 means "use the global setting".
    const isCustomRam = instance.ramMB !== 0;
    const ramCapMB = maxRamMB || 8192;
    const recommendedRam = recommendedRamFor(ramCapMB, ramCapMB);
    const ramTicks = [...RAM_PRESETS, { label: t('recommended'), value: recommendedRam }];

    const filteredVersions = showAllVersions
        ? gameVersions
        : gameVersions.filter((v) => v.version_type === "release");

    const handleSaveName = () => {
        if (editedName.trim() && editedName !== instance.name) {
            onUpdate(instance.id, { name: editedName.trim() });
            toast.success(t('name_saved_success'));
        }
    };

    const getLoaderLabel = (loader: string): string => {
        const labels: Record<string, string> = {
            vanilla: "Vanilla",
            fabric: "Fabric",
            forge: "Forge",
            neoforge: "NeoForge",
            quilt: "Quilt",
        };
        return labels[loader] || loader;
    };

    return (
        <Portal>
            <motion.div variants={m.modal.backdrop} {...m.states} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <motion.div
                    variants={m.modal.panel}
                    role="dialog"
                    aria-modal="true"
                    className="w-[90%] max-w-[1400px] h-[65vh] min-h-[480px] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
                    style={{ backgroundColor: colors.surface }}
                >
                    <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: colors.outline + "30" }}>
                        <div className="flex items-center gap-3">
                            {instance.icon?.startsWith("data:") || instance.icon?.startsWith("http") ? (
                                <img src={instance.icon} alt="icon" className="w-6 h-6 rounded-lg object-cover" />
                            ) : instance.icon ? (
                                <span className="text-xl">{instance.icon}</span>
                            ) : (
                                <Icons.Box className="w-6 h-6" style={{ color: colors.onSurfaceVariant }} />
                            )}
                            <span className="font-medium" style={{ color: colors.onSurface }}>{instance.name}</span>
                            <span style={{ color: colors.onSurfaceVariant }}>›</span>
                            <span className="font-medium" style={{ color: colors.onSurface }}>{t('settings')}</span>
                        </div>
                        <button
                            onClick={() => { playClick(); onClose(); }}
                            className="w-8 h-8 rounded-lg flex items-center justify-center pressable hover:bg-white/10"
                            style={{ color: colors.onSurfaceVariant }}
                        >
                            ✕
                        </button>
                    </div>

                    <div className="flex flex-1 overflow-hidden" style={{ fontSize: 15 }}>
                        <div className="w-[22%] min-w-[240px] p-4 border-r flex flex-col" style={{ borderColor: colors.outline + "30" }}>
                            <button
                                onClick={() => { playClick(); setSettingsTab("general"); }}
                                className="relative isolate w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm mb-1 pressable"
                                style={{
                                    color: settingsTab === "general" ? "#1a1a1a" : colors.onSurfaceVariant
                                }}
                            >
                                {settingsTab === "general" && (
                                    <motion.span
                                        layoutId="instance-settings-tab-pill"
                                        transition={m.tabIndicator}
                                        className="absolute inset-0 -z-10 rounded-lg"
                                        style={{ backgroundColor: colors.secondary }}
                                    />
                                )}
                                <i className="fa-solid fa-circle-info w-4" /> {t('general')}
                            </button>
                            <button
                                onClick={() => { playClick(); setSettingsTab("installation"); }}
                                className="relative isolate w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm mb-1 pressable"
                                style={{
                                    color: settingsTab === "installation" ? "#1a1a1a" : colors.onSurfaceVariant
                                }}
                            >
                                {settingsTab === "installation" && (
                                    <motion.span
                                        layoutId="instance-settings-tab-pill"
                                        transition={m.tabIndicator}
                                        className="absolute inset-0 -z-10 rounded-lg"
                                        style={{ backgroundColor: colors.secondary }}
                                    />
                                )}
                                <i className="fa-solid fa-download w-4" /> {t('installation')}
                            </button>
                            <button
                                onClick={() => { playClick(); setSettingsTab("java"); }}
                                className="relative isolate w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm mb-1 pressable"
                                style={{
                                    color: settingsTab === "java" ? "#1a1a1a" : colors.onSurfaceVariant
                                }}
                            >
                                {settingsTab === "java" && (
                                    <motion.span
                                        layoutId="instance-settings-tab-pill"
                                        transition={m.tabIndicator}
                                        className="absolute inset-0 -z-10 rounded-lg"
                                        style={{ backgroundColor: colors.secondary }}
                                    />
                                )}
                                <i className="fa-brands fa-java w-4" /> Java
                            </button>
                        </div>

                        <div className="flex-1 p-6 overflow-y-auto">
                            <AnimatePresence mode="wait" initial={false}>
                            <motion.div key={settingsTab} variants={m.panelSwap} {...m.states}>
                            {settingsTab === "general" && (
                                <div className="space-y-4">
                                    <div className="flex items-start gap-8">
                                        <div className="flex-1 space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium mb-1.5" style={{ color: colors.onSurface }}>{t('instance_name')}</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={editedName}
                                                        onChange={(e) => setEditedName(e.target.value)}
                                                        disabled={!!instance.cloudId}
                                                        className="flex-1 px-4 py-2.5 rounded-xl outline-none disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                                        style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                                    />
                                                    {editedName !== instance.name && !instance.cloudId && (
                                                        <button
                                                            onClick={() => { playClick(); handleSaveName(); }}
                                                            className="px-4 py-2 rounded-xl text-sm font-medium"
                                                            style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                                        >
                                                            {t('save')}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="space-y-4 pt-2">
                                                {!instance.cloudId && (
                                                    <div>
                                                        <h4 className="text-sm font-medium mb-1" style={{ color: colors.onSurface }}>{t('duplicate_instance_title')}</h4>
                                                        <p className="text-xs mb-2 opacity-70" style={{ color: colors.onSurfaceVariant }}>
                                                            {t('duplicate_instance_desc')}
                                                        </p>
                                                        <button
                                                            onClick={() => {
                                                                playClick();
                                                                onDuplicate(instance.id);
                                                                onClose();
                                                            }}
                                                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all hover:opacity-80 border"
                                                            style={{ backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outline + "20", color: colors.onSurface }}
                                                        >
                                                            <i className="fa-regular fa-copy" /> {t('duplicate')}
                                                        </button>
                                                    </div>
                                                )}
                                                <div>
                                                    <h4 className="text-sm font-medium mb-1" style={{ color: colors.onSurface }}>{t('delete_instance_title')}</h4>
                                                    <p className="text-xs mb-2 opacity-70" style={{ color: colors.onSurfaceVariant }}>
                                                        {instance.cloudId ? t('server_instance_delete_desc') : t('local_instance_delete_desc')}
                                                    </p>
                                                    {deleteConfirm ? (
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    playClick();
                                                                    onDelete(instance.id);
                                                                    onClose();
                                                                }}
                                                                className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm bg-red-500 text-white font-medium"
                                                            >
                                                                <i className="fa-solid fa-trash" /> {t('confirm_delete_btn')}
                                                            </button>
                                                            <button
                                                                onClick={() => { playClick(); setDeleteConfirm(false); }}
                                                                className="px-4 py-2 rounded-xl text-sm"
                                                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                                            >
                                                                {t('cancel')}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => { playClick(); setDeleteConfirm(true); }}
                                                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm border border-red-500/50 text-red-500 hover:bg-red-500/10 transition-colors"
                                                        >
                                                            <i className="fa-solid fa-trash" /> {t('delete_instance_title')}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="shrink-0">
                                            <label className="block text-sm font-medium mb-1.5" style={{ color: colors.onSurface }}>{t('icon')}</label>
                                            <div className="relative group">
                                                <div
                                                    className={`w-28 h-28 rounded-3xl flex items-center justify-center text-3xl transition-all overflow-hidden border-2 ${instance.cloudId ? "" : "cursor-pointer hover:border-secondary/50"}`}
                                                    style={{
                                                        backgroundColor: (instance.icon?.startsWith("data:") || instance.icon?.startsWith("http") || instance.icon?.includes("/") || instance.icon?.includes("\\")) ? 'transparent' : colors.surfaceContainerHighest,
                                                        borderColor: colors.outline + "20"
                                                    }}
                                                    onClick={async () => {
                                                        playClick();
                                                        if (instance.cloudId) return;
                                                        const result = await window.api?.browseIcon?.();
                                                        if (result) {
                                                            const saveResult = await (window.api as any)?.instancesSetIcon?.(instance.id, result);
                                                            if (saveResult?.ok) {
                                                                toast.success(t('icon_saved_success'));
                                                                onUpdate(instance.id, { icon: result });
                                                            } else {
                                                                toast.error(saveResult?.error || t('icon_save_failed'));
                                                            }
                                                        }
                                                    }}
                                                >
                                                    {instance.icon?.startsWith("data:") || instance.icon?.startsWith("http") || instance.icon?.includes("/") || instance.icon?.includes("\\") ? (
                                                        <img src={instance.icon} alt="icon" className="w-full h-full object-cover" />
                                                    ) : instance.icon ? (
                                                        <span className="text-4xl">{instance.icon}</span>
                                                    ) : (
                                                        <Icons.Box className="w-10 h-10" style={{ color: colors.onSurfaceVariant }} />
                                                    )}
                                                </div>
                                                {!instance.cloudId && (
                                                    <div
                                                        className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center text-xs transform group-hover:scale-110 transition-transform cursor-pointer"
                                                        style={{ backgroundColor: "#ffffff", color: "#1a1a1a", border: `2px solid ${colors.surfaceContainerHighest}` }}
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            playClick();
                                                            const result = await window.api?.browseIcon?.();
                                                            if (result) {
                                                                const saveResult = await (window.api as any)?.instancesSetIcon?.(instance.id, result);
                                                                    if (saveResult?.ok) {
                                                                        toast.success(t('icon_saved_success'));
                                                                        onUpdate(instance.id, { icon: result });
                                                                    } else {
                                                                        toast.error(saveResult?.error || t('icon_save_failed'));
                                                                    }
                                                            }
                                                        }}
                                                    >
                                                        <Icons.Edit className="w-3.5 h-3.5" style={{ color: "#1a1a1a" }} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {!instance.cloudId && (
                                        <div className="mt-5">
                                            <label className="block text-sm font-medium mb-1.5" style={{ color: colors.onSurface }}>
                                                Banner
                                            </label>
                                            <div
                                                className="relative w-full h-28 rounded-2xl overflow-hidden border-2 cursor-pointer group transition-all"
                                                style={{
                                                    backgroundColor: colors.surfaceContainerHighest,
                                                    borderColor: instance.banner ? "transparent" : colors.outline + "20",
                                                }}
                                                onClick={async () => {
                                                    playClick();
                                                    const result = await window.api?.browseIcon?.();
                                                    if (result) {
                                                        onUpdate(instance.id, { banner: result });
                                                        toast.success("บันทึก Banner แล้ว");
                                                    }
                                                }}
                                            >
                                                {instance.banner ? (
                                                    <>
                                                        <img src={instance.banner} alt="banner" className="w-full h-full object-cover" />
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                                            <span className="text-white text-sm font-medium flex items-center gap-1.5">
                                                                <Icons.Edit className="w-4 h-4" /> เปลี่ยน Banner
                                                            </span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-red-500/80 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                                                            title="ลบ Banner"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                playClick();
                                                                onUpdate(instance.id, { banner: null });
                                                                toast.success("ลบ Banner แล้ว");
                                                            }}
                                                        >
                                                            <Icons.Close className="w-3.5 h-3.5 text-white" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 opacity-50 group-hover:opacity-80 transition-opacity">
                                                        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor" style={{ color: colors.onSurfaceVariant }}>
                                                            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                                                        </svg>
                                                        <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>คลิกเพื่อเลือก Banner</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {settingsTab === "installation" && (
                                <div className="space-y-6">
                                    <div>
                                        <h4 className="font-medium mb-3" style={{ color: colors.onSurface }}>{t('currently_installed')}</h4>
                                        <div
                                            className="flex items-center gap-4 p-4 rounded-xl"
                                            style={{ backgroundColor: colors.surfaceContainerHighest }}
                                        >
                                            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainer }}>
                                                <Icons.Box className="w-6 h-6" style={{ color: colors.onSurfaceVariant }} />
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-medium" style={{ color: colors.onSurface }}>
                                                    Minecraft {instance.minecraftVersion}
                                                </p>
                                                <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                                                    {getLoaderLabel(instance.loader)} {instance.loaderVersion || ""}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    {!instance.cloudId ? (
                                        <>
                                            <div>
                                                <h4 className="font-medium mb-3" style={{ color: colors.onSurface }}>{t('platform')}</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {(["vanilla", "fabric", "forge", "neoforge", "quilt"] as LoaderType[]).map((loader) => (
                                                        <button
                                                            key={loader}
                                                            onClick={() => {
                                                                playClick();
                                                                setEditedLoader(loader);
                                                                setLoaderVersions([]);
                                                                setEditedLoaderVersion(undefined);
                                                            }}
                                                            className="px-4 py-2 rounded-lg text-sm transition-all hover:opacity-80"
                                                            style={{
                                                                backgroundColor: editedLoader === loader ? colors.secondary : colors.surfaceContainerHighest,
                                                                color: editedLoader === loader ? "#000000ff" : colors.onSurface,
                                                                border: editedLoader === loader ? "none" : `1px solid ${colors.outline}30`
                                                            }}
                                                        >
                                                            {editedLoader === loader && <span className="mr-1">✓</span>}
                                                            {getLoaderLabel(loader)}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="font-medium" style={{ color: colors.onSurface }}>{t('minecraft_version_label')}</h4>
                                                    <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: colors.onSurfaceVariant }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={showAllVersions}
                                                            onChange={(e) => { playClick(); setShowAllVersions(e.target.checked); }}
                                                            className="w-4 h-4"
                                                        />
                                                        {t('include_snapshots')}
                                                    </label>
                                                </div>
                                                <select
                                                    value={editedVersion}
                                                    onChange={(e) => { playClick(); setEditedVersion(e.target.value); }}
                                                    className="w-full px-4 py-3 rounded-xl border cursor-pointer"
                                                    style={{ backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outline + "30", color: colors.onSurface }}
                                                >
                                                    {!filteredVersions.find(v => v.version === editedVersion) && (
                                                        <option value={editedVersion}>{editedVersion}</option>
                                                    )}
                                                    {filteredVersions.map((v) => (
                                                        <option key={v.version} value={v.version}>
                                                            {v.version} {v.version_type !== "release" ? `(${v.version_type})` : ""}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            {editedLoader !== "vanilla" && (
                                                <div className="mt-4">
                                                    <label className="block text-sm font-medium mb-2" style={{ color: colors.onSurface }}>{t('loader_version')}</label>
                                                    <select
                                                        value={editedLoaderVersion || ""}
                                                        onChange={(e) => { playClick(); setEditedLoaderVersion(e.target.value); }}
                                                        disabled={loadingLoaderVersions}
                                                        className="w-full px-4 py-3 rounded-xl border cursor-pointer"
                                                        style={{ backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outline + "30", color: colors.onSurface }}
                                                    >
                                                        {loadingLoaderVersions && <option>{t('loading')}</option>}
                                                        {!loadingLoaderVersions && loaderVersions.length === 0 && <option value="">{t('no_loader_version_found')}</option>}
                                                        {loaderVersions.map((v) => (
                                                            <option key={v} value={v}>
                                                                {v}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                            {hasInstallationChanges && (
                                                <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: "#f59e0b20", color: "#f59e0b" }}>
                                                    <i className="fa-solid fa-triangle-exclamation mr-2" />
                                                    {t('installation_change_warning')}
                                                </div>
                                            )}
                                            {hasInstallationChanges && (
                                                <button
                                                    onClick={handleSaveInstallation}
                                                    className="w-full py-3 rounded-xl font-medium transition-all hover:scale-[1.02] disabled:opacity-50"
                                                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                                >
                                                    {isSavingInstallation ? t('saving') : loadingLoaderVersions ? t('loading_versions') : t('save_changes')}
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <div className="space-y-6">
                                            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 rounded-2xl border-2 border-dashed"
                                                style={{ borderColor: colors.outline + "40" }}>
                                                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                                    <Icons.Info className="w-8 h-8" style={{ color: colors.primary }} />
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-bold mb-1" style={{ color: colors.onSurface }}>{t('managed_by_server')}</h3>
                                                    <p className="text-sm max-w-xs mx-auto" style={{ color: colors.onSurfaceVariant }}>
                                                        {t('server_managed_settings_desc')}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="p-4 rounded-xl flex items-center justify-between transition-colors" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                                <div>
                                                    <h4 className="font-medium" style={{ color: colors.onSurface }}>{t('auto_update')}</h4>
                                                    <p className="text-sm opacity-70" style={{ color: colors.onSurfaceVariant }}>
                                                        {t('auto_update_desc')}
                                                    </p>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={instance.autoUpdate !== false}
                                                        onChange={(e) => {
                                                            playClick();
                                                            onUpdate(instance.id, { autoUpdate: e.target.checked });
                                                        }}
                                                        className="sr-only peer"
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                                                </label>
                                            </div>
                                            <div className="p-4 rounded-xl flex items-center justify-between transition-colors" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                                <div className="flex-1 mr-4">
                                                    <h4 className="font-medium" style={{ color: colors.onSurface }}>{t('repair_files')}</h4>
                                                    <p className="text-sm opacity-70" style={{ color: colors.onSurfaceVariant }}>
                                                        {t('repair_files_desc' as any)}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => { playClick(); onRepair?.(instance.id); onClose(); }}
                                                    className="px-6 py-2.5 rounded-xl text-sm font-bold transition-all hover:bg-red-500 hover:text-white border flex items-center gap-2 shrink-0"
                                                    style={{ borderColor: colors.outline + "30", color: colors.onSurface }}
                                                >
                                                    <Icons.Wrench className="w-4 h-4" />
                                                    {t('repair_files' as any)}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {settingsTab === "java" && (
                                <div className="space-y-8">
                                    <SettingsSection colors={colors}>
                                        <SettingsRow
                                            colors={colors}
                                            title={t('custom_memory_allocation' as any)}
                                        >
                                            <Toggle
                                                checked={isCustomRam}
                                                onChange={() => {
                                                    if (isCustomRam) {
                                                        onUpdate(instance.id, { ramMB: 0 });
                                                        setEditedRam(config.ramMB);
                                                    } else {
                                                        onUpdate(instance.id, { ramMB: config.ramMB });
                                                        setEditedRam(config.ramMB);
                                                    }
                                                }}
                                                colors={colors}
                                                label={t('custom_memory_allocation' as any)}
                                            />
                                        </SettingsRow>
                                        <SettingsRow
                                            colors={colors}
                                            icon={<i className="fa-solid fa-memory text-base"></i>}
                                            title={t('memory_allocated')}
                                            description={t('ram_description', { gb: maxRamMB ? (maxRamMB / 1024).toFixed(0) : '8' })}
                                            below={
                                                <div className="space-y-3">
                                                    <RamSlider
                                                        value={editedRam}
                                                        maxRamMB={ramCapMB}
                                                        ticks={ramTicks}
                                                        onChange={setEditedRam}
                                                        onCommit={handleSaveJava}
                                                        colors={colors}
                                                        disabled={!isCustomRam}
                                                        ariaLabel={t('memory_allocated')}
                                                    />
                                                    <RamPresetChips
                                                        value={editedRam}
                                                        capMB={ramCapMB}
                                                        recommendedMB={recommendedRam}
                                                        recommendedLabel={t('recommended')}
                                                        onSelect={(ramMB, recommended) => {
                                                            setEditedRam(ramMB);
                                                            onUpdate(instance.id, { ramMB });
                                                            if (recommended) toast.success(`${t('recommended')}: ${formatRam(ramMB)}`);
                                                        }}
                                                        colors={colors}
                                                        disabled={!isCustomRam}
                                                    />
                                                </div>
                                            }
                                        />
                                    </SettingsSection>

                                    <SettingsSection colors={colors}>
                                        <SettingsRow
                                            colors={colors}
                                            icon={<Icons.Folder className="w-5 h-5" />}
                                            title={t('java_install_path', { version: "" })}
                                            below={
                                                <>
                                                    <div className="flex gap-2.5">
                                                        <input
                                                            type="text"
                                                            value={editedJavaPath}
                                                            onChange={(e) => setEditedJavaPath(e.target.value)}
                                                            onBlur={handleSaveJava}
                                                            placeholder={config.javaPath || t('follow_system')}
                                                            className={`${fieldClass} flex-1 min-w-0 font-mono text-[13px]`}
                                                            style={fieldStyle(colors)}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                playClick();
                                                                const result = await window.api?.browseJava?.();
                                                                if (result) {
                                                                    setEditedJavaPath(result);
                                                                    onUpdate(instance.id, { javaPath: result });
                                                                    toast.success(t('settings_saved_success'));
                                                                }
                                                            }}
                                                            className={`${buttonClass} h-11`}
                                                            style={buttonStyle(colors)}
                                                        >
                                                            {t('browse')}
                                                        </button>
                                                    </div>
                                                    <p className="text-sm mt-2" style={{ color: colors.onSurfaceVariant }}>
                                                        {t('leave_empty_to_use_default')}
                                                    </p>
                                                </>
                                            }
                                        />
                                        <SettingsRow
                                            colors={colors}
                                            icon={<i className="fa-brands fa-java text-lg"></i>}
                                            title={t('java_args')}
                                            below={
                                                <input
                                                    type="text"
                                                    value={editedJavaArgs}
                                                    onChange={(e) => setEditedJavaArgs(e.target.value)}
                                                    onBlur={handleSaveJava}
                                                    placeholder={t('java_args_placeholder')}
                                                    className={`${fieldClass} w-full font-mono text-sm`}
                                                    style={fieldStyle(colors)}
                                                />
                                            }
                                        />
                                    </SettingsSection>
                                </div>
                            )}
                            </motion.div>
                            </AnimatePresence>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            </Portal>
        );
    }
