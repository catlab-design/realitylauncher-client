/**
 * CreateInstanceModal - Modal สำหรับสร้าง Instance ใหม่
 * ปรับปรุง UX: เพิ่มคำอธิบาย, tooltips, และ preview
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
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
    /** Called with the new instance's id after successful creation */
    onCreated: (instanceId?: string) => void;
    language: "th" | "en";
}

interface ScrollableSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    disabled?: boolean;
    colors: any;
    placeholder?: string;
}

function ScrollableSelect({ value, onChange, options, disabled, colors, placeholder }: ScrollableSelectProps) {
    const [open, setOpen] = useState(false);
    const [dropUp, setDropUp] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const close = useCallback(() => setOpen(false), []);

    useEffect(() => {
        if (!open) return;
        // Scroll selected item into view
        const idx = options.findIndex(o => o.value === value);
        if (idx >= 0 && listRef.current) {
            const item = listRef.current.children[idx] as HTMLElement;
            item?.scrollIntoView({ block: "nearest" });
        }
        const handler = (e: MouseEvent) => {
            if (!triggerRef.current?.contains(e.target as Node) && !listRef.current?.contains(e.target as Node)) {
                close();
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open, value, options, close]);

    const handleOpen = () => {
        if (disabled) return;
        if (!open) {
            const rect = triggerRef.current?.getBoundingClientRect();
            if (rect) {
                const spaceBelow = window.innerHeight - rect.bottom;
                setDropUp(spaceBelow < 220);
            }
        }
        setOpen(v => !v);
    };

    const selected = options.find(o => o.value === value);

    return (
        <div className="relative w-full">
            <button
                ref={triggerRef}
                type="button"
                onClick={handleOpen}
                disabled={disabled}
                className="w-full px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2 transition-colors outline-none disabled:opacity-50 text-sm"
                style={{ backgroundColor: colors.surfaceContainer, borderColor: colors.outline, color: colors.onSurface }}
            >
                <span className="truncate">{selected?.label ?? placeholder ?? ""}</span>
                <svg className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 10l5 5 5-5z" />
                </svg>
            </button>
            {open && (
                <Portal>
                    {(() => {
                        const rect = triggerRef.current?.getBoundingClientRect();
                        if (!rect) return null;
                        const style: React.CSSProperties = {
                            position: "fixed",
                            left: rect.left,
                            width: rect.width,
                            zIndex: 9999,
                            backgroundColor: colors.surfaceContainerHighest,
                            border: `1px solid ${colors.outline}40`,
                            ...(dropUp
                                ? { bottom: window.innerHeight - rect.top + 4, maxHeight: Math.min(rect.top - 16, 240) }
                                : { top: rect.bottom + 4, maxHeight: Math.min(window.innerHeight - rect.bottom - 16, 240) }),
                        };
                        return (
                            <div
                                ref={listRef}
                                className="rounded-xl overflow-y-auto"
                                style={style}
                            >
                                {options.map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => { onChange(opt.value); close(); }}
                                        className="w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/10"
                                        style={{
                                            color: opt.value === value ? colors.secondary : colors.onSurface,
                                            backgroundColor: opt.value === value ? `${colors.secondary}18` : undefined,
                                        }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        );
                    })()}
                </Portal>
            )}
        </div>
    );
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

    const handleClose = () => {
        if (config?.clickSoundEnabled) playClick();
        onClose();
    };

    const stopPropagation = (event: React.MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                handleClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose, config]);

    const [loaderVersion, setLoaderVersion] = useState<string | undefined>(undefined);
    const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
    const [loadingLoaderVersions, setLoadingLoaderVersions] = useState(false);

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
            const created = await window.api?.instancesCreate?.({
                name: name.trim(),
                minecraftVersion,
                loader,
                loaderVersion: loader === "vanilla" ? undefined : loaderVersion,
            });

            toast.success(t('instance_created_success'));
            onCreated(created?.id);
        } catch (error: any) {
            const msg = error?.message || error?.toString?.() || "";
            toast.error(msg ? `${t('error_occurred')}: ${msg}` : t('error_occurred'));
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
        { id: "vanilla", icon: <img src={minecraftIcon.src} alt={t('vanilla')} className="w-5 h-5" /> },
        { id: "fabric", icon: <img src={fabricIcon.src} alt={t('fabric')} className="w-5 h-5" /> },
        { id: "forge", icon: <img src={forgeIcon.src} alt={t('forge')} className="w-5 h-5" /> },
        { id: "neoforge", icon: <img src={neoforgeIcon.src} alt={t('neoforge')} className="w-5 h-5" /> },
        { id: "quilt", icon: <img src={quiltIcon.src} alt={t('quilt')} className="w-5 h-5" /> },
    ];

    const currentLoaderInfo = LOADER_INFO[hoveredLoader || loader];

    return (
        <Portal>
            <motion.div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-md sm:p-5"
                onClick={handleClose}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
            >
                <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('create_new_instance_title')}
                    className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
                    style={{ backgroundColor: colors.surface }}
                    onClick={stopPropagation}
                    initial={{ opacity: 0, y: 28, scale: 0.975 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.9 }}
                >
                    <div
                        className="flex items-center justify-between border-b px-6 py-3.5 sm:px-7 shrink-0"
                        style={{
                            borderColor: `${colors.onSurface}10`,
                            backgroundColor: colors.surfaceContainerLow || colors.surfaceContainer,
                        }}
                    >
                        <div className="flex items-center gap-4">
                            <div
                                className="flex h-10 w-10 items-center justify-center rounded-md"
                                style={{
                                    backgroundColor: colors.secondary,
                                    color: "#1a1a1a",
                                }}
                            >
                                <Icons.Add className="w-5.5 h-5.5" />
                            </div>
                            <div>
                                <h2
                                    className="text-base font-black tracking-tight"
                                    style={{ color: colors.onSurface }}
                                >
                                    {t('create_new_instance_title')}
                                </h2>
                                <p
                                    className="text-xs opacity-75"
                                    style={{ color: colors.onSurfaceVariant }}
                                >
                                    {t('instance_desc')}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleClose}
                            className="flex h-10 w-10 items-center justify-center rounded-full border transition-all hover:bg-white/10 shrink-0"
                            style={{
                                color: colors.onSurface,
                                borderColor: `${colors.onSurface}15`,
                                backgroundColor: colors.surfaceContainer,
                            }}
                            title="Close"
                        >
                            <Icons.Close className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Scrollable Body */}
                    <div className="flex-1 overflow-y-auto px-6 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6 custom-scrollbar">
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
                                className="w-full px-3.5 py-2.5 rounded-xl border transition-all focus:ring-2 focus:ring-offset-2 outline-none text-sm"
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
                                <ScrollableSelect
                                    value={minecraftVersion}
                                    onChange={(v) => { handleSound(); setMinecraftVersion(v); }}
                                    options={filteredVersions.map(v => ({
                                        value: v.version,
                                        label: v.version + (v.version_type !== "release" ? ` (${v.version_type})` : ""),
                                    }))}
                                    colors={colors}
                                />
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
                                    <ScrollableSelect
                                        value={loaderVersion || ""}
                                        onChange={setLoaderVersion}
                                        disabled={loadingLoaderVersions}
                                        options={loadingLoaderVersions
                                            ? [{ value: "", label: t('loading') }]
                                            : loaderVersions.length === 0
                                                ? [{ value: "", label: `${t('no_loader_version_found')} ${minecraftVersion}` }]
                                                : loaderVersions.map(v => ({ value: v, label: v }))
                                        }
                                        colors={colors}
                                    />
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
                                            className="flex flex-col items-center py-2.5 px-2 rounded-xl text-center transition-all relative border-2 text-sm"
                                            style={{
                                                backgroundColor: isSelected ? colors.secondary + "15" : colors.surfaceContainer,
                                                borderColor: isSelected ? colors.secondary : "transparent",
                                                color: isSelected ? colors.onSurface : colors.onSurfaceVariant,
                                                transform: isSelected ? "translateY(-2px)" : "none",
                                                boxShadow: isSelected ? `0 8px 16px ${colors.secondary}15` : "none",
                                            }}
                                        >
                                            <div className="w-7 h-7 mb-1 flex items-center justify-center">
                                                {l.icon}
                                            </div>
                                            <div className="text-[10px] font-black uppercase tracking-wider">{info.name}</div>
                                            {isSelected && (
                                                <div
                                                    className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                                                    style={{ backgroundColor: colors.secondary }}
                                                />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Loader Description Box */}
                            <div
                                className="px-4 py-3 rounded-xl text-sm transition-all border"
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
                            className="w-full py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                            style={{ 
                                backgroundColor: colors.secondary, 
                                color: "#1a1a1a",
                                boxShadow: `0 8px 20px ${colors.secondary}30`
                            }}
                        >
                            {isLoading ? (
                                <>
                                    <Icons.Refresh className="w-5 h-5 animate-spin text-black/60" />
                                    {t('creating_dot')}
                                </>
                            ) : (
                                <>
                                    <Icons.Add className="w-5 h-5" />
                                    {t('create_instance')}
                                </>
                            )}
                        </button>

                        {/* Help Text */}
                        <p className="text-xs text-center mt-4 opacity-50" style={{ color: colors.onSurfaceVariant }}>
                            {t('create_instance_footer')}
                        </p>
                    </div>
                </motion.div>
            </motion.div>
        </Portal>
    );
}
