import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { NAMESPACES, resources } from './resources';

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'ar'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Right-to-left scripts among the supported languages. */
export const isRtl = (language: string): boolean => language.startsWith('ar');

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
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

i18n.on('languageChanged', applyDocumentLanguage);

export default i18n;
