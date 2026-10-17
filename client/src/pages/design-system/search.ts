import type { ComponentType } from 'react';

export const DOC_GROUPS = ['Start', 'Foundations', 'Components', 'Patterns', 'Content', 'Accessibility'] as const;
export type DocGroup = (typeof DOC_GROUPS)[number];

/** Title, one-line summary and anchor of each group: shown as the heading of its part of the page. */
export const GROUP_INFO: Record<DocGroup, { slug: string; summary: string }> = {
  Start: { slug: 'start', summary: 'What the design system is, the rules we settle arguments with, and what changed.' },
  Foundations: { slug: 'foundations', summary: 'Tokens and scales: color and contrast, type, spacing, motion, languages and direction.' },
  Components: { slug: 'components', summary: 'Every reusable piece, with live variants, states, accessibility notes, code and props.' },
  Patterns: { slug: 'patterns', summary: 'How components combine into forms, data views, chat, realtime and AI features.' },
  Content: { slug: 'content', summary: 'Voice, error messages, labels, formats, and writing that survives three languages.' },
  Accessibility: { slug: 'accessibility', summary: 'The WCAG 2.2 AA checklist and an honest status for TaskMan today.' },
};

export const groupHeadingId = (group: DocGroup): string => `group-${GROUP_INFO[group].slug}`;

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

type Searchable = Pick<DocEntry, 'title' | 'group' | 'keywords'> & Partial<Pick<DocEntry, 'id'>>;

/**
 * An entry matches when every word of the query appears in its title, group, keywords or prop names.
 * `propNames` maps an entry id to the props its page documents (`headingLevel`, `onValueChange`...).
 */
export const matchesQuery = (entry: Searchable, query: string, propNames: Readonly<Record<string, string>> = {}): boolean => {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const props = entry.id ? propNames[entry.id] ?? '' : '';
  const haystack = normalize(`${entry.title} ${entry.group} ${entry.keywords} ${props}`);
  return words.every(word => haystack.includes(word));
};

export const filterEntries = <T extends Searchable>(entries: T[], query: string, propNames: Readonly<Record<string, string>> = {}): T[] =>
  entries.filter(entry => matchesQuery(entry, query, propNames));

/** Entries grouped in DOC_GROUPS order, skipping empty groups. */
export const groupEntries = <T extends Pick<DocEntry, 'group'>>(entries: T[]): { group: DocGroup; entries: T[] }[] =>
  DOC_GROUPS
    .map(group => ({ group, entries: entries.filter(entry => entry.group === group) }))
    .filter(item => item.entries.length > 0);
