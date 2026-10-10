// Minimal reader for the generated release notes (headings, bullet lists, paragraphs). The result is plain data
// that React renders as text, so nothing from the notes can ever become markup.

export type NoteBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string; muted: boolean };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const ITALIC_ONLY = /^_(.+)_$/;

export const parseNotesMarkdown = (markdown: string): NoteBlock[] => {
  const blocks: NoteBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ');
    const italic = ITALIC_ONLY.exec(text);
    blocks.push({ kind: 'paragraph', text: italic ? italic[1] : text, muted: Boolean(italic) });
    paragraph = [];
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2].trim() });
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      flushParagraph();
      const last = blocks.at(-1);
      if (last?.kind === 'list') last.items.push(bullet[1].trim());
      else blocks.push({ kind: 'list', items: [bullet[1].trim()] });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
};

const KEYED_ITEM = /^([A-Z0-9]{2,6}-\d+)\s+(.*)$/;

/** Splits a list item like "WEB-12 Dark mode" into its task key and title. */
export const splitNoteItem = (text: string): { key: string; title: string } => {
  const match = KEYED_ITEM.exec(text);
  return match ? { key: match[1], title: match[2] } : { key: '', title: text };
};
