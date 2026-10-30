// Cleaning and shortening of text taken from a document. Pure functions, no I/O.

// Control characters other than tab and newline, zero-width and bidi-override characters, and the BOM
// eslint-disable-next-line no-control-regex
const UNWANTED = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200d\u2060\u202a-\u202e\u2066-\u2069\ufeff]/g;
const HEADING = /^(?:#{1,6}\s|\d{1,3}(?:\.\d{1,3}){0,4}[.)]?\s+\S|(?:chapter|section|appendix|epic|feature|requirement|user story|module)\b)/i;
const MAX_HEADING_LENGTH = 100;
const MAX_HEADINGS = 400;

/** Removes control characters, normalizes line breaks and spaces, and collapses runs of blank lines. */
export const normalizeText = (raw: string): string => {
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029\f\v]/g, '\n')
    .replace(/[\u00a0\u2002-\u200a\u202f\u205f\u3000]/g, ' ')
    .replace(UNWANTED, '')
    .split('\n');
  const out: string[] = [];
  let blank = 0;
  for (const line of lines) {
    const clean = line.replace(/[ \t]+/g, ' ').trim();
    if (clean === '') {
      blank += 1;
      if (blank === 1 && out.length > 0) out.push('');
    } else {
      blank = 0;
      out.push(clean);
    }
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out.join('\n');
};

/** Lines that look like section titles: Markdown headings, numbered titles, "Chapter ...", short ALL CAPS lines. */
export const findHeadings = (text: string): string[] => {
  const headings: string[] = [];
  for (const line of text.split('\n')) {
    if (headings.length >= MAX_HEADINGS) break;
    if (line.length === 0 || line.length > MAX_HEADING_LENGTH) continue;
    const letters = line.replace(/[^\p{L}]/gu, '');
    const shouting = letters.length >= 4 && line.length <= 60 && line === line.toUpperCase() && letters.length * 2 >= line.length;
    if (HEADING.test(line) || shouting) headings.push(line);
  }
  return headings;
};

export interface Shortened {
  text: string;
  truncated: boolean;
  /** Characters of the cleaned document that did not go to the model (headings kept excluded). */
  omittedChars: number;
}

const OMITTED_NOTE = '[... the middle of the document is omitted because it is long ...]';

/**
 * Keeps a document within `maxChars`: the beginning (about 70% of the budget) followed by the section headings of
 * the part that was left out, so the model still sees what the rest is about. Never cuts silently: `truncated` says so.
 */
export const shortenForModel = (text: string, maxChars: number): Shortened => {
  if (text.length <= maxChars) return { text, truncated: false, omittedChars: 0 };

  const headBudget = Math.floor(maxChars * 0.7);
  const cut = text.lastIndexOf('\n', headBudget);
  const head = text.slice(0, cut > headBudget * 0.5 ? cut : headBudget);
  const rest = text.slice(head.length);

  const headingBudget = maxChars - head.length - OMITTED_NOTE.length - 80;
  const kept: string[] = [];
  let used = 0;
  for (const heading of findHeadings(rest)) {
    if (used + heading.length + 3 > headingBudget) break;
    kept.push(`- ${heading}`);
    used += heading.length + 3;
  }
  const tail = kept.length > 0 ? `\n\nSection headings found in the omitted part:\n${kept.join('\n')}` : '';
  const combined = `${head}\n\n${OMITTED_NOTE}${tail}`;
  return { text: combined.slice(0, maxChars), truncated: true, omittedChars: Math.max(0, text.length - head.length - used) };
};

/** First characters for the "what was uploaded" preview. */
export const previewOf = (text: string, max = 2000): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
