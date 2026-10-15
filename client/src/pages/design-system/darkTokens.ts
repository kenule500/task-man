// Documentation data for the dark theme. Hex values mirror the `.dark` block in client/src/index.css;
// __tests__/darkTheme.test.ts fails when they drift apart and when a documented text pair drops under WCAG AA.

import { contrastRatio } from './contrast';
import { TONES, TONE_PARTS, type Tone, type TonePart } from './tokens';

/** Custom property (without `--color-`) → hex under `.dark`, plus the fixed colors the dark exceptions use. */
export const DARK_COLORS = {
  // Surfaces and borders
  'slate-50': '#0B1220',
  white: '#0F172A',
  'slate-100': '#172033',
  'slate-200': '#263449',
  'slate-300': '#3A4A63',
  'slate-400': '#64748B',
  // Text
  'slate-500': '#94A3B8',
  'slate-600': '#A8B5C8',
  'slate-700': '#CBD5E1',
  'slate-800': '#E2E8F0',
  'slate-900': '#F1F5F9',
  // Tints
  'red-50': '#2B1816', 'red-100': '#3A201D', 'red-200': '#5A2C27', 'red-600': '#E8948A', 'red-700': '#F0A79E', 'red-800': '#F6C3BC', 'red-900': '#FAD9D4',
  'emerald-50': '#0F2620', 'emerald-100': '#15342B', 'emerald-200': '#25503F', 'emerald-600': '#74C4A2', 'emerald-700': '#8FD3B4', 'emerald-800': '#B3E4CC', 'emerald-900': '#D2F0E1',
  'amber-50': '#2A2008', 'amber-100': '#3A2D0C', 'amber-200': '#554015', 'amber-600': '#DBA94D', 'amber-700': '#E6BE6A', 'amber-800': '#EFD293', 'amber-900': '#F6E4B8',
  'blue-50': '#0F1E3A', 'blue-100': '#172C52', 'blue-200': '#1F3B6E', 'blue-600': '#60A5FA', 'blue-700': '#93C5FD', 'blue-800': '#BFDBFE',
  'violet-50': '#1D1740', 'violet-100': '#2A2060', 'violet-200': '#3B2E85', 'violet-600': '#A78BFA', 'violet-700': '#C4B5FD', 'violet-800': '#DDD6FE',
  'rose-100': '#3A201D', 'rose-800': '#F6C3BC',
  'pink-100': '#3A1A33', 'pink-800': '#FBCFE8',
  'cyan-100': '#0F2F3A', 'cyan-900': '#CFFAFE',
  // shadcn and role tokens
  foreground: '#F1F5F9',
  card: '#0F172A',
  popover: '#131D33',
  muted: '#172033',
  'muted-foreground': '#94A3B8',
  accent: '#1C2740',
  destructive: '#E38476',
  border: '#263449',
  input: '#3A4A63',
  ring: '#60A5FA',
  canvas: '#0B1220',
  'surface-sunken': '#172033',
  'text-subtle': '#94A3B8',
  'text-faint': '#64748B',
  focus: '#60A5FA',
  inverse: '#1E293B',
  'inverse-text': '#F8FAFC',
  'inverse-muted': '#CBD5E1',
  'inverse-border': '#334155',
  // Status, priority and type
  'status-pending-fg': '#CBD5E1', 'status-pending-bg': '#1B2740',
  'status-in-progress-fg': '#93C5FD', 'status-in-progress-bg': '#13244A',
  'status-completed-fg': '#8FD3B4', 'status-completed-bg': '#0F2620',
  'priority-high-text': '#F0A79E', 'priority-medium-text': '#E6BE6A', 'priority-low-text': '#8FD3B4',
  'type-story': '#8FD3B4', 'type-story-bg': '#0F2620',
  'type-task': '#93C5FD', 'type-task-bg': '#13244A',
  'type-bug': '#F0A79E', 'type-bug-bg': '#2B1816',
  'type-spike': '#C4B5FD', 'type-spike-bg': '#1D1740',
  'project-slate': '#56637C', 'project-slate-deep': '#444F64',
  // Semantic tones (danger, success, warning, info): solid, solid-hover, dot, fg, bg, border
  'danger-solid': '#B4493E', 'danger-solid-hover': '#9A3B31', 'danger-dot': '#D4685B', 'danger-fg': '#F0A79E', 'danger-bg': '#2B1816', 'danger-border': '#5A2C27',
  'success-solid': '#2E7D5B', 'success-solid-hover': '#256A4B', 'success-dot': '#4BAA84', 'success-fg': '#8FD3B4', 'success-bg': '#0F2620', 'success-border': '#25503F',
  'warning-solid': '#946212', 'warning-solid-hover': '#7D520E', 'warning-dot': '#D19A33', 'warning-fg': '#E6BE6A', 'warning-bg': '#2A2008', 'warning-border': '#554015',
  'info-solid': '#2563EB', 'info-solid-hover': '#1D4ED8', 'info-dot': '#5B93F0', 'info-fg': '#93C5FD', 'info-bg': '#13244A', 'info-border': '#1F3B6E',
} as const;

/** Dark values of every semantic tone part, for the docs table. */
export const TONE_DARK: Record<Tone, Record<TonePart, string>> = Object.fromEntries(
  TONES.map(tone => [tone, Object.fromEntries(TONE_PARTS.map(part => [part, DARK_COLORS[`${tone}-${part}` as DarkColorName]]))]),
) as Record<Tone, Record<TonePart, string>>;

export type DarkColorName = keyof typeof DARK_COLORS;

/** Colors that do not change between themes (or that the dark exceptions pin), used by the contrast pairs. */
export const FIXED_COLORS = {
  'on-fill': '#FFFFFF',
  primary: '#2563EB',
  'primary-hover': '#1D4ED8',
  'project-blue': '#3B5B9A', 'project-violet': '#5E4B9C', 'project-rose': '#9E4560', 'project-orange': '#A9573A',
  'project-amber': '#8A6A1F', 'project-emerald': '#2F6F57', 'project-teal': '#2A6B78',
  'blue-300': '#93C5FD',
} as const;

type ColorName = DarkColorName | keyof typeof FIXED_COLORS;
const hexOf = (name: ColorName): string =>
  (name in DARK_COLORS ? DARK_COLORS[name as DarkColorName] : FIXED_COLORS[name as keyof typeof FIXED_COLORS]);

export interface DarkPair {
  group: string;
  fg: ColorName;
  bg: ColorName;
  /** 4.5 for text, 3 for icons, focus rings and large text */
  min: 4.5 | 3;
}

const text = (group: string, fgs: ColorName[], bgs: ColorName[], min: 4.5 | 3 = 4.5): DarkPair[] =>
  fgs.flatMap(fg => bgs.map(bg => ({ group, fg, bg, min })));

const TINTS = ['red', 'emerald', 'amber', 'blue', 'violet'] as const;
const tintPairs = TINTS.flatMap(color =>
  text(`${color} chip`, [`${color}-600`, `${color}-700`, `${color}-800`] as ColorName[], [`${color}-50`, `${color}-100`, 'white'] as ColorName[]),
);

/** Every foreground/background pair the dark theme relies on. */
export const DARK_PAIRS: DarkPair[] = [
  ...text('Body text on surfaces', ['slate-500', 'slate-600', 'slate-700', 'slate-800', 'slate-900', 'text-subtle', 'foreground'], ['white', 'slate-50', 'slate-100', 'card', 'canvas', 'surface-sunken']),
  ...text('Body text on borders-as-fills', ['slate-500', 'slate-600', 'slate-700', 'slate-800', 'slate-900'], ['slate-200']),
  ...text('Popover and menu', ['foreground', 'muted-foreground'], ['popover', 'accent']),
  ...tintPairs,
  ...text('Red 900', ['red-900'], ['red-50', 'red-100']),
  ...text('Emerald 900', ['emerald-900'], ['emerald-50', 'emerald-100']),
  ...text('Amber 900', ['amber-900'], ['amber-50', 'amber-100']),
  ...text('Label chips', ['rose-800'], ['rose-100']),
  ...text('Label chips', ['pink-800'], ['pink-100']),
  ...text('Label chips', ['cyan-900'], ['cyan-100']),
  ...text('Status', ['status-pending-fg'], ['status-pending-bg', 'white']),
  ...text('Status', ['status-in-progress-fg'], ['status-in-progress-bg', 'white']),
  ...text('Status', ['status-completed-fg'], ['status-completed-bg', 'white']),
  ...text('Priority', ['priority-high-text', 'priority-medium-text', 'priority-low-text'], ['white', 'slate-50', 'slate-100']),
  ...text('Task type', ['type-story'], ['type-story-bg']),
  ...text('Task type', ['type-task'], ['type-task-bg']),
  ...text('Task type', ['type-bug'], ['type-bug-bg']),
  ...text('Task type', ['type-spike'], ['type-spike-bg']),
  ...text('Primary', ['on-fill'], ['primary', 'primary-hover']),
  ...text('Primary text and links', ['blue-600'], ['white', 'slate-50', 'slate-100', 'blue-50']),
  ...text('Primary text on tint', ['blue-700'], ['blue-50', 'blue-100']),
  ...TONES.flatMap(tone => [
    ...text(`Tone ${tone}: white on solid`, ['on-fill'], [`${tone}-solid`, `${tone}-solid-hover`] as ColorName[]),
    ...text(`Tone ${tone}: text on soft background`, [`${tone}-fg`] as ColorName[], [`${tone}-bg`, 'white', 'slate-50', 'slate-100'] as ColorName[]),
    ...text(`Tone ${tone}: text on soft border`, [`${tone}-fg`] as ColorName[], [`${tone}-border`] as ColorName[], 4.5),
    ...text(`Tone ${tone}: marker on surface (non-text 3:1)`, [`${tone}-dot`] as ColorName[], ['white', 'slate-50', 'slate-100', `${tone}-bg`] as ColorName[], 3),
  ]),
  ...text('Destructive text', ['destructive'], ['white', 'slate-50']),
  ...text('Inverse surface', ['inverse-text', 'inverse-muted', 'blue-300'], ['inverse']),
  ...text('Project folders', ['on-fill'], [
    'project-blue', 'project-violet', 'project-rose', 'project-orange', 'project-amber', 'project-emerald', 'project-teal', 'project-slate', 'project-slate-deep',
  ]),
  ...text('Icons and focus (non-text 3:1)', ['slate-400', 'focus', 'ring'], ['white', 'slate-50'], 3),
  ...text('Decorative faint text (non-text 3:1)', ['text-faint'], ['white'], 3),
];

export const pairRatio = (pair: DarkPair): number => contrastRatio(hexOf(pair.fg), hexOf(pair.bg));

/** Surface steps for the docs table: light utility, what it becomes, what it is for. */
export const DARK_SURFACE_STEPS: { utility: string; light: string; dark: string; role: string }[] = [
  { utility: 'bg-slate-50 / canvas', light: '#F8FAFC', dark: DARK_COLORS['slate-50'], role: 'Page canvas, input wells (the lowest level)' },
  { utility: 'bg-white / surface-raised', light: '#FFFFFF', dark: DARK_COLORS.white, role: 'Cards, tables, toolbars, sidebar' },
  { utility: 'popover', light: '#FFFFFF', dark: DARK_COLORS.popover, role: 'Menus and popovers, one step above cards' },
  { utility: 'bg-slate-100 / surface-sunken', light: '#F1F5F9', dark: DARK_COLORS['slate-100'], role: 'Chips, segmented track, hairlines inside a card' },
  { utility: 'border-slate-200 / border', light: '#E2E8F0', dark: DARK_COLORS['slate-200'], role: 'Default borders, progress tracks' },
  { utility: 'border-slate-300 / border-strong', light: '#CBD5E1', dark: DARK_COLORS['slate-300'], role: 'Input borders, key caps' },
  { utility: 'inverse', light: '#0F172A', dark: DARK_COLORS.inverse, role: 'Toasts, code blocks, dark chips' },
];

export const DARK_TEXT_STEPS: { utility: string; light: string; dark: string; role: string }[] = [
  { utility: 'text-slate-900 / text-strong', light: '#0F172A', dark: DARK_COLORS['slate-900'], role: 'Titles and values' },
  { utility: 'text-slate-700 / text-body', light: '#334155', dark: DARK_COLORS['slate-700'], role: 'Paragraphs and cells' },
  { utility: 'text-slate-600', light: '#475569', dark: DARK_COLORS['slate-600'], role: 'Secondary text' },
  { utility: 'text-slate-500 / text-subtle', light: '#5B6B82', dark: DARK_COLORS['slate-500'], role: 'Meta text' },
  { utility: 'text-primary', light: '#2563EB', dark: DARK_COLORS['blue-600'], role: 'Links and text-only actions (solid buttons stay #2563EB)' },
];
