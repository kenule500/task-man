import { cn } from '@/lib/utils';

interface RuleSwitchProps {
  checked: boolean;
  /** Names the switch for assistive technology, e.g. the rule name */
  label: string;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

/** On/off switch (role="switch"): applies at once; the touch target is larger than the track. */
export const RuleSwitch = ({ checked, label, disabled, onChange }: RuleSwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      'relative h-6 w-11 shrink-0 rounded-full before:absolute before:-inset-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 motion-safe:transition-colors',
      checked ? 'bg-primary' : 'bg-slate-500',
    )}
  >
    <span
      aria-hidden
      className={cn(
        'absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm motion-safe:transition-transform',
        checked ? 'translate-x-5' : 'translate-x-0',
      )}
    />
  </button>
);
