import { applyToolbarAction, cycleHeading, insertLink, insertTaskKey, prefixLines, wrapSelection } from '../lib/markdown';

describe('wrapSelection', () => {
  it('wraps the selection and keeps it selected', () => {
    const edit = wrapSelection('hello world', 6, 11, '**', '**', 'x');
    expect(edit.text).toBe('hello **world**');
    expect(edit.text.slice(edit.selectionStart, edit.selectionEnd)).toBe('world');
  });

  it('inserts a placeholder without a selection and removes markers when applied again', () => {
    const added = wrapSelection('', 0, 0, '_', '_', 'italic text');
    expect(added.text).toBe('_italic text_');
    expect(added.text.slice(added.selectionStart, added.selectionEnd)).toBe('italic text');
    const removed = wrapSelection(added.text, added.selectionStart, added.selectionEnd, '_', '_', 'italic text');
    expect(removed.text).toBe('italic text');
  });
});

describe('line prefixes', () => {
  it('prefixes every selected line and toggles back', () => {
    const text = 'one\ntwo\nthree';
    const on = prefixLines(text, 0, 7, '- ');
    expect(on.text).toBe('- one\n- two\nthree');
    expect(prefixLines(on.text, on.selectionStart, on.selectionEnd, '- ').text).toBe(text);
  });

  it('works on the line of a collapsed cursor', () => {
    expect(applyToolbarAction('list', 'a\nb\nc', 3, 3).text).toBe('a\n- b\nc');
    expect(applyToolbarAction('checklist', 'task', 2, 2).text).toBe('- [ ] task');
    expect(applyToolbarAction('checklist', '- [x] done', 0, 0).text).toBe('done');
  });

  it('cycles headings', () => {
    const one = cycleHeading('Title', 0, 0).text;
    expect(one).toBe('## Title');
    const two = cycleHeading(one, 0, 0).text;
    expect(two).toBe('### Title');
    expect(cycleHeading(two, 0, 0).text).toBe('Title');
  });
});

describe('links and task keys', () => {
  it('wraps the selection in a link and selects the address', () => {
    const edit = insertLink('see docs here', 4, 8);
    expect(edit.text).toBe('see [docs](https://) here');
    expect(edit.text.slice(edit.selectionStart, edit.selectionEnd)).toBe('https://');
  });

  it('inserts a task key with sensible spacing', () => {
    expect(insertTaskKey('Blocked by', 10, 10, 'WEB-12').text).toBe('Blocked by WEB-12');
    expect(insertTaskKey('See ', 4, 4, 'WEB-12').text).toBe('See WEB-12');
    expect(insertTaskKey('See and', 4, 4, 'WEB-12').text).toBe('See WEB-12 and');
    expect(insertTaskKey('(done).', 6, 6, 'WEB-3').text).toBe('(done) WEB-3.');
  });

  it('wraps code inline or as a block', () => {
    expect(applyToolbarAction('code', 'run npm', 4, 7).text).toBe('run `npm`');
    expect(applyToolbarAction('code', 'a\nb', 0, 3).text).toBe('```\na\nb\n```');
  });
});
