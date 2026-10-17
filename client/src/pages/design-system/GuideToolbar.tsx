import { Monitor, Moon, Sun } from 'lucide-react';
import { SegmentedControl } from '@/components/ds';
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, isRtl, type AppLanguage } from '@/i18n/language';
import { useThemePreference, setThemePreference, type ThemePreference } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useGuidePreview } from './previewContext';

const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map(value => ({ value, label: LANGUAGE_NAMES[value] }));

const THEME_OPTIONS = [
  { value: 'light' as const, label: 'Light', icon: <Sun /> },
  { value: 'dark' as const, label: 'Dark', icon: <Moon /> },
  { value: 'system' as const, label: 'System', icon: <Monitor /> },
];

/**
 * Preview controls of the guide. Language changes how the live specimens read (text from the real translation files,
 * direction, font) and leaves the documentation itself in English. Theme switches the whole page, the same
 * light/dark/system preference the app uses, kept in this browser only.
 */
export const GuideToolbar = ({ className }: { className?: string }) => {
  const { language, setLanguage } = useGuidePreview();
  const { preference } = useThemePreference();

  return (
    <div role="group" aria-label="Preview settings" className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      <SegmentedControl<AppLanguage>
        aria-label="Specimen language"
        size="sm"
        options={LANGUAGE_OPTIONS}
        value={language}
        onValueChange={setLanguage}
      />
      <SegmentedControl<ThemePreference>
        aria-label="Guide theme"
        size="sm"
        iconOnlyOnMobile
        options={THEME_OPTIONS}
        value={preference}
        onValueChange={setThemePreference}
      />
      <p role="status" className="sr-only">
        Specimens are shown in {LANGUAGE_NAMES[language]}, {isRtl(language) ? 'right to left' : 'left to right'}.
      </p>
    </div>
  );
};
