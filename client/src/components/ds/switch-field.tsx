import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

type SwitchFieldProps = Omit<ComponentProps<typeof Switch>, 'children' | 'aria-label' | 'aria-labelledby' | 'aria-describedby'> & {
  label: ReactNode;
  description?: ReactNode;
  /** Where the switch sits relative to the text. Settings rows use the default (end). */
  switchPosition?: 'start' | 'end';
};

/**
 * Switch with a visible label and optional description: the standard settings row.
 * Clicking the text toggles it; the label and description name and describe the switch for screen readers.
 */
export const SwitchField = ({
  label, description, switchPosition = 'end', className, id, size, ...switchProps
}: SwitchFieldProps) => {
  const generated = useId();
  const switchId = id ?? `${generated}-switch`;
  const labelId = `${generated}-label`;
  const descriptionId = `${generated}-description`;
  return (
    <div className={cn('flex items-start justify-between gap-4', switchPosition === 'start' && 'flex-row-reverse justify-end', className as string | undefined)}>
      <div className="min-w-0 flex-1">
        <label id={labelId} htmlFor={switchId} className="cursor-pointer text-sm font-medium text-text-strong">{label}</label>
        {description && <p id={descriptionId} className="mt-0.5 text-xs text-text-body">{description}</p>}
      </div>
      <Switch
        id={switchId}
        size={size}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        {...switchProps}
      />
    </div>
  );
};
