import { makeTask } from '@/features/tasks/__tests__/fixtures';
import {
  DEFAULT_STAGES, STAGE_TEMPLATES, STATUS_STAGES, firstStageOf, groupByStage, hasProblems, moveItem, parseStageLimit,
  prepareSave, quickMoveFor, resolveStage, stageKeyFor, stagePatch, stagesByGroup, validateStages,
} from '../lib/stages';
import type { WorkflowStage } from '../types';

const scrum = STAGE_TEMPLATES.find(template => template.id === 'scrum')?.stages ?? [];

describe('resolveStage', () => {
  it('uses the task stage when it belongs to the status group', () => {
    expect(resolveStage({ status: 'in-progress', stage: 'in-review' }, scrum).name).toBe('In review');
  });

  it('falls back to the first stage of the group for a stale, unknown or missing stage', () => {
    expect(resolveStage({ status: 'completed', stage: 'in-review' }, scrum).key).toBe('done');
    expect(resolveStage({ status: 'in-progress', stage: 'gone' }, scrum).key).toBe('in-progress');
    expect(resolveStage({ status: 'pending' }, scrum).key).toBe('todo');
    expect(resolveStage({ status: 'pending', stage: '' }, DEFAULT_STAGES).key).toBe('todo');
  });

  it('maps statuses onto the plain status stages until a workflow is loaded', () => {
    expect(resolveStage({ status: 'in-progress' }, STATUS_STAGES).name).toBe('In Progress');
  });
});

describe('groupByStage', () => {
  it('puts every task in its stage column, ordered by position', () => {
    const a = makeTask({ status: 'in-progress', stage: 'qa', position: 20 });
    const b = makeTask({ status: 'in-progress', stage: 'qa', position: 10 });
    const c = makeTask({ status: 'in-progress' });
    const d = makeTask({ status: 'completed', stage: 'in-review' });
    const columns = groupByStage([a, b, c, d], scrum);
    expect(columns.qa.map(task => task._id)).toEqual([b._id, a._id]);
    expect(columns['in-progress']).toEqual([c]);
    expect(columns.done).toEqual([d]);
    expect(columns['in-review']).toEqual([]);
  });
});

describe('stagesByGroup', () => {
  it('groups in status order and skips empty groups', () => {
    const groups = stagesByGroup(scrum);
    expect(groups.map(entry => [entry.group, entry.stages.map(stage => stage.key)])).toEqual([
      ['pending', ['todo']],
      ['in-progress', ['in-progress', 'in-review', 'qa']],
      ['completed', ['done']],
    ]);
    expect(stagesByGroup(scrum.filter(stage => stage.group !== 'pending')).map(entry => entry.group)).toEqual(['in-progress', 'completed']);
  });
});

describe('quickMoveFor', () => {
  it('starts, continues, finishes and reopens', () => {
    expect(quickMoveFor(scrum, scrum[0])).toMatchObject({ verb: 'Start', to: { key: 'in-progress' } });
    expect(quickMoveFor(scrum, scrum[1])).toMatchObject({ verb: 'Next', to: { key: 'in-review' } });
    expect(quickMoveFor(scrum, scrum[3])).toMatchObject({ verb: 'Done', to: { key: 'done' } });
    expect(quickMoveFor(scrum, scrum[4])).toMatchObject({ verb: 'Reopen', to: { key: 'todo' } });
  });

  it('matches the three plain statuses', () => {
    expect(quickMoveFor(STATUS_STAGES, STATUS_STAGES[0])).toMatchObject({ verb: 'Start', to: { key: 'in-progress' } });
    expect(quickMoveFor(STATUS_STAGES, STATUS_STAGES[1])).toMatchObject({ verb: 'Done', to: { key: 'completed' } });
    expect(quickMoveFor(STATUS_STAGES, STATUS_STAGES[2])).toMatchObject({ verb: 'Reopen', to: { key: 'pending' } });
  });
});

describe('stagePatch', () => {
  it('names the stage once the workflow is loaded, else only its group', () => {
    expect(stagePatch(scrum[2], true)).toEqual({ stage: 'in-review' });
    expect(stagePatch(scrum[2], false)).toEqual({ status: 'in-progress' });
  });
});

describe('firstStageOf', () => {
  it('returns the first stage of a group', () => {
    expect(firstStageOf(scrum, 'in-progress').key).toBe('in-progress');
  });
});

describe('stageKeyFor', () => {
  it('slugifies and keeps keys unique', () => {
    expect(stageKeyFor('In review', [])).toBe('in-review');
    expect(stageKeyFor('In review', ['in-review'])).toBe('in-review-2');
    expect(stageKeyFor('  QA / Test!  ', [])).toBe('qa-test');
    expect(stageKeyFor('???', [])).toBe('stage');
    expect(stageKeyFor('x'.repeat(60), []).length).toBeLessThanOrEqual(30);
  });
});

describe('validateStages', () => {
  const stage = (key: string, name: string, group: WorkflowStage['group'], wipLimit = 0): WorkflowStage =>
    ({ key, name, group, color: 'slate', wipLimit });

  it('accepts the templates', () => {
    for (const template of STAGE_TEMPLATES) expect(hasProblems(validateStages(template.stages))).toBe(false);
  });

  it('flags empty, long and duplicate names and bad limits per stage', () => {
    const problems = validateStages([
      stage('a', ' ', 'pending'),
      stage('b', 'B', 'in-progress'),
      stage('c', 'b', 'completed'),
      stage('d', 'D', 'completed', 1000),
      stage('e', 'x'.repeat(31), 'completed'),
    ]);
    expect(problems.byKey.a).toMatch(/name/i);
    expect(problems.byKey.c).toMatch(/already/i);
    expect(problems.byKey.d).toMatch(/limit/i);
    expect(problems.byKey.e).toMatch(/30/);
    expect(problems.byKey.b).toBeUndefined();
  });

  it('requires a stage in every group and at most twelve stages', () => {
    expect(validateStages([stage('a', 'A', 'pending'), stage('c', 'C', 'completed')]).list).toMatch(/In Progress/);
    expect(validateStages([]).list).toMatch(/at least one/);
    const many = Array.from({ length: 13 }, (_, i) => stage(`s${i}`, `S${i}`, (['pending', 'in-progress', 'completed'] as const)[i % 3]));
    expect(validateStages(many).list).toMatch(/at most 12/);
  });
});

describe('parseStageLimit', () => {
  it('reads whole numbers, treats empty as none and flags junk', () => {
    expect(parseStageLimit('4')).toBe(4);
    expect(parseStageLimit('  ')).toBe(0);
    expect(parseStageLimit('1.5')).toBeNaN();
    expect(parseStageLimit('-2')).toBeNaN();
  });
});

describe('moveItem', () => {
  it('moves within bounds and ignores moves outside them', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 3)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['a', 'b', 'c']);
  });
});

describe('prepareSave', () => {
  it('gives new stages slug keys, trims names and keeps only moves with a surviving target', () => {
    const saved = DEFAULT_STAGES;
    const draft: WorkflowStage[] = [
      DEFAULT_STAGES[0],
      { key: '~new-1', name: ' In review ', group: 'in-progress', color: 'violet', wipLimit: 2 },
      DEFAULT_STAGES[2],
    ];
    const request = prepareSave(draft, saved, { 'in-progress': '~new-1', done: 'missing' });
    expect(request.stages.map(stage => [stage.key, stage.name])).toEqual([['todo', 'To do'], ['in-review', 'In review'], ['done', 'Done']]);
    expect(request.moves).toEqual({ 'in-progress': 'in-review' });
  });

  it('does not reuse the key of a removed stage', () => {
    const draft: WorkflowStage[] = [
      DEFAULT_STAGES[0],
      { key: '~new-1', name: 'In progress', group: 'in-progress', color: 'blue', wipLimit: 0 },
      DEFAULT_STAGES[2],
    ];
    expect(prepareSave(draft, DEFAULT_STAGES, {}).stages[1].key).toBe('in-progress-2');
  });
});
