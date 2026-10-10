import { Link } from 'react-router-dom';
import { Surface } from '@/components/ds';
import { cn } from '@/lib/utils';
import { parseDateKey, todayKey } from '@/features/tasks/lib/date';
import { describeDuration, formatDuration } from '../lib/duration';
import type { WeekGrid } from '../lib/timesheet';

interface WeekGridTableProps {
  grid: WeekGrid;
  slug: string;
}

const weekday = (key: string) => parseDateKey(key).toLocaleDateString('en-US', { weekday: 'short' });
const dayNumber = (key: string) => parseDateKey(key).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
const dayLong = (key: string) => parseDateKey(key).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });

const Minutes = ({ value }: { value: number }) =>
  value > 0 ? (
    <>
      <span aria-hidden>{formatDuration(value)}</span>
      <span className="sr-only">{describeDuration(value)}</span>
    </>
  ) : (
    <>
      <span aria-hidden className="text-slate-400">–</span>
      <span className="sr-only">none</span>
    </>
  );

const taskHref = (slug: string, id: string) => `/${slug}/tasks?task=${encodeURIComponent(id)}`;

/**
 * Tasks as rows and days as columns with row and column totals. Below `md` each task becomes a card that lists only
 * the days with time, so nothing scrolls sideways on a phone.
 */
const WeekGridTable = ({ grid, slug }: WeekGridTableProps) => {
  const today = todayKey();
  return (
    <>
      <Surface padding="none" radius="xl" className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <caption className="sr-only">Time logged per task and day, with totals</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-3 text-left font-medium">Task</th>
              {grid.days.map(day => (
                <th
                  key={day}
                  scope="col"
                  aria-current={day === today ? 'date' : undefined}
                  className={cn('w-20 px-2 py-3 text-right font-medium tabular-nums', day === today && 'text-primary')}
                >
                  <span aria-hidden>{weekday(day)}</span>
                  <span className="block text-[11px] font-normal normal-case tracking-normal" aria-hidden>{dayNumber(day)}</span>
                  <span className="sr-only">{dayLong(day)}{day === today ? ' (today)' : ''}</span>
                </th>
              ))}
              <th scope="col" className="w-24 px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.map(row => (
              <tr key={row.task._id} className="border-b border-slate-100 last:border-0">
                <th scope="row" className="max-w-0 px-4 py-3 text-left font-normal">
                  <Link
                    to={taskHref(slug, row.task._id)}
                    title={row.task.title}
                    className="block rounded outline-none hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {row.task.key && <span className="mr-2 font-mono text-xs text-slate-500">{row.task.key}</span>}
                    <span className="font-medium text-slate-900">{row.task.title}</span>
                  </Link>
                </th>
                {row.minutes.map((minutes, index) => (
                  <td key={grid.days[index]} className={cn('px-2 py-3 text-right tabular-nums text-slate-700', grid.days[index] === today && 'bg-info-bg/50')}>
                    <Minutes value={minutes} />
                  </td>
                ))}
                <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900"><Minutes value={row.total} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 font-medium text-slate-900">
              <th scope="row" className="px-4 py-3 text-left font-medium">Total</th>
              {grid.dayTotals.map((minutes, index) => (
                <td key={grid.days[index]} className="px-2 py-3 text-right tabular-nums"><Minutes value={minutes} /></td>
              ))}
              <td className="px-4 py-3 text-right tabular-nums"><Minutes value={grid.total} /></td>
            </tr>
          </tfoot>
        </table>
      </Surface>

      <ul aria-label="Time logged per task" className="space-y-3 md:hidden">
        {grid.rows.map(row => (
          <li key={row.task._id}>
            <Surface padding="sm" radius="xl">
              <div className="flex items-start justify-between gap-3">
                <Link
                  to={taskHref(slug, row.task._id)}
                  className="min-w-0 rounded outline-none focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {row.task.key && <span className="block font-mono text-xs text-slate-500">{row.task.key}</span>}
                  <span className="block font-medium text-slate-900 [overflow-wrap:anywhere]">{row.task.title}</span>
                </Link>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                  <Minutes value={row.total} />
                </span>
              </div>
              <dl className="mt-2 divide-y divide-slate-100 text-sm">
                {row.minutes.map((minutes, index) => minutes > 0 && (
                  <div key={grid.days[index]} className="flex items-center justify-between py-1.5">
                    <dt className="text-slate-600">{dayLong(grid.days[index])}</dt>
                    <dd className="tabular-nums text-slate-900"><Minutes value={minutes} /></dd>
                  </div>
                ))}
              </dl>
            </Surface>
          </li>
        ))}
        <li>
          <Surface padding="sm" radius="xl" className="bg-slate-50">
            <p className="flex items-center justify-between text-sm font-semibold text-slate-900">
              <span>Week total</span>
              <span className="tabular-nums"><Minutes value={grid.total} /></span>
            </p>
          </Surface>
        </li>
      </ul>
    </>
  );
};

export default WeekGridTable;
