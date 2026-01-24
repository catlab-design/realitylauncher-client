import { useCallback } from 'react';
import { translations, type Language, type TranslationKey } from "../i18n/translations";
import { useConfigStore } from "../store/configStore";

/**
 * Hook to use translations in components
 * Reads language from Zustand configStore (persisted)
 * If `language` param is provided, it overrides the store value
 */
export function useTranslation(languageOverride?: Language) {
    // Read from config store; will re-render on language change
    const storedLanguage = useConfigStore((state) => state.language);
    const lang: Language = languageOverride ?? storedLanguage ?? "th";

    const t = useCallback((key: TranslationKey): string => {
        const langTranslations = translations[lang] || translations.th;
        return (langTranslations as any)[key] || (translations.th as any)[key] || key;
    }, [lang]);

    return { t, language: lang };
}

