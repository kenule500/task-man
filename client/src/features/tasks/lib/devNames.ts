import type { Task } from '../types';

/** Longest branch name we generate (Git hosts and CI tools truncate long refs). */
export const MAX_BRANCH_LENGTH = 60;

type Named = Pick<Task, 'title' | 'type'>;

/** ASCII kebab-case: diacritics removed, everything else collapsed into single dashes. */
export const kebabCase = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss')
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[đĐ]/g, 'd')
    .replace(/[łŁ]/g, 'l')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Branch prefix by work item type: bugs are fixes, spikes get their own, everything else is a feature. */
export const branchPrefix = (type: Task['type']): string =>
  type === 'bug' ? 'fix/' : type === 'spike' ? 'spike/' : 'feature/';

/** Cuts `slug` to `max` characters, preferring a word boundary and never leaving a trailing dash. */
const clip = (slug: string, max: number): string => {
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  // Next character continues the word: back up to the last dash, unless that would drop almost everything
  const boundary = slug[max] === '-' ? max : cut.lastIndexOf('-');
  const base = boundary >= Math.floor(max / 2) ? cut.slice(0, boundary) : cut;
  return base.replace(/-+$/, '');
};

/** `feature/WEB-12-short-kebab-title` (`fix/` for bugs, `spike/` for spikes), at most 60 characters. */
export const branchName = (task: Named, key = ''): string => {
  const head = `${branchPrefix(task.type)}${kebabCase(key).toUpperCase()}`;
  const title = kebabCase(task.title);
  if (!key.trim()) return `${branchPrefix(task.type)}${clip(title, MAX_BRANCH_LENGTH - branchPrefix(task.type).length) || 'task'}`;
  const room = MAX_BRANCH_LENGTH - head.length - 1;
  const slug = room > 0 ? clip(title, room) : '';
  return slug ? `${head}-${slug}` : head;
};

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** `WEB-12: Title` (just the title for tasks without a key). */
export const commitMessage = (task: Pick<Task, 'title'>, key = ''): string =>
  key ? `${key}: ${oneLine(task.title)}` : oneLine(task.title);

/** `[WEB-12 Title](https://...)`; brackets in the title and parentheses in the URL are escaped. */
export const markdownLink = (task: Pick<Task, 'title'>, url: string, key = ''): string => {
  const label = oneLine(`${key} ${task.title}`).replace(/([[\]\\])/g, '\\$1');
  return `[${label}](${url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s/g, '%20')})`;
};
