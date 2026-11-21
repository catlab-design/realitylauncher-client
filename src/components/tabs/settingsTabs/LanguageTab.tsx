import { useState, useRef, useEffect } from "react";
import type { SettingsTabProps } from "./AccountTab";
import { useTranslation } from "../../../hooks/useTranslation";
import { playClick } from "../../../lib/sounds";
import { SettingsPage, SettingsRow, fieldClass, fieldStyle } from "./SettingsUI";

export function LanguageTab({ config, updateConfig, colors }: SettingsTabProps) {
    const { t } = useTranslation(config.language);
    const [isOpen, setIsOpen] = useState(false);
    const [hoveredValue, setHoveredValue] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);


    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const languages = [
        { value: "th", label: t("language_thai") },
        { value: "en", label: t("language_english") }
    ];

    const currentLanguage = languages.find(l => l.value === config.language) || languages[0];

    return (
        <SettingsPage title={t("language")} colors={colors}>
            <SettingsRow
                title={t("language")}
                description={t("select_language")}
                colors={colors}
                icon={<i className="fa-solid fa-language text-lg"></i>}
            >
                <div className="relative" ref={dropdownRef}>
                    <button
                        type="button"
                        onClick={() => {
                            playClick();
                            setIsOpen(!isOpen);
                        }}
                        className={`${fieldClass} w-64 font-semibold flex items-center justify-between cursor-pointer select-none`}
                        style={{
                            ...fieldStyle(colors),
                            borderColor: isOpen ? colors.secondary : colors.outline,
                        }}
                    >
                        <span>{currentLanguage.label}</span>
                        <svg
                            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                            style={{ color: colors.onSurfaceVariant }}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>

                    {isOpen && (
                        <div
                            className="absolute right-0 mt-2 rounded-xl border overflow-hidden z-50 w-64 p-1.5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150"
                            style={{
                                backgroundColor: colors.surfaceContainerHigh,
                                borderColor: colors.outlineVariant,
                            }}
                        >
                            {languages.map((lang) => {
                                const isSelected = lang.value === config.language;
                                return (
                                    <button
                                        key={lang.value}
                                        onClick={() => {
                                            playClick();
                                            updateConfig({ language: lang.value as "th" | "en" });
                                            setIsOpen(false);
                                        }}
                                        className="w-full h-11 px-3.5 rounded-lg flex items-center justify-between text-[15px] font-medium transition-colors text-left"
                                        style={{
                                            backgroundColor: isSelected || hoveredValue === lang.value
                                                ? colors.surfaceContainerHighest
                                                : "transparent",
                                            color: colors.onSurface,
                                        }}
                                        onMouseEnter={() => setHoveredValue(lang.value)}
                                        onMouseLeave={() => setHoveredValue(null)}
                                    >
                                        <span>{lang.label}</span>
                                        {isSelected && (
                                            <svg
                                                className="w-4 h-4"
                                                fill="none"
                                                stroke="currentColor"
                                                style={{ color: colors.secondary }}
                                                viewBox="0 0 24 24"
                                                strokeWidth="3"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </SettingsRow>
        </SettingsPage>
    );
}
