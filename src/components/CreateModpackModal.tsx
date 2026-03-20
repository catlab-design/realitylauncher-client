import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "../hooks/useTranslation";
import { Icons } from "./ui/Icons";
import fabricIcon from "../assets/fabric.svg";
import forgeIcon from "../assets/forge.svg";
import neoforgeIcon from "../assets/neoforge.svg";
import minecraftIcon from "../assets/minecraft.svg";
import quiltIcon from "../assets/quilt.svg";

// ========================================
// Types
// ========================================

type LoaderType = "forge" | "fabric" | "neoforge" | "quilt" | "vanilla";

interface CreateModpackModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (modpack: NewModpack) => void;
    colors: any;
}

interface NewModpack {
    name: string;
    icon?: string;
    gameVersion: string;
    loader: LoaderType;
}

interface GameVersion {
    version: string;
    version_type: string;
}

// ========================================
// Constants
// ========================================

const LOADERS: { id: LoaderType; name: string; icon: string }[] = [
    { id: "fabric", name: "Fabric", icon: fabricIcon.src },
    { id: "forge", name: "Forge", icon: forgeIcon.src },
    { id: "neoforge", name: "NeoForge", icon: neoforgeIcon.src },
    { id: "quilt", name: "Quilt", icon: quiltIcon.src },
    { id: "vanilla", name: "Vanilla", icon: minecraftIcon.src },
];

// ========================================
// Component
// ========================================

export function CreateModpackModal({
    isOpen,
    onClose,
    onCreate,
    colors,
}: CreateModpackModalProps) {
    const [name, setName] = useState("");
    const [icon, setIcon] = useState<string | undefined>();
    const [gameVersion, setGameVersion] = useState("");
    const [loader, setLoader] = useState<LoaderType>("fabric");
    const [gameVersions, setGameVersions] = useState<GameVersion[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showAllVersions, setShowAllVersions] = useState(false);

    // Load game versions on mount
    useEffect(() => {
        if (isOpen) {
            loadGameVersions();
        }
    }, [isOpen]);

    const loadGameVersions = async () => {
        setIsLoading(true);
        try {
            const versions = await window.api?.modrinthGetGameVersions?.();
            if (versions) {
                setGameVersions(versions);
                // Set default to latest release
                const latestRelease = versions.find((v: GameVersion) => v.version_type === "release");
                if (latestRelease) {
                    setGameVersion(latestRelease.version);
                }
            }
        } catch (error) {
            console.error("[CreateModpack] Failed to load versions:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleIconSelect = () => {
        // Create file input
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement | null)?.files?.[0];
            if (!file) return;

            // Validate file size (max 5MB)
            const MAX_FILE_SIZE = 5 * 1024 * 1024;
            if (file.size > MAX_FILE_SIZE) {
                toast.error(t("file_size_too_large") || "File size exceeds 5MB");
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                if (reader.result) {
                    setIcon(reader.result as string);
                }
            };
            reader.onerror = () => {
                toast.error(t("failed_to_read_file") || "Failed to read file");
                console.error("FileReader error:", reader.error);
            };
            reader.readAsDataURL(file);
        };
        input.click();
    };

    const { t } = useTranslation();

    const handleCreate = () => {
        if (!name.trim()) {
            toast.error(t("create_modpack_error_name_required"));
            return;
        }
        if (!gameVersion) {
            toast.error(t("create_modpack_error_version_required"));
            return;
        }

        onCreate({
            name: name.trim(),
            icon,
            gameVersion,
            loader,
        });

        // Reset form
        setName("");
        setIcon(undefined);
        setLoader("fabric");
        onClose();
    };

    const displayVersions = showAllVersions
        ? gameVersions
        : gameVersions.filter((v) => v.version_type === "release").slice(0, 20);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div
                className="w-full max-w-lg rounded-2xl p-6 shadow-2xl"
                style={{ backgroundColor: colors.surface }}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold" style={{ color: colors.onSurface }}>
                        {t("create_modpack_title")}
                    </h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-500/20"
                        style={{ color: colors.onSurfaceVariant }}
                    >
                        ✕
                    </button>
                </div>

                {/* Icon Picker */}
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={handleIconSelect}
                        className="w-20 h-20 rounded-2xl flex items-center justify-center border-2 border-dashed transition-all hover:border-solid"
                        style={{
                            backgroundColor: colors.surfaceContainer,
                            borderColor: colors.outline,
                        }}
                    >
                        {icon ? (
                            <img src={icon} alt="Icon" className="w-full h-full rounded-2xl object-cover" />
                        ) : (
                            <Icons.Box className="w-10 h-10" style={{ color: colors.onSurfaceVariant }} />
                        )}
                    </button>
                    <div>
                        <p className="font-medium" style={{ color: colors.onSurface }}>{t("create_modpack_icon_label")}</p>
                        <p className="text-sm" style={{ color: colors.onSurfaceVariant }}>
                            {t("create_modpack_icon_desc")}
                        </p>
                    </div>
                </div>

                {/* Name Input */}
                <div className="mb-4">
                    <label className="block text-sm font-medium mb-2" style={{ color: colors.onSurface }}>
                        {t("create_modpack_name_label")}
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("create_modpack_name_placeholder")}
                        className="w-full px-4 py-3 rounded-xl border"
                        style={{
                            backgroundColor: colors.surfaceContainer,
                            borderColor: colors.outline,
                            color: colors.onSurface,
                        }}
                    />
                </div>

                {/* Game Version Select */}
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium" style={{ color: colors.onSurface }}>
                            {t("minecraft_version_label")}
                        </label>
                        <button
                            onClick={() => setShowAllVersions(!showAllVersions)}
                            className="text-xs underline"
                            style={{ color: colors.secondary }}
                        >
                            {showAllVersions ? t("create_modpack_show_release") : t("create_modpack_show_all")}
                        </button>
                    </div>
                    <select
                        value={gameVersion}
                        onChange={(e) => setGameVersion(e.target.value)}
                        disabled={isLoading}
                        className="w-full px-4 py-3 rounded-xl border"
                        style={{
                            backgroundColor: colors.surfaceContainer,
                            borderColor: colors.outline,
                            color: colors.onSurface,
                        }}
                    >
                        {isLoading ? (
                            <option>{t("create_modpack_loading")}</option>
                        ) : (
                            displayVersions.map((v) => (
                                <option key={v.version} value={v.version}>
                                    {v.version} {v.version_type !== "release" ? `(${v.version_type})` : ""}
                                </option>
                            ))
                        )}
                    </select>
                </div>

                {/* Loader Selection */}
                <div className="mb-6">
                    <label className="block text-sm font-medium mb-2" style={{ color: colors.onSurface }}>
                        {t("mod_loader_label")}
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                        {LOADERS.map((l) => (
                            <button
                                key={l.id}
                                onClick={() => setLoader(l.id)}
                                className="p-3 rounded-xl text-center transition-all"
                                style={{
                                    backgroundColor: loader === l.id ? colors.secondary : colors.surfaceContainer,
                                    color: loader === l.id ? "#1a1a1a" : colors.onSurface,
                                    border: `1px solid ${loader === l.id ? colors.secondary : colors.outline}`,
                                }}
                            >
                                <div className="text-2xl mb-1 flex justify-center">
                                    {l.icon.startsWith("/") ? (
                                        <img src={l.icon} alt={l.name} className="w-6 h-6" />
                                    ) : (
                                        l.icon
                                    )}
                                </div>
                                <div className="text-xs font-medium">{l.name}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl border"
                        style={{ borderColor: colors.outline, color: colors.onSurface }}
                    >
                        {t("create_modpack_cancel")}
                    </button>
                    <button
                        onClick={handleCreate}
                        className="px-6 py-2.5 rounded-xl font-medium"
                        style={{ backgroundColor: colors.secondary, color: "#1a1a1a" }}
                    >
                        {t("create_modpack_create")}
                    </button>
                </div>
            </div>
        </div>
    );
}
