import { useState } from "react";
import toast from "react-hot-toast";
import { COLOR_THEMES } from "../../../lib/constants";
import { playClick } from "../../../lib/sounds";
import { getContrastColor } from "../../../lib/utils";
import type { ColorTheme, LauncherConfig } from "../../../types/launcher";
import type { SettingsTabProps } from "./AccountTab";
import { useTranslation } from "../../../hooks/useTranslation";


export function AppearanceTab({ config, updateConfig, colors }: SettingsTabProps) {
    const [pendingColor, setPendingColor] = useState<string | null>(null);
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
        <div className="rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ backgroundColor: colors.surfaceContainer }}>
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
                            { id: "light", label: t('light_mode') },
                            { id: "dark", label: t('dark_mode') },
                            { id: "oled", label: t('oled_mode') },
                            { id: "auto", label: t('follow_system') }
                        ].map((item) => {
                            const isActive = config.theme === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => handleUpdate({ theme: item.id as any })}
                                    className="group flex flex-col rounded-md border transition-all duration-300 overflow-hidden text-left cursor-pointer w-full"
                                    style={{
                                        backgroundColor: colors.surface,
                                        borderColor: isActive ? colors.primary : colors.outline + "20"
                                    } as React.CSSProperties}
                                >
                                    {/* Top Preview Block */}
                                    <div className="w-full flex-1 min-h-[76px] relative flex items-center justify-center p-2.5"
                                         style={{ 
                                             backgroundColor: item.id === "light" 
                                                 ? "#f3f4f6" 
                                                 : item.id === "dark" 
                                                     ? "#18181b" 
                                                     : item.id === "oled" 
                                                         ? "#000000" 
                                                         : "transparent"
                                         }}>
                                        {item.id === "auto" && (
                                            <div className="absolute inset-0 flex">
                                                <div className="w-1/2 h-full bg-[#f3f4f6]" />
                                                <div className="w-1/2 h-full bg-[#18181b]" />
                                            </div>
                                        )}
                                        
                                        {/* Simulated UI Card */}
                                        <div className="relative z-10 w-full h-full rounded border flex items-center p-2 gap-2 shadow-none"
                                             style={{
                                                 backgroundColor: item.id === "light" 
                                                     ? "#ffffff" 
                                                     : (item.id === "dark" || item.id === "auto")
                                                         ? "#09090b" 
                                                         : "#020202",
                                                 borderColor: item.id === "light" 
                                                     ? "#e5e7eb" 
                                                     : "#27272a"
                                             }}>
                                            <div className="w-5 h-full rounded flex-shrink-0" 
                                                 style={{ 
                                                     backgroundColor: item.id === "light" ? "#f3f4f6" : "#18181b" 
                                                 }} 
                                            />
                                            <div className="flex-1 space-y-1">
                                                <div className="w-10 h-1.5 rounded" 
                                                     style={{ 
                                                         backgroundColor: item.id === "light" ? "#e5e7eb" : "#27272a" 
                                                     }} 
                                                />
                                                <div className="w-6 h-1 rounded" 
                                                     style={{ 
                                                         backgroundColor: item.id === "light" ? "#f3f4f6" : "#18181b" 
                                                     }} 
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bottom Label Block */}
                                    <div className="w-full py-2 px-3 flex items-center gap-2 border-t"
                                         style={{ 
                                             borderColor: colors.outline + "15",
                                             backgroundColor: colors.surfaceContainerLow || colors.surfaceContainer
                                         }}>
                                        {/* Radio Circle */}
                                        <div className="w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0"
                                             style={{ 
                                                 borderColor: isActive ? colors.primary : colors.outline + "60",
                                                 backgroundColor: "transparent"
                                             }}>
                                            {isActive && (
                                                <div className="w-1.5 h-1.5 rounded-full" 
                                                     style={{ backgroundColor: colors.primary }} 
                                                />
                                            )}
                                        </div>
                                        
                                        {/* Label Text */}
                                        <span className="text-[11px] font-bold truncate"
                                              style={{ 
                                                  color: isActive ? colors.primary : colors.onSurface
                                              }}>
                                            {item.label}
                                        </span>
                                    </div>
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
                                    <div className="px-4 py-2 rounded-md bg-black/60 border border-white/10 flex items-center gap-3 animate-in zoom-in fade-in duration-300">
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
                                                setPendingColor(null);
                                            }}
                                            className="group relative w-12 h-12 rounded-md border transition-all duration-300 flex items-center justify-center"
                                            style={{
                                                backgroundColor: themeColor,
                                                border: isSelected ? '2px solid white' : 'none'
                                            } as React.CSSProperties}
                                        >
                                            {isSelected && (
                                                <i className="fa-solid fa-check text-xs" style={{ color: contrastColor }}></i>
                                            )}
                                            {!isSelected && (
                                                <div className="absolute inset-0 rounded-md bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                            )}
                                        </button>
                                    );
                                })}

                                {/* Custom Color Button */}
                                <div className="relative w-12 h-12">
                                    <input
                                        type="color"
                                        value={pendingColor || config.customColor || "#ff6b6b"}
                                        onChange={(e) => {
                                            setPendingColor(e.target.value);
                                        }}
                                        onClick={() => {
                                            playClick();
                                        }}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-20"
                                    />
                                    {(() => {
                                        const isCustomSelected = (!!config.customColor || !!pendingColor) && !config.rainbowMode;
                                        const activeColor = pendingColor || config.customColor || "#ff6b6b";
                                        const contrastColor = getContrastColor(activeColor);
                                        return (
                                            <div
                                                className={`absolute inset-0 rounded-md border transition-all duration-300 flex items-center justify-center z-10 ${
                                                    isCustomSelected ? 'border-solid' : 'border-dashed'
                                                }`}
                                                style={{
                                                    backgroundColor: activeColor,
                                                    border: isCustomSelected ? '2px solid white' : `2px solid ${colors.outline}40`,
                                                    color: contrastColor
                                                }}
                                            >
                                                {isCustomSelected ? (
                                                    <i className="fa-solid fa-check text-xs"></i>
                                                ) : (
                                                    <i className="fa-solid fa-plus text-xs opacity-60"></i>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>

                        {pendingColor && (
                            <div className="flex justify-end mt-4">
                                <button
                                    onClick={() => {
                                        handleUpdate({ customColor: pendingColor, colorTheme: 'custom', rainbowMode: false });
                                        setPendingColor(null);
                                        toast.success(t('custom_color_saved'));
                                    }}
                                    className="px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2"
                                    style={{
                                        backgroundColor: pendingColor,
                                        color: getContrastColor(pendingColor)
                                    }}
                                >
                                    <i className="fa-solid fa-save"></i> {t('save_custom_color')}
                                </button>
                            </div>
                        )}

                        <div className="flex items-center justify-between p-5 rounded-md transition-all border border-dashed hover:border-solid group overflow-hidden relative"
                            style={{
                                backgroundColor: config.rainbowMode ? 'transparent' : `${colors.outline}05`,
                                borderColor: config.rainbowMode ? colors.primary : colors.outline + '30'
                            }}>

                            <div className="flex items-center gap-4 relative z-10">
                                <div className="w-12 h-12 rounded-md flex items-center justify-center"
                                    style={{
                                        backgroundColor: config.rainbowMode ? colors.primary : `${colors.outline}10`,
                                        color: config.rainbowMode ? getContrastColor(colors.primary) : colors.onSurface
                                    }}>
                                    <i className="fa-solid fa-wand-magic-sparkles text-sm"></i>
                                </div>
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-black text-sm tracking-tight" style={{ color: config.rainbowMode ? colors.primary : colors.onSurface }}>{t('rainbow_mode').toUpperCase()}</h4>
                                        <span className="text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider" style={{ backgroundColor: config.rainbowMode ? colors.primary : colors.secondary, color: config.rainbowMode ? colors.onPrimary : "#1a1a1a" }}>{t('beta')}</span>
                                    </div>
                                    <p className="text-[10px] font-bold opacity-30 uppercase tracking-widest" style={{ color: colors.onSurface }}>{t('rainbow_mode_desc')}</p>
                                </div>
                            </div>

                            <button
                                onClick={() => handleUpdate({ rainbowMode: !config.rainbowMode })}
                                className="relative w-14 h-7 rounded-full transition-all duration-500 z-10"
                                style={{
                                    backgroundColor: config.rainbowMode ? colors.primary : colors.outline + "40"
                                }}
                            >
                                <div
                                    className="absolute left-[3px] top-[3px] w-6 h-6 bg-white rounded-full transition-all duration-500 flex items-center justify-center overflow-hidden"
                                    style={{
                                        transform: config.rainbowMode ? "translateX(28px)" : "translateX(0)"
                                    }}
                                />
                            </button>
                        </div>
                    </div>
                </section>

                <div className="h-px w-full" style={{ backgroundColor: colors.outline + "15" }}></div>

                {/* Background Image Section */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <i className="fa-solid fa-image text-xs opacity-40" style={{ color: colors.onSurface }}></i>
                        <h4 className="text-xs font-black uppercase tracking-widest opacity-40" style={{ color: colors.onSurface }}>{t('background_image') || "ภาพพื้นหลัง"}</h4>
                    </div>

                    <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Upload image area */}
                            <div className="flex flex-col gap-3 p-4 rounded-md border border-dashed transition-all"
                                style={{ 
                                    backgroundColor: colors.surfaceContainerHigh,
                                    borderColor: colors.outline + "30"
                                }}>
                                <span className="font-bold text-xs" style={{ color: colors.onSurface }}>
                                    {t('choose_background') || "เลือกภาพพื้นหลัง"}
                                </span>
                                
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (window.api?.browseIcon) {
                                                const base64Img = await window.api.browseIcon();
                                                if (base64Img) {
                                                    handleUpdate({ backgroundImage: base64Img });
                                                    toast.success(t('background_updated') || "อัปเดตภาพพื้นหลังแล้ว");
                                                }
                                            }
                                        }}
                                        className="px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2"
                                        style={{
                                            backgroundColor: colors.primary,
                                            color: getContrastColor(colors.primary)
                                        }}
                                    >
                                        <i className="fa-solid fa-upload"></i>
                                        {t('select_image') || "เลือกรูปภาพ"}
                                    </button>

                                    {config.backgroundImage && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                handleUpdate({ backgroundImage: "" });
                                                toast.success(t('background_removed') || "ลบภาพพื้นหลังแล้ว");
                                            }}
                                            className="px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2"
                                            style={{
                                                backgroundColor: colors.outline + "20",
                                                color: colors.onSurface
                                            }}
                                        >
                                            <i className="fa-solid fa-trash"></i>
                                            {t('remove_image') || "ลบรูปภาพ"}
                                        </button>
                                    )}
                                </div>
                                <span className="text-[10px] opacity-40 uppercase font-bold" style={{ color: colors.onSurfaceVariant }}>
                                    {t('background_desc') || "รองรับไฟล์ PNG, JPG, JPEG, WEBP, GIF"}
                                </span>
                            </div>

                            {/* Preview Area */}
                            <div className="flex items-center justify-center p-4 rounded-md border"
                                style={{ 
                                    backgroundColor: colors.surface,
                                    borderColor: colors.outline + "15",
                                    height: "120px",
                                    position: "relative",
                                    overflow: "hidden"
                                }}>
                                {config.backgroundImage ? (
                                    <>
                                        <div 
                                            className="absolute inset-0 bg-cover bg-center"
                                            style={{ 
                                                backgroundImage: `url(${config.backgroundImage})`,
                                                opacity: config.backgroundImageOpacity ?? 0.15
                                            }}
                                        />
                                        <span className="text-[10px] font-bold z-10 px-2.5 py-1 rounded-md bg-black/60 text-white border border-white/10">
                                            {t('preview') || "ตัวอย่างพื้นหลัง"}
                                        </span>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center gap-1.5 opacity-30">
                                        <i className="fa-solid fa-image text-2xl" style={{ color: colors.onSurface }}></i>
                                        <span className="text-xs font-bold" style={{ color: colors.onSurface }}>
                                            {t('no_background') || "ไม่มีภาพพื้นหลัง"}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Opacity Control */}
                        {config.backgroundImage && (
                            <div className="p-4 rounded-md flex flex-col gap-2"
                                style={{ backgroundColor: colors.surfaceContainerHigh }}>
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-xs" style={{ color: colors.onSurface }}>
                                        {t('background_opacity') || "ความโปร่งใสของพื้นหลัง"}
                                    </span>
                                    <span className="text-xs font-bold" style={{ color: colors.primary }}>
                                        {Math.round((config.backgroundImageOpacity ?? 0.15) * 100)}%
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0.05"
                                    max="0.80"
                                    step="0.05"
                                    value={config.backgroundImageOpacity ?? 0.15}
                                    onChange={(e) => handleUpdate({ backgroundImageOpacity: parseFloat(e.target.value) })}
                                    className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
                                    style={{ 
                                        accentColor: colors.primary,
                                        background: colors.outline + "30"
                                    }}
                                />
                            </div>
                        )}
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
                                className="flex items-center justify-between p-4 rounded-md transition-all border border-transparent hover:border-white/5"
                                style={{ backgroundColor: colors.surfaceContainerHigh }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-md flex items-center justify-center" style={{ backgroundColor: colors.surface }}>
                                        <i className={`fa-solid ${item.icon} text-sm opacity-60`} style={{ color: colors.onSurface }}></i>
                                    </div>
                                    <div>
                                        <span className="font-bold text-sm block" style={{ color: colors.onSurface }}>{item.label}</span>
                                        <span className="text-[10px] opacity-40 font-bold uppercase tracking-wide" style={{ color: colors.onSurfaceVariant }}>{item.desc}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleUpdate({ [item.id]: !(config as any)[item.id] })}
                                    className="relative w-11 h-6 rounded-full transition-all duration-300 flex-shrink-0"
                                    style={{ backgroundColor: (config as any)[item.id] ? colors.primary : colors.outline + "40" }}
                                >
                                    <div
                                        className="absolute left-[2px] top-[2px] w-5 h-5 bg-white rounded-full transition-transform duration-300"
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
