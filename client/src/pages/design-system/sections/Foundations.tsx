import { useState } from 'react';
import {
  BookOpen, Briefcase, Bug, Flag, Folder, FolderKanban, Globe, Layers, Rocket, SquareCheck, Target, Zap,
} from 'lucide-react';
import { Kbd, Surface, Tag } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { contrastLevel, contrastRatio, formatRatio } from '../contrast';
import { DataTable, DoDont, DocSection, Prose, Specimen, SubHeading } from '../kit';
import { TONE_DARK } from '../darkTokens';
import {
  BREAKPOINTS, COLOR_GROUPS, DURATIONS, EASINGS, ELEVATION_LEVELS, ICON_SIZES, PROJECT_BG, PROJECT_COLORS,
  RADIUS_SCALE, SPACING_SCALE, TONES, TONE_LIGHT, TONE_MEANING, TONE_PARTS, TONE_USAGE, TYPE_SCALE, Z_INDEX, type ColorToken,
} from '../tokens';

const WHITE = '#FFFFFF';
const TEXT = '#0F172A';

const levelTone = (level: ReturnType<typeof contrastLevel>) =>
  level === 'AAA' || level === 'AA' ? 'success' : level === 'AA large' ? 'warning' : 'danger';

const ContrastCell = ({ label, ratio }: { label: string; ratio: number }) => {
  const level = contrastLevel(ratio);
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-text-subtle">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="tabular-nums text-text-body">{formatRatio(ratio)}</span>
        <Tag tone={levelTone(level)} size="sm">{level}</Tag>
      </span>
    </div>
  );
};

const Swatch = ({ color }: { color: ColorToken }) => (
  <li>
    <Surface padding="none" className="h-full overflow-hidden">
      <div
        className="flex h-16 items-end border-b border-border-subtle p-2"
        style={{ backgroundColor: `var(${color.name})` }}
        aria-hidden
      />
      <div className="space-y-2 p-3">
        <div>
          <p className="break-all font-mono text-xs font-semibold text-text-strong">{color.name}</p>
          <p className="font-mono text-xs text-text-subtle">{color.hex} · <span>{color.role === 'text' ? 'text' : 'fill'}</span></p>
        </div>
        <p className="text-xs text-text-body">{color.usage}</p>
        <div className="space-y-1 border-t border-border-subtle pt-2">
          <ContrastCell label="On white" ratio={contrastRatio(color.hex, WHITE)} />
          <ContrastCell label="Text on it" ratio={contrastRatio(TEXT, color.hex)} />
        </div>
      </div>
    </Surface>
  </li>
);

const HexSwatch = ({ hex }: { hex: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span aria-hidden className="size-4 shrink-0 rounded border border-border-strong" style={{ backgroundColor: hex }} />
    <code className="font-mono text-xs">{hex}</code>
  </span>
);

const THEMES = [
  { id: 'Light', surface: WHITE, values: TONE_LIGHT },
  { id: 'Dark', surface: '#0F172A', values: TONE_DARK },
] as const;

/** The four semantic tones in both themes: every hex and the contrast ratios that make them safe to pair. */
const ToneTables = () => (
  <div className="space-y-3">
    <div>
      <SubHeading>Semantic tones</SubHeading>
      <p className="mt-1 max-w-3xl text-sm text-text-subtle">
        Neutral (slate), info, success, warning and danger are the five tones. Use the tokens, for example{' '}
        <code>bg-danger-bg text-danger-fg border-danger-border</code> or <code>bg-success-solid text-white</code>. Never use raw
        <code> red</code>, <code>green</code>, <code>emerald</code> or <code>rose</code> utilities: ESLint rejects them.
      </p>
    </div>
    <DataTable
      caption="When to use each semantic tone"
      columns={['Tone', 'Use it for', 'Parts']}
      rows={TONES.map(tone => [
        <code key="t" className="font-mono text-xs">{tone}</code>,
        TONE_MEANING[tone],
        <ul key="p" className="space-y-0.5 text-xs">
          {TONE_PARTS.map(part => <li key={part}><code className="font-mono">{tone}-{part}</code> · {TONE_USAGE[part]}</li>)}
        </ul>,
      ])}
    />
    <DataTable
      caption="Semantic tone values in light and dark"
      columns={['Tone', 'Theme', ...TONE_PARTS]}
      className="[&_table]:min-w-[56rem]"
      rows={TONES.flatMap(tone => THEMES.map(theme => [
        <code key="t" className="font-mono text-xs">{tone}</code>,
        theme.id,
        ...TONE_PARTS.map(part => <HexSwatch key={part} hex={theme.values[tone][part]} />),
      ]))}
    />
    <DataTable
      caption="Contrast ratios of the semantic tones"
      columns={['Tone', 'Theme', 'White on solid', 'fg on bg', 'fg on surface', 'dot on surface (3:1)']}
      className="[&_table]:min-w-[44rem]"
      rows={TONES.flatMap(tone => THEMES.map(theme => {
        const t = theme.values[tone];
        return [
          <code key="t" className="font-mono text-xs">{tone}</code>,
          theme.id,
          <ContrastCell key="a" label="" ratio={contrastRatio(WHITE, t.solid)} />,
          <ContrastCell key="b" label="" ratio={contrastRatio(t.fg, t.bg)} />,
          <ContrastCell key="c" label="" ratio={contrastRatio(t.fg, theme.surface)} />,
          <ContrastCell key="d" label="" ratio={contrastRatio(t.dot, theme.surface)} />,
        ];
      }))}
    />
  </div>
);

export const ColorSection = () => (
  <DocSection
    id="color"
    title="Color"
    description="Tokens named by job, not by hue. Ratios are computed from the hex values by a tested helper (WCAG 2.2 relative luminance)."
  >
    <Prose>
      <p>
        Read a ratio like this: <strong>On white</strong> is the token used as text or an icon on a white card
        (4.5:1 for body text, 3:1 for large text and UI parts). <strong>Text on it</strong> is slate-900 text
        placed on the token as a background. Marker colors such as <code>priority-medium</code> fail as text on
        purpose: use the matching <code>-text</code> token for words.
      </p>
    </Prose>
    <ToneTables />
    {COLOR_GROUPS.map(group => (
      <div key={group.id} className="space-y-3">
        <div>
          <SubHeading>{group.title}</SubHeading>
          <p className="mt-1 max-w-3xl text-sm text-text-subtle">{group.description}</p>
        </div>
        <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
          {group.tokens.map(color => <Swatch key={color.name} color={color} />)}
        </ul>
      </div>
    ))}
    <DoDont
      doText="Pair color with a word or icon: a danger dot plus “Overdue”, a warning dot plus “Medium”."
      dontText="Use color as the only signal, or use a marker color (priority-medium, text-faint) for text."
    />
  </DocSection>
);

export const TypographySection = () => (
  <DocSection id="typography" title="Typography" description="Inter, six sizes, four weights. Dates and counts use tabular numerals.">
    <Surface className="divide-y divide-border-subtle p-0">
      {TYPE_SCALE.map(step => (
        <div key={step.role} className="grid gap-2 px-5 py-4 md:grid-cols-[11rem_1fr] md:items-baseline">
          <div>
            <p className="text-xs font-semibold text-text-strong">{step.role}</p>
            <p className="text-xs text-text-subtle">{step.size} · {step.weight} · {step.lineHeight}</p>
          </div>
          <div className="min-w-0">
            <p className={cn(step.classes, 'text-text-strong')}>{step.sample}</p>
            <p className="mt-1 break-words font-mono text-[11px] text-text-subtle">{step.classes} · {step.usage}</p>
          </div>
        </div>
      ))}
    </Surface>
    <Specimen label="Weights and numerals">
      <span className="text-sm font-normal">Regular 400</span>
      <span className="text-sm font-medium">Medium 500</span>
      <span className="text-sm font-semibold">Semibold 600</span>
      <span className="text-sm font-bold">Bold 700</span>
      <span className="text-sm tabular-nums">Oct 12, 2026 · 1,284 · 3 pts</span>
    </Specimen>
    <DoDont
      doText="Keep one h1 per page and descend h2, h3 without skipping levels. Use tabular-nums for numbers that change."
      dontText="Pick a heading level for its size, set text below 12px, or use font-light on small text."
    />
  </DocSection>
);

export const SpacingSection = () => (
  <DocSection id="spacing" title="Spacing" description="A 4px base. Tailwind's numeric steps are the scale: p-4 is 16px.">
    <Surface padding="sm" className="space-y-2">
      {SPACING_SCALE.map(step => (
        <div key={step.token} className="grid grid-cols-[3rem_1fr] items-center gap-3 sm:grid-cols-[6rem_12rem_1fr]">
          <span className="font-mono text-xs text-text-strong">{step.token}</span>
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-3 rounded-sm bg-primary/70" style={{ width: step.px }} />
            <span className="text-xs tabular-nums text-text-subtle">{step.px}px</span>
          </div>
          <span className="col-span-2 text-xs text-text-body sm:col-span-1">{step.usage}</span>
        </div>
      ))}
    </Surface>
    <Prose>
      <ul>
        <li>Inside a card: 16px on phones, 20px from <code>sm</code> (<code>Surface</code> does this for you).</li>
        <li>Between cards in a grid: 16–20px. Between page sections: 24–40px.</li>
        <li>Touch targets are at least 44px tall on phones, even when the visible control is smaller.</li>
      </ul>
    </Prose>
  </DocSection>
);

export const RadiusSection = () => (
  <DocSection id="radius" title="Radius" description="Four steps, chosen by what the shape is.">
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {RADIUS_SCALE.map(radius => (
        <li key={radius.token}>
          <Surface padding="sm" className="h-full space-y-3">
            <div aria-hidden className="h-16 border-2 border-primary/40 bg-primary/5" style={{ borderRadius: radius.value }} />
            <div>
              <p className="font-mono text-xs font-semibold text-text-strong">{radius.token}</p>
              <p className="font-mono text-xs text-text-subtle">{radius.tailwind} · {radius.value}</p>
              <p className="mt-1 text-xs text-text-body">{radius.usage}</p>
            </div>
          </Surface>
        </li>
      ))}
    </ul>
  </DocSection>
);

export const ElevationSection = () => (
  <DocSection id="elevation" title="Elevation" description="Three shadow levels and a scrim. Shadows are soft and slate-tinted; borders do most of the separating.">
    <ul className="grid gap-4 sm:grid-cols-3">
      {ELEVATION_LEVELS.map(level => (
        <li key={level.token}>
          <div className={cn('h-full space-y-1 rounded-xl border border-border-subtle bg-white p-4', level.utility === 'shadow-raised' && 'shadow-raised', level.utility === 'shadow-floating' && 'shadow-floating', level.utility === 'shadow-overlay' && 'shadow-overlay')}>
            <p className="font-mono text-xs font-semibold text-text-strong">{level.token}</p>
            <p className="font-mono text-xs text-text-subtle">{level.utility}</p>
            <p className="text-xs text-text-body">{level.usage}</p>
          </div>
        </li>
      ))}
    </ul>
    <Specimen label="Scrim: --color-scrim (slate-900 at 50%)" bare>
      <div className="relative h-24 overflow-hidden rounded-xl border border-border bg-white">
        <p className="p-3 text-sm text-text-body">Page content behind a modal</p>
        <div aria-hidden className="absolute inset-0 bg-scrim" />
        <div className="absolute top-1/2 left-1/2 w-48 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-3 text-center text-xs font-medium text-text-strong shadow-overlay">Dialog</div>
      </div>
    </Specimen>
  </DocSection>
);

const MotionDemo = ({ duration, easing }: { duration: number; easing: string }) => {
  const [moved, setMoved] = useState(false);
  return (
    <div className="space-y-2">
      <div className="h-8 rounded-lg bg-surface-sunken p-1">
        <div
          aria-hidden
          className="h-6 w-10 rounded-md bg-primary"
          style={{ transform: moved ? 'translateX(calc(100cqw - 3rem))' : 'translateX(0)', transition: `transform ${duration}ms ${easing}` }}
        />
      </div>
      <Button type="button" variant="outline" size="sm" aria-pressed={moved} onClick={() => setMoved(value => !value)}>
        Play {duration}ms
      </Button>
    </div>
  );
};

export const MotionSection = () => (
  <DocSection id="motion" title="Motion" description="Motion explains change; it never decorates. Four durations, three easings.">
    <div className="grid gap-4 lg:grid-cols-2">
      <DataTable
        caption="Duration tokens"
        columns={['Token', 'Value', 'Use']}
        rows={DURATIONS.map(item => [
          <code key="t" className="font-mono text-xs">{item.token}</code>,
          <span key="v" className="tabular-nums">{item.ms}ms</span>,
          item.usage,
        ])}
      />
      <DataTable
        caption="Easing tokens"
        columns={['Token', 'Curve', 'Use']}
        rows={EASINGS.map(item => [
          <code key="t" className="font-mono text-xs">{item.token}</code>,
          <code key="v" className="font-mono text-[11px] text-text-subtle">{item.value}</code>,
          item.usage,
        ])}
      />
    </div>
    <Specimen label="Try the durations (honors your reduced-motion setting)" bare>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {DURATIONS.map(item => <div key={item.token} className="min-w-0 [container-type:inline-size]"><MotionDemo duration={item.ms} easing="cubic-bezier(0.2, 0, 0, 1)" /></div>)}
      </div>
    </Specimen>
    <Prose>
      <ul>
        <li><strong>Animate transform and opacity</strong> only. Color, border and shadow may transition at 150ms. Never animate width, height or top/left (progress fills are the one exception).</li>
        <li><strong>Exits are faster than entries.</strong> A popover opens in 200ms and closes in 150ms.</li>
        <li><strong>Reduced motion:</strong> a global rule in <code>index.css</code> shrinks every animation and transition to 0.01ms under <code>prefers-reduced-motion: reduce</code>. Never rely on motion alone to convey state.</li>
        <li>No looping or autoplaying animation, except a skeleton shimmer while content loads.</li>
      </ul>
    </Prose>
  </DocSection>
);

export const ZIndexSection = () => (
  <DocSection id="z-index" title="Z-index" description="Seven layers as CSS variables. Never write z-[9999].">
    <div className="grid gap-4 lg:grid-cols-2">
      <DataTable
        caption="Z-index scale"
        columns={['Token', 'Value', 'Layer']}
        rows={Z_INDEX.map(item => [
          <code key="t" className="font-mono text-xs">{item.token}</code>,
          <span key="v" className="tabular-nums">{item.value}</span>,
          item.usage,
        ])}
      />
      <Surface padding="sm" className="flex flex-col-reverse gap-1.5">
        {Z_INDEX.map(item => (
          <div
            key={item.token}
            className="rounded-lg border border-border bg-surface-sunken px-3 py-1.5 text-xs text-text-body"
            style={{ marginLeft: `${item.value / 70 * 3}rem` }}
          >
            <span className="font-mono font-semibold text-text-strong">{item.value}</span> {item.token.replace('--z-', '')}
          </div>
        ))}
      </Surface>
    </div>
    <Prose>
      <p>Use in markup as <code>z-(--z-nav)</code>. Toasts sit above modals so an Undo action stays reachable.</p>
    </Prose>
  </DocSection>
);

export const BreakpointsSection = () => (
  <DocSection id="breakpoints" title="Breakpoints" description="Mobile first: styles apply upwards from each minimum width.">
    <Surface padding="sm" className="space-y-3">
      {BREAKPOINTS.map(point => (
        <div key={point.name} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-mono font-semibold text-text-strong">{point.name}</span>
            <span className="tabular-nums text-text-subtle">{point.min === 0 ? '0' : `${point.min}px`}</span>
          </div>
          <div aria-hidden className="h-2 rounded-full bg-surface-sunken">
            <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(point.min / 1280 * 100, 4)}%` }} />
          </div>
          <p className="text-xs text-text-body">{point.usage}</p>
        </div>
      ))}
    </Surface>
    <Prose>
      <ul>
        <li>No horizontal page scroll at 360px. Wide content (timeline, tables) scrolls inside its own box or changes shape.</li>
        <li>Prefer container-relative layout (<code>grid-cols-1 sm:grid-cols-2</code>) over device checks.</li>
      </ul>
    </Prose>
  </DocSection>
);

const TYPE_ICONS = [
  { name: 'Story', icon: BookOpen, className: 'text-type-story bg-type-story-bg' },
  { name: 'Task', icon: SquareCheck, className: 'text-type-task bg-type-task-bg' },
  { name: 'Bug', icon: Bug, className: 'text-type-bug bg-type-bug-bg' },
  { name: 'Spike', icon: Zap, className: 'text-type-spike bg-type-spike-bg' },
];
const PROJECT_ICONS = [
  { name: 'Folder', icon: Folder }, { name: 'Kanban', icon: FolderKanban }, { name: 'Rocket', icon: Rocket },
  { name: 'Target', icon: Target }, { name: 'Layers', icon: Layers }, { name: 'Flag', icon: Flag },
  { name: 'Briefcase', icon: Briefcase }, { name: 'Globe', icon: Globe },
];

export const IconographySection = () => (
  <DocSection id="iconography" title="Iconography" description="Lucide, outline style, 2px stroke, three sizes. Icons support words; they rarely replace them.">
    <div className="grid gap-4 lg:grid-cols-2">
      <Specimen label="Sizes">
        {ICON_SIZES.map(size => (
          <div key={size.px} className="flex flex-col items-center gap-1 text-center">
            <Folder strokeWidth={2} className={cn(size.className, 'text-text-body')} aria-hidden />
            <span className="text-xs tabular-nums text-text-strong">{size.px}px</span>
          </div>
        ))}
        <p className="basis-full text-xs text-text-subtle">16 inline with text · 20 navigation and icon buttons · 24 headers</p>
      </Specimen>
      <Specimen label="Work item types (always with the name)">
        {TYPE_ICONS.map(item => (
          <span key={item.name} className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium', item.className)}>
            <item.icon className="size-3.5" aria-hidden />{item.name}
          </span>
        ))}
      </Specimen>
    </div>
    <Specimen label="Project icons on the project palette">
      {PROJECT_ICONS.map((item, index) => {
        const color = PROJECT_COLORS[index % PROJECT_COLORS.length];
        return (
          <div key={item.name} className="flex flex-col items-center gap-1">
            <span className={cn('flex size-10 items-center justify-center rounded-xl text-white', PROJECT_BG[color])}>
              <item.icon className="size-5" aria-hidden />
            </span>
            <span className="text-[11px] text-text-subtle">{item.name}</span>
          </div>
        );
      })}
    </Specimen>
    <Prose>
      <ul>
        <li>Decorative icons get <code>aria-hidden</code>. An icon-only button needs <code>aria-label</code> and a tooltip.</li>
        <li>Icons inherit <code>currentColor</code>; do not color an icon differently from its label unless it is a status marker.</li>
        <li>Keyboard hints use <Kbd size="sm">Ctrl</Kbd> <Kbd size="sm">K</Kbd>, not icons.</li>
      </ul>
    </Prose>
  </DocSection>
);
