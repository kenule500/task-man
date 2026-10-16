import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Stepper, Surface, type StepperStep } from '@/components/ds';
import { Button } from '@/components/ui/button';
import type { Project } from '@/features/projects';
import { hasMappingProblems } from '../lib/mapping';
import { WIZARD_STEPS, type ImportWizard as WizardState } from '../hooks/useImportWizard';
import { MapStep } from './MapStep';
import { ResultStep } from './ResultStep';
import { ReviewStep } from './ReviewStep';
import { SourceStep } from './SourceStep';
import { UploadStep } from './UploadStep';
import { currentLocale } from '@/i18n/format';

interface ImportWizardProps {
  slug: string;
  wizard: WizardState;
  projects: readonly Project[];
  canCreateProject: boolean;
}

/** The five-step import flow. Each step has one heading; focus moves to it when the step changes. */
export const ImportWizard = ({ slug, wizard, projects, canCreateProject }: ImportWizardProps) => {
  const { t } = useTranslation('admin');
  const stepList: StepperStep[] = ['source', 'upload', 'map', 'review', 'import'].map(id => ({ id, title: t(`import.steps.${id}`) }));
  const { step, preview, draft, problems } = wizard;
  const index = WIZARD_STEPS.indexOf(step);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  const overLimit = Boolean(preview && preview.total > preview.limit);
  const canContinue =
    step === 'source' ? true
      : step === 'upload' ? Boolean(preview) && !wizard.reading && !wizard.fileError
        : step === 'map' ? Boolean(draft) && !hasMappingProblems(problems)
          : step === 'review' ? Boolean(preview) && !overLimit
            : false;

  const titles = {
    source: t('import.titles.source'),
    upload: t('import.titles.upload'),
    map: t('import.titles.map'),
    review: t('import.titles.review'),
    import: wizard.result ? t('import.titles.finished') : wizard.importError ? t('import.titles.failed') : t('import.titles.importing'),
  } as const;

  return (
    <div className="space-y-5">
      <Stepper steps={stepList} current={index} label={t('import.progress')} size="sm" />

      <Surface as="section" aria-labelledby="import-step-title" className="space-y-5">
        <h2 id="import-step-title" ref={heading} tabIndex={-1} className="text-base font-semibold text-text-strong outline-none">
          {titles[step]}
        </h2>

        {step === 'source' && <SourceStep source={wizard.source} onChange={wizard.chooseSource} />}
        {step === 'upload' && (
          <UploadStep
            source={wizard.source}
            file={wizard.file}
            reading={wizard.reading}
            error={wizard.fileError}
            onFile={file => { void wizard.loadFile(file); }}
            onClear={wizard.clearFile}
          />
        )}
        {step === 'map' && preview && draft && (
          <MapStep
            preview={preview}
            draft={draft}
            onChange={wizard.setDraft}
            projects={projects}
            canCreateProject={canCreateProject}
            problems={problems}
          />
        )}
        {step === 'review' && preview && draft && <ReviewStep preview={preview} draft={draft} />}
        {step === 'import' && (
          <ResultStep
            slug={slug}
            total={preview?.total ?? 0}
            importing={wizard.importing}
            error={wizard.importError}
            result={wizard.result}
            onBack={wizard.backToReview}
            onAnother={wizard.reset}
          />
        )}

        {step !== 'import' && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-between">
            {index > 0 ? (
              <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={wizard.back}>
                <ArrowLeft className="rtl:-scale-x-100" aria-hidden /> {t('import.back')}
              </Button>
            ) : <span />}
            {step === 'review' ? (
              <Button type="button" className="h-11 sm:h-9" disabled={!canContinue} onClick={() => { void wizard.runImport(); }}>
                <Upload aria-hidden /> {t('import.importTasks', { count: preview?.total ?? 0, n: preview?.total.toLocaleString(currentLocale()) })}
              </Button>
            ) : (
              <Button type="button" className="h-11 sm:h-9" disabled={!canContinue} onClick={wizard.next}>
                {t('import.continue')} <ArrowRight className="rtl:-scale-x-100" aria-hidden />
              </Button>
            )}
          </div>
        )}
      </Surface>
    </div>
  );
};
