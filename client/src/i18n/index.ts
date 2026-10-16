import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { NAMESPACES, resources } from './resources';
import { DEFAULT_LANGUAGE, detectLanguage, isRtl, toSupportedLanguage, SUPPORTED_LANGUAGES, type AppLanguage } from './language';
import { setStoredLanguage } from '@/utils/session';

export { SUPPORTED_LANGUAGES, isRtl, detectLanguage, LANGUAGE_NAMES } from './language';
export type { AppLanguage } from './language';

/** Sets `lang` and `dir` on <html> so the browser, screen readers and CSS logical properties follow the language. */
export const applyDocumentLanguage = (language: string): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  document.documentElement.dir = isRtl(language) ? 'rtl' : 'ltr';
};

void i18n.use(initReactI18next).init({
  resources,
  ns: [...NAMESPACES],
  defaultNS: 'common',
  lng: detectLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

i18n.on('languageChanged', applyDocumentLanguage);
applyDocumentLanguage(i18n.language || detectLanguage());

/** The language the interface shows right now. */
export const currentLanguage = (): AppLanguage => toSupportedLanguage(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LANGUAGE;

/**
 * Switches the interface language without reloading and remembers it in this browser.
 * Account storage is done by the caller (the switcher and Settings → Profile), which knows whether anyone is signed in.
 */
export const setLanguage = async (language: AppLanguage): Promise<void> => {
  setStoredLanguage(language);
  await i18n.changeLanguage(language);
};

/** Translate outside React (plain helpers, toasts, validators); components use useTranslation. */
export const t = i18n.t.bind(i18n);

export default i18n;
