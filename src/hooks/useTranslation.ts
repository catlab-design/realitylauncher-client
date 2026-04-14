import { useCallback } from 'react';
import { translations, type Language, type TranslationKey } from "../i18n/translations";
import { useConfigStore } from "../store/configStore";


export function useTranslation(languageOverride?: Language) {
    
    const storedLanguage = useConfigStore((state) => state.language);
    const lang: Language = languageOverride ?? storedLanguage ?? "th";

    const t = useCallback((key: TranslationKey, params?: Record<string, any>): string => {
        const langTranslations = translations[lang] || translations.th;
        let text = (langTranslations as any)[key] || (translations.th as any)[key] || key;

        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                text = text.replace(new RegExp(`{${k}}`, 'g'), String(v));
            });
        }

        return text;
    }, [lang]);

    return { t, language: lang };
}

