import type { TaskView } from '@/features/tasks';

/** A saved task view: a layout plus the filters of the task page's URL (`status=pending&assignedToMe=1`). */
export interface SavedView {
  _id: string;
  name: string;
  /** Layout that opens: list, board, calendar or timeline. */
  view: TaskView;
  /** URL query string without the leading "?" and without `view`. */
  query: string;
  /** Visible to every member who can read tasks. */
  shared: boolean;
  /** True when the signed-in user owns it. */
  mine: boolean;
  owner: { _id: string; name: string };
  createdAt?: string;
}

export interface SavedViewInput {
  name: string;
  view: TaskView;
  query: string;
  shared: boolean;
}

export type SavedViewPatch = Partial<SavedViewInput>;
