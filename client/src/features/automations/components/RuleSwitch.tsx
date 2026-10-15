import { Switch } from '@/components/ui/switch';

interface RuleSwitchProps {
  checked: boolean;
  /** Names the switch for assistive technology, e.g. the rule name */
  label: string;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

/** On/off switch (design-system Switch): applies at once; the touch target is larger than the track. */
export const RuleSwitch = ({ checked, label, disabled, onChange }: RuleSwitchProps) => (
  <Switch checked={checked} aria-label={label} disabled={disabled} onCheckedChange={onChange} />
);
