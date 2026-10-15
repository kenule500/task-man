import type { ChecklistItem } from '../types';

// Mirrors the server limits
export const MAX_CHECKLIST_ITEMS = 50;
export const MAX_CHECKLIST_TEXT = 200;

export interface ChecklistProgress {
  done: number;
  total: number;
}

export const checklistProgress = (items: readonly ChecklistItem[] | undefined | null): ChecklistProgress => {
  const list = items ?? [];
  return { done: list.filter(item => item.done).length, total: list.length };
};

/** "3/5", or an empty string while the checklist is empty. */
export const checklistLabel = (items: readonly ChecklistItem[] | undefined | null): string => {
  const { done, total } = checklistProgress(items);
  return total > 0 ? `${done}/${total}` : '';
};

/** A fresh 24-hex id (the server stores it as the item's ObjectId), so new items have a stable key before the save. */
export const newChecklistId = (): string => {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

/** Text as the server will store it, or null when it cannot be an item. */
export const cleanChecklistText = (text: string): string | null => {
  const trimmed = text.trim();
  return trimmed && trimmed.length <= MAX_CHECKLIST_TEXT ? trimmed : null;
};

export const canAddChecklistItem = (items: readonly ChecklistItem[]): boolean => items.length < MAX_CHECKLIST_ITEMS;

/** Appends an item; returns the list unchanged when the text is empty or the list is full. */
export const addChecklistItem = (items: readonly ChecklistItem[], text: string, id: string = newChecklistId()): ChecklistItem[] => {
  const clean = cleanChecklistText(text);
  if (!clean || !canAddChecklistItem(items)) return [...items];
  return [...items, { _id: id, text: clean, done: false }];
};

export const toggleChecklistItem = (items: readonly ChecklistItem[], id: string, done?: boolean): ChecklistItem[] =>
  items.map(item => (item._id === id ? { ...item, done: done ?? !item.done } : item));

/** Renames an item; an empty or too long text keeps the old one. */
export const renameChecklistItem = (items: readonly ChecklistItem[], id: string, text: string): ChecklistItem[] => {
  const clean = cleanChecklistText(text);
  if (!clean) return [...items];
  return items.map(item => (item._id === id ? { ...item, text: clean } : item));
};

export const removeChecklistItem = (items: readonly ChecklistItem[], id: string): ChecklistItem[] =>
  items.filter(item => item._id !== id);

/** Moves an item one place up (-1) or down (1); the list is unchanged at the ends. */
export const moveChecklistItem = (items: readonly ChecklistItem[], id: string, direction: -1 | 1): ChecklistItem[] => {
  const from = items.findIndex(item => item._id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
};

/** Items as the API takes them. */
export const toChecklistInput = (items: readonly ChecklistItem[]) =>
  items.map(({ _id, text, done }) => ({ _id, text, done }));
