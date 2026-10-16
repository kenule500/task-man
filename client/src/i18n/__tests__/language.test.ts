import i18n from '@/i18n';
import { currentLocale, formatNumber, localeFormatter } from '../format';
import { detectLanguage, isRtl, languageFromBrowser, toSupportedLanguage } from '../language';
import { getStoredLanguage, setStoredLanguage } from '@/utils/session';
import { formatDate } from '@/features/tasks/lib/date';

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('language detection', () => {
  it('maps a browser tag to a supported language', () => {
    expect(toSupportedLanguage('fr-CA')).toBe('fr');
    expect(toSupportedLanguage('ar_EG')).toBe('ar');
    expect(toSupportedLanguage('EN-gb')).toBe('en');
    expect(toSupportedLanguage('de')).toBeNull();
    expect(toSupportedLanguage('')).toBeNull();
  });

  it('picks the first supported entry of navigator.languages, otherwise English', () => {
    expect(languageFromBrowser(['de-DE', 'fr-FR', 'en-US'])).toBe('fr');
    expect(languageFromBrowser(['ar-SA'])).toBe('ar');
    expect(languageFromBrowser(['ja', 'zh'])).toBe('en');
    expect(languageFromBrowser([])).toBe('en');
  });

  it('prefers the saved choice over the browser', () => {
    setStoredLanguage('ar');
    expect(detectLanguage()).toBe('ar');
    localStorage.setItem('taskman.language', 'xx');
    expect(detectLanguage()).toBe('en');
  });

  it('reads right to left only for Arabic', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('ar-EG')).toBe(true);
    expect(isRtl('fr')).toBe(false);
    expect(isRtl('en')).toBe(false);
  });
});

describe('language storage', () => {
  it('keeps the language in the browser through the session helper', () => {
    expect(getStoredLanguage()).toBeNull();
    setStoredLanguage('fr');
    expect(getStoredLanguage()).toBe('fr');
    expect(localStorage.getItem('taskman.language')).toBe('fr');
  });
});

describe('locale formatting follows the interface language', () => {
  it('formats dates, numbers and the en-GB override per language', async () => {
    expect(currentLocale()).toBe('en-US');
    expect(currentLocale('en-GB')).toBe('en-GB');
    expect(formatDate('2026-10-09')).toBe('Oct 9, 2026');
    expect(formatNumber(1234567)).toBe('1,234,567');

    await i18n.changeLanguage('fr');
    expect(currentLocale('en-GB')).toBe('fr-FR');
    expect(formatDate('2026-10-09')).toContain('oct');
    expect(formatDate('2026-10-09')).toContain('2026');

    await i18n.changeLanguage('ar');
    // Arabic uses Western digits, so ids, counts and dates line up with the rest of the interface
    expect(formatNumber(1234)).toMatch(/1.?234/);
    expect(formatDate('2026-10-09')).toMatch(/2026/);
  });

  it('rebuilds a cached formatter when the language changes', async () => {
    const format = localeFormatter({ month: 'long' });
    const date = new Date(2026, 9, 9);
    expect(format(date)).toBe('October');
    await i18n.changeLanguage('fr');
    expect(format(date)).toBe('octobre');
  });
});
