import { currentLanguage } from '@/i18n';
import type { PlanUploadOptions } from '../types';
import { nextMondayKey } from './file';

/** The upload options before the person changes anything: two-week sprints from next Monday, in the interface language. */
export const defaultOptions = (): PlanUploadOptions => ({
  projectName: '',
  projectKey: '',
  sprintLengthWeeks: 2,
  startDate: nextMondayKey(),
  teamSize: '',
  extraInstructions: '',
  language: currentLanguage(),
  destination: 'new',
  targetProjectId: null,
});
