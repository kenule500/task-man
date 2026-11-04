import {
  defaultWorkflow,
  firstStageOf,
  planStageMoves,
  stageFor,
  validateWorkflow,
  workflowOf,
  type WorkflowStage,
} from '../utils/workflow.js';

const scrum: WorkflowStage[] = [
  { key: 'todo', name: 'To do', group: 'pending', color: 'slate', wipLimit: 0 },
  { key: 'doing', name: 'Doing', group: 'in-progress', color: 'blue', wipLimit: 3 },
  { key: 'review', name: 'In review', group: 'in-progress', color: 'violet', wipLimit: 0 },
  { key: 'done', name: 'Done', group: 'completed', color: 'emerald', wipLimit: 0 },
];

const base = [
  { key: 'a', name: 'A', group: 'pending' },
  { key: 'b', name: 'B', group: 'in-progress' },
  { key: 'c', name: 'C', group: 'completed' },
];

describe('defaultWorkflow', () => {
  it('has one stage per status group', () => {
    expect(defaultWorkflow().map(stage => [stage.key, stage.group])).toEqual([
      ['todo', 'pending'], ['in-progress', 'in-progress'], ['done', 'completed'],
    ]);
  });
});

describe('validateWorkflow', () => {
  it('accepts a valid list and normalises it', () => {
    const result = validateWorkflow([
      { key: 'todo', name: '  To do ', group: 'pending' },
      { key: 'doing', name: 'Doing', group: 'in-progress', color: 'violet', wipLimit: 4 },
      { key: 'done', name: 'Done', group: 'completed', wipLimit: null },
    ]);
    expect(result).toEqual({
      ok: true,
      stages: [
        { key: 'todo', name: 'To do', group: 'pending', color: 'slate', wipLimit: 0 },
        { key: 'doing', name: 'Doing', group: 'in-progress', color: 'violet', wipLimit: 4 },
        { key: 'done', name: 'Done', group: 'completed', color: 'emerald', wipLimit: 0 },
      ],
    });
  });

  it('rejects a list that is not an array, empty or longer than 12', () => {
    expect(validateWorkflow('x').ok).toBe(false);
    expect(validateWorkflow([]).ok).toBe(false);
    const groups = ['pending', 'in-progress', 'completed'];
    const many = Array.from({ length: 13 }, (_, i) => ({ key: `s${i}`, name: `S${i}`, group: groups[i % 3] }));
    expect(validateWorkflow(many).ok).toBe(false);
    expect(validateWorkflow(many.slice(0, 12)).ok).toBe(true);
  });

  it('rejects duplicate keys, bad keys and bad names', () => {
    const duplicate = validateWorkflow([...base, { key: 'a', name: 'Again', group: 'pending' }]);
    expect(duplicate).toMatchObject({ ok: false, error: expect.stringContaining('unique') });
    for (const key of ['Review', 'in review', '-x', '', 'a'.repeat(31), 5]) {
      expect(validateWorkflow([{ ...base[0], key }, base[1], base[2]]).ok).toBe(false);
    }
    expect(validateWorkflow([{ ...base[0], name: '  ' }, base[1], base[2]]).ok).toBe(false);
    expect(validateWorkflow([{ ...base[0], name: 'n'.repeat(31) }, base[1], base[2]]).ok).toBe(false);
  });

  it('rejects unknown groups and colors, bad limits and a group without stages', () => {
    expect(validateWorkflow([{ ...base[0], group: 'blocked' }, base[1], base[2]]).ok).toBe(false);
    expect(validateWorkflow([{ ...base[0], color: 'pink' }, base[1], base[2]]).ok).toBe(false);
    for (const wipLimit of [-1, 1000, 1.5, '3']) {
      expect(validateWorkflow([{ ...base[0], wipLimit }, base[1], base[2]]).ok).toBe(false);
    }
    expect(validateWorkflow([base[0], base[1]])).toMatchObject({ ok: false, error: expect.stringContaining('completed') });
  });
});

describe('stageFor', () => {
  it('lets an explicit stage win and sets the status to its group', () => {
    expect(stageFor(scrum, { stage: 'review', status: 'pending' })).toEqual({ stage: 'review', status: 'in-progress' });
  });

  it('returns null for an unknown stage', () => {
    expect(stageFor(scrum, { stage: 'qa' })).toBeNull();
  });

  it('keeps the current stage when it already belongs to the requested status', () => {
    expect(stageFor(scrum, { status: 'in-progress', currentStage: 'review', currentStatus: 'in-progress' }))
      .toEqual({ stage: 'review', status: 'in-progress' });
  });

  it('takes the first stage of the group when the current stage is elsewhere', () => {
    expect(stageFor(scrum, { status: 'in-progress', currentStage: 'todo', currentStatus: 'pending' }))
      .toEqual({ stage: 'doing', status: 'in-progress' });
    expect(stageFor(scrum, { status: 'completed' })).toEqual({ stage: 'done', status: 'completed' });
  });

  it('repairs a stale or empty stage from the status', () => {
    expect(stageFor(scrum, { currentStage: 'review', currentStatus: 'completed' })).toEqual({ stage: 'done', status: 'completed' });
    expect(stageFor(scrum, { currentStage: '', currentStatus: 'in-progress' })).toEqual({ stage: 'doing', status: 'in-progress' });
    expect(stageFor(scrum, {})).toEqual({ stage: 'todo', status: 'pending' });
  });
});

describe('firstStageOf', () => {
  it('returns the first stage in array order', () => {
    expect(firstStageOf(scrum, 'in-progress').key).toBe('doing');
  });
});

describe('workflowOf', () => {
  it('falls back to the default workflow', () => {
    expect(workflowOf({}).map(stage => stage.key)).toEqual(['todo', 'in-progress', 'done']);
    expect(workflowOf({ workflow: { stages: [] } }).map(stage => stage.key)).toEqual(['todo', 'in-progress', 'done']);
  });

  it('applies the old board limit to the only stage of a group', () => {
    const stages = workflowOf({ boardSettings: { wipLimits: { pending: null, 'in-progress': 4, completed: null } } });
    expect(stages.map(stage => stage.wipLimit)).toEqual([0, 4, 0]);
  });

  it('keeps stage limits and ignores the old limit for shared groups', () => {
    const stages = workflowOf({
      workflow: { stages: scrum },
      boardSettings: { wipLimits: { pending: 9, 'in-progress': 9, completed: 9 } },
    });
    expect(stages.map(stage => stage.wipLimit)).toEqual([9, 3, 0, 9]);
  });
});

describe('planStageMoves', () => {
  it('sends tasks to the requested stage or the first stage of their group', () => {
    const after: WorkflowStage[] = [
      scrum[0],
      { key: 'build', name: 'Build', group: 'in-progress', color: 'blue', wipLimit: 0 },
      scrum[3],
    ];
    expect(planStageMoves(scrum, after, { doing: 'done' })).toEqual([
      { from: 'doing', to: 'done' },
      { from: 'review', to: 'build' },
    ]);
  });

  it('ignores a requested target that does not exist', () => {
    const after = scrum.filter(stage => stage.key !== 'review');
    expect(planStageMoves(scrum, after, { review: 'nope' })).toEqual([{ from: 'review', to: 'doing' }]);
  });
});
