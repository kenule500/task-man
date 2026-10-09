import { MAX_LABELS, MAX_LABEL_LENGTH, type Task } from '../types';

export interface LabelStyle {
  /** Tailwind classes: soft background, dark text (>= 4.5:1 contrast) and a matching border. */
  chip: string;
  /** Solid dot color, decorative only. */
  dot: string;
}

// Full class names so Tailwind's scanner keeps them. Text is the 800 shade on a 100 background.
const PALETTE: LabelStyle[] = [
  { chip: 'bg-blue-100 text-blue-800 border-blue-200', dot: 'bg-blue-500' },
  { chip: 'bg-pink-100 text-pink-800 border-pink-200', dot: 'bg-pink-500' },
  { chip: 'bg-amber-100 text-amber-900 border-amber-200', dot: 'bg-amber-500' },
  { chip: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  { chip: 'bg-violet-100 text-violet-800 border-violet-200', dot: 'bg-violet-500' },
  { chip: 'bg-cyan-100 text-cyan-900 border-cyan-200', dot: 'bg-cyan-500' },
  { chip: 'bg-rose-100 text-rose-800 border-rose-200', dot: 'bg-rose-500' },
  { chip: 'bg-slate-100 text-slate-800 border-slate-200', dot: 'bg-slate-500' },
];

export const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

/** Same label (case-insensitive) always gets the same color, so no color picker is needed. */
export const getLabelStyle = (label: string): LabelStyle => PALETTE[hashString(label.trim().toLowerCase()) % PALETTE.length];

/** Trims, collapses inner whitespace and caps the length. */
export const normalizeLabel = (raw: string): string => raw.trim().replace(/\s+/g, ' ').slice(0, MAX_LABEL_LENGTH);

/** Adds a label unless it is empty, a duplicate (case-insensitive) or the list is full. */
export const addLabel = (labels: string[], raw: string): string[] => {
  const label = normalizeLabel(raw);
  if (!label || labels.length >= MAX_LABELS) return labels;
  if (labels.some(existing => existing.toLowerCase() === label.toLowerCase())) return labels;
  return [...labels, label];
};

/** Every distinct label used in the workspace (first spelling wins), sorted. */
export const collectLabels = (tasks: Task[]): string[] => {
  const seen = new Map<string, string>();
  for (const task of tasks) {
    for (const label of task.labels ?? []) {
      if (!seen.has(label.toLowerCase())) seen.set(label.toLowerCase(), label);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
};

/** Existing labels matching what the user typed, minus the ones already on the task. */
export const suggestLabels = (all: string[], selected: string[], query: string, limit = 6): string[] => {
  const term = query.trim().toLowerCase();
  const taken = new Set(selected.map(label => label.toLowerCase()));
  return all
    .filter(label => !taken.has(label.toLowerCase()) && label.toLowerCase().includes(term))
    .slice(0, limit);
};
