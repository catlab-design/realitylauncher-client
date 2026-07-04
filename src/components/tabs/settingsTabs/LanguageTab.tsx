import { useState, useRef, useEffect } from "react";
import type { SettingsTabProps } from "./AccountTab";
import { useTranslation } from "../../../hooks/useTranslation";
import { playClick } from "../../../lib/sounds";

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
        <div className="rounded-xl" style={{ backgroundColor: colors.surfaceContainer }}>
            <div className="px-4 py-3 border-b flex items-center gap-3 rounded-t-xl" style={{ borderColor: colors.outline + "40" }}>
                <i className="fa-solid fa-language text-lg" style={{ color: colors.secondary }}></i>
                <h3 className="font-medium" style={{ color: colors.onSurface }}>{t("language")}</h3>
            </div>
            <div className="p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-sm" style={{ color: colors.onSurface }}>{t("language")}</p>
                        <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>{t("select_language")}</p>
                    </div>
                    <div className="relative" ref={dropdownRef}>
                        <button
                            type="button"
                            onClick={() => {
                                playClick();
                                setIsOpen(!isOpen);
                            }}
                            className="h-10 px-4 rounded-md text-sm font-semibold transition-all outline-none border flex items-center justify-between cursor-pointer select-none w-80"
                            style={{
                                backgroundColor: colors.surfaceContainerHighest,
                                borderColor: isOpen ? colors.secondary : colors.outline + "30",
                                color: colors.onSurface
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
                                className="absolute right-0 mt-2 rounded-md border overflow-hidden z-50 w-80 py-1 animate-in fade-in slide-in-from-top-2 duration-150"
                                style={{
                                    backgroundColor: colors.surfaceContainerHigh,
                                    borderColor: colors.outline + "30",
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
                                            className="w-full h-10 px-4 flex items-center justify-between text-sm font-medium transition-colors text-left"
                                            style={{
                                                backgroundColor: isSelected 
                                                    ? colors.secondary + "20" 
                                                    : hoveredValue === lang.value 
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
                </div>
            </div>
        </div>
    );
}
