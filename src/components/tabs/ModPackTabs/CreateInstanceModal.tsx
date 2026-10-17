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
                className="w-full h-12 px-4 rounded-lg flex items-center justify-between gap-2 transition-colors outline-none disabled:opacity-50 text-[15px]"
                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
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
                            boxShadow: "0 12px 32px -8px rgba(0,0,0,0.35)",
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
                                        className="w-full px-4 py-2.5 text-left text-[15px] transition-colors hover:bg-black/5"
                                        style={{
                                            color: opt.value === value ? "#111" : colors.onSurface,
                                            backgroundColor: opt.value === value ? colors.secondary : undefined,
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

    const LOADER_INFO: Record<string, { name: string; description: string; color: string }> = {
        vanilla: { name: t('vanilla'), description: t('vanilla_desc'), color: "#4CAF50" },
        fabric: { name: t('fabric'), description: t('fabric_desc'), color: "#DBD0AB" },
        forge: { name: t('forge'), description: t('forge_desc'), color: "#1E3A5F" },
        neoforge: { name: t('neoforge'), description: t('neoforge_desc'), color: "#F97316" },
        quilt: { name: t('quilt'), description: t('quilt_desc'), color: "#9B59B6" },
    };

    const loaders = [
        { id: "vanilla", icon: <img src={minecraftIcon} alt={t('vanilla')} className="w-8 h-8" /> },
        { id: "fabric", icon: <img src={fabricIcon} alt={t('fabric')} className="w-8 h-8" /> },
        { id: "forge", icon: <img src={forgeIcon} alt={t('forge')} className="w-8 h-8" /> },
        { id: "neoforge", icon: <img src={neoforgeIcon} alt={t('neoforge')} className="w-8 h-8" /> },
        { id: "quilt", icon: <img src={quiltIcon} alt={t('quilt')} className="w-8 h-8" /> },
    ];

    const canCreate = !isLoading && !!name.trim() && !(loader !== "vanilla" && !loaderVersion && loaderVersions.length > 0);
    const fieldLabel = "flex items-center gap-2 text-sm font-semibold mb-2";

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
                    className="flex w-full max-w-6xl h-[min(44rem,calc(100vh-2rem))] overflow-hidden rounded-2xl shadow-2xl"
                    style={{ backgroundColor: colors.surface }}
                    onClick={stopPropagation}
                    initial={{ opacity: 0, y: 28, scale: 0.975 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.9 }}
                >
                    {/* Left: pick the loader. */}
                    <aside className="w-88 shrink-0 flex flex-col p-6 overflow-y-auto custom-scrollbar" style={{ backgroundColor: colors.surfaceContainer }}>
                        <p className="text-sm font-semibold px-1 mb-1" style={{ color: colors.onSurface }}>{t('mod_loader')}</p>
                        <p className="text-[13px] px-1 mb-4" style={{ color: colors.onSurfaceVariant }}>{t('select_to_add_mods')}</p>
                        <div className="space-y-1.5">
                            {loaders.map((l) => {
                                const info = LOADER_INFO[l.id];
                                const isSelected = loader === l.id;
                                return (
                                    <button
                                        key={l.id}
                                        type="button"
                                        onClick={() => { handleSound(); setLoader(l.id as any); }}
                                        className="w-full flex items-center gap-3.5 p-4 rounded-xl text-left transition-colors"
                                        style={{
                                            backgroundColor: isSelected ? colors.secondary : "transparent",
                                            color: isSelected ? "#111" : colors.onSurface,
                                        }}
                                    >
                                        <span className="w-9 h-9 flex items-center justify-center shrink-0">{l.icon}</span>
                                        <span className="min-w-0">
                                            <span className="block text-[15px] font-bold leading-tight">{info.name}</span>
                                            <span
                                                className="block text-[13px] leading-snug mt-0.5 line-clamp-2"
                                                style={{ color: isSelected ? "rgba(17,17,17,0.7)" : colors.onSurfaceVariant }}
                                            >
                                                {info.description}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </aside>

                    {/* Right: details + create. */}
                    <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex items-start justify-between gap-4 px-9 pt-8 pb-6">
                            <div className="flex items-center gap-4 min-w-0">
                                <div
                                    className="flex h-11 w-11 items-center justify-center rounded-full shrink-0"
                                    style={{ backgroundColor: colors.secondary, color: "#111" }}
                                >
                                    <Icons.Add className="w-5.5 h-5.5" />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-xl font-black tracking-tight" style={{ color: colors.onSurface }}>
                                        {t('create_new_instance_title')}
                                    </h2>
                                    <p className="text-[15px]" style={{ color: colors.onSurfaceVariant }}>{t('instance_desc')}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleClose}
                                className="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:brightness-110 shrink-0"
                                style={{ color: colors.onSurface, backgroundColor: colors.surfaceContainerHighest }}
                                aria-label={t('close')}
                            >
                                <Icons.Close className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-9 pb-2 space-y-6 custom-scrollbar">
                            <div>
                                <label className={fieldLabel} style={{ color: colors.onSurface }}>{t('instance_name')}</label>
                                <input
                                    type="text"
                                    value={name}
                                    autoFocus
                                    onChange={(e) => setName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter" && canCreate) { handleSound(); handleCreate(); } }}
                                    placeholder={t('instance_name_placeholder')}
                                    className="w-full h-12 px-4 rounded-lg border border-transparent outline-none text-[15px]"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-semibold" style={{ color: colors.onSurface }}>{t('minecraft_version_label')}</label>
                                        <label className="flex items-center gap-1.5 text-[13px] cursor-pointer select-none" style={{ color: colors.onSurfaceVariant }}>
                                            <input
                                                type="checkbox"
                                                checked={showAllVersions}
                                                onChange={(e) => { handleSound(); setShowAllVersions(e.target.checked); }}
                                                className="w-4 h-4 rounded-md"
                                                style={{ accentColor: colors.secondary }}
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

                                <div>
                                    <label className={fieldLabel} style={{ color: colors.onSurface }}>
                                        {t('loader_version')}
                                        {loadingLoaderVersions && (
                                            <span className="text-[13px] font-normal animate-pulse" style={{ color: colors.onSurfaceVariant }}>{t('loading')}</span>
                                        )}
                                    </label>
                                    <ScrollableSelect
                                        value={loaderVersion || ""}
                                        onChange={setLoaderVersion}
                                        disabled={loader === "vanilla" || loadingLoaderVersions}
                                        options={loader === "vanilla"
                                            ? [{ value: "", label: "—" }]
                                            : loadingLoaderVersions
                                                ? [{ value: "", label: t('loading') }]
                                                : loaderVersions.length === 0
                                                    ? [{ value: "", label: `${t('no_loader_version_found')} ${minecraftVersion}` }]
                                                    : loaderVersions.map(v => ({ value: v, label: v }))
                                        }
                                        colors={colors}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-4 px-9 py-6 mt-4">
                            <p className="text-[13px]" style={{ color: colors.onSurfaceVariant }}>{t('create_instance_footer')}</p>
                            <div className="flex items-center gap-2.5 shrink-0">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="h-12 px-6 rounded-xl text-[15px] font-semibold transition hover:brightness-110"
                                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                                >
                                    {t('cancel')}
                                </button>
                                <button
                                    onClick={() => { handleSound(); handleCreate(); }}
                                    disabled={!canCreate}
                                    className="h-12 px-7 rounded-xl font-bold text-[15px] transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                    style={{ backgroundColor: colors.secondary, color: "#111" }}
                                >
                                    {isLoading ? (
                                        <>
                                            <Icons.Spinner className="w-4.5 h-4.5 animate-spin" />
                                            {t('creating_dot')}
                                        </>
                                    ) : (
                                        <>
                                            <Icons.Add className="w-4.5 h-4.5" />
                                            {t('create_instance')}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </Portal>
    );
}
