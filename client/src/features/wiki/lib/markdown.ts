// Pure text edits behind the editor toolbar: each takes the text and the selection and returns both anew.

export interface TextEdit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

export type ToolbarAction = 'bold' | 'italic' | 'heading' | 'list' | 'checklist' | 'code' | 'link';

/** Wraps the selection (or a placeholder) in `before`/`after`; wrapping again removes the markers. */
export const wrapSelection = (
  text: string, start: number, end: number, before: string, after: string, placeholder: string,
): TextEdit => {
  const selected = text.slice(start, end);
  const hasMarkers = selected !== ''
    && text.slice(start - before.length, start) === before
    && text.slice(end, end + after.length) === after;
  if (hasMarkers) {
    return {
      text: text.slice(0, start - before.length) + selected + text.slice(end + after.length),
      selectionStart: start - before.length,
      selectionEnd: end - before.length,
    };
  }
  const inner = selected || placeholder;
  return {
    text: text.slice(0, start) + before + inner + after + text.slice(end),
    selectionStart: start + before.length,
    selectionEnd: start + before.length + inner.length,
  };
};

/** First character of the line holding `from` and the end of the line holding `to` (before its newline). */
const lineBounds = (text: string, from: number, to: number) => {
  const lineStart = text.lastIndexOf('\n', from - 1) + 1;
  const nextBreak = text.indexOf('\n', to);
  return { lineStart, lineEnd: nextBreak === -1 ? text.length : nextBreak };
};

/** Adds a line prefix to each selected line; when every line already has it, removes it instead. */
export const prefixLines = (
  text: string, start: number, end: number, prefix: string, matches: (line: string) => boolean = line => line.startsWith(prefix),
): TextEdit => {
  const { lineStart, lineEnd } = lineBounds(text, start, end);
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const allPrefixed = lines.every(matches);
  const block = lines
    .map(line => (allPrefixed ? line.slice(prefix.length) : matches(line) ? line : `${prefix}${line}`))
    .join('\n');
  return {
    text: text.slice(0, lineStart) + block + text.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + block.length,
  };
};

const HEADING = /^(#{1,3}) /;

/** Cycles the first selected line through "## ", "### " and back to plain text. */
export const cycleHeading = (text: string, start: number, end: number): TextEdit => {
  const { lineStart, lineEnd } = lineBounds(text, start, end);
  const line = text.slice(lineStart, lineEnd).split('\n')[0];
  const bare = line.replace(HEADING, '');
  const level = HEADING.exec(line)?.[1].length ?? 0;
  const next = level === 2 ? `### ${bare}` : level === 3 ? bare : `## ${bare}`;
  return {
    text: text.slice(0, lineStart) + next + text.slice(lineStart + line.length),
    selectionStart: lineStart,
    selectionEnd: lineStart + next.length,
  };
};

/** `[text](https://)` around the selection, with the address selected for typing. */
export const insertLink = (text: string, start: number, end: number): TextEdit => {
  const label = text.slice(start, end) || 'link text';
  const url = 'https://';
  const urlStart = start + label.length + 3;
  return {
    text: `${text.slice(0, start)}[${label}](${url})${text.slice(end)}`,
    selectionStart: urlStart,
    selectionEnd: urlStart + url.length,
  };
};

/** Inserts a task key such as "WEB-12" at the cursor, spaced from neighbouring words. */
export const insertTaskKey = (text: string, start: number, end: number, key: string): TextEdit => {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const trail = after && !/^[\s.,;:!?)]/.test(after) ? ' ' : '';
  const inserted = `${lead}${key}${trail}`;
  const cursor = start + inserted.length;
  return { text: before + inserted + after, selectionStart: cursor, selectionEnd: cursor };
};

export const applyToolbarAction = (action: ToolbarAction, text: string, start: number, end: number): TextEdit => {
  switch (action) {
    case 'bold': return wrapSelection(text, start, end, '**', '**', 'bold text');
    case 'italic': return wrapSelection(text, start, end, '_', '_', 'italic text');
    case 'code':
      return text.slice(start, end).includes('\n')
        ? wrapSelection(text, start, end, '```\n', '\n```', 'code')
        : wrapSelection(text, start, end, '`', '`', 'code');
    case 'heading': return cycleHeading(text, start, end);
    case 'list': return prefixLines(text, start, end, '- ', line => /^[-*] /.test(line) && !/^[-*] \[[ xX]\] /.test(line));
    case 'checklist': return prefixLines(text, start, end, '- [ ] ', line => /^- \[[ xX]\] /.test(line));
    case 'link': return insertLink(text, start, end);
  }
};
