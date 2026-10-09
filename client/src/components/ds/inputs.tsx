import { useId, useRef, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  kbdVariants, segmentedItemVariants,
  type KbdVariants,
} from './variants';

// ---------------------------------------------------------------------------
// Kbd
// ---------------------------------------------------------------------------

type KbdProps = ComponentProps<'kbd'> & KbdVariants;

/** Key cap for shortcuts: `<Kbd>Ctrl</Kbd> <Kbd>K</Kbd>`. */
export const Kbd = ({ size, className, ...props }: KbdProps) => (
  <kbd data-slot="kbd" className={cn(kbdVariants({ size }), className)} {...props} />
);

// ---------------------------------------------------------------------------
// SearchInput
// ---------------------------------------------------------------------------

interface SearchInputProps {
  /** Accessible name; also the placeholder when none is given. */
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  /** Called after the clear button (or Escape) empties the field. */
  onClear?: () => void;
}

/** Controlled search field with a leading icon and a clear button. Escape clears too. */
export const SearchInput = ({ label, value, onValueChange, placeholder, id, className, onClear }: SearchInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const clear = () => {
    onValueChange('');
    onClear?.();
    inputRef.current?.focus();
  };
  return (
    <div className={cn('relative', className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle" />
      <Input
        ref={inputRef}
        id={id}
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder ?? label}
        autoComplete="off"
        onChange={event => onValueChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            clear();
          }
        }}
        className="h-10 bg-white pr-10 pl-9 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={clear}
          className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-text-subtle outline-none hover:text-text-strong focus-visible:outline-2 focus-visible:outline-focus"
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SegmentedControl
// ---------------------------------------------------------------------------

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Accessible name of the group (what the choice is about). */
  'aria-label': string;
  size?: 'sm' | 'md';
  /** Hide labels below `sm` and keep only icons (labels stay in the accessible name). */
  iconOnlyOnMobile?: boolean;
  className?: string;
}

/**
 * Single choice among 2–5 options shown side by side (view switcher, density).
 * `role="radiogroup"`: arrows move and select, Home/End jump, one tab stop.
 */
export const SegmentedControl = <T extends string>({
  options, value, onValueChange, size = 'md', iconOnlyOnMobile, className, 'aria-label': ariaLabel,
}: SegmentedControlProps<T>) => {
  const groupId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((option, index) => ({ option, index })).filter(item => !item.option.disabled);

  const move = (from: number, step: 1 | -1 | 'first' | 'last') => {
    if (enabled.length === 0) return;
    const position = enabled.findIndex(item => item.index === from);
    const next =
      step === 'first' ? 0
        : step === 'last' ? enabled.length - 1
          : (position + step + enabled.length) % enabled.length;
    const target = enabled[next];
    onValueChange(target.option.value);
    refs.current[target.index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys: Record<string, 1 | -1 | 'first' | 'last'> = {
      ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 'first', End: 'last',
    };
    const step = keys[event.key];
    if (step === undefined) return;
    event.preventDefault();
    move(index, step);
  };

  const selectedIndex = options.findIndex(option => option.value === value);
  const tabStop = options[selectedIndex]?.disabled || selectedIndex < 0 ? enabled[0]?.index : selectedIndex;

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex max-w-full gap-0.5 rounded-lg bg-surface-sunken p-0.5', className)}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={node => { refs.current[index] = node; }}
          id={`${groupId}-${option.value}`}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          aria-label={iconOnlyOnMobile ? option.label : undefined}
          disabled={option.disabled}
          tabIndex={index === tabStop ? 0 : -1}
          onClick={() => onValueChange(option.value)}
          onKeyDown={event => onKeyDown(event, index)}
          className={cn(segmentedItemVariants({ selected: option.value === value, size }), 'min-h-8')}
        >
          {option.icon && <span aria-hidden className="flex [&_svg]:size-4">{option.icon}</span>}
          <span className={cn(iconOnlyOnMobile && option.icon && 'sr-only sm:not-sr-only')}>{option.label}</span>
        </button>
      ))}
    </div>
  );
};
