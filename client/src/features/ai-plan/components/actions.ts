import type { PlanContent, PlanItem, PlanProject, PlanSprint, PlanSubtask } from '../types';
import {
  addItem, addSubtask, moveItem, removeItem, removeSubtask, updateItem, updateProject, updateSprint, updateSubtask,
} from '../lib/plan';

/** Everything a person can change in the generated plan; each call edits the draft held by `useAiProjectPlan`. */
export interface PlanActions {
  updateProject: (patch: Partial<PlanProject>) => void;
  updateSprint: (index: number, patch: Partial<Pick<PlanSprint, 'name' | 'goal'>>) => void;
  updateItem: (ref: string, patch: Partial<PlanItem>) => void;
  moveItem: (ref: string, sprintIndex: number | null) => void;
  removeItem: (ref: string) => void;
  addItem: (sprintIndex: number | null, title: string) => void;
  addSubtask: (ref: string, title: string) => void;
  updateSubtask: (ref: string, index: number, patch: Partial<PlanSubtask>) => void;
  removeSubtask: (ref: string, index: number) => void;
  /** Puts back a whole earlier plan (Undo). */
  replace: (plan: PlanContent) => void;
}

/** Binds the pure editing helpers to a draft updater. */
export const planActions = (edit: (change: (plan: PlanContent) => PlanContent) => void): PlanActions => ({
  updateProject: patch => edit(plan => updateProject(plan, patch)),
  updateSprint: (index, patch) => edit(plan => updateSprint(plan, index, patch)),
  updateItem: (ref, patch) => edit(plan => updateItem(plan, ref, patch)),
  moveItem: (ref, sprintIndex) => edit(plan => moveItem(plan, ref, sprintIndex)),
  removeItem: ref => edit(plan => removeItem(plan, ref)),
  addItem: (sprintIndex, title) => edit(plan => addItem(plan, sprintIndex, title)),
  addSubtask: (ref, title) => edit(plan => addSubtask(plan, ref, title)),
  updateSubtask: (ref, index, patch) => edit(plan => updateSubtask(plan, ref, index, patch)),
  removeSubtask: (ref, index) => edit(plan => removeSubtask(plan, ref, index)),
  replace: plan => edit(() => plan),
});
