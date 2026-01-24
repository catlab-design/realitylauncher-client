import { useState } from "react";
import toast from "react-hot-toast";
import { COLOR_THEMES } from "../../../lib/constants";
import { playClick } from "../../../lib/sounds";
import { getContrastColor } from "../../../lib/utils";
import type { ColorTheme, LauncherConfig } from "../../../types/launcher";
import type { SettingsTabProps } from "./AccountTab";
import { useTranslation } from "../../../hooks/useTranslation";


export function AppearanceTab({ config, updateConfig, colors }: SettingsTabProps) {
    const [customColorPending, setCustomColorPending] = useState<string | null>(null);
    const { t } = useTranslation(config.language);

    const handleUpdate = (updates: Partial<LauncherConfig>) => {
        if (updates.clickSoundEnabled === true || updates.notificationSoundEnabled === true) {
            playClick(true);
        } else if (updates.clickSoundEnabled === false || updates.notificationSoundEnabled === false) {
            // Turning off -> Be silent
        } else {
            playClick();
        }
        updateConfig(updates);
    };

    return (
        <div className="rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ backgroundColor: colors.surfaceContainer }}>
            {/* Standard Header */}
            <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                <i className="fa-solid fa-palette text-lg" style={{ color: colors.secondary }}></i>
                <h3 className="font-medium" style={{ color: colors.onSurface }}>{t('appearance_and_themes')}</h3>
            </div>

            <div className="p-6 space-y-8">
                {/* Theme Mode Section */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <i className="fa-solid fa-moon text-xs opacity-40" style={{ color: colors.onSurface }}></i>
                        <h4 className="text-xs font-black uppercase tracking-widest opacity-40" style={{ color: colors.onSurface }}>{t('theme_mode')}</h4>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[
                            { id: "light", icon: "fa-sun", label: t('light_mode'), desc: t('light_mode_desc') },
                            { id: "dark", icon: "fa-moon", label: t('dark_mode'), desc: t('dark_mode_desc') },
                            { id: "oled", icon: "fa-circle", label: t('oled_mode'), desc: t('oled_mode_desc') },
                            { id: "auto", icon: "fa-clock", label: t('follow_system'), desc: t('follow_system_desc') }
                        ].map((item) => {
                            const isActive = config.theme === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => handleUpdate({ theme: item.id as any })}
                                    className={`group relative h-24 rounded-2xl border transition-all duration-300 flex flex-col items-center justify-center gap-1.5 overflow-hidden ${isActive ? 'scale-[1.02] shadow-lg' : 'hover:bg-black/5 hover:border-white/10'}`}
                                    style={{
                                        backgroundColor: isActive ? colors.surface : "transparent",
                                        borderColor: isActive ? colors.primary : colors.outline + "15",
                                        color: isActive ? colors.primary : colors.onSurfaceVariant,
                                        boxShadow: isActive ? `0 10px 25px -5px ${colors.primary}30` : undefined
                                    } as React.CSSProperties}
                                >
                                    {isActive && (
                                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-current to-transparent opacity-50"
                                            style={{ color: colors.primary }}></div>
                                    )}
                                    <i className={`fa-solid ${item.icon} text-lg mb-0.5 ${isActive ? 'scale-110' : 'opacity-40 group-hover:opacity-100'}`}></i>
                                    <span className="font-black text-[11px] uppercase tracking-wider">{item.label}</span>
                                    <span className="text-[9px] font-bold opacity-30 uppercase">{item.desc}</span>
                                </button>
                            );
                        })}
                    </div>
                </section>

                <div className="h-px w-full" style={{ backgroundColor: colors.outline + "15" }}></div>

                {/* Colors Section */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <i className="fa-solid fa-brush text-xs opacity-40" style={{ color: colors.onSurface }}></i>
                            <h4 className="text-xs font-black uppercase tracking-widest opacity-40" style={{ color: colors.onSurface }}>{t('accent_color')}</h4>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="relative">
                            {config.rainbowMode && (
                                <div className="absolute inset-0 z-20 flex items-center justify-center">
                                    <div className="px-4 py-2 rounded-xl bg-black/60 backdrop-blur-sm shadow-lg border border-white/10 flex items-center gap-3 animate-in zoom-in fade-in duration-300">
                                        <i className="fa-solid fa-lock text-white text-sm"></i>
                                        <span className="text-xs font-bold text-white">{t('rainbow_mode_active')}</span>
                                    </div>
                                </div>
                            )}

                            <div className={`flex flex-wrap gap-2 transition-all duration-300 ${config.rainbowMode ? 'opacity-20 blur-[1px] pointer-events-none' : ''}`}>
                                {(Object.keys(COLOR_THEMES) as ColorTheme[]).map((theme) => {
                                    const isSelected = config.colorTheme === theme && !config.customColor && !config.rainbowMode;
                                    const themeColor = COLOR_THEMES[theme].primary;
                                    const contrastColor = getContrastColor(themeColor);

                                    return (
                                        <button
                                            key={theme}
                                            onClick={() => {
                                                handleUpdate({ colorTheme: theme, customColor: undefined, rainbowMode: false });
                                                setCustomColorPending(null);
                                            }}
                                            className={`group relative w-12 h-12 rounded-2xl transition-all duration-300 flex items-center justify-center ${isSelected ? 'scale-110 shadow-lg' : 'hover:scale-110 hover:shadow-md'}`}
                                            style={{
                                                backgroundColor: themeColor,
                                                boxShadow: isSelected ? `0 0 20px ${themeColor}60` : undefined,
                                                border: isSelected ? '2px solid white' : 'none'
                                            } as React.CSSProperties}
                                        >
                                            {isSelected && (
                                                <i className="fa-solid fa-check text-xs drop-shadow-sm" style={{ color: contrastColor }}></i>
                                            )}
                                            {!isSelected && (
                                                <div className="absolute inset-0 rounded-2xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                            )}
                                        </button>
                                    );
                                })}

                                <div className="relative w-10 h-10">
                                    <input
                                        type="color"
                                        value={customColorPending || config.customColor || "#ff6b6b"}
                                        onChange={(e) => {
                                            setCustomColorPending(e.target.value);
                                            handleUpdate({ rainbowMode: false });
                                        }}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                                    />
                                    <div
                                        className={`w-full h-full rounded-xl flex items-center justify-center border-2 border-dashed transition-all ${customColorPending || config.customColor ? 'shadow-sm border-solid scale-105' : 'hover:bg-black/5'}`}
                                        style={{
                                            background: customColorPending || config.customColor || 'transparent',
                                            borderColor: colors.outline + "40"
                                        }}
                                    >
                                        {(customColorPending || config.customColor) && !config.rainbowMode ? (
                                            <i className="fa-solid fa-pen text-[10px]" style={{ color: getContrastColor((customColorPending || config.customColor)!) }}></i>
                                        ) : (
                                            <i className="fa-solid fa-plus text-xs opacity-50" style={{ color: colors.onSurface }}></i>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {customColorPending && (
                            <div className="flex justify-end">
                                <button
                                    onClick={() => {
                                        handleUpdate({ customColor: customColorPending, rainbowMode: false });
                                        setCustomColorPending(null);
                                        toast.success(t('custom_color_saved'));
                                    }}
                                    className="px-4 py-2 rounded-xl text-xs font-bold shadow-lg transition-all flex items-center gap-2 active:scale-95"
                                    style={{
                                        backgroundColor: customColorPending,
                                        color: getContrastColor(customColorPending)
                                    }}
                                >
                                    <i className="fa-solid fa-save"></i> {t('save_custom_color')}
                                </button>
                            </div>
                        )}

                        <div className="flex items-center justify-between p-5 rounded-3xl transition-all border border-dashed hover:border-solid group overflow-hidden relative"
                            style={{
                                backgroundColor: config.rainbowMode ? 'transparent' : `${colors.outline}05`,
                                borderColor: config.rainbowMode ? colors.primary : colors.outline + '30'
                            }}>
                            {config.rainbowMode && (
                                <div className="absolute inset-0 opacity-[0.03] blur-2xl"
                                    style={{
                                        background: 'conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red)',
                                        willChange: 'transform'
                                    }}></div>
                            )}

                            <div className="flex items-center gap-4 relative z-10">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 ${config.rainbowMode ? 'shadow-xl scale-110 rotate-6' : 'bg-black/5 opacity-40'}`}
                                    style={{
                                        background: config.rainbowMode ? 'conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red)' : undefined,
                                        willChange: 'transform, filter'
                                    }}>
                                    <i className={`fa-solid fa-wand-magic-sparkles text-sm ${config.rainbowMode ? 'text-white drop-shadow-md' : ''}`}
                                        style={{ color: !config.rainbowMode ? colors.onSurface : undefined }}></i>
                                </div>
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <h4 className={`font-black text-sm tracking-tight ${config.rainbowMode ? 'rainbow-text' : ''}`} style={{ color: colors.onSurface }}>{t('rainbow_mode').toUpperCase()}</h4>
                                        <span className="text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider" style={{ backgroundColor: config.rainbowMode ? colors.primary : colors.secondary, color: config.rainbowMode ? colors.onPrimary : "#1a1a1a" }}>{t('beta')}</span>
                                    </div>
                                    <p className="text-[10px] font-bold opacity-30 uppercase tracking-widest" style={{ color: colors.onSurface }}>{t('rainbow_mode_desc')}</p>
                                </div>
                            </div>

                            <button
                                onClick={() => handleUpdate({ rainbowMode: !config.rainbowMode })}
                                className="relative w-14 h-7 rounded-full transition-all duration-500 shadow-lg z-10"
                                style={{
                                    backgroundColor: config.rainbowMode ? colors.primary : colors.outline + "40",
                                    boxShadow: config.rainbowMode ? `0 0 15px ${colors.primary}40` : 'inset 0 2px 4px rgba(0,0,0,0.1)'
                                }}
                            >
                                <div
                                    className="absolute left-[3px] top-[3px] w-6 h-6 bg-white rounded-full shadow-md transition-all duration-500 flex items-center justify-center overflow-hidden"
                                    style={{
                                        transform: config.rainbowMode ? "translateX(28px)" : "translateX(0)"
                                    }}
                                >
                                    {config.rainbowMode && <div className="w-full h-full animate-[spin_3s_linear_infinite]" style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}></div>}
                                </div>
                            </button>
                        </div>
                    </div>
                </section>

                <div className="h-px w-full" style={{ backgroundColor: colors.outline + "15" }}></div>

                {/* Audio Section */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <i className="fa-solid fa-volume-high text-xs opacity-40" style={{ color: colors.onSurface }}></i>
                        <h4 className="text-xs font-black uppercase tracking-widest opacity-40" style={{ color: colors.onSurface }}>{t('audio_header')}</h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                            { id: "clickSoundEnabled", label: t('click_sound'), icon: "fa-computer-mouse", desc: t('click_sound_desc') },
                            { id: "notificationSoundEnabled", label: t('notification_sound'), icon: "fa-bell", desc: t('notification_sound_desc') }
                        ].map((item) => (
                            <div key={item.id}
                                className="flex items-center justify-between p-4 rounded-2xl transition-all border border-transparent hover:border-white/5"
                                style={{ backgroundColor: colors.surfaceContainerHigh }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.surface }}>
                                        <i className={`fa-solid ${item.icon} text-sm opacity-60`} style={{ color: colors.onSurface }}></i>
                                    </div>
                                    <div>
                                        <span className="font-bold text-sm block" style={{ color: colors.onSurface }}>{item.label}</span>
                                        <span className="text-[10px] opacity-40 font-bold uppercase tracking-wide" style={{ color: colors.onSurfaceVariant }}>{item.desc}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleUpdate({ [item.id]: !(config as any)[item.id] })}
                                    className="relative w-11 h-6 rounded-full transition-all duration-300 shadow-inner flex-shrink-0"
                                    style={{ backgroundColor: (config as any)[item.id] ? colors.primary : colors.outline + "40" }}
                                >
                                    <div
                                        className="absolute left-[2px] top-[2px] w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300"
                                        style={{ transform: (config as any)[item.id] ? "translateX(20px)" : "translateX(0)" }}
                                    />
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
