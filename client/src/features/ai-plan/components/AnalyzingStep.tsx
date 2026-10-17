import { useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, Spinner, Stepper, Surface } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { phaseIndex } from '../lib/progress';
import type { AiPlan } from '../types';

const useElapsedSeconds = (since: string | null | undefined): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const started = since ? new Date(since).getTime() : now;
  return Math.max(0, Math.floor((now - started) / 1000));
};

interface AnalyzingStepProps {
  plan: AiPlan;
  cancelling: boolean;
  timedOut: boolean;
  onCancel: () => void;
}

/** Step 2: the AI is working. Shows the phases, how long it has taken, and lets the person cancel. */
export const AnalyzingStep = ({ plan, cancelling, timedOut, onCancel }: AnalyzingStepProps) => {
  const { t } = useTranslation('aiPlan');
  const elapsed = useElapsedSeconds(plan.startedAt ?? plan.createdAt);
  const current = phaseIndex(plan.status, elapsed);
  const minutes = Math.floor(elapsed / 60);
  const seconds = String(elapsed % 60).padStart(2, '0');

  return (
    <Surface padding="md" className="space-y-5">
      <div className="flex items-center gap-3">
        <FileText aria-hidden className="size-5 shrink-0 text-text-subtle" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-text-strong">{plan.source.fileName}</p>
        <span className="text-sm tabular-nums text-text-subtle">{t('analyzing.elapsed', { time: `${minutes}:${seconds}` })}</span>
      </div>

      <div role="status" aria-live="polite" className="space-y-1">
        <h2 className="flex items-center gap-3 text-lg font-semibold text-text-strong">
          <Spinner decorative /> {t('analyzing.title')}
        </h2>
        <p className="text-sm text-text-body">{t(`analyzing.phase.${current}`)}</p>
      </div>

      <Stepper
        orientation="vertical"
        size="sm"
        current={current}
        label={t('analyzing.stepsLabel')}
        steps={[
          { id: 'read', title: t('analyzing.steps.read'), description: t('analyzing.steps.readHint') },
          { id: 'design', title: t('analyzing.steps.design'), description: t('analyzing.steps.designHint') },
          { id: 'write', title: t('analyzing.steps.write'), description: t('analyzing.steps.writeHint') },
        ]}
      />

      {plan.source.truncated && <Alert tone="warning">{t('analyzing.truncated')}</Alert>}
      {timedOut && <Alert tone="warning" title={t('analyzing.slowTitle')}>{t('analyzing.slowBody')}</Alert>}

      <p className="text-sm text-text-subtle">{t('analyzing.leave')}</p>

      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={cancelling} aria-busy={cancelling} className="h-11 gap-2 rounded-lg sm:h-9">
          <X aria-hidden className="size-4" /> {cancelling ? t('analyzing.cancelling') : t('analyzing.cancel')}
        </Button>
      </div>
    </Surface>
  );
};
