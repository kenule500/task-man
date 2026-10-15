import { buildChecklist, hasTriedBoard, isChecklistComplete, markBoardTried } from '../getStarted';

describe('buildChecklist', () => {
  it('derives each step from real data', () => {
    const steps = buildChecklist({ taskCount: 0, memberCount: 1, boardTried: false, canInvite: true });
    expect(steps).toEqual([
      { id: 'task', done: false },
      { id: 'invite', done: false },
      { id: 'board', done: false },
    ]);

    const progressed = buildChecklist({ taskCount: 3, memberCount: 2, boardTried: true, canInvite: true });
    expect(progressed.every((step) => step.done)).toBe(true);
    expect(isChecklistComplete(progressed)).toBe(true);
  });

  it('leaves out the invite step for people who cannot invite', () => {
    const steps = buildChecklist({ taskCount: 1, memberCount: 1, boardTried: false, canInvite: false });
    expect(steps.map((step) => step.id)).toEqual(['task', 'board']);
  });
});

describe('board flag', () => {
  beforeEach(() => localStorage.clear());

  it('is stored per workspace', () => {
    expect(hasTriedBoard('acme')).toBe(false);
    markBoardTried('acme');
    expect(hasTriedBoard('acme')).toBe(true);
    expect(hasTriedBoard('other')).toBe(false);
  });
});
