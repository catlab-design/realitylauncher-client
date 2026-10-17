import { useState } from "react";
import toast from "react-hot-toast";
import { COLOR_THEMES } from "../../../lib/constants";
import { playClick } from "../../../lib/sounds";
import { getContrastColor } from "../../../lib/utils";
import type { ColorTheme, LauncherConfig } from "../../../types/launcher";
import type { SettingsTabProps } from "./AccountTab";
import { useTranslation } from "../../../hooks/useTranslation";
import { SettingsPage, SettingsSection, SettingsRow, Toggle, buttonClass, buttonStyle } from "./SettingsUI";


export function AppearanceTab({ config, updateConfig, colors }: SettingsTabProps) {
    const [pendingColor, setPendingColor] = useState<string | null>(null);
    const { t } = useTranslation(config.language);

    const handleUpdate = (updates: Partial<LauncherConfig>) => {
        if (updates.clickSoundEnabled === true || updates.notificationSoundEnabled === true) {
            playClick(true);
        } else if (updates.clickSoundEnabled === false || updates.notificationSoundEnabled === false) {

        } else {
            playClick();
        }
        updateConfig(updates);
    };

    return (
        <div>
        <SettingsPage title={t('appearance_and_themes')} colors={colors}>
            {}
            <SettingsSection title={t('theme_mode')} colors={colors}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                                className="group flex flex-col rounded-xl overflow-hidden text-left cursor-pointer w-full hover-lift hover:brightness-105"
                                style={{
                                    backgroundColor: colors.surfaceContainer,
                                    border: `2px solid ${isActive ? colors.secondary : colors.outlineVariant}`
                                } as React.CSSProperties}
                            >
                                {}
                                <div className="w-full flex-1 min-h-[88px] relative flex items-center justify-center p-3"
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

                                    {}
                                    <div className="relative z-10 w-full h-full rounded-md border flex items-center p-2 gap-2 shadow-none"
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
                                        <div className="w-5 h-full rounded shrink-0"
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

                                {}
                                <div className="w-full py-3 px-3.5 flex items-center gap-2.5 border-t"
                                     style={{
                                         borderColor: "transparent",
                                         backgroundColor: colors.surfaceContainer
                                     }}>
                                    {}
                                    <div className="w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center shrink-0"
                                         style={{
                                             borderColor: isActive ? colors.secondary : colors.outline,
                                             backgroundColor: "transparent"
                                         }}>
                                        {isActive && (
                                            <div className="w-2 h-2 rounded-full"
                                                 style={{ backgroundColor: colors.secondary }}
                                            />
                                        )}
                                    </div>

                                    {}
                                    <span className="text-sm font-semibold truncate"
                                          style={{
                                              color: colors.onSurface
                                          }}>
                                        {item.label}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </SettingsSection>

            {}
            <SettingsSection title={t('accent_color')} colors={colors}>
                <div
                    className="rounded-xl border px-5 py-5"
                    style={{ backgroundColor: colors.surfaceContainer, borderColor: "transparent" }}
                >
                    <div className="relative">
                        {config.rainbowMode && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center">
                                <div className="px-4 py-2 rounded-lg bg-black/70 border border-white/10 flex items-center gap-3 animate-in zoom-in-95 fade-in duration-200">
                                    <i className="fa-solid fa-lock text-white text-sm"></i>
                                    <span className="text-sm font-semibold text-white">{t('rainbow_mode_active')}</span>
                                </div>
                            </div>
                        )}

                        <div className={`flex flex-wrap gap-3 transition-[opacity,filter] duration-300 ${config.rainbowMode ? 'opacity-20 blur-[1px] pointer-events-none' : ''}`}>
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
                                        className="group relative w-12 h-12 rounded-xl transition-[scale,box-shadow] duration-200 flex items-center justify-center hover:scale-105 active:scale-95"
                                        style={{
                                            backgroundColor: themeColor,
                                            boxShadow: isSelected ? `0 0 0 2px ${colors.surfaceContainer}, 0 0 0 4px ${colors.onSurface}` : 'none'
                                        } as React.CSSProperties}
                                    >
                                        {isSelected && (
                                            <i className="fa-solid fa-check text-base" style={{ color: contrastColor }}></i>
                                        )}
                                        {!isSelected && (
                                            <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                        )}
                                    </button>
                                );
                            })}

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
                                            className="absolute inset-0 rounded-xl transition-[background-color,box-shadow,border-color] duration-200 flex items-center justify-center z-10"
                                            style={{
                                                backgroundColor: activeColor,
                                                border: isCustomSelected ? 'none' : `2px dashed ${colors.outline}`,
                                                boxShadow: isCustomSelected ? `0 0 0 2px ${colors.surfaceContainer}, 0 0 0 4px ${colors.onSurface}` : 'none',
                                                color: contrastColor
                                            }}
                                        >
                                            {isCustomSelected ? (
                                                <i className="fa-solid fa-check text-base"></i>
                                            ) : (
                                                <i className="fa-solid fa-plus text-base"></i>
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
                                className="h-10 px-4 rounded-lg text-sm font-semibold transition hover:brightness-110 inline-flex items-center gap-2"
                                style={{
                                    backgroundColor: pendingColor,
                                    color: getContrastColor(pendingColor)
                                }}
                            >
                                <i className="fa-solid fa-save"></i> {t('save_custom_color')}
                            </button>
                        </div>
                    )}
                </div>

                <SettingsRow
                    colors={colors}
                    icon={<i className="fa-solid fa-wand-magic-sparkles text-base" style={{ color: config.rainbowMode ? colors.secondary : colors.onSurface }}></i>}
                    title={
                        <span className="inline-flex items-center gap-2">
                            {t('rainbow_mode')}
                            <span className="text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide" style={{ backgroundColor: colors.secondary, color: "#111" }}>{t('beta')}</span>
                        </span>
                    }
                    description={t('rainbow_mode_desc')}
                >
                    <Toggle
                        checked={!!config.rainbowMode}
                        label={t('rainbow_mode')}
                        colors={colors}
                        onChange={() => handleUpdate({ rainbowMode: !config.rainbowMode })}
                    />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title={t('background_image') || "ภาพพื้นหลัง"} colors={colors}>
                <SettingsRow
                    colors={colors}
                    title={t('choose_background') || "เลือกภาพพื้นหลัง"}
                    description={t('background_desc') || "รองรับไฟล์ PNG, JPG, JPEG, WEBP, GIF"}
                    below={
                        <div className="flex items-center justify-center rounded-lg border"
                            style={{
                                backgroundColor: colors.surface,
                                borderColor: "transparent",
                                height: "140px",
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
                                    <span className="text-sm font-semibold z-10 px-3 py-1.5 rounded-lg bg-black/60 text-white border border-white/10">
                                        {t('preview') || "ตัวอย่างพื้นหลัง"}
                                    </span>
                                </>
                            ) : (
                                <div className="flex flex-col items-center gap-2">
                                    <i className="fa-solid fa-image text-2xl" style={{ color: colors.onSurfaceVariant }}></i>
                                    <span className="text-sm font-medium" style={{ color: colors.onSurfaceVariant }}>
                                        {t('no_background') || "ไม่มีภาพพื้นหลัง"}
                                    </span>
                                </div>
                            )}
                        </div>
                    }
                >
                    {config.backgroundImage && (
                        <button
                            type="button"
                            onClick={() => {
                                handleUpdate({ backgroundImage: "" });
                                toast.success(t('background_removed') || "ลบภาพพื้นหลังแล้ว");
                            }}
                            className={buttonClass}
                            style={buttonStyle(colors)}
                        >
                            <i className="fa-solid fa-trash"></i>
                            {t('remove_image') || "ลบรูปภาพ"}
                        </button>
                    )}
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
                        className={buttonClass}
                        style={{
                            backgroundColor: colors.primary,
                            borderColor: colors.primary,
                            color: getContrastColor(colors.primary)
                        }}
                    >
                        <i className="fa-solid fa-upload"></i>
                        {t('select_image') || "เลือกรูปภาพ"}
                    </button>
                </SettingsRow>

                {config.backgroundImage && (
                    <SettingsRow
                        colors={colors}
                        title={t('background_opacity') || "ความโปร่งใสของพื้นหลัง"}
                        below={
                            <input
                                type="range"
                                min="0.05"
                                max="0.80"
                                step="0.05"
                                value={config.backgroundImageOpacity ?? 0.15}
                                onChange={(e) => handleUpdate({ backgroundImageOpacity: parseFloat(e.target.value) })}
                                className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                                style={{
                                    accentColor: colors.primary,
                                    background: colors.surfaceContainerHighest
                                }}
                            />
                        }
                    >
                        <span className="text-base font-bold tabular-nums" style={{ color: colors.onSurface }}>
                            {Math.round((config.backgroundImageOpacity ?? 0.15) * 100)}%
                        </span>
                    </SettingsRow>
                )}
            </SettingsSection>

            <SettingsSection title={t('audio_header')} colors={colors}>
                {[
                    { id: "clickSoundEnabled", label: t('click_sound'), icon: "fa-computer-mouse", desc: t('click_sound_desc') },
                    { id: "notificationSoundEnabled", label: t('notification_sound'), icon: "fa-bell", desc: t('notification_sound_desc') }
                ].map((item) => (
                    <SettingsRow
                        key={item.id}
                        colors={colors}
                        icon={<i className={`fa-solid ${item.icon} text-base`}></i>}
                        title={item.label}
                        description={item.desc}
                    >
                        <Toggle
                            checked={!!(config as any)[item.id]}
                            label={item.label}
                            colors={colors}
                            onChange={() => handleUpdate({ [item.id]: !(config as any)[item.id] })}
                        />
                    </SettingsRow>
                ))}
            </SettingsSection>
        </SettingsPage>
        </div>
    );
}
