import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ds';
import { contrastLevel, contrastRatio, formatRatio } from '../contrast';
import { DARK_COLORS } from '../darkTokens';
import { CodeBlock, DataTable, DoDont, DocSection, Prose, Specimen, SubHeading } from '../kit';
import { ALL_COLOR_TOKENS, TONE_LIGHT } from '../tokens';

// Patterns → Data visualization. The specimen is built from tokens only; the real charts live in
// features/projects (BurndownChart, VelocityChart) and features/flow (cumulative flow, throughput, time scatter).

const W = 400;
const H = 200;
const PAD = { left: 30, right: 8, top: 16, bottom: 30 };
const DATA = [
  { sprint: 'Sprint 1', points: 21 },
  { sprint: 'Sprint 2', points: 28 },
  { sprint: 'Sprint 3', points: 24 },
  { sprint: 'Sprint 4', points: 31 },
  { sprint: 'Sprint 5', points: 27 },
];
const AVERAGE = DATA.reduce((sum, item) => sum + item.points, 0) / DATA.length;
const MAX = 35;

const innerW = W - PAD.left - PAD.right;
const innerH = H - PAD.top - PAD.bottom;
const slot = innerW / DATA.length;
const y = (value: number) => PAD.top + innerH - (value / MAX) * innerH;

const SUMMARY = `Velocity over five sprints: ${DATA.map(item => `${item.sprint} ${item.points} points`).join(', ')}. Average ${AVERAGE.toFixed(1)} points.`;

/** A velocity bar chart that follows every rule below. */
const VelocityChartSpecimen = () => {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className="m-0 w-full max-w-lg space-y-2">
      {/* [direction:ltr] keeps axes and text-anchor meaningful in Arabic */}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={SUMMARY} className="h-auto w-full [direction:ltr]">
        {[0, MAX / 2, MAX].map(tick => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" fontSize={12} className="fill-text-subtle">{Math.round(tick)}</text>
          </g>
        ))}
        {DATA.map((item, index) => {
          const cx = PAD.left + slot * index + slot / 2;
          const barW = Math.min(48, slot * 0.6);
          return (
            <g key={item.sprint}>
              <rect x={cx - barW / 2} y={y(item.points)} width={barW} height={PAD.top + innerH - y(item.points)} rx={4} className="fill-info-dot" />
              <text x={cx} y={y(item.points) - 4} textAnchor="middle" fontSize={12} fontWeight={600} className="fill-text-strong">{item.points}</text>
              <text x={cx} y={H - 10} textAnchor="middle" fontSize={12} className="fill-text-subtle">{item.sprint.replace('Sprint ', 'S')}</text>
            </g>
          );
        })}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(AVERAGE)} y2={y(AVERAGE)} className="stroke-warning-solid" strokeWidth={2} strokeDasharray="5 4" />
      </svg>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-subtle">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-info-dot" />Points delivered</span>
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden width="20" height="6"><line x1="0" x2="20" y1="3" y2="3" className="stroke-warning-solid" strokeWidth={2} strokeDasharray="5 4" /></svg>
          Average {AVERAGE.toFixed(1)}
        </span>
      </figcaption>
      <Button type="button" variant="outline" size="sm" aria-expanded={showTable} onClick={() => setShowTable(current => !current)}>
        {showTable ? 'Hide data table' : 'Show data table'}
      </Button>
      {/* The same numbers as a real table: always in the DOM for screen readers, visible on request */}
      <div className={showTable ? 'overflow-x-auto rounded-lg border border-border' : 'sr-only'}>
        <table className="w-full text-start text-sm">
          <caption className="sr-only">Points delivered per sprint</caption>
          <thead className="bg-surface-sunken text-xs text-text-subtle">
            <tr><th scope="col" className="px-3 py-2 text-start">Sprint</th><th scope="col" className="px-3 py-2 text-start">Points</th></tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {DATA.map(item => (
              <tr key={item.sprint}><th scope="row" className="px-3 py-1.5 text-start font-medium text-text-strong">{item.sprint}</th><td className="px-3 py-1.5 tabular-nums">{item.points}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
};

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const LIGHT_SURFACE = '#FFFFFF';
const DARK_SURFACE = DARK_COLORS.white;
const lightOf = (utility: string): string => ALL_COLOR_TOKENS.find(token => token.utility === utility)?.hex ?? '#000000';

interface ChartColor {
  role: string;
  classes: string;
  light: string;
  dark: string;
  min: 3 | 4.5;
  swatch: string;
}

const CHART_COLORS: ChartColor[] = [
  { role: 'Series 1 (default)', classes: 'fill-info-dot · bg-info-dot', light: TONE_LIGHT.info.dot, dark: DARK_COLORS['info-dot'], min: 3, swatch: 'bg-info-dot' },
  { role: 'Series 2', classes: 'fill-success-dot', light: TONE_LIGHT.success.dot, dark: DARK_COLORS['success-dot'], min: 3, swatch: 'bg-success-dot' },
  { role: 'Series 3', classes: 'fill-warning-dot', light: TONE_LIGHT.warning.dot, dark: DARK_COLORS['warning-dot'], min: 3, swatch: 'bg-warning-dot' },
  { role: 'Series 4 (also “bad”)', classes: 'fill-danger-dot', light: TONE_LIGHT.danger.dot, dark: DARK_COLORS['danger-dot'], min: 3, swatch: 'bg-danger-dot' },
  { role: 'Reference line (average, target)', classes: 'stroke-warning-solid, dashed', light: TONE_LIGHT.warning.solid, dark: DARK_COLORS['warning-solid'], min: 3, swatch: 'bg-warning-solid' },
  { role: 'Axis and tick labels (12px)', classes: 'fill-text-subtle', light: lightOf('text-subtle'), dark: DARK_COLORS['text-subtle'], min: 4.5, swatch: 'bg-text-subtle' },
  { role: 'Value labels', classes: 'fill-text-strong', light: lightOf('text-strong'), dark: DARK_COLORS['slate-900'], min: 4.5, swatch: 'bg-text-strong' },
];

const PaletteTable = () => (
  <DataTable
    caption="Chart colors, from tokens, with contrast against the card in light and dark"
    columns={['Role', 'Classes', 'Light', 'Dark', 'Needs']}
    className="[&_table]:min-w-[44rem]"
    rows={CHART_COLORS.map(item => {
      const light = contrastRatio(item.light, LIGHT_SURFACE);
      const dark = contrastRatio(item.dark, DARK_SURFACE);
      const ok = light >= item.min && dark >= item.min;
      return [
        <span key="r" className="inline-flex items-center gap-2"><span aria-hidden className={`size-3 rounded-sm ${item.swatch}`} />{item.role}</span>,
        <code key="c" className="font-mono text-xs">{item.classes}</code>,
        <span key="l" className="tabular-nums">{formatRatio(light)} · {contrastLevel(light)}</span>,
        <span key="d" className="tabular-nums">{formatRatio(dark)} · {contrastLevel(dark)}</span>,
        <Tag key="n" tone={ok ? 'success' : 'danger'} size="sm">{item.min === 3 ? '3:1 marks' : '4.5:1 text'}{ok ? '' : ' failed'}</Tag>,
      ];
    })}
  />
);

export const DataVizSection = () => (
  <DocSection
    id="p-dataviz"
    title="Data visualization"
    description="Charts are built from the same tokens as everything else, read by screen readers as an image plus a table, and never mirrored."
  >
    <Specimen label="Velocity chart built to the rules" bare>
      <VelocityChartSpecimen />
    </Specimen>

    <div className="space-y-3">
      <SubHeading>Colors come from tokens</SubHeading>
      <Prose>
        <p>
          Marks (bars, lines, areas) use the <code>-dot</code> part of a tone, which keeps at least 3:1 against the card in both themes. Text on a chart uses <code>text-subtle</code> or
          <code> text-strong</code>. Never use a raw hue or hex; never use a marker color for a word. The first series is <code>info</code>; add <code>success</code>, <code>warning</code>
          and <code>danger</code> only when they mean something (done, at risk, late), and keep to four series.
        </p>
      </Prose>
      <PaletteTable />
    </div>

    <div className="space-y-3">
      <SubHeading>Rules</SubHeading>
      <Prose>
        <ul>
          <li><strong>One image, one table.</strong> The svg is <code>role=&quot;img&quot;</code> with an <code>aria-label</code> that states the headline number (“Average 26.2 points”). The same numbers are a real
            <code> table</code> with a caption and <code>scope</code> headers, hidden with <code>sr-only</code> (or shown on request, as above).</li>
          <li><strong>Axes.</strong> Bars start at zero. Three ticks (0, half, max) are enough; no more than six labels on the x axis. Text is at least 12px, y labels use <code>text-anchor=&quot;end&quot;</code>, x labels
            <code> middle</code>; dates and numbers go through <code>i18n/format.ts</code>.</li>
          <li><strong>Color is never alone.</strong> Direct value labels on bars, a dashed line for the reference (solid for the data), a legend with a swatch and a word, and icons or words for good, risk and late.</li>
          <li><strong>Always left to right.</strong> <code>[direction:ltr]</code> on the svg keeps the axes and the order of bars in Arabic; translate the labels, not the geometry.</li>
          <li><strong>Keyboard and touch.</strong> Hover tooltips also open on focus and tap, and announce through a polite live region. A chart wider than its card scrolls inside a focusable frame; it never widens the page.</li>
          <li><strong>States.</strong> <code>SkeletonChart</code> while loading, <code>EmptyState</code> when there is nothing to plot, <code>ErrorState</code> when the request failed. Show the last value in text even if the plot is empty.</li>
          <li><strong>Grid.</strong> Hairlines in <code>stroke-border</code>, no vertical gridlines, no 3D, no gradients.</li>
        </ul>
      </Prose>
    </div>

    <CodeBlock
      label="Chart skeleton"
      code={`<figure className="m-0">
  <svg viewBox={\`0 0 \${W} \${H}\`} role="img" aria-label={summary} className="h-auto w-full [direction:ltr]">
    <line className="stroke-border" ... />
    <rect className="fill-info-dot" ... />
    <text className="fill-text-subtle" fontSize={12} textAnchor="end">0</text>
    <line className="stroke-warning-solid" strokeDasharray="5 4" ... />
  </svg>
  <figcaption>{/* legend: swatch + word */}</figcaption>
  <div className="sr-only">
    <table><caption>Points delivered per sprint</caption>{/* th scope="col" and scope="row" */}</table>
  </div>
</figure>`}
    />

    <DoDont
      doText="Say the point in the label (“Average 26.2 points”), label bars directly, and keep a table behind every chart."
      dontText="Rely on a legend and a rainbow of hues, start a bar axis above zero, shrink labels below 12px, or flip the chart in Arabic."
    />
  </DocSection>
);
