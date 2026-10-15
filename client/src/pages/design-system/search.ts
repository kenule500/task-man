import type { ComponentType } from 'react';

export const DOC_GROUPS = ['Start', 'Foundations', 'Components', 'Patterns', 'Content', 'Accessibility'] as const;
export type DocGroup = (typeof DOC_GROUPS)[number];

export interface DocEntry {
  /** Anchor id; also the id of the rendered section element. */
  id: string;
  group: DocGroup;
  title: string;
  /** Extra search words (synonyms, related components). */
  keywords: string;
  Component: ComponentType;
}

const normalize = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim();

/** An entry matches when every word of the query appears in its title, group or keywords. */
export const matchesQuery = (entry: Pick<DocEntry, 'title' | 'group' | 'keywords'>, query: string): boolean => {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize(`${entry.title} ${entry.group} ${entry.keywords}`);
  return words.every(word => haystack.includes(word));
};

export const filterEntries = <T extends Pick<DocEntry, 'title' | 'group' | 'keywords'>>(entries: T[], query: string): T[] =>
  entries.filter(entry => matchesQuery(entry, query));

/** Entries grouped in DOC_GROUPS order, skipping empty groups. */
export const groupEntries = <T extends Pick<DocEntry, 'group'>>(entries: T[]): { group: DocGroup; entries: T[] }[] =>
  DOC_GROUPS
    .map(group => ({ group, entries: entries.filter(entry => entry.group === group) }))
    .filter(item => item.entries.length > 0);
