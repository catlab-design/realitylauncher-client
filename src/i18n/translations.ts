import { enTranslations } from "./translations-en";
import { thTranslations } from "./translations-th";

export const translations = {
  th: thTranslations,
  en: enTranslations,
};

export type TranslationKey = keyof typeof thTranslations;
export type Language = keyof typeof translations;
