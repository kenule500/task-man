import { useId, type PointerEvent } from 'react';
import { formatDate } from '@/features/tasks';
import { useActiveIndex } from '../hooks/useActiveIndex';
import { useChartWidth } from '../hooks/useChartWidth';
import { FLOW_STATUS_LABEL, STACK_ORDER, areaPath, axisScale, cfdMax, describeCfd, labelIndexes, stackBands } from '../lib/flow';
import type { CfdDay, FlowStatusKey } from '../types';
import { ChartLegend, ChartTooltip, ScrollFrame } from './ChartParts';

const MIN_W = 520;
const H = 280;
const PAD = { left: 36, right: 12, top: 12, bottom: 28 };

// Status meaning colors (DESIGN.md): slate, blue, emerald
const FILL: Record<FlowStatusKey, string> = {
  pending: 'fill-slate-400',
  inProgress: 'fill-blue-600',
  completed: 'fill-emerald-500',
};
const SWATCH: Record<FlowStatusKey, string> = {
  pending: 'bg-slate-400',
  inProgress: 'bg-blue-600',
  completed: 'bg-emerald-500',
};

const shortDate = (key: string) => formatDate(key, { month: 'short', day: 'numeric' });
const longDate = (key: string) => formatDate(key, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

const dayText = (day: CfdDay) =>
  `${longDate(day.date)}: ${STACK_ORDER.slice().reverse().map(status => `${day[status]} ${FLOW_STATUS_LABEL[status].toLowerCase()}`).join(', ')}`;

/**
 * Stacked areas of the tasks in each status per day. Widening bands show where work piles up.
 * One image for assistive tech (summary), arrow keys read the days, and a hidden table has every number.
 */
const CumulativeFlowChart = ({ cfd }: { cfd: CfdDay[] }) => {
  const id = useId();
  const [box, W] = useChartWidth(MIN_W);
  const { active, setActive, handlers } = useActiveIndex(cfd.length, 'last');
  const scale = axisScale(cfdMax(cfd));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (cfd.length <= 1 ? innerW / 2 : (index / (cfd.length - 1)) * innerW);
  const y = (value: number) => PAD.top + innerH - (value / scale.max) * innerH;
  const xs = cfd.map((_, index) => x(index));
  const last = cfd[cfd.length - 1];

  const moveTo = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || cfd.length === 0) return;
    const viewX = ((event.clientX - box.left) / box.width) * W;
    const index = Math.round(((viewX - PAD.left) / innerW) * (cfd.length - 1));
    setActive(Math.min(cfd.length - 1, Math.max(0, cfd.length === 1 ? 0 : index)));
  };

  return (
    <figure className="m-0">
      <ScrollFrame label="Cumulative flow chart. Use the left and right arrow keys to read each day." aria-describedby={`${id}-live`} {...handlers}>
        <div ref={box} className="relative min-w-[520px]" onPointerMove={moveTo} onPointerDown={moveTo}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={describeCfd(cfd)} className="block h-auto w-full text-slate-500">
            {scale.ticks.map(tick => (
              <g key={tick}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-200" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" fontSize={12} className="fill-slate-600">{tick}</text>
              </g>
            ))}
            {stackBands(cfd).map(band => (
              <path
                key={band.status}
                d={areaPath(xs, band.upper.map(y), band.lower.map(y))}
                className={`${FILL[band.status]} stroke-white`}
                strokeWidth={1}
              />
            ))}
            {labelIndexes(cfd.length, 5).map((index, order, all) => (
              <text
                key={index}
                x={x(index)}
                y={H - 8}
                textAnchor={order === 0 ? 'start' : order === all.length - 1 ? 'end' : 'middle'}
                fontSize={12}
                className="fill-slate-600"
              >
                {shortDate(cfd[index].date)}
              </text>
            ))}
            {active !== null && (
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + innerH} className="stroke-slate-900" strokeWidth={1.5} strokeDasharray="3 3" />
            )}
          </svg>
          {active !== null && (
            <ChartTooltip left={(x(active) / W) * 100}>
              <p className="font-semibold">{longDate(cfd[active].date)}</p>
              {STACK_ORDER.slice().reverse().map(status => (
                <p key={status} className="flex items-center gap-1.5">
                  <span aria-hidden className={`inline-block size-2 rounded-sm ${SWATCH[status]}`} />
                  {FLOW_STATUS_LABEL[status]}: <span className="tabular-nums">{cfd[active][status]}</span>
                </p>
              ))}
            </ChartTooltip>
          )}
        </div>
      </ScrollFrame>
      <p id={`${id}-live`} className="sr-only" aria-live="polite">{active === null ? '' : dayText(cfd[active])}</p>

      <ChartLegend
        items={STACK_ORDER.slice().reverse().map(status => ({
          label: FLOW_STATUS_LABEL[status],
          swatch: <span aria-hidden className={`inline-block size-2.5 rounded-sm ${SWATCH[status]}`} />,
          value: last ? `${last[status]} now` : undefined,
        }))}
      />

      <div className="sr-only">
        <table>
          <caption>Tasks in each status at the end of every day</caption>
          <thead>
            <tr><th scope="col">Date</th><th scope="col">Pending</th><th scope="col">In progress</th><th scope="col">Completed</th></tr>
          </thead>
          <tbody>
            {cfd.map(day => (
              <tr key={day.date}>
                <th scope="row">{longDate(day.date)}</th>
                <td>{day.pending}</td><td>{day.inProgress}</td><td>{day.completed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
};

export default CumulativeFlowChart;
