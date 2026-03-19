import { useState } from "react";
import type { SettingsTabProps } from "./AccountTab";
import { useTranslation } from "../../../hooks/useTranslation";
import { LanguageEditorModal } from "../../modals/LanguageEditorModal";
import { Icons } from "../../ui/Icons";

export function LanguageTab({ config, updateConfig, colors }: SettingsTabProps) {
    const { t } = useTranslation(config.language);
    const [editorOpen, setEditorOpen] = useState(false);

    return (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surfaceContainer }}>
            <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: colors.outline + "40" }}>
                <i className="fa-solid fa-language text-lg" style={{ color: colors.secondary }}></i>
                <h3 className="font-medium" style={{ color: colors.onSurface }}>{t("language")}</h3>
            </div>
            <div className="p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-sm" style={{ color: colors.onSurface }}>{t("language")}</p>
                        <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>{t("select_language")}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setEditorOpen(true)}
                            className="p-2 rounded-lg transition-all hover:bg-white/10 text-xs font-semibold flex items-center gap-2 border border-dashed"
                            style={{
                                color: colors.onSurfaceVariant,
                                borderColor: colors.outline,
                            }}
                            title={t("edit_translations")}
                        >
                            <Icons.Edit className="w-3.5 h-3.5" />
                            <span>{t("edit")}</span>
                        </button>

                        <div className="flex gap-2">
                            <button
                                onClick={() => updateConfig({ language: "th" })}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${config.language === "th"
                                    ? "bg-primary/20 border-primary text-primary"
                                    : "bg-transparent border-transparent hover:bg-white/5"
                                    }`}
                                style={{
                                    backgroundColor: config.language === "th" ? colors.secondary + "20" : "transparent",
                                    borderColor: config.language === "th" ? colors.secondary : "transparent",
                                    color: config.language === "th" ? colors.secondary : colors.onSurfaceVariant,
                                }}
                            >
                                {t("language_thai")}
                            </button>
                            <button
                                onClick={() => updateConfig({ language: "en" })}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${config.language === "en"
                                    ? "bg-primary/20 border-primary text-primary"
                                    : "bg-transparent border-transparent hover:bg-white/5"
                                    }`}
                                style={{
                                    backgroundColor: config.language === "en" ? colors.secondary + "20" : "transparent",
                                    borderColor: config.language === "en" ? colors.secondary : "transparent",
                                    color: config.language === "en" ? colors.secondary : colors.onSurfaceVariant,
                                }}
                            >
                                {t("language_english")}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <LanguageEditorModal
                isOpen={editorOpen}
                onClose={() => setEditorOpen(false)}
                colors={colors}
                currentLanguage={config.language}
            />
        </div>
    );
}
