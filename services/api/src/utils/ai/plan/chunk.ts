import type { PlanContent, PlanEpic, PlanItem, PlanSprint } from './schema.js';

// Page-by-page generation: a document longer than one analyzer call is split into chunks, each chunk
// is generated on its own (its own analyzer request), and the answers are merged into one plan.
// Everything here is pure, so the split and the merge are unit tested without a provider.
//
// The chunk boundary is only a hint to the model: it never changes the answer's shape, and the merge
// repairs whatever a chunk produced (missing refs, an epic that points nowhere), because
// `finalizePlan` renumbers and clamps the merged plan afterwards anyway.

export interface Chunk {
  /** 0-based position of this chunk in the document. */
  index: number;
  /** Chunk text, at most `maxChars` characters. */
  text: string;
  /** Characters of the document covered by this chunk (before the overlap). */
  startChar: number;
  endChar: number;
}

/** Characters of the previous chunk repeated at the start of the next one, so a section cut in two is seen whole by one of them. */
export const CHUNK_OVERLAP = 400;
/** Smallest useful chunk: below this the split is refused and the document is sent whole. */
const MIN_CHUNK_CHARS = 1_000;

/**
 * Splits `text` into chunks of at most `maxChars` characters.
 *
 * The cut prefers a blank line (a paragraph or section boundary), then a newline, then a hard cut, so
 * a chunk rarely begins or ends in the middle of a sentence. Consecutive chunks overlap by
 * `CHUNK_OVERLAP` characters, so a requirement that straddles a boundary is still seen whole by one
 * of them; the merge drops the duplicates that overlap produces.
 *
 * A single chunk is returned whenever the text already fits or when `maxChars` is too small to be
 * worth splitting, so callers can treat "one chunk" as the ordinary single-call path.
 */
export const splitIntoChunks = (text: string, maxChars: number): Chunk[] => {
  const size = Math.floor(maxChars);
  if (text.length <= size || size < MIN_CHUNK_CHARS) {
    return [{ index: 0, text, startChar: 0, endChar: text.length }];
  }

  const chunks: Chunk[] = [];
  let start = 0;
  while (start < text.length) {
    // The hard limit for this chunk, and where a clean cut is preferred.
    const hardEnd = Math.min(start + size, text.length);
    let end = hardEnd;
    if (hardEnd < text.length) {
      const window = text.slice(start, hardEnd);
      const paragraph = window.lastIndexOf('\n\n');
      const line = window.lastIndexOf('\n');
      // Only trust a soft cut when it is not so early that it wastes most of the budget.
      const soft = paragraph > size * 0.5 ? paragraph : line > size * 0.5 ? line : -1;
      if (soft > 0) end = start + soft + (paragraph === soft ? 2 : 1);
    }
    const slice = text.slice(start, end).trim();
    if (slice) chunks.push({ index: chunks.length, text: slice, startChar: start, endChar: end });
    if (end >= text.length) break;
    // Always move forward, even when the overlap is larger than the remaining text.
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
};

/**
 * Splits one chunk into two halves at a paragraph or newline boundary near the middle.
 *
 * Used to recover a page that the model could not answer: a page that is too dense is planned in two
 * smaller calls. Returns null when the chunk is too small to be worth halving, or when the two halves
 * would not cover more of the document than one page already does (the callers count re-splits, so a
 * chunk with little room left must not be split again and again).
 */
const MIN_RESPLIT_CHARS = 500;
export const halveChunk = (chunk: Chunk): [Chunk, Chunk] | null => {
  const { text } = chunk;
  if (text.length < MIN_RESPLIT_CHARS * 2) return null;
  const middle = Math.floor(text.length / 2);
  const window = text.slice(0, middle);
  const paragraph = window.lastIndexOf('\n\n');
  const line = window.lastIndexOf('\n');
  const at = paragraph > text.length * 0.25 ? paragraph + 2 : line > text.length * 0.25 ? line + 1 : middle;
  const head = text.slice(0, at).trim();
  const tail = text.slice(at).trim();
  if (head.length < MIN_RESPLIT_CHARS || tail.length < MIN_RESPLIT_CHARS) return null;
  return [
    { index: chunk.index, text: head, startChar: chunk.startChar, endChar: chunk.startChar + at },
    { index: chunk.index + 1, text: tail, startChar: chunk.startChar + at, endChar: chunk.endChar },
  ];
};

/** Lower-cased, whitespace-collapsed key used to recognise the same title written twice. */
const titleKey = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();
const nonEmpty = (values: string[], max: number): string[] => {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of values) {
    const clean = value.replace(/\s+/g, ' ').trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    kept.push(clean);
    if (kept.length >= max) break;
  }
  return kept;
};

/** The longest of the values that are not empty, or an empty string. */
const longestOf = (values: string[]): string => values.reduce((best, value) => (value.length > best.length ? value : best), '');

const mergeEpics = (plans: PlanContent[], limit: number): PlanEpic[] => {
  const seen = new Set<string>();
  const kept: PlanEpic[] = [];
  for (const plan of plans) {
    for (const epic of plan.epics) {
      const key = titleKey(epic.title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      kept.push({ ref: epic.ref, title: epic.title, description: epic.description });
      if (kept.length >= limit) return kept;
    }
  }
  return kept;
};

/**
 * The sprints of the merged plan: the longest list any chunk proposed (the document defines how many
 * sprints exist, and every chunk sees the whole document's title, so the largest is the best guess).
 * A goal or a name is taken from the first chunk that filled it.
 */
const mergeSprints = (plans: PlanContent[], limit: number): PlanSprint[] => {
  const count = Math.min(limit, plans.reduce((most, plan) => Math.max(most, plan.sprints.length), 0));
  const merged: PlanSprint[] = [];
  for (let index = 0; index < count; index += 1) {
    const windows = plans.map(plan => plan.sprints[index]).filter((sprint): sprint is PlanSprint => Boolean(sprint));
    merged.push({
      name: windows.map(sprint => sprint.name).find(name => name.trim() !== '') ?? '',
      goal: longestOf(windows.map(sprint => sprint.goal)),
      // Dates are computed by `finalizePlan` unless a person kept them; the model leaves them empty.
      startDate: windows.map(sprint => sprint.startDate).find(date => date !== '') ?? '',
      endDate: windows.map(sprint => sprint.endDate).find(date => date !== '') ?? '',
    });
  }
  return merged;
};

/**
 * Everything a document run produces, folded into the one plan the rest of the system expects.
 *
 * A chunk sees only part of the document, so several chunks overlap on a boundary requirement and the
 * same item can be produced twice; items are therefore de-duplicated by title (first wins). Refs are
 * not trusted across chunks, so every item is given a fresh sequential ref and its `epicRef`
 * is rewritten to point at the merged epics; `finalizePlan` numbers them again after this anyway.
 */
export const mergePlans = (
  plans: PlanContent[],
  options: { maxItems: number; maxSprints: number; maxEpics: number; maxNotes: number },
): PlanContent => {
  const usable = plans.filter(plan => plan.items.length > 0 || plan.epics.length > 0 || plan.sprints.length > 0);
  const source = usable.length > 0 ? usable : plans;

  const project = source.map(plan => plan.project).find(Boolean);
  const epics = mergeEpics(source, options.maxEpics);
  const numbered = epics.map((epic, index) => ({ ...epic, ref: `E${index + 1}` }));
  const sprints = mergeSprints(source, options.maxSprints);

  // Map the merged epic titles to their final refs, so an item points at the epic the merge kept,
  // never at the ref a single chunk invented (which is why the refs are renumbered once, here).
  const refOf = new Map<string, string>();
  for (const epic of numbered) refOf.set(titleKey(epic.title), epic.ref);

  const seenTitles = new Set<string>();
  const items: PlanItem[] = [];
  for (const plan of source) {
    const epicByRef = new Map(plan.epics.map(epic => [epic.ref, epic]));
    for (const item of plan.items) {
      const key = titleKey(item.title);
      if (!key || seenTitles.has(key)) continue;
      seenTitles.add(key);
      if (items.length >= options.maxItems) break;
      // Point the item at the merged epic with the same title, not the ref this one chunk invented.
      const epicTitle = item.epicRef ? epicByRef.get(item.epicRef)?.title : undefined;
      const epicRef = epicTitle ? refOf.get(titleKey(epicTitle)) ?? null : null;
      items.push({ ...item, ref: `T${items.length + 1}`, epicRef });
    }
    if (items.length >= options.maxItems) break;
  }

  return {
    project: project ?? { name: 'New project', key: 'NEW', description: '', color: 'blue' },
    sprints,
    epics: numbered,
    items,
    assumptions: nonEmpty(source.flatMap(plan => plan.assumptions), options.maxNotes),
    risks: nonEmpty(source.flatMap(plan => plan.risks), options.maxNotes),
  };
};

