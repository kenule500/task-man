import { CHUNK_OVERLAP, halveChunk, mergePlans, splitIntoChunks } from '../utils/ai/plan/chunk.js';
import type { PlanContent } from '../utils/ai/plan/schema.js';

// The pure half of page-by-page generation: how a document is cut into analyzer-sized pages, and how
// the answers are folded back into the one plan the rest of the system expects.

const chunk = (overrides: Partial<PlanContent> = {}): PlanContent => ({
  project: { name: 'Clinic', key: 'CLINIC', description: '', color: 'blue' },
  sprints: [{ name: 'Sprint 1', goal: '', startDate: '', endDate: '' }],
  epics: [],
  items: [],
  assumptions: [],
  risks: [],
  ...overrides,
});

const item = (ref: string, title: string, epicRef: string | null = null) => ({
  ref, sprintIndex: 0, epicRef, title, description: '', type: 'story' as const, priority: 'medium' as const,
  storyPoints: 3, labels: [], acceptanceCriteria: [], subtasks: [],
});

describe('splitIntoChunks', () => {
  it('keeps a document that already fits as one chunk', () => {
    const chunks = splitIntoChunks('short brief', 1_000);
    expect(chunks).toEqual([{ index: 0, text: 'short brief', startChar: 0, endChar: 11 }]);
  });

  it('splits a long document into pages of at most the cap, covering the whole text', () => {
    const text = `${'a'.repeat(2_000)}\n\n${'b'.repeat(2_000)}\n\n${'c'.repeat(2_000)}`;
    const chunks = splitIntoChunks(text, 3_000);

    expect(chunks.length).toBeGreaterThan(1);
    for (const part of chunks) expect(part.text.length).toBeLessThanOrEqual(3_000);
    // The first chunk starts at the start and the last one reaches the end
    expect(chunks[0].startChar).toBe(0);
    expect(chunks.at(-1)!.endChar).toBe(text.length);
  });

  it('overlaps consecutive pages so a requirement on a boundary is seen whole by one of them', () => {
    const text = Array.from({ length: 8 }, (_, i) => `Section ${i}. ${'x'.repeat(900)}`).join('\n\n');
    const chunks = splitIntoChunks(text, 2_000);

    expect(chunks.length).toBeGreaterThan(1);
    // Each page after the first starts before the previous one ended
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i].startChar).toBeLessThan(chunks[i - 1].endChar);
      expect(chunks[i - 1].endChar - chunks[i].startChar).toBeLessThanOrEqual(CHUNK_OVERLAP);
    }
  });

  it('gives up on a cap too small to be worth splitting', () => {
    const chunks = splitIntoChunks('x'.repeat(5_000), 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toHaveLength(5_000);
  });
});

describe('halveChunk', () => {
  const page = (text: string): { index: number; text: string; startChar: number; endChar: number } => ({
    index: 1,
    text,
    startChar: 100,
    endChar: 100 + text.length,
  });

  it('splits a dense page into two halves that cover it exactly once', () => {
    const text = `${'a'.repeat(1_000)}\n\n${'b'.repeat(1_000)}`;
    const halves = halveChunk(page(text));

    expect(halves).not.toBeNull();
    const [head, tail] = halves!;
    // The two halves read the same text once, with no gap and no repetition
    expect(`${head.text}\n\n${tail.text}`).toBe(text);
    expect(head.startChar).toBe(100);
    expect(tail.endChar).toBe(100 + text.length);
  });

  it('refuses to split a page too small to gain anything', () => {
    expect(halveChunk(page('x'.repeat(400)))).toBeNull();
  });

  it('refuses when cutting would leave one half too small to be worth a call', () => {
    // A paragraph break sits past the 25% mark but before 500 characters, so the head half would be
    // too small to plan: the page must not be halved into a call that cannot carry a requirement.
    const text = `${'x'.repeat(398)}\n\n${'y'.repeat(800)}`;
    expect(halveChunk(page(text))).toBeNull();
  });
});

describe('mergePlans', () => {
  const limits = { maxItems: 120, maxSprints: 8, maxEpics: 12, maxNotes: 12 };

  it('folds chunks into one plan with renumbered, non-repeating refs', () => {
    const merged = mergePlans([
      chunk({ items: [item('T1', 'Book an appointment')] }),
      chunk({ items: [item('T1', 'Send a reminder')] }),
    ], limits);

    expect(merged.items.map(entry => entry.ref)).toEqual(['T1', 'T2']);
    expect(merged.items.map(entry => entry.title)).toEqual(['Book an appointment', 'Send a reminder']);
  });

  it('drops the item a boundary produced twice', () => {
    const merged = mergePlans([
      chunk({ items: [item('T1', 'Book an appointment')] }),
      chunk({ items: [item('T1', '  Book an appointment ')] }),
    ], limits);

    expect(merged.items).toHaveLength(1);
  });

  it('merges epics by title and points items at the merged epic, not the chunk-local ref', () => {
    const merged = mergePlans([
      chunk({ epics: [{ ref: 'E9', title: 'Scheduling', description: '' }], items: [item('T1', 'Book', 'E9')] }),
      chunk({ epics: [{ ref: 'E1', title: 'Reminders', description: '' }], items: [item('T1', 'Remind', 'E1')] }),
    ], limits);

    expect(merged.epics.map(epic => epic.ref)).toEqual(['E1', 'E2']);
    const book = merged.items.find(entry => entry.title === 'Book');
    const remind = merged.items.find(entry => entry.title === 'Remind');
    expect(book?.epicRef).toBe('E1');
    expect(remind?.epicRef).toBe('E2');
  });

  it('points an item at nothing when its epic was not kept', () => {
    const merged = mergePlans([
      chunk({ items: [{ ...item('T1', 'Orphan', 'E7') }] }),
    ], limits);

    expect(merged.items[0].epicRef).toBeNull();
  });

  it('takes the longest sprint list any chunk proposed and de-duplicates the notes', () => {
    const merged = mergePlans([
      chunk({
        sprints: [{ name: 'Sprint 1', goal: 'Start', startDate: '', endDate: '' }],
        assumptions: ['Cards only', 'Cards only'],
        risks: ['Approval takes weeks'],
      }),
      chunk({
        sprints: [
          { name: 'Sprint 1', goal: '', startDate: '', endDate: '' },
          { name: 'Sprint 2', goal: 'Finish', startDate: '', endDate: '' },
        ],
        assumptions: ['Cards only', 'Euro only'],
      }),
    ], limits);

    expect(merged.sprints).toHaveLength(2);
    expect(merged.sprints[0].goal).toBe('Start');
    expect(merged.sprints[1].goal).toBe('Finish');
    expect(merged.assumptions).toEqual(['Cards only', 'Euro only']);
    expect(merged.risks).toEqual(['Approval takes weeks']);
  });
});
