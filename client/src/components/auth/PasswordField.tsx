import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Field, fieldMessageId } from '@/components/ds';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MIN_PASSWORD_LENGTH, getPasswordStrength } from './validation';

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  /** `current-password` to sign in, `new-password` when choosing one */
  autoComplete: 'current-password' | 'new-password';
  /** Shows the minimum-length hint and a strength meter */
  showStrength?: boolean;
  hint?: string;
  /** Link shown under the field, right-aligned (e.g. "Forgot password?") */
  footerLink?: React.ReactNode;
  placeholder?: string;
  className?: string;
}

const STRENGTH_BAR = ['bg-slate-200', 'bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500'];

/** Password input with a show/hide toggle, optional strength hint and inline error. */
const PasswordField = ({
  id, label, value, onChange, onBlur, error, autoComplete, showStrength = false, hint, footerLink, placeholder, className,
}: PasswordFieldProps) => {
  const [shown, setShown] = useState(false);
  const strength = getPasswordStrength(value);
  const describedBy = [error || hint || showStrength ? fieldMessageId(id) : '', showStrength ? `${id}-strength` : '']
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div className={className}>
      <Field
        label={label}
        htmlFor={id}
        error={error}
        hint={hint ?? (showStrength ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined)}
      >
        <div className="relative">
          <Input
            id={id}
            name={id}
            type={shown ? 'text' : 'password'}
            required
            autoComplete={autoComplete}
            autoCapitalize="none"
            spellCheck={false}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            placeholder={placeholder}
            className="h-12 rounded-xl border-slate-300 bg-white pr-12 text-base text-slate-900 shadow-sm placeholder:text-slate-500 md:text-base"
          />
          <button
            type="button"
            onClick={() => setShown((current) => !current)}
            aria-label={shown ? 'Hide password' : 'Show password'}
            aria-pressed={shown}
            className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-primary"
          >
            {shown ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </button>
        </div>
      </Field>
      {footerLink && <div className="mt-1.5 text-right text-sm">{footerLink}</div>}
      {showStrength && value && (
        <div id={`${id}-strength`} className="mt-2" aria-live="polite">
          <div className="flex gap-1" aria-hidden>
            {[1, 2, 3, 4].map((segment) => (
              <span
                key={segment}
                className={cn('h-1 flex-1 rounded-full motion-safe:transition-colors', segment <= strength.score ? STRENGTH_BAR[strength.score] : 'bg-slate-200')}
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-600">Strength: {strength.label}</p>
        </div>
      )}
    </div>
  );
};

export default PasswordField;
