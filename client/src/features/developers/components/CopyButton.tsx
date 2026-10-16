import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/features/tasks/lib/taskKey';
import { cn } from '@/lib/utils';

interface CopyButtonProps {
  value: string;
  /** What is copied, for assistive technology: "token", "secret", "example" */
  label: string;
  className?: string;
}

/** Copies `value`, shows "Copied" for two seconds and announces it politely. */
export const CopyButton = ({ value, label, className }: CopyButtonProps) => {
  const { t } = useTranslation('admin');
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    if (await copyToClipboard(value)) {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(t('developers.copyFailed'));
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => { void copy(); }}
        className={cn('h-11 gap-2 rounded-lg border-slate-300 text-sm text-slate-700 shadow-none hover:bg-slate-100 sm:h-9', className)}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? t('actions.copied') : t('actions.copy')}<span className="sr-only"> {label}</span>
      </Button>
      <span role="status" className="sr-only">{copied ? t('developers.copiedToClipboard', { label }) : ''}</span>
    </>
  );
};
