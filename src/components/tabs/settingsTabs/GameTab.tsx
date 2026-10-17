import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import type { SettingsTabProps } from "./AccountTab";
import { useTranslation } from "../../../hooks/useTranslation";
import { cachedMaxRam, cachedSystemRam } from "../../../api";
import { SettingsPage, SettingsSection, SettingsRow, fieldClass, fieldStyle, buttonClass, primaryButtonStyle } from "./SettingsUI";

export interface GameTabProps extends SettingsTabProps {
    handleBrowseJava: () => void;
    handleBrowseMinecraftDir: () => void;
}

export function GameTab({ config, updateConfig, colors, handleBrowseJava, handleBrowseMinecraftDir }: GameTabProps) {
    const [maxRamMB, setMaxRamMB] = useState(cachedMaxRam);
    const [systemRamMB, setSystemRamMB] = useState(cachedSystemRam);
    const [isDetectingJava, setIsDetectingJava] = useState(false);


    const [resolvedDir, setResolvedDir] = useState("");
    const { t } = useTranslation(config.language);

    useEffect(() => {
        (async () => {
            const maxRam = await (window as any).api?.getMaxRam?.();
            const systemRam = await (window as any).api?.getSystemRam?.();
            if (maxRam) setMaxRamMB(maxRam);
            if (systemRam) setSystemRamMB(systemRam);
            const dir = await (window as any).api?.configGetMinecraftDir?.();
            if (dir) setResolvedDir(dir);
        })();
    }, [config.minecraftDir]);

    const handleAutoDetectJava = async () => {
        setIsDetectingJava(true);
        try {
            const javaPath = await (window as any).api?.autoDetectJava?.();
            if (javaPath) {
                updateConfig({ javaPath });
                toast.success(t('java_found').replace('{path}', javaPath));
            } else {
                toast.error(t('java_not_found'));
            }
        } catch {
            toast.error(t('java_search_failed'));
        } finally {
            setIsDetectingJava(false);
        }
    };

    const formatRam = (mb: number) => {
        if (mb >= 1024) {
            return `${(mb / 1024).toFixed(1)} GB`;
        }
        return `${mb} MB`;
    };

    const ramPresets = [
        { label: "Lite", value: 2048 },
        { label: "Standard", value: 4096 },
        { label: "High", value: 8192 },
        { label: "Ultra", value: 16384 },
    ];

    const calculatePercentage = (value: number) => {
        return ((value - 512) / (maxRamMB - 512)) * 100;
    }

    const recommendedRam = (() => {
        let recommended = 4096;
        if (systemRamMB >= 32000) recommended = 16384;
        else if (systemRamMB >= 16000) recommended = 8192;
        else if (systemRamMB >= 12000) recommended = 6144;
        else if (systemRamMB >= 8000) recommended = 4096;
        else recommended = Math.max(2048, systemRamMB - 2048);
        return Math.min(recommended, maxRamMB);
    })();

    // Preset stops shown as ticks on the slider; dragging near one snaps to it.
    const ramTicks = [...ramPresets, { label: t('recommended'), value: recommendedRam }]
        .filter((tick, i, all) => tick.value <= maxRamMB && all.findIndex((x) => x.value === tick.value) === i);
    const snapRam = (value: number) => {
        const near = ramTicks.find((tick) => Math.abs(tick.value - value) <= (maxRamMB - 512) * 0.015);
        return near ? near.value : value;
    };
    const ramPercent = Math.min(100, Math.max(0, calculatePercentage(config.ramMB)));

    return (
        <SettingsPage title={t('tab_game')} colors={colors}>
            <SettingsSection colors={colors}>
                <SettingsRow
                    colors={colors}
                    icon={<i className="fa-solid fa-memory text-base"></i>}
                    title={t('memory_allocated')}
                    description={t('ram_description').replace('{gb}', (systemRamMB / 1024).toFixed(0))}
                    below={
                        // One-line slider: min, track with snap ticks + handle, max, exact value.
                        <div className="flex items-center gap-4">
                            <span className="text-sm shrink-0 tabular-nums" style={{ color: colors.onSurfaceVariant }}>512 MB</span>
                            <div className="relative flex-1 h-8">
                                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full" style={{ backgroundColor: colors.surfaceContainerHighest }} />
                                <div
                                    className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full transition-[width] duration-150 ease-out"
                                    style={{ width: `${ramPercent}%`, backgroundColor: colors.secondary }}
                                />
                                {ramTicks.map((tick) => (
                                    <span
                                        key={tick.value}
                                        title={`${tick.label} · ${formatRam(tick.value)}`}
                                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-3.5 rounded-full pointer-events-none"
                                        style={{
                                            left: `${calculatePercentage(tick.value)}%`,
                                            backgroundColor: tick.value <= config.ramMB ? colors.secondary : colors.outline,
                                        }}
                                    />
                                ))}
                                <span
                                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-6 rounded-full shadow-md pointer-events-none transition-[left] duration-150 ease-out"
                                    style={{ left: `${ramPercent}%`, backgroundColor: colors.secondary }}
                                />
                                <input
                                    type="range"
                                    min={512}
                                    max={maxRamMB}
                                    step={256}
                                    value={config.ramMB}
                                    onChange={(e) => updateConfig({ ramMB: snapRam(Number(e.target.value)) })}
                                    aria-label={t('memory_allocated')}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    style={{ margin: 0 }}
                                />
                            </div>
                            <span className="text-sm shrink-0 tabular-nums" style={{ color: colors.onSurfaceVariant }}>{formatRam(maxRamMB)}</span>
                            <div className="h-11 px-3 rounded-lg flex items-center gap-1.5 shrink-0" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                                <input
                                    type="number"
                                    value={config.ramMB}
                                    onChange={(e) => updateConfig({ ramMB: Math.min(Math.max(512, Number(e.target.value)), maxRamMB) })}
                                    className="w-16 bg-transparent text-center font-semibold text-[15px] tabular-nums focus:outline-none"
                                    style={{ color: colors.onSurface }}
                                />
                                <span className="text-sm" style={{ color: colors.onSurfaceVariant }}>MB</span>
                            </div>
                        </div>
                    }
                />
            </SettingsSection>

            <SettingsSection colors={colors}>
                <SettingsRow
                    colors={colors}
                    icon={<i className="fa-solid fa-folder-open text-base"></i>}
                    title={t('minecraft_folder')}
                    below={
                        <div className="flex gap-2.5">
                            <input
                                type="text"
                                value={config.minecraftDir || resolvedDir}
                                readOnly
                                title={config.minecraftDir || resolvedDir}
                                className={`${fieldClass} flex-1 min-w-0 font-mono text-[13px]`}
                                style={fieldStyle(colors)}
                            />
                            <button
                                onClick={handleBrowseMinecraftDir}
                                className={`${buttonClass} h-11`}
                                style={primaryButtonStyle(colors)}
                            >
                                {t('select')}
                            </button>
                        </div>
                    }
                />

                <SettingsRow
                    colors={colors}
                    icon={<i className="fa-brands fa-java text-lg"></i>}
                    title={t('java_args')}
                    description={t('java_args_desc')}
                    below={
                        <input
                            type="text"
                            value={config.javaArguments}
                            onChange={(e) => updateConfig({ javaArguments: e.target.value })}
                            placeholder={t('java_args_placeholder')}
                            className={`${fieldClass} w-full font-mono text-sm`}
                            style={fieldStyle(colors)}
                        />
                    }
                />
            </SettingsSection>
        </SettingsPage>
    );
}
