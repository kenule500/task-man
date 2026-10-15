// Documentation data for the style guide. Hex values mirror client/src/index.css (@theme);
// __tests__/tokens.test.ts fails when they drift apart.

export interface ColorToken {
  /** CSS custom property, e.g. --color-primary */
  name: string;
  /** Tailwind utility suffix, e.g. "primary" for bg-primary / text-primary */
  utility: string;
  hex: string;
  usage: string;
  /** Does this color carry text on white? Controls whether a failing ratio is flagged. */
  role: 'text' | 'fill';
}

export interface ColorGroup {
  id: string;
  title: string;
  description: string;
  tokens: ColorToken[];
}

const token = (utility: string, hex: string, usage: string, role: ColorToken['role'] = 'fill'): ColorToken => ({
  name: `--color-${utility}`,
  utility,
  hex,
  usage,
  role,
});

export const TONES = ['danger', 'success', 'warning', 'info'] as const;
export type Tone = (typeof TONES)[number];
export const TONE_PARTS = ['solid', 'solid-hover', 'dot', 'fg', 'bg', 'border'] as const;
export type TonePart = (typeof TONE_PARTS)[number];

/** What each part of a tone is for. */
export const TONE_USAGE: Record<TonePart, string> = {
  solid: 'Filled buttons and badges; white text on it passes AA',
  'solid-hover': 'Hover and pressed state of -solid',
  dot: 'Markers, bars and chart fills (3:1 on surfaces, never text)',
  fg: 'Text and icons on a surface and on -bg (AA)',
  bg: 'Soft background of chips, alerts and hover states',
  border: 'Soft border of chips and alerts',
};

/** When to reach for each tone. */
export const TONE_MEANING: Record<Tone, string> = {
  danger: 'Errors, overdue, destructive actions, bugs, high priority',
  success: 'Completed, saved, done, low priority, stories',
  warning: 'Needs attention, offline, at risk, medium priority',
  info: 'Neutral news, in progress, links, selected (the blue family)',
};

/** Light theme values; the dark values live in darkTokens.ts. Both mirror index.css. */
export const TONE_LIGHT: Record<Tone, Record<TonePart, string>> = {
  danger: { solid: '#B4493E', 'solid-hover': '#9A3B31', dot: '#C4574A', fg: '#A33A30', bg: '#FBF0EE', border: '#EBCDC8' },
  success: { solid: '#2E7D5B', 'solid-hover': '#256A4B', dot: '#3A9170', fg: '#1F6B4A', bg: '#EDF6F1', border: '#C9E0D4' },
  warning: { solid: '#946212', 'solid-hover': '#7D520E', dot: '#B8801A', fg: '#8A5B0F', bg: '#FBF3E1', border: '#EBD9AE' },
  info: { solid: '#2563EB', 'solid-hover': '#1D4ED8', dot: '#3B82F6', fg: '#1D4ED8', bg: '#EFF6FF', border: '#DBEAFE' },
};

const toneTokens = (): ColorToken[] =>
  TONES.flatMap(tone =>
    TONE_PARTS.map(part => token(`${tone}-${part}`, TONE_LIGHT[tone][part], TONE_USAGE[part], part === 'fg' ? 'text' : 'fill')),
  );

export const COLOR_GROUPS: ColorGroup[] = [
  {
    id: 'tones',
    title: 'Semantic tones',
    description: 'Danger, success, warning and info: the only reds, greens, ochres and blues used for meaning. Calm hues with a solid, hover, dot, fg, bg and border part each, authored for light and dark. Raw red, green, emerald and rose utilities are not allowed.',
    tokens: toneTokens(),
  },
  {
    id: 'core',
    title: 'Core',
    description: 'Brand and the shadcn variables every primitive reads. Existing names; do not rename.',
    tokens: [
      token('primary', '#2563EB', 'Primary actions, active states, links', 'text'),
      token('primary-hover', '#1D4ED8', 'Hover and pressed state of primary', 'text'),
      token('background', '#F9FAFB', 'Legacy page background (prefer canvas)'),
      token('surface', '#FFFFFF', 'Legacy card color (prefer surface-raised)'),
      token('foreground', '#0F172A', 'Default text of shadcn primitives', 'text'),
      token('muted-foreground', '#5B6B82', 'Secondary text of primitives', 'text'),
      token('border', '#E2E8F0', 'Default 1px borders and dividers'),
      token('destructive', '#B4493E', 'Destructive actions and errors', 'text'),
      token('ring', '#93C5FD', 'Focus ring of primitives (30% alpha halo)'),
    ],
  },
  {
    id: 'roles',
    title: 'Surface, canvas, border and text roles',
    description: 'Named by job. New components use these instead of raw slate steps.',
    tokens: [
      token('canvas', '#F8FAFC', 'App background behind cards'),
      token('surface-raised', '#FFFFFF', 'Cards, tables, toolbars, popovers'),
      token('surface-sunken', '#F1F5F9', 'Wells: segmented control track, kbd, empty tiles'),
      token('border-subtle', '#F1F5F9', 'Hairlines inside a card'),
      token('border-strong', '#CBD5E1', 'Inputs, key caps, emphasised outlines'),
      token('text-strong', '#0F172A', 'Titles and values', 'text'),
      token('text-body', '#334155', 'Paragraphs and table cells', 'text'),
      token('text-subtle', '#5B6B82', 'Meta text, helper text, placeholders (passes AA on slate-100 surfaces)', 'text'),
      token('text-faint', '#94A3B8', 'Decorative only: separators, disabled icons. Never text', 'text'),
      token('focus', '#2563EB', 'Focus outline color (2px, 2px offset)'),
    ],
  },
  {
    id: 'status',
    title: 'Status',
    description: 'Pending, in progress, completed. Marker color, text on the soft background, and the soft background.',
    tokens: [
      token('status-pending', '#94A3B8', 'Dot and column accent'),
      token('status-pending-fg', '#334155', 'Text on status-pending-bg', 'text'),
      token('status-pending-bg', '#F1F5F9', 'Pill background'),
      token('status-in-progress', '#2563EB', 'Dot, progress fill, today marker'),
      token('status-in-progress-fg', '#1D4ED8', 'Text on status-in-progress-bg', 'text'),
      token('status-in-progress-bg', '#EFF6FF', 'Pill background'),
      token('status-completed', '#3A9170', 'Dot, completed progress'),
      token('status-completed-fg', '#1F6B4A', 'Text on status-completed-bg', 'text'),
      token('status-completed-bg', '#EDF6F1', 'Pill background'),
    ],
  },
  {
    id: 'priority',
    title: 'Priority',
    description: 'The marker color is for dots and card accents. Use the -text token for words.',
    tokens: [
      token('priority-high', '#C4574A', 'Dot, card top accent'),
      token('priority-high-text', '#A33A30', 'High priority label', 'text'),
      token('priority-medium', '#B8801A', 'Dot, card top accent'),
      token('priority-medium-text', '#8A5B0F', 'Medium priority label', 'text'),
      token('priority-low', '#3A9170', 'Dot, card top accent'),
      token('priority-low-text', '#1F6B4A', 'Low priority label', 'text'),
    ],
  },
  {
    id: 'types',
    title: 'Scrum work item types',
    description: 'Story, task, bug and spike. The label shades keep AA contrast on white and on the soft background. Always shown with an icon and a name.',
    tokens: [
      token('type-story', '#1F6B4A', 'Story icon and label (success green)', 'text'),
      token('type-story-bg', '#EDF6F1', 'Story chip background'),
      token('type-task', '#1D4ED8', 'Task icon and label (blue)', 'text'),
      token('type-task-bg', '#EFF6FF', 'Task chip background'),
      token('type-bug', '#A33A30', 'Bug icon and label (danger brick)', 'text'),
      token('type-bug-bg', '#FBF0EE', 'Bug chip background'),
      token('type-spike', '#6D28D9', 'Spike icon and label (violet)', 'text'),
      token('type-spike-bg', '#F5F3FF', 'Spike chip background'),
    ],
  },
  {
    id: 'projects',
    title: 'Project palette',
    description: 'Eight calm, deep colors a project can take (folder cards, folder icons, project dots); white text on each passes AA. Use the soft tint (the color at 10%) for backgrounds under text.',
    tokens: [
      token('project-blue', '#3B5B9A', 'Dusk blue (default); back panel #2E4778'),
      token('project-violet', '#5E4B9C', 'Iris; back panel #4A3B7C'),
      token('project-rose', '#9E4560', 'Berry; back panel #7E354B'),
      token('project-orange', '#A9573A', 'Terracotta; back panel #87452E'),
      token('project-amber', '#8A6A1F', 'Ochre; back panel #6E5418'),
      token('project-emerald', '#2F6F57', 'Pine; back panel #255946'),
      token('project-teal', '#2A6B78', 'Lagoon; back panel #21555F'),
      token('project-slate', '#4A5568', 'Slate; back panel #3A4353'),
    ],
  },
];

export const ALL_COLOR_TOKENS: ColorToken[] = COLOR_GROUPS.flatMap(group => group.tokens);

export const PROJECT_COLORS = ['blue', 'violet', 'rose', 'orange', 'amber', 'emerald', 'teal', 'slate'] as const;

/** Literal class names so Tailwind can see them. */
export const PROJECT_BG: Record<(typeof PROJECT_COLORS)[number], string> = {
  blue: 'bg-project-blue',
  violet: 'bg-project-violet',
  rose: 'bg-project-rose',
  orange: 'bg-project-orange',
  amber: 'bg-project-amber',
  emerald: 'bg-project-emerald',
  teal: 'bg-project-teal',
  slate: 'bg-project-slate',
};

export interface TypeStep {
  role: string;
  size: string;
  weight: string;
  lineHeight: string;
  classes: string;
  usage: string;
  sample: string;
}

export const TYPE_SCALE: TypeStep[] = [
  { role: 'Page title', size: '24px (20px on phones)', weight: '700', lineHeight: '32px', classes: 'text-xl sm:text-2xl font-bold tracking-tight', usage: 'The h1 of a page, once', sample: 'Sprint planning' },
  { role: 'Section title', size: '18px', weight: '700', lineHeight: '28px', classes: 'text-lg font-bold', usage: 'Sections of a page, dialog titles', sample: 'Active sprint' },
  { role: 'Card heading', size: '14px', weight: '600', lineHeight: '20px', classes: 'text-sm font-semibold', usage: 'Card and panel titles, table headers', sample: 'Website v1' },
  { role: 'Body', size: '14px', weight: '400', lineHeight: '20px', classes: 'text-sm', usage: 'Paragraphs, table cells, form values', sample: 'Review the launch checklist with the team.' },
  { role: 'Meta', size: '12px', weight: '400', lineHeight: '16px', classes: 'text-xs', usage: 'Dates, counts, helper text', sample: 'Updated Oct 9, 2026' },
  { role: 'Overline', size: '12px', weight: '600', lineHeight: '16px', classes: 'text-xs font-semibold uppercase tracking-wider', usage: 'Column and table headings', sample: 'In progress' },
  { role: 'Code', size: '12px', weight: '500', lineHeight: '16px', classes: 'font-mono text-xs', usage: 'Tokens, shortcuts, snippets', sample: '--color-primary' },
];

export const SPACING_SCALE = [
  { token: '1', px: 4, usage: 'Icon to text in dense chips' },
  { token: '2', px: 8, usage: 'Gap between inline controls' },
  { token: '3', px: 12, usage: 'Gap in toolbars, card inner rows' },
  { token: '4', px: 16, usage: 'Card padding on phones, form field gap' },
  { token: '5', px: 20, usage: 'Default card padding, grid gap' },
  { token: '6', px: 24, usage: 'Large card padding, section gap' },
  { token: '8', px: 32, usage: 'Page padding on desktop' },
  { token: '10', px: 40, usage: 'Minimum touch target below md' },
  { token: '12', px: 48, usage: 'Mobile tab bar height' },
  { token: '16', px: 64, usage: 'Empty state vertical padding' },
];

export const RADIUS_SCALE = [
  { token: '--radius-control', tailwind: 'rounded-lg', value: '8px', usage: 'Buttons, inputs, selects, tags' },
  { token: '--radius-card', tailwind: 'rounded-xl', value: '12px', usage: 'Cards inside lists, board cards, popovers' },
  { token: '--radius-page', tailwind: 'rounded-2xl', value: '16px', usage: 'Page-level Surface cards' },
  { token: 'full', tailwind: 'rounded-full', value: '9999px', usage: 'Avatars, status pills, progress' },
];

export const ELEVATION_LEVELS = [
  { token: '--shadow-raised', utility: 'shadow-raised', usage: 'Level 1: cards, segmented selection, sticky bars', value: '0 1px 2px / 0 1px 3px' },
  { token: '--shadow-floating', utility: 'shadow-floating', usage: 'Level 2: hover lift, dropdowns, popovers, toasts', value: '0 4px 6px -1px / 0 2px 4px -2px' },
  { token: '--shadow-overlay', utility: 'shadow-overlay', usage: 'Level 3: dialogs, sheets, command palette', value: '0 20px 25px -5px / 0 8px 10px -6px' },
];

export const Z_INDEX = [
  { token: '--z-base', value: 0, usage: 'Normal flow' },
  { token: '--z-sticky', value: 10, usage: 'Sticky headers, table headers, timeline name column' },
  { token: '--z-nav', value: 30, usage: 'Mobile tab bar, docked sidebar' },
  { token: '--z-overlay', value: 40, usage: 'Scrims, sheet backdrops' },
  { token: '--z-modal', value: 50, usage: 'Dialogs, sheets, command palette, popovers inside them' },
  { token: '--z-toast', value: 60, usage: 'Toaster (above modals so Undo stays reachable)' },
  { token: '--z-tooltip', value: 70, usage: 'Tooltips' },
];

export const DURATIONS = [
  { token: '--duration-instant', ms: 80, usage: 'Press feedback, checkbox tick' },
  { token: '--duration-fast', ms: 150, usage: 'Color, border and shadow changes, exits' },
  { token: '--duration-base', ms: 200, usage: 'Chevron rotation, popover entry, drawers' },
  { token: '--duration-slow', ms: 280, usage: 'Progress fill, layout shifts, sheets' },
];

export const EASINGS = [
  { token: '--ease-standard', utility: 'ease-standard', value: 'cubic-bezier(0.2, 0, 0, 1)', usage: 'Moves and resizes of elements already on screen' },
  { token: '--ease-enter', utility: 'ease-enter', value: 'cubic-bezier(0, 0, 0.2, 1)', usage: 'Elements entering: decelerate' },
  { token: '--ease-exit', utility: 'ease-exit', value: 'cubic-bezier(0.4, 0, 1, 1)', usage: 'Elements leaving: accelerate, and use a shorter duration' },
];

export const BREAKPOINTS = [
  { name: 'base', min: 0, usage: 'Phones. Design here first; 360px is the smallest supported width' },
  { name: 'sm', min: 640, usage: 'Large phones and small tablets: inputs return to 14px, buttons stop stretching' },
  { name: 'md', min: 768, usage: 'Sidebar docks (below it: sheet + bottom tab bar)' },
  { name: 'lg', min: 1024, usage: 'Two-column layouts, docs navigation docks' },
  { name: 'xl', min: 1280, usage: 'Wide boards and timelines' },
];

export const ICON_SIZES = [
  { px: 16, className: 'size-4', usage: 'Inline with 14px text, buttons, chips' },
  { px: 20, className: 'size-5', usage: 'Navigation, tab bar, icon buttons' },
  { px: 24, className: 'size-6', usage: 'Page headers; 32px in empty states' },
];
