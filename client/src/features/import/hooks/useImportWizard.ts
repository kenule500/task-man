import { useCallback, useMemo, useRef, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { invalidate, tasksKey } from '@/lib/queryCache';
import type { Project } from '@/features/projects';
import { importApi } from '../api';
import { checkImportFile, readFileText } from '../lib/sources';
import { buildCommitMapping, hasMappingProblems, initialMapping, mappingProblems, projectNameFromFile } from '../lib/mapping';
import type { ImportPreview, ImportResult, ImportSource, MappingDraft } from '../types';

export const WIZARD_STEPS = ['source', 'upload', 'map', 'review', 'import'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface PickedFile {
  name: string;
  size: number;
}

interface Options {
  canCreateProject: boolean;
  projects: readonly Project[];
  /** Refresh the project list after an import created a project or sprints. */
  onImported?: () => void;
}

/**
 * State of the import wizard: source, file text, the server preview, the user's mapping and the final result.
 * The file is read in the browser and sent as text; nothing is stored until the last step.
 */
export const useImportWizard = (slug: string | undefined, { canCreateProject, projects, onImported }: Options) => {
  const [step, setStep] = useState<WizardStep>('source');
  const [source, setSourceState] = useState<ImportSource>('trello');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [draft, setDraft] = useState<MappingDraft | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileError, setFileError] = useState('');
  const [importError, setImportError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  // A newer file or a reset makes older answers stale
  const run = useRef(0);

  const clearFile = useCallback(() => {
    run.current++;
    setFile(null);
    setContent('');
    setPreview(null);
    setDraft(null);
    setFileError('');
    setReading(false);
  }, []);

  const chooseSource = useCallback((next: ImportSource) => {
    setSourceState(next);
    clearFile();
  }, [clearFile]);

  const loadFile = useCallback(async (picked: File) => {
    if (!slug) return;
    const problem = checkImportFile(picked, source);
    const ticket = ++run.current;
    setFile({ name: picked.name, size: picked.size });
    setPreview(null);
    setDraft(null);
    setContent('');
    if (problem) {
      setFileError(problem);
      return;
    }
    setFileError('');
    setReading(true);
    try {
      const text = await readFileText(picked);
      if (ticket !== run.current) return;
      const summary = await importApi.preview(slug, source, text);
      if (ticket !== run.current) return;
      setContent(text);
      setPreview(summary);
      setDraft(initialMapping(summary, {
        canCreateProject,
        projects,
        suggestedName: projectNameFromFile(picked.name),
      }));
    } catch (error) {
      if (ticket !== run.current) return;
      setFileError(getApiErrorMessage(error, 'We could not read this file.'));
    } finally {
      if (ticket === run.current) setReading(false);
    }
  }, [slug, source, canCreateProject, projects]);

  const problems = useMemo(
    () => (draft ? mappingProblems(draft, { canCreateProject, projects }) : {}),
    [draft, canCreateProject, projects],
  );

  const next = useCallback(() => {
    setStep(current => WIZARD_STEPS[Math.min(WIZARD_STEPS.indexOf(current) + 1, WIZARD_STEPS.length - 1)]);
  }, []);
  const back = useCallback(() => {
    setStep(current => WIZARD_STEPS[Math.max(WIZARD_STEPS.indexOf(current) - 1, 0)]);
  }, []);

  const runImport = useCallback(async () => {
    if (!slug || !draft || !preview || hasMappingProblems(problems)) return;
    setImportError('');
    setImporting(true);
    setStep('import');
    try {
      const done = await importApi.commit(slug, source, content, buildCommitMapping(draft));
      setResult(done);
      // The new tasks (and project) must show on the next screen
      invalidate(tasksKey(slug));
      onImported?.();
    } catch (error) {
      setImportError(getApiErrorMessage(error, 'The import failed. Nothing was imported.'));
    } finally {
      setImporting(false);
    }
  }, [slug, draft, preview, problems, source, content, onImported]);

  const reset = useCallback(() => {
    clearFile();
    setResult(null);
    setImportError('');
    setStep('source');
  }, [clearFile]);

  return {
    step, source, file, content, preview, draft, setDraft, reading, importing, fileError, importError, result, problems,
    chooseSource, loadFile, clearFile, next, back, runImport, reset,
    /** Back from a failed import to the review step. */
    backToReview: () => { setImportError(''); setStep('review'); },
  };
};

export type ImportWizard = ReturnType<typeof useImportWizard>;
