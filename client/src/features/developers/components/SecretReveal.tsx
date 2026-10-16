import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { CopyButton } from './CopyButton';
import { DialogActions, DialogBody, DialogShell } from './DialogShell';

interface SecretRevealProps {
  title: string;
  /** "API token" or "signing secret" */
  noun: string;
  secret: string;
  /** True for an API token (the loss advice differs from a webhook secret). */
  isToken?: boolean;
  onClose: () => void;
}

/** Shows a token or secret once, with a copy button. It cannot be read again after this dialog closes. */
export const SecretReveal = ({ title, noun, secret, isToken = false, onClose }: SecretRevealProps) => {
  const { t } = useTranslation('admin');
  return (
  <DialogShell
    title={title}
    description={t('developers.secretDescription', { noun })}
    icon={<KeyRound />}
    onClose={onClose}
  >
    <DialogBody>
      <Alert tone="warning" title={t('developers.secretWarning', { noun })}>
        {isToken ? t('developers.secretWarningBodyToken') : t('developers.secretWarningBodySecret')}
      </Alert>
      <div>
        <p id="secret-reveal-label" className="mb-1 text-xs font-medium text-slate-700">{t('developers.yourNoun', { noun })}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code
            aria-labelledby="secret-reveal-label"
            className="min-w-0 flex-1 select-all break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-800 sm:text-sm"
          >
            {secret}
          </code>
          <CopyButton value={secret} label={noun} />
        </div>
      </div>
    </DialogBody>
    <DialogActions>
      <Button type="button" onClick={onClose} className="h-11 sm:h-9">{t('developers.copiedIt')}</Button>
    </DialogActions>
  </DialogShell>
  );
};
