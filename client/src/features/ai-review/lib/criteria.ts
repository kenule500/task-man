import type { TaskCriterion, TaskCriterionInput } from '@/features/tasks/types';

// Editing helpers for a task's acceptance criteria. Limits mirror the server (taskModel.ts).
export const MAX_CRITERIA = 30;
export const MAX_CRITERION_TEXT = 300;

/** A fresh 24-hex id (the server stores it as the item's ObjectId), so new rows have a stable key before the save. */
export const newCriterionId = (): string => {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

/** Text as the server will store it, or null when it cannot be a criterion. */
export const cleanCriterionText = (text: string): string | null => {
  const trimmed = text.trim();
  return trimmed && trimmed.length <= MAX_CRITERION_TEXT ? trimmed : null;
};

export const canAddCriterion = (items: readonly TaskCriterion[]): boolean => items.length < MAX_CRITERIA;

/** Appends a criterion; returns the list unchanged when the text is empty or the list is full. */
export const addCriterion = (items: readonly TaskCriterion[], text: string, id: string = newCriterionId()): TaskCriterion[] => {
  const clean = cleanCriterionText(text);
  return clean && canAddCriterion(items) ? [...items, { _id: id, text: clean }] : [...items];
};

export const renameCriterion = (items: readonly TaskCriterion[], id: string, text: string): TaskCriterion[] => {
  const clean = cleanCriterionText(text);
  return clean ? items.map(item => (item._id === id ? { ...item, text: clean } : item)) : [...items];
};

export const removeCriterion = (items: readonly TaskCriterion[], id: string): TaskCriterion[] =>
  items.filter(item => item._id !== id);

/** Moves one row up (-1) or down (+1); out-of-range moves return the list unchanged. */
export const moveCriterion = (items: readonly TaskCriterion[], id: string, direction: -1 | 1): TaskCriterion[] => {
  const from = items.findIndex(item => item._id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
};

export const toCriteriaInput = (items: readonly TaskCriterion[]): TaskCriterionInput[] =>
  items.map(item => ({ _id: item._id, text: item.text }));
