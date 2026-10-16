import { useTranslation } from 'react-i18next';
import { isRtl } from './language';

/** True while the interface language reads right to left (re-renders when the language changes). */
export const useIsRtl = (): boolean => {
  const { i18n } = useTranslation();
  return isRtl(i18n.resolvedLanguage ?? i18n.language ?? 'en');
};

/** Sheets and sidebars name physical sides; they follow the reading direction, so "left" means the start edge. */
export const physicalSide = <T extends string>(side: T, rtl: boolean): T =>
  (rtl ? (side === 'left' ? 'right' : side === 'right' ? 'left' : side) : side) as T;

/** The document direction as an attribute value, for islands that stay left to right but hold translated text. */
export const useDir = (): 'ltr' | 'rtl' => (useIsRtl() ? 'rtl' : 'ltr');
