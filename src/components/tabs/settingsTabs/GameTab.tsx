import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import type { SettingsTabProps } from "./AccountTab";
import { useTranslation } from "../../../hooks/useTranslation";
import { cachedMaxRam, cachedSystemRam } from "../../../api";
import { SettingsPage, SettingsSection, SettingsRow, Toggle, fieldClass, fieldStyle, buttonClass, primaryButtonStyle } from "./SettingsUI";
import { RamSlider, RamPresetChips, RAM_PRESETS, recommendedRamFor, formatRam } from "./RamSlider";

export interface GameTabProps extends SettingsTabProps {
    handleBrowseJava: () => void;
    handleBrowseMinecraftDir: () => void;
}

export function GameTab({ config, updateConfig, colors, handleBrowseJava, handleBrowseMinecraftDir }: GameTabProps) {
    const [maxRamMB, setMaxRamMB] = useState(cachedMaxRam);
    const [systemRamMB, setSystemRamMB] = useState(cachedSystemRam);
    const [isDetectingJava, setIsDetectingJava] = useState(false);


    const [resolvedDir, setResolvedDir] = useState("");
    const [perfTools, setPerfTools] = useState<{ linux: boolean; mangohud: boolean; gamemode: boolean; wayland: boolean } | null>(null);
    const { t } = useTranslation(config.language);

    useEffect(() => {
        (window as any).api?.linuxPerfTools?.().then(setPerfTools).catch(() => setPerfTools(null));
    }, []);

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

    const recommendedRam = recommendedRamFor(systemRamMB, maxRamMB);
    const ramTicks = [...RAM_PRESETS, { label: t('recommended'), value: recommendedRam }];

    return (
        <SettingsPage title={t('tab_game')} colors={colors}>
            <SettingsSection colors={colors}>
                <SettingsRow
                    colors={colors}
                    icon={<i className="fa-solid fa-memory text-base"></i>}
                    title={t('memory_allocated')}
                    description={t('ram_description').replace('{gb}', (systemRamMB / 1024).toFixed(0))}
                    below={
                        <div className="space-y-3">
                            <RamSlider
                                value={config.ramMB}
                                maxRamMB={maxRamMB}
                                ticks={ramTicks}
                                onChange={(ramMB) => updateConfig({ ramMB })}
                                colors={colors}
                                ariaLabel={t('memory_allocated')}
                            />
                            <RamPresetChips
                                value={config.ramMB}
                                capMB={maxRamMB}
                                recommendedMB={recommendedRam}
                                recommendedLabel={t('recommended')}
                                onSelect={(ramMB, recommended) => {
                                    updateConfig({ ramMB });
                                    if (recommended) toast.success(`${t('recommended')}: ${formatRam(ramMB)}`);
                                }}
                                colors={colors}
                            />
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

            {perfTools?.linux && (
                <SettingsSection title={t('linux_performance')} colors={colors}>
                    <SettingsRow
                        colors={colors}
                        icon={<i className="fa-solid fa-gauge-high text-base"></i>}
                        title={t('mangohud')}
                        description={perfTools.mangohud ? t('mangohud_desc') : t('tool_not_installed').replace('{tool}', 'MangoHud')}
                    >
                        <Toggle
                            checked={perfTools.mangohud && !!config.enableMangoHud}
                            disabled={!perfTools.mangohud}
                            label={t('mangohud')}
                            colors={colors}
                            onChange={() => updateConfig({ enableMangoHud: !config.enableMangoHud })}
                        />
                    </SettingsRow>
                    <SettingsRow
                        colors={colors}
                        icon={<i className="fa-solid fa-rocket text-base"></i>}
                        title={t('gamemode')}
                        description={perfTools.gamemode ? t('gamemode_desc') : t('tool_not_installed').replace('{tool}', 'gamemoderun')}
                    >
                        <Toggle
                            checked={perfTools.gamemode && !!config.enableGameMode}
                            disabled={!perfTools.gamemode}
                            label={t('gamemode')}
                            colors={colors}
                            onChange={() => updateConfig({ enableGameMode: !config.enableGameMode })}
                        />
                    </SettingsRow>
                    {perfTools.wayland && (
                        <SettingsRow
                            colors={colors}
                            icon={<i className="fa-solid fa-display text-base"></i>}
                            title={t('native_wayland')}
                            description={t('native_wayland_desc')}
                        >
                            <Toggle
                                checked={!!config.nativeWayland}
                                label={t('native_wayland')}
                                colors={colors}
                                onChange={() => updateConfig({ nativeWayland: !config.nativeWayland })}
                            />
                        </SettingsRow>
                    )}
                </SettingsSection>
            )}
        </SettingsPage>
    );
}
