import { formatDate } from '@/features/tasks';
import { describeBurndown, type Burndown } from '../lib/burndown';

const W = 400;
const H = 220;
const PAD = { left: 34, right: 10, top: 12, bottom: 28 };

const shortDate = (key: string) => formatDate(key, { month: 'short', day: 'numeric' });

interface BurndownChartProps {
  burndown: Burndown;
  /** Names the chart for screen readers, e.g. the sprint name. */
  title: string;
  today?: Date;
}

/**
 * Ideal line against the remaining work per day. The SVG is one image for assistive tech
 * (`role="img"` + summary) and the same numbers are available in a visually hidden table.
 */
const BurndownChart = ({ burndown, title, today = new Date() }: BurndownChartProps) => {
  const { points, total, unit } = burndown;
  const max = Math.max(total, 1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const y = (value: number) => PAD.top + innerH - (value / max) * innerH;

  const idealPath = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(point.ideal).toFixed(1)}`).join(' ');
  const known = points.map((point, index) => ({ point, index })).filter(item => item.point.remaining !== null);
  const remainingPath = known
    .map((item, order) => `${order === 0 ? 'M' : 'L'}${x(item.index).toFixed(1)} ${y(item.point.remaining ?? 0).toFixed(1)}`)
    .join(' ');
  const summary = describeBurndown(burndown, today);
  const ticks = [0, max / 2, max];
  const labelIndexes = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${title}. ${summary}`}
        className="h-auto w-full max-w-md text-slate-500"
      >
        {ticks.map(tick => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-200" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" fontSize={12} className="fill-slate-600">
              {Math.round(tick * 10) / 10}
            </text>
          </g>
        ))}
        {labelIndexes.map(index => (
          <text
            key={index}
            x={x(index)}
            y={H - 8}
            textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
            fontSize={12}
            className="fill-slate-600"
          >
            {shortDate(points[index].date)}
          </text>
        ))}
        <path d={idealPath} fill="none" className="stroke-slate-400" strokeWidth={2} strokeDasharray="5 4" />
        {remainingPath && <path d={remainingPath} fill="none" className="stroke-blue-600" strokeWidth={2.5} strokeLinejoin="round" />}
        {known.length > 0 && (
          <circle
            cx={x(known[known.length - 1].index)}
            cy={y(known[known.length - 1].point.remaining ?? 0)}
            r={4}
            className="fill-blue-600 stroke-white"
            strokeWidth={2}
          />
        )}
      </svg>

      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden width="20" height="6"><line x1="0" x2="20" y1="3" y2="3" className="stroke-blue-600" strokeWidth={2.5} /></svg>
          Remaining {unit}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden width="20" height="6"><line x1="0" x2="20" y1="3" y2="3" className="stroke-slate-400" strokeWidth={2} strokeDasharray="5 4" /></svg>
          Ideal
        </span>
      </figcaption>

      <table className="sr-only">
        <caption>{title}: remaining {unit} per day</caption>
        <thead>
          <tr><th scope="col">Date</th><th scope="col">Ideal</th><th scope="col">Remaining</th></tr>
        </thead>
        <tbody>
          {points.map(point => (
            <tr key={point.date}>
              <th scope="row">{shortDate(point.date)}</th>
              <td>{point.ideal}</td>
              <td>{point.remaining ?? 'not yet'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};

export default BurndownChart;
