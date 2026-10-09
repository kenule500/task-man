// Pure logic of the dashboard "Get started" checklist, plus the one flag that cannot be derived from server data.

export type StepId = 'task' | 'invite' | 'board';

export interface ChecklistInput {
  taskCount: number;
  memberCount: number;
  boardTried: boolean;
  /** Whether the viewer may invite people (steps they cannot complete are left out) */
  canInvite: boolean;
}

export interface ChecklistStep {
  id: StepId;
  done: boolean;
}

export const buildChecklist = ({ taskCount, memberCount, boardTried, canInvite }: ChecklistInput): ChecklistStep[] => {
  const steps: ChecklistStep[] = [{ id: 'task', done: taskCount > 0 }];
  if (canInvite) steps.push({ id: 'invite', done: memberCount > 1 });
  steps.push({ id: 'board', done: boardTried });
  return steps;
};

export const isChecklistComplete = (steps: ChecklistStep[]): boolean => steps.every((step) => step.done);

const boardKey = (workspaceSlug: string) => `taskman.boardTried.${workspaceSlug}`;

/** Remembers (per workspace, on this device) that the board view was opened. */
export const markBoardTried = (workspaceSlug: string): void => {
  try {
    localStorage.setItem(boardKey(workspaceSlug), '1');
  } catch {
    // Private mode or storage disabled: the step simply stays open
  }
};

export const hasTriedBoard = (workspaceSlug: string): boolean => {
  try {
    return localStorage.getItem(boardKey(workspaceSlug)) === '1';
  } catch {
    return false;
  }
};
