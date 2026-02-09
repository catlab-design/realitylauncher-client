import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import type { SettingsTabProps } from "./AccountTab";
import { useTranslation } from "../../../hooks/useTranslation";

export interface GameTabProps extends SettingsTabProps {
    handleBrowseJava: () => void;
    handleBrowseMinecraftDir: () => void;
}

export function GameTab({ config, updateConfig, colors, handleBrowseJava, handleBrowseMinecraftDir }: GameTabProps) {
    const [maxRamMB, setMaxRamMB] = useState(8192);
    const [systemRamMB, setSystemRamMB] = useState(0);
    const [isDetectingJava, setIsDetectingJava] = useState(false);
    const { t } = useTranslation(config.language);

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

    return (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "20" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: colors.secondary + "20" }}>
                    <i className="fa-solid fa-gamepad text-sm" style={{ color: colors.secondary }}></i>
                </div>
                <h3 className="font-medium" style={{ color: colors.onSurface }}>{t('tab_game')}</h3>
            </div>

            <div className="p-4 space-y-4">
                {/* RAM Allocation Section */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-sm flex items-center gap-2" style={{ color: colors.onSurface }}>
                                <i className="fa-solid fa-memory text-xs opacity-70"></i>
                                {t('memory_allocated')}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: colors.onSurfaceVariant }}>
                                {t('ram_description').replace('{gb}', (systemRamMB / 1024).toFixed(0))}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors focus-within:ring-2"
                             style={{ 
                                 backgroundColor: colors.surface, 
                                 borderColor: colors.outline + "40",
                                 color: colors.onSurface 
                             }}>
                            <input
                                type="number"
                                value={config.ramMB}
                                onChange={(e) => updateConfig({ ramMB: Math.min(Math.max(512, Number(e.target.value)), maxRamMB) })}
                                className="w-16 bg-transparent text-right font-mono font-medium text-sm focus:outline-none"
                            />
                            <span className="text-xs opacity-70">MB</span>
                        </div>
                    </div>

                    {/* Custom Slider */}
                    <div className="relative pt-4 pb-1">
                        {/* Track Background */}
                        <div className="h-3 w-full rounded-full relative overflow-hidden" 
                             style={{ backgroundColor: colors.surfaceContainerHighest }}>
                            {/* Fill */}
                            <div 
                                className="absolute top-0 left-0 h-full rounded-full transition-all duration-150 ease-out"
                                style={{ 
                                    width: `${calculatePercentage(config.ramMB)}%`,
                                    backgroundColor: colors.primary 
                                }}
                            />
                        </div>
                        
                        {/* Native Range Input (Transparent overlay) */}
                        <input
                            type="range"
                            min={512}
                            max={maxRamMB}
                            step={256}
                            value={config.ramMB}
                            onChange={(e) => updateConfig({ ramMB: Number(e.target.value) })}
                            className="absolute top-4 left-0 w-full h-3 opacity-0 cursor-pointer"
                            style={{ margin: 0 }}
                        />

                        {/* Labels */}
                        <div className="flex justify-between text-[10px] mt-2 font-medium px-1" style={{ color: colors.onSurfaceVariant }}>
                            <span>512 MB</span>
                            <span className="text-center absolute left-1/2 -translate-x-1/2" style={{ opacity: 0.5 }}>
                                {formatRam(config.ramMB)}
                            </span>
                            <span>{formatRam(maxRamMB)}</span>
                        </div>
                    </div>

                    {/* Presets */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
                        <button
                            onClick={() => {
                                let recommended = 4096;
                                if (systemRamMB >= 32000) recommended = 16384;
                                else if (systemRamMB >= 16000) recommended = 8192;
                                else if (systemRamMB >= 12000) recommended = 6144;
                                else if (systemRamMB >= 8000) recommended = 4096;
                                else recommended = Math.max(2048, systemRamMB - 2048);
                                
                                recommended = Math.min(recommended, maxRamMB);
                                updateConfig({ ramMB: recommended });
                                toast.success(`${t('recommended')}: ${formatRam(recommended)}`);
                            }}
                            className={`
                                px-2 py-2 rounded-lg text-xs font-medium transition-all duration-200 border
                                flex flex-col items-center gap-0.5 justify-center
                                hover:brightness-105 active:scale-95
                            `}
                            style={{
                                backgroundColor: colors.primaryContainer,
                                borderColor: colors.primary + "40",
                                color: colors.onPrimaryContainer,
                            }}
                        >
                            <span className="flex items-center gap-1.5">
                                <i className="fa-solid fa-thumbs-up text-[10px]"></i>
                                {t('recommended')}
                            </span>
                        </button>

                        {ramPresets.map((preset) => {
                            // Only show preset if within max RAM limit
                            if (preset.value > maxRamMB) return null;
                            
                            const isActive = config.ramMB === preset.value;
                            return (
                                <button
                                    key={preset.label}
                                    onClick={() => updateConfig({ ramMB: preset.value })}
                                    className={`
                                        px-2 py-2 rounded-lg text-xs font-medium transition-all duration-200 border
                                        flex flex-col items-center gap-0.5 justify-center
                                    `}
                                    style={{
                                        backgroundColor: isActive ? colors.secondaryContainer : colors.surface,
                                        borderColor: isActive ? colors.secondary : colors.outline + "30",
                                        color: isActive ? colors.onSecondaryContainer : colors.onSurface,
                                        transform: isActive ? 'scale(1.02)' : 'scale(1)'
                                    }}
                                >
                                    <span>{preset.label}</span>
                                    <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>{formatRam(preset.value)}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="h-px w-full" style={{ backgroundColor: colors.outline + "20" }} />

                {/* Minecraft Directory & Java Args Grid */}
                <div className="grid grid-cols-1 gap-4">
                    {/* Minecraft Directory */}
                    <div className="space-y-2">
                        <p className="font-medium text-sm flex items-center gap-2" style={{ color: colors.onSurface }}>
                            <i className="fa-solid fa-folder-open text-xs opacity-70"></i>
                            {t('minecraft_folder')}
                        </p>
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <input
                                    type="text"
                                    value={config.minecraftDir || t('use_default')}
                                    readOnly
                                    className="w-full pl-3 pr-3 py-2.5 rounded-xl border text-xs transition-colors"
                                    style={{ 
                                        borderColor: colors.outline + "40", 
                                        backgroundColor: colors.surface, 
                                        color: colors.onSurface 
                                    }}
                                />
                            </div>
                            <button
                                onClick={handleBrowseMinecraftDir}
                                className="px-4 py-2.5 rounded-xl text-xs font-medium hover:brightness-110 active:scale-95 transition-all shadow-sm"
                                style={{ backgroundColor: colors.secondary, color: colors.onSecondary }}
                            >
                                {t('select')}
                            </button>
                        </div>
                    </div>

                    {/* Java Arguments */}
                    <div className="space-y-2">
                        <div>
                             <p className="font-medium text-sm flex items-center gap-2" style={{ color: colors.onSurface }}>
                                <i className="fa-brands fa-java text-xs opacity-70"></i>
                                {t('java_args')}
                            </p>
                            <p className="text-[10px] mt-0.5" style={{ color: colors.onSurfaceVariant }}>
                                {t('java_args_desc')}
                            </p>
                        </div>
                        <input
                            type="text"
                            value={config.javaArguments}
                            onChange={(e) => updateConfig({ javaArguments: e.target.value })}
                            placeholder={t('java_args_placeholder')}
                            className="w-full px-3 py-2.5 rounded-xl border text-xs transition-colors focus:ring-2 focus:ring-opacity-50 focus:outline-none"
                            style={{ 
                                borderColor: colors.outline + "40", 
                                backgroundColor: colors.surface, 
                                color: colors.onSurface,
                                // @ts-ignore
                                '--tw-ring-color': colors.primary 
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
