import { useState } from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ds';
import { cn } from '@/lib/utils';
import { saveLanguagePreference } from '@/lib/languageApi';
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, isRtl, isSupportedLanguage, toSupportedLanguage } from '@/i18n/language';

interface LanguageSwitcherProps {
  className?: string;
  /** Show the language name next to the globe from the `lg` breakpoint up (always on the landing and sign-in pages) */
  labelFrom?: 'always' | 'lg';
}

/**
 * Globe button with the current language; the menu lists every language in its own script.
 * The choice applies at once (no reload), is kept in this browser and, when signed in, saved on the account.
 */
export const LanguageSwitcher = ({ className, labelFrom = 'lg' }: LanguageSwitcherProps) => {
  const { t, i18n } = useTranslation();
  const current = toSupportedLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'en';
  // Radio items keep a menu open by default; picking a language should close it
  const [open, setOpen] = useState(false);

  const onChange = (value: string) => {
    setOpen(false);
    if (!isSupportedLanguage(value) || value === current) return;
    void saveLanguagePreference(value).then(saved => {
      if (!saved) toast.error(t('languageSaveFailed'));
    });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            aria-label={`${t('language')}: ${LANGUAGE_NAMES[current]}`}
            className={cn('h-10 gap-1.5 px-2.5 text-slate-600 md:h-8', className)}
          />
        }
      >
        <Globe aria-hidden className="size-4" />
        <span className={cn('text-sm', labelFrom === 'lg' && 'hidden lg:inline')} lang={current}>{LANGUAGE_NAMES[current]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuRadioGroup value={current} onValueChange={onChange}>
          {SUPPORTED_LANGUAGES.map(language => (
            <DropdownMenuRadioItem
              key={language}
              value={language}
              lang={language}
              dir={isRtl(language) ? 'rtl' : 'ltr'}
              className="min-h-11 text-slate-700 md:min-h-0"
            >
              {LANGUAGE_NAMES[language]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;
