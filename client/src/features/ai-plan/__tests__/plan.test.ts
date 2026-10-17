import i18n from '@/i18n';
import { uploadFields } from '../api';
import { describeApiError, describeFailure } from '../lib/errors';
import { fileProblem, formatFileSize, nextMondayKey, readPlanError } from '../lib/file';
import { phaseIndex } from '../lib/progress';
import {
  addItem, addSubtask, canAddItem, canAddSubtask, cleanKey, countCriteria, countSubtasks, editList, groupBySprint, isValidKey, itemsWithoutCriteria,
  moveItem, newRef, planProblems, PLAN_LIMITS, removeItem, removeSubtask, tidyPlan, totals, updateItem, updateProject, updateSprint, updateSubtask, weekRange,
} from '../lib/plan';
import { makeItem, makePlan } from './fixtures';

const t = i18n.getFixedT('en', 'aiPlan');

describe('reading a plan', () => {
  it('groups items by sprint, then the backlog, with their points', () => {
    const groups = groupBySprint(makePlan());
    expect(groups.map(group => [group.sprintIndex, group.items.map(item => item.ref), group.points])).toEqual([
      [0, ['T1'], 5], [1, ['T2'], 8], [null, ['T3'], 0],
    ]);
    expect(groups[0].sprint?.name).toBe('Sprint 1');
    expect(groups[2].sprint).toBeNull();
  });

  it('shows the backlog even when there are no sprints, and puts out-of-range items there', () => {
    const plan = makePlan({ sprints: [], items: [makeItem({ sprintIndex: 3 })] });
    const groups = groupBySprint(plan);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(1);
  });

  it('counts subtasks, criteria and points', () => {
    const plan = makePlan();
    expect(countSubtasks(plan)).toBe(2);
    expect(countCriteria(plan)).toBe(2 + 1 + 1);
    expect(totals(plan)).toEqual({ sprints: 2, epics: 1, items: 3, subtasks: 2, criteria: 4, points: 13 });
    expect(itemsWithoutCriteria(plan)).toBe(1);
  });

  it('labels the weeks of a sprint', () => {
    expect(weekRange(0, 2)).toEqual({ from: 1, to: 2 });
    expect(weekRange(2, 2)).toEqual({ from: 5, to: 6 });
    expect(weekRange(3, 1)).toEqual({ from: 4, to: 4 });
  });
});

describe('editing a plan', () => {
  it('changes an item without touching the original plan', () => {
    const plan = makePlan();
    const next = updateItem(plan, 'T2', { title: 'Pay with a card', storyPoints: 13, priority: 'high' });
    expect(next.items[1]).toMatchObject({ title: 'Pay with a card', storyPoints: 13, priority: 'high' });
    expect(plan.items[1].title).toBe('Pay by card');
    expect(next.items[0]).toBe(plan.items[0]);
  });

  it('moves an item to a sprint or the backlog and refuses a sprint that does not exist', () => {
    const plan = makePlan();
    expect(moveItem(plan, 'T3', 1).items[2].sprintIndex).toBe(1);
    expect(moveItem(plan, 'T1', null).items[0].sprintIndex).toBeNull();
    expect(moveItem(plan, 'T1', 9).items[0].sprintIndex).toBeNull();
    expect(moveItem(plan, 'T1', -1).items[0].sprintIndex).toBeNull();
  });

  it('deletes an item and adds one to a sprint with a fresh reference', () => {
    const plan = makePlan();
    expect(removeItem(plan, 'T2').items.map(item => item.ref)).toEqual(['T1', 'T3']);
    const added = addItem(plan, 1, '  Order history  ');
    const item = added.items.at(-1);
    expect(item).toMatchObject({ title: 'Order history', sprintIndex: 1, type: 'task', priority: 'medium', storyPoints: null, subtasks: [], acceptanceCriteria: [] });
    expect(new Set(added.items.map(entry => entry.ref)).size).toBe(4);
    expect(addItem(plan, 7, 'Beyond').items.at(-1)?.sprintIndex).toBeNull();
  });

  it('never reuses a reference of an item or an epic', () => {
    const plan = makePlan({ items: [makeItem({ ref: 'N2' }), makeItem({ ref: 'N3' })], epics: [{ ref: 'N4', title: 'e', description: '' }] });
    expect(newRef(plan)).toBe('N5');
    expect(newRef(makePlan())).toBe('N4');
  });

  it('stops adding items at the limit', () => {
    const full = makePlan({ items: Array.from({ length: PLAN_LIMITS.items }, (_, i) => makeItem({ ref: `T${i}` })) });
    expect(canAddItem(full)).toBe(false);
    expect(addItem(full, null, 'One more')).toBe(full);
  });

  it('adds, edits and removes subtasks within the limits', () => {
    let plan = makePlan();
    plan = addSubtask(plan, 'T2', 'Wire the gateway');
    expect(plan.items[1].subtasks).toEqual([{ title: 'Wire the gateway', acceptanceCriteria: [] }]);
    plan = updateSubtask(plan, 'T2', 0, { title: 'Wire the payment gateway', acceptanceCriteria: ['A test card works'] });
    expect(plan.items[1].subtasks[0]).toEqual({ title: 'Wire the payment gateway', acceptanceCriteria: ['A test card works'] });
    plan = removeSubtask(plan, 'T2', 0);
    expect(plan.items[1].subtasks).toEqual([]);

    const crowded = makePlan({ items: [makeItem({ subtasks: Array.from({ length: PLAN_LIMITS.subtasksPerItem }, (_, i) => ({ title: `s${i}`, acceptanceCriteria: [] })) })] });
    expect(canAddSubtask(crowded, 'T1')).toBe(false);
    expect(addSubtask(crowded, 'T1', 'x')).toBe(crowded);
    expect(canAddSubtask(makePlan(), 'nope')).toBe(false);
  });

  it('edits the project and a sprint', () => {
    const plan = updateSprint(updateProject(makePlan(), { name: 'Bookshop 2', key: 'BK2' }), 1, { name: 'Payments', goal: 'Take money' });
    expect(plan.project).toMatchObject({ name: 'Bookshop 2', key: 'BK2' });
    expect(plan.sprints[1]).toMatchObject({ name: 'Payments', goal: 'Take money', startDate: '2031-03-17' });
    expect(plan.sprints[0].name).toBe('Sprint 1');
  });

  it('edits a list of criteria', () => {
    expect(editList(['a', 'b'], 1, 'c')).toEqual(['a', 'c']);
    expect(editList(['a', 'b'], 0, null)).toEqual(['b']);
    expect(editList(['a'], 0, 'x'.repeat(400))[0]).toHaveLength(PLAN_LIMITS.criterion);
  });
});

describe('checking a plan before it is created', () => {
  it('accepts the plan as generated', () => {
    expect(planProblems(makePlan())).toEqual([]);
  });

  it('names what the server would refuse', () => {
    const plan = makePlan();
    plan.project.name = '  ';
    plan.project.key = 'x';
    plan.sprints[0].name = '';
    plan.items[0].title = ' ';
    plan.items[1].subtasks = [{ title: '', acceptanceCriteria: [] }];
    expect(planProblems(plan).map(problem => problem.kind).sort()).toEqual(['itemTitle', 'projectKey', 'projectName', 'sprintName', 'subtaskTitle']);
    expect(planProblems(makePlan({ items: [] }))).toEqual([{ kind: 'noItems' }]);
  });

  it('tidies text and drops empty criteria before sending', () => {
    const plan = makePlan();
    plan.project.name = '  Bookshop  ';
    plan.items[0].acceptanceCriteria = ['  keep me ', '', '   '];
    plan.items[0].subtasks = [{ title: ' Step ', acceptanceCriteria: ['', ' ok '] }];
    const tidy = tidyPlan(plan);
    expect(tidy.project.name).toBe('Bookshop');
    expect(tidy.items[0].acceptanceCriteria).toEqual(['keep me']);
    expect(tidy.items[0].subtasks).toEqual([{ title: 'Step', acceptanceCriteria: ['ok'] }]);
  });

  it('cleans a key while it is typed', () => {
    expect(cleanKey('bo-ok shop')).toBe('BOOKSH');
    expect(isValidKey('BOOK')).toBe(true);
    expect(isValidKey('B')).toBe(false);
    expect(isValidKey('book')).toBe(false);
    expect(isValidKey('TOOLONGKEY')).toBe(false);
  });
});

describe('choosing the document', () => {
  it('accepts the four kinds and says why a file is refused', () => {
    for (const name of ['spec.pdf', 'SPEC.DOCX', 'notes.txt', 'readme.md', 'readme.markdown']) expect(fileProblem({ name, size: 100 })).toBeNull();
    expect(fileProblem({ name: 'photo.png', size: 100 })).toBe('type');
    expect(fileProblem({ name: 'noextension', size: 100 })).toBe('type');
    expect(fileProblem({ name: 'old.doc', size: 100 })).toBe('doc');
    expect(fileProblem({ name: 'empty.txt', size: 0 })).toBe('empty');
    expect(fileProblem({ name: 'big.pdf', size: 6 * 1024 * 1024 })).toBe('size');
    expect(fileProblem({ name: 'big.pdf', size: 6 * 1024 * 1024 }, 10 * 1024 * 1024)).toBeNull();
  });

  it('formats sizes', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1500)).toBe('1.5 kB');
    expect(formatFileSize(123_456)).toBe('123 kB');
    expect(formatFileSize(5_242_880)).toBe('5.2 MB');
  });

  it('proposes the next Monday', () => {
    expect(nextMondayKey(new Date(2031, 2, 3))).toBe('2031-03-10'); // a Monday -> the following one
    expect(nextMondayKey(new Date(2031, 2, 4))).toBe('2031-03-10');
    expect(nextMondayKey(new Date(2031, 2, 9))).toBe('2031-03-10'); // Sunday
    expect(nextMondayKey(new Date(2031, 2, 8))).toBe('2031-03-10'); // Saturday
  });

  it('sends only the options that were filled in', () => {
    const base = { projectName: '', projectKey: '', sprintLengthWeeks: 3, startDate: '', teamSize: '', extraInstructions: '', language: 'fr' as const };
    expect(uploadFields(base)).toEqual([['sprintLengthWeeks', '3'], ['language', 'fr']]);
    expect(uploadFields({ ...base, projectName: ' Shop ', projectKey: 'SHP', startDate: '2031-03-03', teamSize: '5', extraInstructions: 'Mobile first' })).toEqual([
      ['sprintLengthWeeks', '3'], ['language', 'fr'], ['projectName', 'Shop'], ['projectKey', 'SHP'], ['startDate', '2031-03-03'], ['teamSize', '5'], ['extraInstructions', 'Mobile first'],
    ]);
  });
});

describe('reading refusals', () => {
  it('reads code, message and suggestion from the response', () => {
    const error = { response: { status: 409, data: { code: 'PROJECT_KEY_TAKEN', message: 'Key used', suggestion: 'BOOKA' } } };
    expect(readPlanError(error, 'fallback')).toEqual({ status: 409, code: 'PROJECT_KEY_TAKEN', message: 'Key used', suggestion: 'BOOKA' });
    expect(readPlanError({ response: { status: 400, data: { errors: [{ msg: 'The key must be 2 to 6 letters or digits' }] } } }, 'x').message).toContain('2 to 6');
    expect(readPlanError({ response: { status: 502, data: '<html>' } }, 'fallback')).toMatchObject({ status: 502, code: '', message: 'fallback' });
    expect(readPlanError({ request: {} }, 'fallback')).toMatchObject({ status: null, code: 'NETWORK' });
  });

  it('explains upload refusals in the interface language', () => {
    const refusal = (status: number, code: string, message = 'server text') => ({ status, code, message, suggestion: '' });
    expect(describeApiError(refusal(415, 'UNSUPPORTED_TYPE'), t)).toContain('PDF, DOCX, TXT or Markdown');
    expect(describeApiError(refusal(413, ''), t)).toContain('too large');
    expect(describeApiError(refusal(429, 'AI_DAILY_LIMIT'), t)).toContain('all its AI project plans');
    expect(describeApiError(refusal(429, ''), t)).toContain('Too many requests');
    expect(describeApiError(refusal(409, 'PLAN_IN_PROGRESS'), t)).toContain('already being analyzed');
    expect(describeApiError(refusal(null as unknown as number, 'NETWORK'), t)).toContain('could not reach');
    expect(describeApiError(refusal(500, 'SOMETHING_NEW', 'Server text'), t)).toBe('Server text');
  });

  it('explains why a generation failed', () => {
    expect(describeFailure({ errorCode: 'AI_RATE_LIMIT', error: 'raw' }, t)).toContain('limiting requests');
    expect(describeFailure({ errorCode: 'AI_INVALID_OUTPUT', error: 'raw' }, t)).toContain('usable plan');
    expect(describeFailure({ errorCode: 'ODD', error: 'The server says no' }, t)).toBe('The server says no');
    expect(describeFailure({ errorCode: 'ODD', error: '' }, t)).toContain('failed');
  });
});

describe('progress while waiting', () => {
  it('reads while queued, then designs, then writes', () => {
    expect(phaseIndex('queued', 0)).toBe(0);
    expect(phaseIndex('queued', 90)).toBe(0);
    expect(phaseIndex('running', 3)).toBe(1);
    expect(phaseIndex('running', 19)).toBe(1);
    expect(phaseIndex('running', 20)).toBe(2);
  });
});
