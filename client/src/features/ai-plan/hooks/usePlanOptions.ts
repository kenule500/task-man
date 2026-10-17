import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SelectOption } from '@/features/tasks/constants';
import { STORY_POINT_VALUES } from '../lib/plan';
import type { PlanContent } from '../types';

export const NO_POINTS = 'none';
export const BACKLOG = 'backlog';

/** Select options for the story points: "Not estimated" and the Fibonacci scale up to 13. */
export const usePointOptions = (): SelectOption<string>[] => {
  const { t } = useTranslation('aiPlan');
  return useMemo(() => [
    { value: NO_POINTS, label: t('item.notEstimated') },
    ...STORY_POINT_VALUES.map(points => ({ value: String(points), label: t('item.points', { count: points }) })),
  ], [t]);
};

/** Select options for moving an item: the sprints by name, then the backlog. */
export const useSprintOptions = (plan: PlanContent): SelectOption<string>[] => {
  const { t } = useTranslation('aiPlan');
  return useMemo(() => [
    ...plan.sprints.map((sprint, index) => ({ value: String(index), label: sprint.name || t('sprint.unnamed', { number: index + 1 }) })),
    { value: BACKLOG, label: t('sprint.backlog') },
  ], [plan.sprints, t]);
};
