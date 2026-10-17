import { useContext, useMemo, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { i18n as I18nInstance } from 'i18next';
import i18n from '@/i18n';
import { isRtl, type AppLanguage } from '@/i18n/language';
import { cn } from '@/lib/utils';
import { PreviewContext } from './previewContext';

// Preview language of the guide. The language toggle in the header changes how the live specimens render
// (text from the real translation files, reading direction, Arabic font) without touching the language of the
// guide itself: the documentation stays English and left to right, the specimens are the preview.

/** One i18n instance per preview language, sharing the app's resources, so feature components translate in place. */
const instances = new Map<AppLanguage, I18nInstance>();
const instanceFor = (language: AppLanguage): I18nInstance => {
  let instance = instances.get(language);
  if (!instance) {
    instance = i18n.cloneInstance({ lng: language, initAsync: false });
    instances.set(language, instance);
  }
  return instance;
};

export const GuidePreviewProvider = ({ children, initial = 'en' }: { children: ReactNode; initial?: AppLanguage }) => {
  const [language, setLanguage] = useState<AppLanguage>(initial);
  const value = useMemo(() => ({ language, setLanguage }), [language]);
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
};

interface PreviewAreaProps {
  children: ReactNode;
  className?: string;
  /** Extra attributes for the wrapper, for example `data-testid`. */
  [attribute: `data-${string}`]: string | undefined;
}

/**
 * Wraps live specimens. Sets `lang` and `dir` for the preview language (so logical Tailwind classes mirror in Arabic)
 * and provides a matching i18n instance. `data-demo` marks everything inside as an example, not guide content.
 */
export const PreviewArea = ({ children, className, ...rest }: PreviewAreaProps) => {
  const { language } = useContext(PreviewContext);
  return (
    <I18nextProvider i18n={instanceFor(language)}>
      <div {...rest} data-demo="" data-preview-language={language} lang={language} dir={isRtl(language) ? 'rtl' : 'ltr'} className={cn('min-w-0', className)}>
        {children}
      </div>
    </I18nextProvider>
  );
};
