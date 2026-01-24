/**
 * InstanceSettingsModal - Modal แสดงการตั้งค่า Instance
 */

import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Icons } from "../../ui/Icons";
import type { GameInstance } from "../../../types/launcher";
import { playClick } from "../../../lib/sounds";
import { useTranslation } from "../../../hooks/useTranslation";

type SettingsTab = "general" | "installation";
type LoaderType = "vanilla" | "fabric" | "forge" | "neoforge" | "quilt";

export interface InstanceSettingsModalProps {
    colors: any;
    instance: GameInstance;
    onClose: () => void;
    onUpdate: (id: string, updates: Partial<GameInstance>) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    language: "th" | "en";
}

export function InstanceSettingsModal({
    colors,
    instance,
    onClose,
    onUpdate,
    onDelete,
    onDuplicate,
    language,
}: InstanceSettingsModalProps) {
    const { t } = useTranslation(language);
    const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
    const [editedName, setEditedName] = useState(instance.name);
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    // Installation settings state
    const [editedLoader, setEditedLoader] = useState<LoaderType>(instance.loader as LoaderType);
    const [editedVersion, setEditedVersion] = useState(instance.minecraftVersion);
    const [editedLoaderVersion, setEditedLoaderVersion] = useState(instance.loaderVersion);
    const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
    const [loadingLoaderVersions, setLoadingLoaderVersions] = useState(false);

    // Sync local state with instance prop (e.g. when background sync updates loader/version)
    useEffect(() => {
        setEditedName(instance.name);
        setEditedLoader(instance.loader as LoaderType);
        setEditedVersion(instance.minecraftVersion);
        setEditedLoaderVersion(instance.loaderVersion);
    }, [instance]);

    // Fetch loader versions when loader or mc version changes
    useEffect(() => {
        if (editedLoader === "vanilla") {
            setLoaderVersions([]);
            setEditedLoaderVersion(undefined);
            return;
        }

        const fetchVersions = async () => {
            setLoadingLoaderVersions(true);
            try {
                // Check if API exists (it should now)
                if (window.api?.modrinthGetLoaderVersions) {
                    const versions = await window.api.modrinthGetLoaderVersions(editedLoader, editedVersion);
                    setLoaderVersions(versions);

                    // If current selection is invalid or empty, default to latest
                    // But if we are editing an existing instance, try to keep current if possible
                    // If switching loader type or MC version, default to latest
                    if ((!editedLoaderVersion || !versions.includes(editedLoaderVersion)) && versions.length > 0) {
                        setEditedLoaderVersion(versions[0]);
                    }
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

    // Check if installation settings changed
    const hasInstallationChanges = editedLoader !== instance.loader || editedVersion !== instance.minecraftVersion || editedLoaderVersion !== instance.loaderVersion;

    // Load game versions when installation tab is opened
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div
                className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl"
                style={{ backgroundColor: colors.surface }}
            >
                {/* Modal Header */}
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
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10"
                        style={{ color: colors.onSurfaceVariant }}
                    >
                        ✕
                    </button>
                </div>

                <div className="flex">
                    {/* Sidebar */}
                    <div className="w-48 p-4 border-r" style={{ borderColor: colors.outline + "30" }}>
                        <button
                            onClick={() => { playClick(); setSettingsTab("general"); }}
                            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm mb-1 transition-all"
                            style={{
                                backgroundColor: settingsTab === "general" ? colors.secondary : "transparent",
                                color: settingsTab === "general" ? "#1a1a1a" : colors.onSurfaceVariant
                            }}
                        >
                            <i className="fa-solid fa-circle-info w-4" /> {t('general')}
                        </button>
                        <button
                            onClick={() => { playClick(); setSettingsTab("installation"); }}
                            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm mb-1 transition-all"
                            style={{
                                backgroundColor: settingsTab === "installation" ? colors.secondary : "transparent",
                                color: settingsTab === "installation" ? "#1a1a1a" : colors.onSurfaceVariant
                            }}
                        >
                            <i className="fa-solid fa-download w-4" /> {t('installation')}
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-6 max-h-[80vh] overflow-y-auto">
                        {settingsTab === "general" && (
                            <div className="space-y-6">
                                {/* Name */}
                                <div className="flex gap-6">
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium mb-2" style={{ color: colors.onSurface }}>{t('instance_name')}</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={editedName}
                                                onChange={(e) => setEditedName(e.target.value)}
                                                disabled={!!instance.cloudId}
                                                className="flex-1 px-4 py-2 rounded-xl outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                            />
                                            {editedName !== instance.name && !instance.cloudId && (
                                                <button
                                                    onClick={() => { playClick(); handleSaveName(); }}
                                                    className="px-4 py-2 rounded-xl text-sm"
                                                    style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                                                >
                                                    {t('save')}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Icon picker */}
                                    <div>
                                        <label className="block text-sm font-medium mb-2" style={{ color: colors.onSurface }}>{t('icon')}</label>
                                        <div className="relative group">
                                            <div
                                                className={`w-20 h-20 rounded-2xl flex items-center justify-center text-3xl transition-all overflow-hidden ${instance.cloudId ? "" : "cursor-pointer hover:opacity-80"}`}
                                                style={{ backgroundColor: colors.surfaceContainerHighest }}
                                                onClick={async () => {
                                                    playClick();
                                                    if (instance.cloudId) return;
                                                    const result = await window.api?.browseIcon?.();
                                                    if (result) {
                                                        const saveResult = await (window.api as any)?.instancesSetIcon?.(instance.id, result);
                                                        if (saveResult?.ok) {
                                                            toast.success(t('icon_saved_success'));
                                                            onUpdate(instance.id, {});
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
                                                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-xs cursor-pointer"
                                                    style={{ backgroundColor: colors.surface, border: `2px solid ${colors.surfaceContainerHighest}` }}
                                                    onClick={async () => {
                                                        playClick();
                                                        const result = await window.api?.browseIcon?.();
                                                        if (result) {
                                                            const saveResult = await (window.api as any)?.instancesSetIcon?.(instance.id, result);
                                                            if (saveResult?.ok) {
                                                                toast.success(t('icon_saved_success'));
                                                                onUpdate(instance.id, {});
                                                            } else {
                                                                toast.error(saveResult?.error || t('icon_save_failed'));
                                                            }
                                                        }
                                                    }}
                                                >
                                                    <Icons.Edit className="w-3 h-3" style={{ color: colors.onSurface }} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>



                                {/* Duplicate & Delete - Only for Local Instances */}
                                {/* Duplicate - Only for Local Instances */}
                                {!instance.cloudId && (
                                    <div>
                                        <h4 className="font-medium mb-1" style={{ color: colors.onSurface }}>{t('duplicate_instance_title')}</h4>
                                        <p className="text-sm mb-2" style={{ color: colors.onSurfaceVariant }}>
                                            {t('duplicate_instance_desc')}
                                        </p>
                                        <button
                                            onClick={() => {
                                                playClick();
                                                onDuplicate(instance.id);
                                                onClose();
                                            }}
                                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all hover:opacity-80"
                                            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                        >
                                            <i className="fa-regular fa-copy" /> {t('duplicate')}
                                        </button>
                                    </div>
                                )}

                                {/* Delete - For All Instances */}
                                <div>
                                    <h4 className="font-medium mb-1" style={{ color: colors.onSurface }}>{t('delete_instance_title')}</h4>
                                    <p className="text-sm mb-2" style={{ color: colors.onSurfaceVariant }}>
                                        {instance.cloudId
                                            ? t('server_instance_delete_desc')
                                            : t('local_instance_delete_desc')
                                        }
                                    </p>
                                    {deleteConfirm ? (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    playClick();
                                                    onDelete(instance.id);
                                                    onClose();
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm bg-red-500 text-white"
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
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm border border-red-500 text-red-500 hover:bg-red-500/10"
                                >
                                    <i className="fa-solid fa-trash" /> {t('delete_instance_title')}
                                </button>
                                    )}
                            </div>
                            </div>
                        )}

                    {settingsTab === "installation" && (
                        <div className="space-y-6">
                            {/* Currently installed */}
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

                            {/* Edit Controls - Only for Local Instances */}
                            {!instance.cloudId ? (
                                <>
                                    {/* Platform */}
                                    <div>
                                        <h4 className="font-medium mb-3" style={{ color: colors.onSurface }}>Platform</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {(["vanilla", "fabric", "forge", "neoforge", "quilt"] as LoaderType[]).map((loader) => (
                                                <button
                                                    key={loader}
                                                    onClick={() => {
                                                        playClick();
                                                        setEditedLoader(loader);
                                                        setLoaderVersions([]); // Clear list
                                                        setEditedLoaderVersion(undefined); // Clear selection
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

                                    {/* Game version */}
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
                                            {/* Always include current version */}
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

                                    {/* Loader Version Selection */}
                                    {editedLoader !== "vanilla" && (
                                        <div className="mt-4">
                                            <label className="block text-sm font-medium mb-2" style={{ color: colors.onSurface }}>Loader Version</label>
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

                                    {/* Warning about changing settings */}
                                    {hasInstallationChanges && (
                                        <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: "#f59e0b20", color: "#f59e0b" }}>
                                            <i className="fa-solid fa-triangle-exclamation mr-2" />
                                            {t('installation_change_warning')}
                                        </div>
                                    )}

                                    {/* Save button */}
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
                    /* Server Managed Message */
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
                                )}
                </div>
                        )}
            </div>
        </div>

            </div >
        </div >
    );
}
