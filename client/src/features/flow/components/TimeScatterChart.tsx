import { useId } from 'react';
import { formatDate } from '@/features/tasks';
import { useActiveIndex } from '../hooks/useActiveIndex';
import { useChartWidth } from '../hooks/useChartWidth';
import { axisScale, describeStats, formatDays, labelIndexes, shortDays } from '../lib/flow';
import type { TimeStats } from '../types';
import { ChartLegend, ChartTooltip, ScrollFrame } from './ChartParts';

const MIN_W = 520;
const H = 260;
const PAD = { left: 36, right: 68, top: 26, bottom: 28 };
const DAY_MS = 86_400_000;

const shortDate = (key: string) => formatDate(key, { month: 'short', day: 'numeric' });
const stamp = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

interface TimeScatterChartProps {
  /** "Cycle time" or "Lead time": names the chart for assistive tech. */
  name: string;
  stats: TimeStats;
  /** First and last day of the report range (YYYY-MM-DD). */
  range: { from: string; to: string };
}

/**
 * One dot per completed task: when it finished against how many days it took. Dashed lines mark the median (p50)
 * and the 85th percentile (p85): 85 of 100 tasks finish at or under that line.
 */
const TimeScatterChart = ({ name, stats, range }: TimeScatterChartProps) => {
  const id = useId();
  const [box, W] = useChartWidth(MIN_W);
  const { points } = stats;
  const { active, setActive, handlers } = useActiveIndex(points.length, 'last');
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const start = Date.parse(`${range.from}T00:00:00.000Z`);
  const span = Math.max(Date.parse(`${range.to}T00:00:00.000Z`) + DAY_MS - start, DAY_MS);
  const scale = axisScale(Math.max(stats.p95 ?? 0, ...points.map(point => point.days)));
  const x = (iso: string) => PAD.left + (Math.min(Math.max(Date.parse(iso) - start, 0), span) / span) * innerW;
  const y = (days: number) => PAD.top + innerH - (days / scale.max) * innerH;
  const labels = labelIndexes(5, 5).map(step => new Date(start + (step / 4) * (span - DAY_MS)).toISOString().slice(0, 10));
  const lines = [
    { key: 'p50', label: 'p50', value: stats.p50, dash: '2 4', className: 'stroke-slate-600' },
    { key: 'p85', label: 'p85', value: stats.p85, dash: '6 4', className: 'stroke-warning-solid' },
  ];
  const activePoint = active === null ? null : points[active];

  return (
    <figure className="m-0">
      <ScrollFrame label={`${name} scatter plot. Use the left and right arrow keys to read each task.`} aria-describedby={`${id}-live`} {...handlers}>
        <div ref={box} className="relative min-w-[520px]">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={describeStats(name, stats)} className="block h-auto w-full text-slate-500">
            {scale.ticks.map(tick => (
              <g key={tick}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-200" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" fontSize={12} className="fill-slate-600">{tick}</text>
              </g>
            ))}
            <text x={4} y={12} fontSize={11} className="fill-slate-600">days</text>
            {labels.map((label, index) => (
              <text
                key={label}
                x={PAD.left + (index / 4) * innerW}
                y={H - 8}
                textAnchor={index === 0 ? 'start' : index === 4 ? 'end' : 'middle'}
                fontSize={12}
                className="fill-slate-600"
              >
                {shortDate(label)}
              </text>
            ))}
            {lines.map(line => line.value !== null && (
              <g key={line.key}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(line.value)} y2={y(line.value)} className={line.className} strokeWidth={1.75} strokeDasharray={line.dash} />
                <text x={W - PAD.right + 4} y={y(line.value) + 4} fontSize={12} fontWeight={600} className="fill-slate-700">
                  {line.label} {shortDays(line.value)}
                </text>
              </g>
            ))}
            {points.map((point, index) => (
              <g key={point.taskId} onPointerEnter={() => setActive(index)} onPointerDown={() => setActive(index)}>
                <circle cx={x(point.completedAt)} cy={y(point.days)} r={11} className="fill-transparent" />
                <circle
                  cx={x(point.completedAt)}
                  cy={y(point.days)}
                  r={active === index ? 6 : 4.5}
                  className="fill-blue-600 stroke-white"
                  strokeWidth={active === index ? 2.5 : 1.5}
                />
              </g>
            ))}
          </svg>
          {activePoint && (
            <ChartTooltip left={(x(activePoint.completedAt) / W) * 100}>
              <p className="font-semibold">{activePoint.key ? `${activePoint.key} · ` : ''}{activePoint.title}</p>
              <p>{formatDays(activePoint.days)}, done {stamp(activePoint.completedAt)}</p>
            </ChartTooltip>
          )}
        </div>
      </ScrollFrame>
      <p id={`${id}-live`} className="sr-only" aria-live="polite">
        {activePoint ? `${activePoint.key} ${activePoint.title}: ${formatDays(activePoint.days)}, completed ${stamp(activePoint.completedAt)}` : ''}
      </p>

      <ChartLegend
        items={[
          { label: 'Completed task', swatch: <span aria-hidden className="inline-block size-2.5 rounded-full bg-blue-600" /> },
          { label: 'Median (p50)', swatch: <svg aria-hidden width="20" height="6"><line x1="0" x2="20" y1="3" y2="3" className="stroke-slate-600" strokeWidth={2} strokeDasharray="2 4" /></svg>, value: formatDays(stats.p50) },
          { label: '85th percentile (p85)', swatch: <svg aria-hidden width="20" height="6"><line x1="0" x2="20" y1="3" y2="3" className="stroke-warning-solid" strokeWidth={2} strokeDasharray="6 4" /></svg>, value: formatDays(stats.p85) },
        ]}
      />

      <div className="sr-only">
        <table>
          <caption>{name} of tasks completed in this range</caption>
          <thead>
            <tr><th scope="col">Task</th><th scope="col">Completed</th><th scope="col">Days</th></tr>
          </thead>
          <tbody>
            {points.map(point => (
              <tr key={point.taskId}>
                <th scope="row">{point.key ? `${point.key} ` : ''}{point.title}</th>
                <td>{stamp(point.completedAt)}</td>
                <td>{point.days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
};

export default TimeScatterChart;
