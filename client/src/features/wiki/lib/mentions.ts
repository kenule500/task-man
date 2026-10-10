import { formatRelativeTime } from '@/features/tasks/lib/date';
import type { WikiMention, WikiPageSummary } from '../types';

// A tiny structural view of the Markdown syntax tree (mdast); enough to split text nodes without extra packages
export interface MdNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MdNode[];
}

const TASK_KEY = /\b[A-Z][A-Z0-9]{1,5}-\d{1,9}\b/g;
// Text inside these is left alone: it already is a link, code or raw markup
const SKIP = new Set(['link', 'linkReference', 'code', 'inlineCode', 'definition', 'html', 'image', 'imageReference']);

/** Tasks page address; the tasks screen opens the task from `?task=` and then clears it. */
export const taskHref = (workspaceSlug: string, taskId: string): string =>
  `/${encodeURIComponent(workspaceSlug)}/tasks?task=${encodeURIComponent(taskId)}`;

export const mentionLinks = (mentions: readonly WikiMention[], workspaceSlug: string): Map<string, { href: string; title: string }> =>
  new Map(mentions.map(mention => [mention.key, { href: taskHref(workspaceSlug, mention.id), title: mention.title }]));

const splitText = (value: string, links: ReadonlyMap<string, { href: string; title: string }>): MdNode[] | null => {
  const parts: MdNode[] = [];
  let last = 0;
  for (const match of value.matchAll(TASK_KEY)) {
    const link = links.get(match[0]);
    if (!link) continue;
    const at = match.index ?? 0;
    if (at > last) parts.push({ type: 'text', value: value.slice(last, at) });
    parts.push({ type: 'link', url: link.href, title: link.title, children: [{ type: 'text', value: match[0] }] });
    last = at + match[0].length;
  }
  if (parts.length === 0) return null;
  if (last < value.length) parts.push({ type: 'text', value: value.slice(last) });
  return parts;
};

/** Turns known task keys in text nodes into links to the task (in place). */
export const linkTaskKeys = (node: MdNode, links: ReadonlyMap<string, { href: string; title: string }>): void => {
  if (!node.children || SKIP.has(node.type)) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string') {
      next.push(...(splitText(child.value, links) ?? [child]));
    } else {
      linkTaskKeys(child, links);
      next.push(child);
    }
  }
  node.children = next;
};

/** remark plugin: `remarkPlugins={[[remarkTaskKeys, { links }]]}` */
export const remarkTaskKeys = (options: { links: ReadonlyMap<string, { href: string; title: string }> }) =>
  (tree: MdNode) => {
    if (options.links.size > 0) linkTaskKeys(tree, options.links);
  };

/** A link that leaves the app (http, https or protocol-relative). */
export const isExternalHref = (href: string): boolean => /^(https?:)?\/\//i.test(href);

/** A link inside the app ("/demo/tasks?task=1"), not a protocol-relative address. */
export const isInternalHref = (href: string): boolean => href.startsWith('/') && !href.startsWith('//');

/** "Edited by Ada 5 minutes ago" (falls back to "Created" wording for a page that was never edited). */
export const describeLastEdit = (page: Pick<WikiPageSummary, 'updatedBy' | 'createdBy' | 'updatedAt' | 'createdAt' | 'version'>, now?: Date): string => {
  const edited = page.version > 1;
  const who = (edited ? page.updatedBy : page.createdBy)?.name;
  const when = formatRelativeTime(edited ? page.updatedAt : page.createdAt, now);
  return `${edited ? 'Edited' : 'Created'}${who ? ` by ${who}` : ''}${when ? ` ${when}` : ''}`;
};
