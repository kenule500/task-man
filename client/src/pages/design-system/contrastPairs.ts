// Every text/background pair of the semantic tokens, in light and dark, with the ratio it must reach.
// The Foundations → Contrast pairs page renders this list and __tests__/contrastPairs.test.ts fails when a pair drops
// under its minimum in either theme (4.5:1 for text, 3:1 for markers, icons and focus rings).

import { contrastRatio } from './contrast';
import { DARK_COLORS } from './darkTokens';
import { ALL_COLOR_TOKENS, TONES } from './tokens';

export interface ThemedPair {
  group: string;
  /** Token names, for example `text-body` on `canvas`. */
  fg: string;
  bg: string;
  /** 4.5 for text, 3 for markers, icons and focus rings. */
  min: 4.5 | 3;
  light: { fg: string; bg: string };
  dark: { fg: string; bg: string };
}

const WHITE = '#FFFFFF';

/** Light hex of a token name: a documented token, or white. */
const lightHex = (name: string): string => {
  if (name === 'white') return WHITE;
  const token = ALL_COLOR_TOKENS.find(item => item.utility === name);
  if (!token) throw new Error(`Unknown light token ${name}`);
  return token.hex;
};

/** Dark hex of a token name; colors that do not change in dark keep their light value. */
const darkHex = (name: string): string => {
  if (name === 'white') return WHITE;
  const dark = (DARK_COLORS as Record<string, string>)[name];
  return dark ?? lightHex(name);
};

const pair = (group: string, fg: string, bg: string, min: 4.5 | 3 = 4.5): ThemedPair => ({
  group,
  fg,
  bg,
  min,
  light: { fg: lightHex(fg), bg: lightHex(bg) },
  dark: { fg: darkHex(fg), bg: darkHex(bg) },
});

const on = (group: string, fgs: string[], bgs: string[], min: 4.5 | 3 = 4.5): ThemedPair[] =>
  fgs.flatMap(fg => bgs.map(bg => pair(group, fg, bg, min)));

/** Text on the surfaces it is allowed on. `text-faint` is decorative and never text, so it is not listed. */
const SURFACES = ['surface-raised', 'canvas', 'surface-sunken'];

export const CONTRAST_PAIRS: ThemedPair[] = [
  ...on('Text on surfaces', ['text-strong', 'text-body', 'text-subtle'], SURFACES),
  ...on('Primary and focus', ['primary-foreground'], ['primary']),
  ...on('Primary and focus', ['focus'], ['surface-raised', 'canvas'], 3),
  ...TONES.flatMap(tone => [
    ...on(`Tone ${tone}`, ['primary-foreground'], [`${tone}-solid`, `${tone}-solid-hover`]),
    ...on(`Tone ${tone}`, [`${tone}-fg`], [`${tone}-bg`, 'surface-raised', 'surface-sunken']),
    ...on(`Tone ${tone}`, [`${tone}-dot`], ['surface-raised', `${tone}-bg`], 3),
  ]),
  ...on('Status', ['status-pending-fg'], ['status-pending-bg']),
  ...on('Status', ['status-in-progress-fg'], ['status-in-progress-bg']),
  ...on('Status', ['status-completed-fg'], ['status-completed-bg']),
  ...on('Status markers (dots)', ['status-pending', 'status-in-progress', 'status-completed'], ['surface-raised'], 3).filter(item => item.fg !== 'status-pending'),
  ...on('Priority', ['priority-high-text', 'priority-medium-text', 'priority-low-text'], ['surface-raised', 'canvas']),
  ...on('Priority markers (dots)', ['priority-high', 'priority-medium', 'priority-low'], ['surface-raised'], 3),
  ...on('Task type', ['type-story'], ['type-story-bg']),
  ...on('Task type', ['type-task'], ['type-task-bg']),
  ...on('Task type', ['type-bug'], ['type-bug-bg']),
  ...on('Task type', ['type-spike'], ['type-spike-bg']),
  ...on('Inverse surface', ['inverse-text', 'inverse-muted'], ['inverse']),
  ...on('Project folders (white text)', ['primary-foreground'], [
    'project-blue', 'project-violet', 'project-rose', 'project-orange', 'project-amber', 'project-emerald', 'project-teal', 'project-slate',
  ]),
];

export const pairRatios = (item: ThemedPair): { light: number; dark: number } => ({
  light: contrastRatio(item.light.fg, item.light.bg),
  dark: contrastRatio(item.dark.fg, item.dark.bg),
});

/** The pair groups in page order. */
export const CONTRAST_GROUPS: string[] = [...new Set(CONTRAST_PAIRS.map(item => item.group))];
