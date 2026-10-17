import { Tag } from '@/components/ds';
import { contrastLevel, formatRatio } from '../contrast';
import { CONTRAST_GROUPS, CONTRAST_PAIRS, pairRatios } from '../contrastPairs';
import { DataTable, DocSection, Prose, SubHeading } from '../kit';

// Foundations → Contrast pairs: every text/background pair of the semantic tokens in light and dark.

const levelTone = (level: ReturnType<typeof contrastLevel>) =>
  level === 'AAA' || level === 'AA' ? 'success' : level === 'AA large' ? 'warning' : 'danger';

const Ratio = ({ value }: { value: number }) => {
  const level = contrastLevel(value);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular-nums">{formatRatio(value)}</span>
      <Tag tone={levelTone(level)} size="sm">{level}</Tag>
    </span>
  );
};

/** Two chips showing the pair in both themes with fixed hex values, so the sample never depends on the guide's theme. */
const Sample = ({ fg, bg }: { fg: string; bg: string }) => (
  <span aria-hidden className="inline-flex size-8 items-center justify-center rounded-md border border-border text-xs font-semibold" style={{ color: fg, backgroundColor: bg }}>Aa</span>
);

export const ContrastPairsSection = () => (
  <DocSection
    id="contrast-pairs"
    title="Contrast pairs"
    description="Every text and background pair of the semantic tokens, in light and dark, with the ratio it must reach. A test fails when one drops under its minimum."
  >
    <Prose>
      <p>
        <strong>4.5:1</strong> for text, <strong>3:1</strong> for markers (dots, bars), icons and focus rings (WCAG 2.2 AA). Ratios are computed from the hex values of
        <code> tokens.ts</code> and <code>darkTokens.ts</code>, which a test compares with <code>index.css</code>. <code>text-faint</code> is not listed: it is decorative and is never used for text.
        Marker colors (<code>-dot</code>, <code>status-*</code>, <code>priority-*</code>) are listed against surfaces at 3:1 only; for words use the matching <code>-fg</code> or <code>-text</code> token.
      </p>
    </Prose>
    {CONTRAST_GROUPS.map(group => {
      const pairs = CONTRAST_PAIRS.filter(item => item.group === group);
      return (
        <div key={group} className="space-y-2">
          <SubHeading>{group}</SubHeading>
          <DataTable
            caption={`Contrast pairs: ${group}`}
            columns={['Foreground on background', 'Light', 'Dark', 'Light sample', 'Dark sample', 'Needs']}
            className="[&_table]:min-w-[46rem]"
            rows={pairs.map(item => {
              const { light, dark } = pairRatios(item);
              return [
                <span key="p" className="font-mono text-xs"><span className="text-text-strong">{item.fg}</span> on {item.bg}</span>,
                <Ratio key="l" value={light} />,
                <Ratio key="d" value={dark} />,
                <Sample key="ls" fg={item.light.fg} bg={item.light.bg} />,
                <Sample key="ds" fg={item.dark.fg} bg={item.dark.bg} />,
                <span key="m" className="tabular-nums">{item.min}:1 {item.min === 3 ? 'marker' : 'text'}</span>,
              ];
            })}
          />
        </div>
      );
    })}
  </DocSection>
);
