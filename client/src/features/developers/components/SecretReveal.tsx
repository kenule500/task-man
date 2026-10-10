import { KeyRound } from 'lucide-react';
import { Alert } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { CopyButton } from './CopyButton';
import { DialogActions, DialogBody, DialogShell } from './DialogShell';

interface SecretRevealProps {
  title: string;
  /** "API token" or "signing secret" */
  noun: string;
  secret: string;
  onClose: () => void;
}

/** Shows a token or secret once, with a copy button. It cannot be read again after this dialog closes. */
export const SecretReveal = ({ title, noun, secret, onClose }: SecretRevealProps) => (
  <DialogShell
    title={title}
    description={`Copy your ${noun} now and keep it somewhere safe.`}
    icon={<KeyRound />}
    onClose={onClose}
  >
    <DialogBody>
      <Alert tone="warning" title={`You will not see this ${noun} again`}>
        TaskMan stores only what it needs to check it. If you lose it, {noun === 'API token' ? 'revoke it and create a new one' : 'rotate the secret to get a new one'}.
      </Alert>
      <div>
        <p id="secret-reveal-label" className="mb-1 text-xs font-medium text-slate-700">Your {noun}</p>
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
      <Button type="button" onClick={onClose} className="h-11 sm:h-9">I have copied it</Button>
    </DialogActions>
  </DialogShell>
);
