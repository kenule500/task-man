import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipHint, toast } from '@/components/ds';
import { cn } from '@/lib/utils';
import { useThemePreference, type ThemePreference } from '@/lib/theme';
import { saveThemePreference } from '@/lib/themeApi';

const ORDER: ThemePreference[] = ['light', 'dark', 'system'];
const LABELS: Record<ThemePreference, string> = { light: 'Light', dark: 'Dark', system: 'System' };
const ICONS = { light: Sun, dark: Moon, system: Monitor };

interface ThemeToggleProps {
  className?: string;
}

/**
 * Icon button that cycles Light, Dark, System. Mount it in a header or toolbar. The choice applies at once, is kept in
 * this browser and, when signed in, saved on the account. The button names the current mode and the next one.
 */
export const ThemeToggle = ({ className }: ThemeToggleProps) => {
  const { preference } = useThemePreference();
  const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length];
  const Icon = ICONS[preference];

  const onClick = () => {
    void saveThemePreference(next).then(saved => {
      if (!saved) toast.error('We could not save your theme. It applies on this device only. Try again later.');
    });
  };

  return (
    <TooltipHint label={`Theme: ${LABELS[preference]}`}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClick}
        aria-label={`Theme: ${LABELS[preference]}. Switch to ${LABELS[next].toLowerCase()}`}
        className={cn('size-10 text-slate-600 md:size-8', className)}
      >
        <Icon aria-hidden className="size-4" />
      </Button>
    </TooltipHint>
  );
};

export default ThemeToggle;
