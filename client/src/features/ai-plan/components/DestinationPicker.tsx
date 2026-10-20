import { useId, useRef, useState } from 'react';
import { FolderKanban, FolderPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Project } from '@/features/projects';
import type { PlanDestination, PlanTarget } from '../types';
import { destinationTarget, targetProblem } from '../lib/destination';
import { ProjectPicker } from './ProjectPicker';

interface DestinationPickerProps {
  slug: string;
  destination: PlanDestination;
  onDestinationChange: (destination: PlanDestination) => void;
  targetProjectId: string | null;
  onTargetChange: (projectId: string | null) => void;
  projects: Project[];
  projectsLoading: boolean;
  /** The review step can pass the target it resolved, so an archived or deleted one is noticed. */
  serverTarget?: PlanTarget | null;
  disabled?: boolean;
}

const optionClass =
  'flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border-strong bg-surface-raised p-3 text-start transition-colors has-[:checked]:border-primary has-[:checked]:bg-info-bg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary';

/** The two destinations: a new project (the default), or a project the workspace already uses. */
export const DestinationPicker = ({
  slug, destination, onDestinationChange, targetProjectId, onTargetChange, projects, projectsLoading, serverTarget, disabled = false,
}: DestinationPickerProps) => {
  const { t } = useTranslation('aiPlan');
  const name = useId();
  const changeRef = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);
  const problem = targetProblem(destination, targetProjectId, projects, serverTarget);
  const problemText = problem ? t(`destination.problems.${problem}`) : undefined;
  const target = destinationTarget(projects, targetProjectId, serverTarget);

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-semibold text-text-strong">{t('destination.title')}</legend>
      <p className="text-sm text-text-subtle">{t('destination.hint')}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className={cn(optionClass, disabled && 'cursor-not-allowed opacity-60')}>
          <input
            type="radio"
            name={name}
            value="new"
            checked={destination === 'new'}
            onChange={() => onDestinationChange('new')}
            className="sr-only"
          />
          <FolderPlus aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-text-strong">{t('destination.new.title')}</span>
            <span className="mt-0.5 block text-xs text-text-subtle">{t('destination.new.body')}</span>
          </span>
        </label>
        <label className={cn(optionClass, disabled && 'cursor-not-allowed opacity-60')}>
          <input
            type="radio"
            name={name}
            value="existing"
            checked={destination === 'existing'}
            onChange={() => onDestinationChange('existing')}
            className="sr-only"
          />
          <FolderKanban aria-hidden className="mt-0.5 size-5 shrink-0 text-text-subtle" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-text-strong">{t('destination.existing.title')}</span>
            <span className="mt-0.5 block text-xs text-text-subtle">{t('destination.existing.body')}</span>
          </span>
        </label>
      </div>
      {destination === 'existing' && (
        <div className="pt-1">
          {target && !picking ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-strong bg-surface-sunken px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text-subtle">{t('destination.selected')}</p>
                  <p className="truncate text-sm font-semibold text-text-strong">
                    {target.name}
                    <span className="ms-2 font-mono text-xs font-normal text-text-subtle">{target.key}</span>
                  </p>
                </div>
                <Button
                  ref={changeRef}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPicking(true)}
                  className="min-h-11 sm:min-h-8"
                >
                  {t('destination.change')}
                </Button>
              </div>
              {problemText && <p role="alert" className="text-sm font-medium text-danger-fg">{problemText}</p>}
            </div>
          ) : (
            <ProjectPicker
              slug={slug}
              projects={projects}
              loading={projectsLoading}
              value={targetProjectId}
              onChange={next => {
                onTargetChange(next);
                if (next) {
                  setPicking(false);
                  requestAnimationFrame(() => changeRef.current?.focus());
                }
              }}
              error={problemText}
              autoFocus={picking}
            />
          )}
        </div>
      )}
    </fieldset>
  );
};
