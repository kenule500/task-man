import { addDays, isDateKey, nextMonday, sprintWindow } from '../utils/ai/plan/dates.js';
import { readPlanConfig } from '../utils/ai/plan/config.js';
import { draftTasks } from '../utils/ai/plan/create.js';
import {
  PLAN_LIMITS, countPlan, editedPlanSchema, finalizePlan, modelPlanSchema, snapStoryPoints, uniqueKey, uniqueName, type PlanContent,
} from '../utils/ai/plan/schema.js';
import { parseJsonWith } from '../utils/ai/schema.js';
import mongoose from 'mongoose';

const START = '2030-01-07'; // a Monday

const modelAnswer = (overrides: Record<string, unknown> = {}) => ({
  project: { name: 'Bookshop', key: 'shop', description: 'An online bookshop.', color: 'Emerald' },
  sprints: [{ name: 'Sprint 1', goal: 'Browse and search' }, { name: 'Sprint 2', goal: 'Pay' }],
  epics: [{ ref: 'E1', title: 'Catalogue', description: 'Books' }],
  items: [
    {
      ref: 'T1', sprint: 1, epic: 'E1', title: 'Browse the catalogue', description: 'List books', type: 'Feature', priority: 'Critical', storyPoints: 4,
      labels: ['web', 'WEB', 'ui'], acceptanceCriteria: ['Given a visitor, when they open the shop, then books are listed', 'Pagination works'],
      subtasks: [{ title: 'Build the list', acceptanceCriteria: ['Renders 20 books'] }],
    },
    { ref: 'T2', sprint: null, title: 'Gift cards', type: 'task', priority: 'low', storyPoints: null, acceptanceCriteria: ['Cards can be bought'] },
  ],
  assumptions: ['Cards only'],
  risks: ['Payment provider approval'],
  ...overrides,
});

const parse = (value: unknown) => {
  const result = modelPlanSchema.safeParse(value);
  if (!result.success) throw new Error(JSON.stringify(result.error.issues));
  return result.data;
};

describe('modelPlanSchema (forgiving)', () => {
  it('maps the model vocabulary to the stored plan', () => {
    const plan = parse(modelAnswer());
    expect(plan.project).toEqual({ name: 'Bookshop', key: 'SHOP', description: 'An online bookshop.', color: 'emerald' });
    const [first, second] = plan.items;
    expect(first).toMatchObject({
      ref: 'T1', sprintIndex: 0, epicRef: 'E1', type: 'story', priority: 'high', storyPoints: 5, labels: ['web', 'ui'],
    });
    expect(first.subtasks).toEqual([{ title: 'Build the list', acceptanceCriteria: ['Renders 20 books'] }]);
    expect(second).toMatchObject({ sprintIndex: null, epicRef: null, type: 'task', priority: 'low', storyPoints: null, subtasks: [], labels: [] });
    expect(plan.sprints[0]).toMatchObject({ name: 'Sprint 1', startDate: '', endDate: '' });
  });

  it('drops what is unusable instead of failing', () => {
    const plan = parse(modelAnswer({
      items: [
        { title: '   ' }, 'nonsense', null, { ref: 'bad ref!', title: 'Kept', type: 'epic', priority: 'urgent!!', storyPoints: '8', acceptanceCriteria: ['ok', 42, '', 'fine'] },
      ],
      sprints: [{ goal: 'no name' }, { name: 'Real' }],
      epics: 'not a list',
      assumptions: null,
    }));
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ ref: '', title: 'Kept', type: 'task', priority: 'medium', storyPoints: 8, acceptanceCriteria: ['ok', 'fine'] });
    expect(plan.sprints.map(sprint => sprint.name)).toEqual(['Real']);
    expect(plan.epics).toEqual([]);
    expect(plan.assumptions).toEqual([]);
  });

  it('needs at least one usable item', () => {
    expect(modelPlanSchema.safeParse(modelAnswer({ items: [] })).success).toBe(false);
    expect(modelPlanSchema.safeParse(modelAnswer({ items: [{ nonsense: true }] })).success).toBe(false);
    expect(modelPlanSchema.safeParse({}).success).toBe(false);
  });

  it('caps every count and length', () => {
    const many = (n: number, make: (i: number) => unknown) => Array.from({ length: n }, (_, i) => make(i));
    const plan = parse(modelAnswer({
      project: { name: 'N'.repeat(200), description: 'D'.repeat(2000), key: 'toolongkey' },
      sprints: many(20, i => ({ name: `S${i}`, goal: 'G'.repeat(1000) })),
      epics: many(40, i => ({ ref: `E${i}`, title: `Epic ${i}` })),
      items: many(300, i => ({
        ref: `T${i}`, title: 'x'.repeat(400), description: 'y'.repeat(5000), sprint: i % 30,
        labels: many(20, l => `label-${l}`),
        acceptanceCriteria: many(20, c => `c${c}`.padEnd(900, 'z')),
        subtasks: many(30, s => ({ title: `st ${s}`, acceptanceCriteria: many(20, () => 'ok') })),
      })),
      assumptions: many(50, i => `a${i}`),
      risks: many(50, i => `r${i}`),
    }));
    expect(plan.project.name).toHaveLength(PLAN_LIMITS.projectName);
    expect(plan.project.description).toHaveLength(PLAN_LIMITS.projectDescription);
    expect(plan.project.key).toBe('TOOLON');
    expect(plan.sprints).toHaveLength(PLAN_LIMITS.sprints);
    expect(plan.sprints[0].goal).toHaveLength(PLAN_LIMITS.sprintGoal);
    expect(plan.epics).toHaveLength(PLAN_LIMITS.epics);
    expect(plan.items).toHaveLength(PLAN_LIMITS.items);
    const item = plan.items[0];
    expect(item.title).toHaveLength(PLAN_LIMITS.title);
    expect(item.description).toHaveLength(PLAN_LIMITS.itemDescription);
    expect(item.labels).toHaveLength(PLAN_LIMITS.labels);
    expect(item.acceptanceCriteria).toHaveLength(PLAN_LIMITS.criteria);
    expect(item.acceptanceCriteria[0]).toHaveLength(PLAN_LIMITS.criterion);
    expect(item.subtasks).toHaveLength(PLAN_LIMITS.subtasksPerItem);
    expect(item.subtasks[0].acceptanceCriteria).toHaveLength(PLAN_LIMITS.criteria);
    expect(plan.assumptions).toHaveLength(PLAN_LIMITS.notes);
    expect(plan.risks).toHaveLength(PLAN_LIMITS.notes);
  });

  it('strips control characters and line breaks from single-line text', () => {
    const plan = parse(modelAnswer({ items: [{ title: 'A\u0007 title\nwith\tbreaks', description: 'line 1\n\n\n\nline 2', acceptanceCriteria: ['ok'] }] }));
    expect(plan.items[0].title).toBe('A title with breaks');
    expect(plan.items[0].description).toBe('line 1\n\nline 2');
  });

  it('works through the JSON helper, including a fenced answer and broken JSON', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(modelAnswer())}\n\`\`\``;
    expect(parseJsonWith(modelPlanSchema, fenced).ok).toBe(true);
    expect(parseJsonWith(modelPlanSchema, '{"project":').ok).toBe(false);
    const bad = parseJsonWith(modelPlanSchema, '{"items": []}');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.problem).toContain('at least one item');
  });
});

describe('snapStoryPoints', () => {
  it('snaps to the Fibonacci scale up to 13', () => {
    expect([1, 2, 3, 4, 6, 7, 10, 11, 20, 100].map(snapStoryPoints)).toEqual([1, 2, 3, 5, 5, 8, 8, 13, 13, 13]);
    expect([0, -2, null, undefined, 'abc', NaN, {}].map(snapStoryPoints)).toEqual([null, null, null, null, null, null, null]);
    expect(snapStoryPoints('5')).toBe(5);
  });
});

describe('finalizePlan', () => {
  const generated = () => parse(modelAnswer());
  const context = { startDate: START, sprintLengthWeeks: 2 };

  it('computes sprint dates from the start date and the sprint length', () => {
    const plan = finalizePlan(generated(), context);
    expect(plan.sprints.map(sprint => [sprint.startDate, sprint.endDate])).toEqual([['2030-01-07', '2030-01-18'], ['2030-01-21', '2030-02-01']]);
    expect(finalizePlan(generated(), { startDate: START, sprintLengthWeeks: 1 }).sprints[1]).toMatchObject({ startDate: '2030-01-14', endDate: '2030-01-18' });
    // A start that is not a Monday: sprints end the day before the next one starts
    expect(finalizePlan(generated(), { startDate: '2030-01-09', sprintLengthWeeks: 2 }).sprints[0]).toMatchObject({ endDate: '2030-01-22' });
  });

  it('keeps valid edited dates and recomputes broken ones', () => {
    const edited = generated();
    edited.sprints[0] = { ...edited.sprints[0], startDate: '2030-03-04', endDate: '2030-03-15' };
    edited.sprints[1] = { ...edited.sprints[1], startDate: '2030-03-20', endDate: '2030-03-01' };
    const plan = finalizePlan(edited, { ...context, keepDates: true });
    expect(plan.sprints[0]).toMatchObject({ startDate: '2030-03-04', endDate: '2030-03-15' });
    expect(plan.sprints[1]).toMatchObject({ startDate: '2030-01-21', endDate: '2030-02-01' });
  });

  it('repairs references: unique refs, unknown epics and out-of-range sprints', () => {
    const messy = generated();
    messy.items = [
      { ...messy.items[0], ref: 'E1', sprintIndex: 7, epicRef: 'nope' },
      { ...messy.items[1], ref: 'E1', sprintIndex: -1 },
      { ...messy.items[1], ref: '' },
    ];
    const plan = finalizePlan(messy, context);
    const refs = [...plan.epics.map(epic => epic.ref), ...plan.items.map(item => item.ref)];
    expect(new Set(refs.map(ref => ref.toLowerCase())).size).toBe(refs.length);
    expect(plan.items.every(item => item.sprintIndex === null && item.epicRef === null)).toBe(true);
  });

  it('limits the subtasks of the whole plan', () => {
    const big = generated();
    big.items = Array.from({ length: 100 }, (_, i) => ({
      ...big.items[0], ref: `I${i}`, subtasks: Array.from({ length: 8 }, (_, s) => ({ title: `s${s}`, acceptanceCriteria: [] })),
    }));
    const plan = finalizePlan(big, context);
    expect(plan.items.reduce((sum, item) => sum + item.subtasks.length, 0)).toBe(PLAN_LIMITS.subtasksTotal);
  });

  it('applies the requested name and key and finds a free one', () => {
    const plan = finalizePlan(generated(), {
      ...context, projectName: ' Book Store ', projectKey: 'bks', takenNames: new Set(['book store']), takenKeys: new Set(['BKS']),
    });
    expect(plan.project.name).toBe('Book Store (2)');
    expect(plan.project.key).toBe('BKSA');
    expect(finalizePlan(generated(), { ...context, takenKeys: new Set(['SHOP', 'SHOPA']) }).project.key).toBe('SHOPB');
    expect(finalizePlan({ ...generated(), project: { ...generated().project, key: '' } }, context).project.key).toBe('BOO');
  });

  it('is idempotent', () => {
    const once = finalizePlan(generated(), context);
    expect(finalizePlan(once, { ...context, keepDates: true })).toEqual(once);
  });
});

describe('uniqueKey and uniqueName', () => {
  it('finds a free key of at most six characters', () => {
    expect(uniqueKey('WEB', new Set())).toBe('WEB');
    expect(uniqueKey('WEB', new Set(['WEB']))).toBe('WEBA');
    expect(uniqueKey('WEBSIT', new Set(['WEBSIT']))).toBe('WEBSIA');
    expect(uniqueKey('AB', new Set(['AB', 'ABA']))).toBe('ABB');
  });

  it('numbers a taken name and keeps it within the limit', () => {
    expect(uniqueName('Shop', new Set())).toBe('Shop');
    expect(uniqueName('Shop', new Set(['shop', 'shop (2)']))).toBe('Shop (3)');
    const long = 'L'.repeat(60);
    expect(uniqueName(long, new Set([long.toLowerCase()]))).toHaveLength(60);
  });
});

describe('editedPlanSchema (strict)', () => {
  const valid = () => finalizePlan(parse(modelAnswer()), { startDate: START, sprintLengthWeeks: 2 });

  it('accepts a plan that came out of the generator', () => {
    const result = editedPlanSchema.safeParse(valid());
    expect(result.success).toBe(true);
  });

  it('rejects instead of repairing', () => {
    const bad = (change: (plan: PlanContent) => void) => {
      const plan = structuredClone(valid());
      change(plan);
      return editedPlanSchema.safeParse(plan).success;
    };
    expect(bad(() => undefined)).toBe(true);
    expect(bad(plan => { plan.items = []; })).toBe(false);
    expect(bad(plan => { plan.items[0].title = '  '; })).toBe(false);
    expect(bad(plan => { plan.items[0].title = 'x'.repeat(141); })).toBe(false);
    expect(bad(plan => { plan.items[0].storyPoints = 4; })).toBe(false);
    expect(bad(plan => { plan.items[0].storyPoints = null; })).toBe(true);
    expect(bad(plan => { (plan.items[0] as { type: string }).type = 'epic'; })).toBe(false);
    expect(bad(plan => { plan.items[0].acceptanceCriteria = Array(7).fill('x'); })).toBe(false);
    expect(bad(plan => { plan.items[0].subtasks = Array(9).fill({ title: 'x', acceptanceCriteria: [] }); })).toBe(false);
    expect(bad(plan => { plan.items[0].labels = ['a', 'A']; })).toBe(false);
    expect(bad(plan => { plan.items[0].sprintIndex = 8; })).toBe(false);
    expect(bad(plan => { plan.sprints[0].startDate = '2030-13-40'; })).toBe(false);
    expect(bad(plan => { plan.project.key = 'x'; })).toBe(false);
    expect(bad(plan => { plan.project.name = ''; })).toBe(false);
    expect(bad(plan => { plan.items = Array(121).fill(plan.items[0]); })).toBe(false);
  });
});

describe('countPlan', () => {
  it('counts sprints, items, subtasks, criteria and points', () => {
    expect(countPlan(finalizePlan(parse(modelAnswer()), { startDate: START, sprintLengthWeeks: 2 }))).toEqual({
      sprints: 2, epics: 1, items: 2, subtasks: 1, criteria: 4, points: 5,
    });
  });
});

describe('dates', () => {
  it('finds the next Monday after a day', () => {
    expect(nextMonday(new Date('2030-01-07T10:00:00Z'))).toBe('2030-01-14');
    expect(nextMonday(new Date('2030-01-08T23:59:00Z'))).toBe('2030-01-14');
    expect(nextMonday(new Date('2030-01-13T00:00:00Z'))).toBe('2030-01-14');
    expect(nextMonday(new Date('2030-01-12T12:00:00Z'))).toBe('2030-01-14');
  });

  it('validates calendar days', () => {
    expect(isDateKey('2030-02-28')).toBe(true);
    expect(isDateKey('2030-02-30')).toBe(false);
    expect(isDateKey('2030-2-3')).toBe(false);
    expect(isDateKey(20300101)).toBe(false);
    expect(addDays('2030-02-27', 3)).toBe('2030-03-02');
    expect(sprintWindow('2030-01-07', 2, 2)).toEqual({ startDate: '2030-02-04', endDate: '2030-02-15' });
  });
});

describe('readPlanConfig', () => {
  it('has the documented defaults and clamps bad numbers', () => {
    expect(readPlanConfig({})).toEqual({ dailyLimit: 20, maxChars: 60_000, maxBytes: 4 * 1024 * 1024, maxOutputTokens: 8192, timeoutMs: 200_000 });
    expect(readPlanConfig({ AI_PLAN_DAILY_LIMIT: '3', AI_PLAN_MAX_CHARS: '1000', AI_PLAN_MAX_MB: '2', AI_PLAN_TIMEOUT_SECONDS: '9999' }))
      .toMatchObject({ dailyLimit: 3, maxChars: 1000, maxBytes: 2 * 1024 * 1024, timeoutMs: 280_000 });
    expect(readPlanConfig({ AI_PLAN_DAILY_LIMIT: '-1', AI_PLAN_MAX_CHARS: 'x' })).toMatchObject({ dailyLimit: 20, maxChars: 60_000 });
  });
});

describe('draftTasks', () => {
  const userId = new mongoose.Types.ObjectId();
  const workspaceId = new mongoose.Types.ObjectId();

  it('builds epics, items and subtasks that point at each other', () => {
    const plan = finalizePlan(parse(modelAnswer({
      items: [
        { ref: 'B', sprint: null, title: 'Backlog item', acceptanceCriteria: ['x'] },
        { ref: 'S2', sprint: 2, title: 'Second sprint', storyPoints: 3, acceptanceCriteria: ['y'] },
        { ref: 'S1', sprint: 1, epic: 'E1', title: 'First sprint', storyPoints: 8, priority: 'high', acceptanceCriteria: ['a', 'b'], subtasks: [{ title: 'Step', acceptanceCriteria: ['done'] }] },
      ],
    })), { startDate: START, sprintLengthWeeks: 2 });
    const sprintIds = plan.sprints.map(() => new mongoose.Types.ObjectId());
    const drafts = draftTasks(plan, {
      sprintIds, userId, workspaceId, projectName: 'Bookshop', stage: { stage: 'todo', status: 'pending' }, startDate: START, sprintLengthWeeks: 2, basePosition: 1000,
    });

    expect(drafts.map(draft => draft.title)).toEqual(['Catalogue', 'First sprint', 'Step', 'Second sprint', 'Backlog item']);
    const [epic, first, step, second, backlog] = drafts;
    expect(epic).toMatchObject({ type: 'epic', sprint: null, epic: null, parent: null });
    expect(first).toMatchObject({ type: 'task', sprint: sprintIds[0], epic: epic._id, parent: null, storyPoints: 8, priority: 'high' });
    expect(first.acceptanceCriteria).toEqual([{ text: 'a' }, { text: 'b' }]);
    expect(step).toMatchObject({ parent: first._id, sprint: sprintIds[0], epic: epic._id, priority: 'high', storyPoints: null, type: 'task' });
    expect(step.acceptanceCriteria).toEqual([{ text: 'done' }]);
    expect(second).toMatchObject({ sprint: sprintIds[1], epic: null });
    expect(backlog).toMatchObject({ sprint: null });
    // dates: sprint items run from the sprint start to its end; backlog items end with the plan
    expect((first.startDate as Date).toISOString().slice(0, 10)).toBe('2030-01-07');
    expect((first.deadline as Date).toISOString().slice(0, 10)).toBe('2030-01-18');
    expect((second.deadline as Date).toISOString().slice(0, 10)).toBe('2030-02-01');
    expect(backlog.startDate).toBeUndefined();
    expect((backlog.deadline as Date).toISOString().slice(0, 10)).toBe('2030-02-01');
    // order and ownership
    expect(drafts.map(draft => draft.position)).toEqual([1000, 1001, 1002, 1003, 1004]);
    expect(drafts.every(draft => String(draft.owner) === String(userId) && String(draft.workspace) === String(workspaceId) && draft.project === 'Bookshop')).toBe(true);
    expect(new Set(drafts.map(draft => String(draft._id))).size).toBe(drafts.length);
  });
});
