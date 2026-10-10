import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Upload } from 'lucide-react';
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

const STEPS: StepperStep[] = [
  { id: 'source', title: 'Source' },
  { id: 'upload', title: 'File' },
  { id: 'map', title: 'Map' },
  { id: 'review', title: 'Review' },
  { id: 'import', title: 'Import' },
];

interface ImportWizardProps {
  slug: string;
  wizard: WizardState;
  projects: readonly Project[];
  canCreateProject: boolean;
}

/** The five-step import flow. Each step has one heading; focus moves to it when the step changes. */
export const ImportWizard = ({ slug, wizard, projects, canCreateProject }: ImportWizardProps) => {
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
    source: 'Choose where your work comes from',
    upload: 'Upload the file',
    map: 'Map it to this workspace',
    review: 'Review before importing',
    import: wizard.result ? 'Import finished' : wizard.importError ? 'Import failed' : 'Importing',
  } as const;

  return (
    <div className="space-y-5">
      <Stepper steps={STEPS} current={index} label="Import progress" size="sm" />

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
                <ArrowLeft aria-hidden /> Back
              </Button>
            ) : <span />}
            {step === 'review' ? (
              <Button type="button" className="h-11 sm:h-9" disabled={!canContinue} onClick={() => { void wizard.runImport(); }}>
                <Upload aria-hidden /> Import {preview?.total.toLocaleString()} {preview?.total === 1 ? 'task' : 'tasks'}
              </Button>
            ) : (
              <Button type="button" className="h-11 sm:h-9" disabled={!canContinue} onClick={wizard.next}>
                Continue <ArrowRight aria-hidden />
              </Button>
            )}
          </div>
        )}
      </Surface>
    </div>
  );
};
