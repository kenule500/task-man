import { MAX_PAGE_DEPTH } from '../models/pageModel.js';

// Pure helpers for the wiki (see controllers/pageController.ts)

/** "Release plan: Q3 (draft)" -> "release-plan-q3-draft"; never empty. */
export const slugify = (title: string): string => {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || 'page';
};

/** The first of "slug", "slug-2", "slug-3"... that `isTaken` does not report. */
export const uniqueSlug = (base: string, isTaken: (slug: string) => boolean): string => {
  if (!isTaken(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!isTaken(candidate)) return candidate;
  }
};

const TASK_KEY = /\b([A-Z][A-Z0-9]{1,5})-(\d{1,9})\b/g;
export const MAX_MENTIONS = 50;

/** Distinct task keys such as "WEB-12" mentioned in Markdown, in order of appearance (at most MAX_MENTIONS). */
export const extractTaskKeys = (content: string): { key: string; prefix: string; number: number }[] => {
  const seen = new Set<string>();
  const found: { key: string; prefix: string; number: number }[] = [];
  for (const match of content.matchAll(TASK_KEY)) {
    const key = match[0];
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ key, prefix: match[1], number: Number(match[2]) });
    if (found.length >= MAX_MENTIONS) break;
  }
  return found;
};

export interface PageNode {
  _id: string;
  parent: string | null;
}

/** Levels above `id` including itself (a root page = 1). Stops on a cycle. */
export const depthOf = (id: string | null, nodes: Map<string, PageNode>): number => {
  let depth = 0;
  const visited = new Set<string>();
  let current = id;
  while (current && !visited.has(current)) {
    visited.add(current);
    depth += 1;
    current = nodes.get(current)?.parent ?? null;
  }
  return depth;
};

/** Levels of the subtree below `id` (a page without children = 0). */
export const subtreeHeight = (id: string, nodes: Map<string, PageNode>): number => {
  const children = new Map<string, string[]>();
  for (const node of nodes.values()) {
    if (node.parent) children.set(node.parent, [...(children.get(node.parent) ?? []), node._id]);
  }
  const walk = (current: string, seen: Set<string>): number => {
    const kids = (children.get(current) ?? []).filter(kid => !seen.has(kid));
    return kids.length === 0 ? 0 : 1 + Math.max(...kids.map(kid => walk(kid, new Set([...seen, kid]))));
  };
  return walk(id, new Set([id]));
};

/** Whether `candidate` is `id` itself or one of its descendants (a page cannot move under itself). */
export const isSelfOrDescendant = (id: string, candidate: string, nodes: Map<string, PageNode>): boolean => {
  let current: string | null = candidate;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    if (current === id) return true;
    visited.add(current);
    current = nodes.get(current)?.parent ?? null;
  }
  return false;
};

/** Whether `id` can sit under `newParent` (null = root) without exceeding MAX_PAGE_DEPTH or forming a loop. */
export const canMoveUnder = (id: string, newParent: string | null, nodes: Map<string, PageNode>): boolean => {
  if (newParent === null) return true;
  if (isSelfOrDescendant(id, newParent, nodes)) return false;
  return depthOf(newParent, nodes) + 1 + subtreeHeight(id, nodes) <= MAX_PAGE_DEPTH;
};

/** Text around the first match of `needle` (case-insensitive) in Markdown, on one line. */
export const snippetAround = (content: string, needle: string, radius = 60): string => {
  const flat = content.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const index = flat.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return flat.slice(0, radius * 2) + (flat.length > radius * 2 ? '…' : '');
  const start = Math.max(0, index - radius);
  const end = Math.min(flat.length, index + needle.length + radius);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
};

/** Escapes text for use inside a regular expression (search input is never used as a pattern). */
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
