import { Monitor, Moon, Sun } from 'lucide-react';
import { Alert, SegmentedControl, Surface, Tag } from '@/components/ds';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useThemePreference, type ThemePreference } from '@/lib/theme';
import { saveThemePreference } from '@/lib/themeApi';
import { contrastLevel, formatRatio } from '../contrast';
import { DARK_PAIRS, DARK_SURFACE_STEPS, DARK_TEXT_STEPS, pairRatio } from '../darkTokens';
import { DataTable, DoDont, DocSection, Prose, Specimen, SubHeading } from '../kit';

const CHOICES = [
  { value: 'light' as const, label: 'Light', icon: <Sun /> },
  { value: 'dark' as const, label: 'Dark', icon: <Moon /> },
  { value: 'system' as const, label: 'System', icon: <Monitor /> },
];

/** Swatch with a fixed color, so it looks the same in both themes. The hex is always printed next to it. */
const Swatch = ({ hex }: { hex: string }) => (
  <span className="inline-flex items-center gap-2">
    <span aria-hidden className="size-4 shrink-0 rounded border border-border-strong" style={{ backgroundColor: hex }} />
    <code className="font-mono text-xs">{hex}</code>
  </span>
);

/** Lowest ratio per group of pairs: one row says "everything in this group is at least N:1". */
const groupSummary = () => {
  const groups = new Map<string, { min: number; count: number; target: number }>();
  for (const pair of DARK_PAIRS) {
    const ratio = pairRatio(pair);
    const current = groups.get(pair.group);
    groups.set(pair.group, {
      min: current ? Math.min(current.min, ratio) : ratio,
      count: (current?.count ?? 0) + 1,
      target: pair.min,
    });
  }
  return [...groups.entries()];
};

export const DarkModeSection = () => {
  const { preference, resolved } = useThemePreference();
  const summary = groupSummary();

  return (
    <DocSection
      id="dark-mode"
      title="Dark mode"
      description="Authored, not inverted: a re-built slate ramp, deep tinted chips and lighter text steps, switched by a class on the html element."
    >
      <Specimen label="Try it">
        <SegmentedControl
          aria-label="Theme"
          options={CHOICES}
          value={preference}
          onValueChange={(next: ThemePreference) => { void saveThemePreference(next); }}
        />
        <ThemeToggle />
        <span className="text-xs text-text-subtle" aria-live="polite">Showing the {resolved} theme</span>
      </Specimen>

      <Prose>
        <p>
          The choice is <strong>Light</strong>, <strong>Dark</strong> or <strong>System</strong> (follows the device and updates live). It is stored in this
          browser (<code>localStorage taskman.theme</code>, applied in <code>main.tsx</code> before the first render, so there is no flash) and on the account
          (<code>theme</code> on <code>PUT /api/profile</code>), where it is set from <strong>Settings → Profile → Appearance</strong> or the theme button.
        </p>
      </Prose>

      <div className="space-y-3">
        <SubHeading>How the existing utilities map</SubHeading>
        <Prose>
          <p>
            Tailwind reads colors from CSS variables, so <code>.dark</code> in <code>index.css</code> re-points the slate ramp and the tint ramps. Every
            <code>bg-white</code>, <code>bg-slate-50</code>, <code>text-slate-500</code> or <code>bg-danger-bg text-danger-fg</code> already in the app switches
            with no change to the component. Elevation in dark mode is lightness: canvas, then card, then raised well.
          </p>
        </Prose>
        <DataTable
          caption="Surface and border steps in light and dark"
          columns={['Utility or token', 'Light', 'Dark', 'Use']}
          rows={DARK_SURFACE_STEPS.map(step => [
            <code key="u" className="font-mono text-xs">{step.utility}</code>,
            <Swatch key="l" hex={step.light} />,
            <Swatch key="d" hex={step.dark} />,
            step.role,
          ])}
        />
        <DataTable
          caption="Text steps in light and dark"
          columns={['Utility or token', 'Light', 'Dark', 'Use']}
          rows={DARK_TEXT_STEPS.map(step => [
            <code key="u" className="font-mono text-xs">{step.utility}</code>,
            <Swatch key="l" hex={step.light} />,
            <Swatch key="d" hex={step.dark} />,
            step.role,
          ])}
        />
      </div>

      <div className="space-y-3">
        <SubHeading>Tint chips</SubHeading>
        <Surface padding="sm" className="flex flex-wrap items-center gap-2">
          <Tag tone="neutral">Neutral</Tag>
          <Tag tone="primary">Primary</Tag>
          <Tag tone="success">Success</Tag>
          <Tag tone="warning">Warning</Tag>
          <Tag tone="danger">Danger</Tag>
          <Tag tone="dark">Inverse</Tag>
        </Surface>
        <Prose>
          <p>
            Light chips pair <code>-bg</code> with <code>-fg</code> text and <code>-border</code> (semantic tones: danger, success, warning, info). In dark mode the same classes give a deep,
            low-chroma panel with a light <code>-fg</code> text, so nothing needs a <code>dark:</code> variant. <code>-dot</code> is the marker fill (dots, bars), never text, and
            <code>-solid</code> keeps white text at AA in both themes.
          </p>
        </Prose>
      </div>

      <div className="space-y-3">
        <SubHeading>Contrast (checked by a test)</SubHeading>
        <DataTable
          caption="Lowest contrast ratio per group of dark mode color pairs"
          columns={['Group', 'Pairs', 'Lowest ratio', 'Level']}
          rows={summary.map(([group, info]) => {
            const level = contrastLevel(info.min);
            return [
              group,
              info.count,
              <span key="r" className="tabular-nums">{formatRatio(info.min)}</span>,
              <Tag key="t" tone={level === 'Fail' ? 'danger' : level === 'AA large' ? 'warning' : 'success'} size="sm">{level}</Tag>,
            ];
          })}
        />
      </div>

      <div className="space-y-3">
        <SubHeading>Rules</SubHeading>
        <Prose>
          <ul>
            <li>Use semantic tokens or the existing utilities. Do not write <code>dark:</code> variants for colors the ramp already covers, and never raw hex.</li>
            <li>
              A fixed color needs a fixed name. <code>text-white</code> on a solid fill (<code>bg-primary</code>, status dots, project folders) stays white;
              solid fills use <code>-solid</code> (danger, success, warning, info) or the primary blue. For a surface that stays dark in both themes (toast, code block,
              dark chip) use <code>bg-inverse text-inverse-text</code>, not <code>bg-slate-900 text-white</code>.
            </li>
            <li>
              Blue text and links use <code>text-primary</code>, which becomes <code>#60A5FA</code> in dark mode; solid buttons keep <code>#2563EB</code> with white text (5.17:1).
              Hover text on a tint uses <code>text-primary-hover</code>.
            </li>
            <li>Borders carry the separation: shadows are nearly invisible on a dark canvas, so cards always keep their <code>border</code>.</li>
            <li>Check both themes before merging: states, focus rings, disabled, error, empty and loading. Colors never carry meaning alone in either theme.</li>
            <li>Images and illustrations are not inverted; give transparent PNGs a surface behind them.</li>
          </ul>
        </Prose>
        <DoDont
          doText={<>Use <code>bg-white</code>, <code>text-slate-700</code>, <code>bg-danger-bg text-danger-fg</code>. They already have authored dark values.</>}
          dontText={<>Add <code>dark:bg-[#0f172a]</code> or <code>dark:text-gray-200</code> next to a utility the ramp covers. It drifts from the palette and from the contrast test.</>}
        />
        <Alert tone="info" title="Adding a color">
          Add the light value to <code>@theme</code> and the dark value to <code>.dark</code> in <code>index.css</code>, mirror it in <code>design-system/darkTokens.ts</code> and
          list every text pair it appears in. <code>darkTheme.test.ts</code> fails when a hex drifts or a pair drops below 4.5:1 (3:1 for icons and focus).
        </Alert>
      </div>
    </DocSection>
  );
};
