import { readFileSync } from 'node:fs';
import { PLAN_LIMITS, finalizePlan, modelPlanSchema } from '../utils/ai/plan/schema.js';

// The plan contract both sides share (packages/contracts). The Python half is
// services/document-analyzer/tests/test_contracts.py; together they fail when one side changes alone.

const read = (path: string) => JSON.parse(readFileSync(new URL(`../../../../packages/contracts/${path}`, import.meta.url), 'utf8'));
const golden = read('fixtures/plan.golden.json');
const schema = read('plan.contract.json') as {
  properties: Record<'sprints' | 'epics' | 'items' | 'assumptions', { maxItems: number }>;
};

const valid = (value: unknown) => modelPlanSchema.safeParse(value).success;

describe('the shared plan contract', () => {
  it('accepts the golden fixture unchanged', () => {
    // Repairing an already clean plan must change nothing
    expect(modelPlanSchema.parse(golden)).toEqual(golden);
  });

  it('uses the same plan limits as the analyzer', () => {
    expect({
      sprints: PLAN_LIMITS.sprints, epics: PLAN_LIMITS.epics, items: PLAN_LIMITS.items, notes: PLAN_LIMITS.notes, subtasksTotal: PLAN_LIMITS.subtasksTotal,
    }).toEqual({
      sprints: schema.properties.sprints.maxItems,
      epics: schema.properties.epics.maxItems,
      items: schema.properties.items.maxItems,
      notes: schema.properties.assumptions.maxItems,
      subtasksTotal: 300,
    });
  });

  it('repairs what the analyzer repairs, and drops what neither keeps', () => {
    const messy = { ...golden, springSummary: 'dropped', items: [{ ref: 'E1', sprint: 9, epic: 'nope', storyPoints: 4, title: 'X' }] };
    expect(modelPlanSchema.parse(messy).items[0]).toMatchObject({ storyPoints: 5 });
    expect(modelPlanSchema.parse(messy)).not.toHaveProperty('springSummary');
    expect(valid({ ...golden, items: [] })).toBe(false);
  });

  it('finalizes into a plan the published schema still accepts', () => {
    // Refs that point nowhere and sprint dates are settled by finalizePlan, not by the model schema
    const messy = { ...golden, items: [{ ref: 'E1', sprint: 9, epic: 'nope', storyPoints: 4, title: 'X' }] };
    const clean = finalizePlan(modelPlanSchema.parse(messy), { startDate: '2026-11-02', sprintLengthWeeks: 2 });
    expect(clean.items[0]).toMatchObject({ epicRef: null, sprintIndex: null, storyPoints: 5 });
    expect(clean).toMatchObject({ sprints: golden.sprints.map((sprint: { name: string; goal: string }) => ({ name: sprint.name, goal: sprint.goal })) });
    // Already clean and re-run: still clean (finalizePlan is idempotent)
    expect(finalizePlan(modelPlanSchema.parse(clean), { startDate: '2026-11-02', sprintLengthWeeks: 2 })).toEqual(clean);
  });
});
