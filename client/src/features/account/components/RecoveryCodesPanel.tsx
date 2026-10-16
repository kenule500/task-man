import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Download } from 'lucide-react';
import { Alert } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { recoveryCodesFile } from '../lib/twoFactor';

interface RecoveryCodesPanelProps {
  codes: string[];
  account: string;
}

/** The recovery codes with copy and download. Shown right after they are created: they cannot be read again. */
export const RecoveryCodesPanel = ({ codes, account }: RecoveryCodesPanelProps) => {
  const { t } = useTranslation('settings');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([recoveryCodesFile(codes, account)], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'taskman-recovery-codes.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Alert tone="warning" title={t('twoFactor.codes.saveNow')}>
        {t('twoFactor.codes.onlyOnce')}
      </Alert>
      <ul
        aria-label={t('twoFactor.codes.list')}
        className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-900"
      >
        {codes.map((code) => (
          <li key={code} className="rounded-md bg-white px-3 py-2 text-center tracking-wider shadow-sm">{code}</li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={() => void copy()} className="h-11 flex-1 gap-2 sm:h-10">
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? t('common:copied') : t('twoFactor.codes.copy')}
        </Button>
        <Button type="button" variant="outline" onClick={download} className="h-11 flex-1 gap-2 sm:h-10">
          <Download aria-hidden /> {t('twoFactor.codes.download')}
        </Button>
      </div>
      <p role="status" className="sr-only">{copied ? t('twoFactor.codes.copiedStatus') : ''}</p>
    </div>
  );
};
