import {
  MAX_CHECKLIST_ITEMS, addChecklistItem, canAddChecklistItem, checklistLabel, checklistProgress, cleanChecklistText,
  moveChecklistItem, newChecklistId, removeChecklistItem, renameChecklistItem, toChecklistInput, toggleChecklistItem,
} from '../lib/checklist';
import type { ChecklistItem } from '../types';

const items: ChecklistItem[] = [
  { _id: 'a', text: 'One', done: true },
  { _id: 'b', text: 'Two', done: false },
  { _id: 'c', text: 'Three', done: false },
];

describe('checklist progress', () => {
  it('counts done items', () => {
    expect(checklistProgress(items)).toEqual({ done: 1, total: 3 });
    expect(checklistProgress(undefined)).toEqual({ done: 0, total: 0 });
  });

  it('labels a non-empty list as done/total', () => {
    expect(checklistLabel(items)).toBe('1/3');
    expect(checklistLabel([])).toBe('');
  });
});

describe('checklist edits', () => {
  it('adds a trimmed item with a fresh 24-hex id, not done', () => {
    const next = addChecklistItem(items, '  Four  ');
    expect(next).toHaveLength(4);
    expect(next[3]).toMatchObject({ text: 'Four', done: false });
    expect(next[3]._id).toMatch(/^[0-9a-f]{24}$/);
    expect(newChecklistId()).not.toBe(newChecklistId());
  });

  it('ignores empty text, text over 200 characters and a full list', () => {
    expect(addChecklistItem(items, '   ')).toEqual(items);
    expect(addChecklistItem(items, 'x'.repeat(201))).toEqual(items);
    const full = Array.from({ length: MAX_CHECKLIST_ITEMS }, (_, i) => ({ _id: `i${i}`, text: `Item ${i}`, done: false }));
    expect(canAddChecklistItem(full)).toBe(false);
    expect(addChecklistItem(full, 'one more')).toHaveLength(MAX_CHECKLIST_ITEMS);
    expect(cleanChecklistText('x'.repeat(200))).toHaveLength(200);
  });

  it('toggles one item, or sets it explicitly', () => {
    expect(toggleChecklistItem(items, 'b').map(item => item.done)).toEqual([true, true, false]);
    expect(toggleChecklistItem(items, 'a').map(item => item.done)).toEqual([false, false, false]);
    expect(toggleChecklistItem(items, 'a', true)[0].done).toBe(true);
  });

  it('renames with trimming and keeps the old text for an empty one', () => {
    expect(renameChecklistItem(items, 'b', '  Second ')[1].text).toBe('Second');
    expect(renameChecklistItem(items, 'b', '  ')[1].text).toBe('Two');
  });

  it('removes an item', () => {
    expect(removeChecklistItem(items, 'b').map(item => item._id)).toEqual(['a', 'c']);
  });

  it('moves an item one place and stops at the ends', () => {
    expect(moveChecklistItem(items, 'c', -1).map(item => item._id)).toEqual(['a', 'c', 'b']);
    expect(moveChecklistItem(items, 'a', 1).map(item => item._id)).toEqual(['b', 'a', 'c']);
    expect(moveChecklistItem(items, 'a', -1).map(item => item._id)).toEqual(['a', 'b', 'c']);
    expect(moveChecklistItem(items, 'c', 1).map(item => item._id)).toEqual(['a', 'b', 'c']);
    expect(moveChecklistItem(items, 'zzz', 1).map(item => item._id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input and sends only the API fields', () => {
    const before = JSON.stringify(items);
    moveChecklistItem(items, 'a', 1);
    removeChecklistItem(items, 'a');
    expect(JSON.stringify(items)).toBe(before);
    expect(toChecklistInput([{ ...items[0], extra: 1 } as ChecklistItem])).toEqual([{ _id: 'a', text: 'One', done: true }]);
  });
});
