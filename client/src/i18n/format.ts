// Locale-aware formatting that follows the interface language. Calendar-day logic (YYYY-MM-DD keys) lives in
// features/tasks/lib/date.ts and is untouched: only the display of a date, time or number goes through here.
import { currentLanguage } from './index';
import type { AppLanguage } from './language';

/**
 * BCP 47 tags used for Intl. English keeps the US pattern the screens were designed with (a few places ask for en-GB).
 * Arabic uses Western digits (0-9) like most Arabic product UIs, so keys, counts and ids line up in tables and mixed text.
 */
const LOCALES: Record<AppLanguage, string> = { en: 'en-US', fr: 'fr-FR', ar: 'ar-u-nu-latn' };

/** The Intl locale for the current interface language; `english` overrides the English variant (e.g. 'en-GB'). */
export const currentLocale = (english?: string): string => {
  const language = currentLanguage();
  return language === 'en' && english ? english : LOCALES[language];
};

export const formatNumber = (value: number, options?: Intl.NumberFormatOptions): string =>
  new Intl.NumberFormat(currentLocale(), options).format(value);

export const formatPercent = (fraction: number): string => formatNumber(fraction, { style: 'percent' });

/** A date or date-time for display in the interface language. */
export const formatDateTimeIn = (value: Date, options: Intl.DateTimeFormatOptions, english?: string): string =>
  new Intl.DateTimeFormat(currentLocale(english), options).format(value);

/** Formatter that rebuilds itself when the language changes (module-level constants would be stuck on the first language). */
export const localeFormatter = (options: Intl.DateTimeFormatOptions, english?: string) => {
  let cache: { locale: string; format: Intl.DateTimeFormat } | null = null;
  return (value: Date): string => {
    const locale = currentLocale(english);
    if (!cache || cache.locale !== locale) cache = { locale, format: new Intl.DateTimeFormat(locale, options) };
    return cache.format.format(value);
  };
};

/** "in 3 days" / "3 days ago" with the language's own plural and word order. */
export const formatRelative = (value: number, unit: Intl.RelativeTimeFormatUnit): string =>
  new Intl.RelativeTimeFormat(currentLocale(), { numeric: 'auto' }).format(value, unit);
