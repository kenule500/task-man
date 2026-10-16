// Which languages exist and how a visitor's language is chosen. Pure (no i18next import) so any module can use it.
import { getStoredLanguage } from '@/utils/session';

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'ar'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: AppLanguage = 'en';

/** Each language written in itself, as people look for it in a menu. */
export const LANGUAGE_NAMES: Record<AppLanguage, string> = { en: 'English', fr: 'Français', ar: 'العربية' };

/** Right-to-left scripts among the supported languages. */
export const isRtl = (language: string): boolean => language.startsWith('ar');

export const isSupportedLanguage = (value: unknown): value is AppLanguage =>
  typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);

/** "fr-CA" -> "fr"; anything unsupported -> null. */
export const toSupportedLanguage = (tag: string | null | undefined): AppLanguage | null => {
  if (!tag) return null;
  const base = tag.toLowerCase().split(/[-_]/)[0];
  return isSupportedLanguage(base) ? base : null;
};

/** First visit: the first supported entry of the browser's language list, otherwise English. */
export const languageFromBrowser = (languages: readonly string[] = typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language])): AppLanguage => {
  for (const tag of languages) {
    const match = toSupportedLanguage(tag);
    if (match) return match;
  }
  return DEFAULT_LANGUAGE;
};

/** The saved choice wins; a first visit follows the browser. */
export const detectLanguage = (): AppLanguage => toSupportedLanguage(getStoredLanguage()) ?? languageFromBrowser();
