import { Field, fieldMessageId } from '@/components/ds';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { sanitizeCode } from '@/features/account/lib/twoFactor';

interface OneTimeCodeFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Six-digit authenticator code. `autocomplete="one-time-code"` lets phones and password managers fill it,
 * and pasting "123 456" works because the value is cleaned instead of capped by the input's maxlength.
 */
export const OneTimeCodeField = ({ id, label, value, onChange, error, hint, autoFocus, className }: OneTimeCodeFieldProps) => (
  <Field label={label} htmlFor={id} error={error} hint={hint}>
    <Input
      id={id}
      name={id}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      autoFocus={autoFocus}
      spellCheck={false}
      autoCapitalize="none"
      placeholder="123456"
      value={value}
      onChange={(event) => onChange(sanitizeCode(event.target.value))}
      onPaste={(event) => {
        event.preventDefault();
        onChange(sanitizeCode(event.clipboardData.getData('text')));
      }}
      aria-invalid={Boolean(error)}
      aria-describedby={error || hint ? fieldMessageId(id) : undefined}
      className={cn('h-12 rounded-xl border-slate-300 bg-white text-center font-mono text-xl tracking-[0.4em] text-slate-900 shadow-sm placeholder:tracking-normal placeholder:text-slate-500 md:text-xl', className)}
    />
  </Field>
);
