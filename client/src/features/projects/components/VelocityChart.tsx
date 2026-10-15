import { formatSprintRange } from '../lib/sprintStats';
import type { SprintVelocity } from '../lib/velocity';

const W = 400;
const H = 200;
const PAD = { left: 30, right: 8, top: 16, bottom: 30 };

interface VelocityChartProps {
  velocities: SprintVelocity[];
  /** Average of the last completed sprints, drawn as a reference line. */
  average: number | null;
}

/** Bars of the story points each completed sprint delivered. Accessible as an image plus a hidden table. */
const VelocityChart = ({ velocities, average }: VelocityChartProps) => {
  const max = Math.max(1, ...velocities.map(item => item.points), average ?? 0);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(velocities.length, 1);
  const barW = Math.min(48, slot * 0.6);
  const y = (value: number) => PAD.top + innerH - (value / max) * innerH;
  const summary = `Velocity chart: ${velocities.map(item => `${item.sprint.name} ${item.points} points`).join(', ')}.`
    + (average === null ? '' : ` Average ${average} points.`);

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full max-w-lg">
        {[0, max / 2, max].map(tick => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-200" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" fontSize={12} className="fill-slate-600">
              {Math.round(tick * 10) / 10}
            </text>
          </g>
        ))}
        {velocities.map((item, index) => {
          const cx = PAD.left + slot * index + slot / 2;
          return (
            <g key={item.sprint._id}>
              <rect
                x={cx - barW / 2}
                y={y(item.points)}
                width={barW}
                height={Math.max(PAD.top + innerH - y(item.points), item.points > 0 ? 1 : 0)}
                rx={4}
                className="fill-blue-600"
              />
              <text x={cx} y={y(item.points) - 4} textAnchor="middle" fontSize={12} fontWeight={600} className="fill-slate-800">
                {item.points}
              </text>
              <text x={cx} y={H - 10} textAnchor="middle" fontSize={12} className="fill-slate-600">
                {item.sprint.name.length > 10 ? `${item.sprint.name.slice(0, 9)}…` : item.sprint.name}
              </text>
            </g>
          );
        })}
        {average !== null && (
          <line x1={PAD.left} x2={W - PAD.right} y1={y(average)} y2={y(average)} className="stroke-warning-solid" strokeWidth={2} strokeDasharray="5 4" />
        )}
      </svg>
      {average !== null && (
        <figcaption className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
          <svg aria-hidden width="20" height="6"><line x1="0" x2="20" y1="3" y2="3" className="stroke-warning-solid" strokeWidth={2} strokeDasharray="5 4" /></svg>
          Average of the last 3 sprints: {average} points
        </figcaption>
      )}
      <div className="sr-only">
        <table>
          <caption>Story points completed per sprint</caption>
          <thead>
            <tr><th scope="col">Sprint</th><th scope="col">Dates</th><th scope="col">Points</th></tr>
          </thead>
          <tbody>
            {velocities.map(item => (
              <tr key={item.sprint._id}>
                <th scope="row">{item.sprint.name}</th>
                <td>{formatSprintRange(item.sprint)}</td>
                <td>{item.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
};

export default VelocityChart;
