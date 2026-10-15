import { useId } from 'react';
import { formatDate } from '@/features/tasks';
import { useActiveIndex } from '../hooks/useActiveIndex';
import { useChartWidth } from '../hooks/useChartWidth';
import { axisScale, labelIndexes } from '../lib/flow';
import type { ThroughputWeek } from '../types';
import { ChartTooltip, ScrollFrame } from './ChartParts';

const MIN_W = 420;
const H = 240;
const PAD = { left: 30, right: 10, top: 20, bottom: 30 };

const weekOf = (week: ThroughputWeek) => formatDate(week.start, { month: 'short', day: 'numeric' });
const describe = (week: ThroughputWeek) =>
  `Week of ${formatDate(week.start, { month: 'long', day: 'numeric' })} (${week.week}): ${week.count} ${week.count === 1 ? 'task' : 'tasks'} completed`;

/** Tasks completed in each ISO week of the range. */
const ThroughputChart = ({ weeks }: { weeks: ThroughputWeek[] }) => {
  const id = useId();
  const [box, W] = useChartWidth(MIN_W);
  const { active, setActive, handlers } = useActiveIndex(weeks.length, 'last');
  const scale = axisScale(Math.max(0, ...weeks.map(week => week.count)), 4);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(weeks.length, 1);
  const barW = Math.min(44, slot * 0.7);
  const y = (value: number) => PAD.top + innerH - (value / scale.max) * innerH;
  const cx = (index: number) => PAD.left + slot * index + slot / 2;
  const total = weeks.reduce((sum, week) => sum + week.count, 0);

  return (
    <figure className="m-0">
      <ScrollFrame label="Throughput chart. Use the left and right arrow keys to read each week." aria-describedby={`${id}-live`} {...handlers}>
        <div ref={box} className="relative min-w-[420px]">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Throughput: ${total} ${total === 1 ? 'task' : 'tasks'} completed over ${weeks.length} ${weeks.length === 1 ? 'week' : 'weeks'}.`}
            className="block h-auto w-full text-slate-500"
          >
            {scale.ticks.map(tick => (
              <g key={tick}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-200" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" fontSize={12} className="fill-slate-600">{tick}</text>
              </g>
            ))}
            {weeks.map((week, index) => (
              <g key={week.week} onPointerEnter={() => setActive(index)} onPointerDown={() => setActive(index)}>
                <rect x={cx(index) - slot / 2} y={PAD.top} width={slot} height={innerH} className="fill-transparent" />
                <rect
                  x={cx(index) - barW / 2}
                  y={y(week.count)}
                  width={barW}
                  height={Math.max(PAD.top + innerH - y(week.count), week.count > 0 ? 1 : 0)}
                  rx={4}
                  className={active === index ? 'fill-blue-700' : 'fill-blue-600'}
                />
                {weeks.length <= 14 && week.count > 0 && (
                  <text x={cx(index)} y={y(week.count) - 4} textAnchor="middle" fontSize={12} fontWeight={600} className="fill-slate-800">
                    {week.count}
                  </text>
                )}
              </g>
            ))}
            {labelIndexes(weeks.length, 6).map(index => (
              <text key={weeks[index].week} x={cx(index)} y={H - 10} textAnchor="middle" fontSize={12} className="fill-slate-600">
                {weekOf(weeks[index])}
              </text>
            ))}
          </svg>
          {active !== null && (
            <ChartTooltip left={(cx(active) / W) * 100}>
              <p className="font-semibold">Week of {weekOf(weeks[active])}</p>
              <p><span className="tabular-nums">{weeks[active].count}</span> completed</p>
            </ChartTooltip>
          )}
        </div>
      </ScrollFrame>
      <p id={`${id}-live`} className="sr-only" aria-live="polite">{active === null ? '' : describe(weeks[active])}</p>

      <div className="sr-only">
        <table>
          <caption>Tasks completed per week</caption>
          <thead>
            <tr><th scope="col">Week</th><th scope="col">Starts</th><th scope="col">Completed</th></tr>
          </thead>
          <tbody>
            {weeks.map(week => (
              <tr key={week.week}><th scope="row">{week.week}</th><td>{week.start}</td><td>{week.count}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
};

export default ThroughputChart;
