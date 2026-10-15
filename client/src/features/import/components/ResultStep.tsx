import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Alert, DotsLoader, Spinner, Surface } from '@/components/ds';
import { Button, buttonVariants } from '@/components/ui/button';
import type { ImportResult } from '../types';

interface ResultStepProps {
  slug: string;
  total: number;
  importing: boolean;
  error: string;
  result: ImportResult | null;
  onBack: () => void;
  onAnother: () => void;
}

/** Step 5: the request is running, then either the result with a link to the board or the reason it failed. */
export const ResultStep = ({ slug, total, importing, error, result, onBack, onAnother }: ResultStepProps) => {
  if (importing) {
    return (
      <Surface padding="lg" className="flex flex-col items-center gap-3 text-center shadow-none" aria-busy="true">
        <Spinner size="lg" label="Importing" />
        <p className="text-sm font-medium text-text-strong">Creating {total.toLocaleString()} {total === 1 ? 'task' : 'tasks'}…</p>
        <p className="text-xs text-text-subtle">Keep this page open. Large files can take a little while.</p>
        <DotsLoader label="Working" />
      </Surface>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert tone="error" title="Nothing was imported">{error}</Alert>
        <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={onBack}>Back to review</Button>
      </div>
    );
  }

  if (!result) return null;
  const board = `/${slug}/tasks?view=board&project=${encodeURIComponent(result.project.name)}`;
  return (
    <div className="space-y-4">
      <Surface padding="lg" className="flex flex-col items-center gap-2 text-center shadow-none" role="status">
        <CheckCircle2 aria-hidden className="size-10 text-success-fg" />
        <h2 className="text-lg font-semibold text-text-strong">
          Imported {result.created.toLocaleString()} {result.created === 1 ? 'task' : 'tasks'} into {result.project.name}
        </h2>
        <p className="text-sm text-text-body tabular-nums">
          {result.skipped > 0 ? `${result.skipped.toLocaleString()} left out. ` : ''}
          {result.sprintsCreated > 0 ? `${result.sprintsCreated} ${result.sprintsCreated === 1 ? 'sprint' : 'sprints'} created.` : ''}
        </p>
      </Surface>

      {result.warnings.length > 0 && (
        <Alert tone="warning" title="Worth a look">
          <ul className="list-disc space-y-0.5 pl-4">
            {result.warnings.map(warning => <li key={warning}>{warning}</li>)}
          </ul>
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link to={board} className={buttonVariants({ className: 'h-11 sm:h-9' })}>Open the board</Link>
        <Link to={`/${slug}/projects/${result.project._id}`} className={buttonVariants({ variant: 'outline', className: 'h-11 sm:h-9' })}>
          Open the project
        </Link>
        <Button type="button" variant="ghost" className="h-11 sm:h-9" onClick={onAnother}>Import another file</Button>
      </div>
    </div>
  );
};
