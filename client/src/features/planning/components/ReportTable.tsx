import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Surface } from '@/components/ds';
import { TaskTypeBadge, taskKey } from '@/features/tasks';
import { pointsLabel, type ReportItem, type ReportTotal } from '../lib/sprintReport';

interface ReportTableProps {
  title: string;
  total: ReportTotal;
  items: ReportItem[];
  slug: string;
  /** Project key used to build task keys such as "WEB-12". */
  projectKey: string;
  /** Said when the list is empty. */
  empty: string;
}

/** One list of the sprint report: key, title, type, points and assignee. Wide rows scroll inside the card. */
const ReportTable = ({ title, total, items, slug, projectKey, empty }: ReportTableProps) => {
  const headingId = useId();
  return (
    <Surface as="section" aria-labelledby={headingId} padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 pb-3 pt-4 sm:px-5">
        <h2 id={headingId} className="text-sm font-semibold text-slate-900">
          {title}
          <span className="ml-2 rounded-md border border-slate-200 bg-slate-50 px-1.5 text-xs font-medium tabular-nums text-slate-600">{total.count}</span>
        </h2>
        <p className="text-xs tabular-nums text-slate-600">{pointsLabel(total.points)}</p>
      </div>

      {items.length === 0 ? (
        <p className="border-t border-slate-100 px-4 py-6 text-sm text-slate-600 sm:px-5">{empty}</p>
      ) : (
        <div
          role="region"
          aria-label={`${title} table`}
          tabIndex={0}
          className="overflow-x-auto border-t border-slate-100 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-2 font-semibold sm:px-5">Key</th>
                <th scope="col" className="px-3 py-2 font-semibold">Title</th>
                <th scope="col" className="px-3 py-2 font-semibold">Type</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Points</th>
                <th scope="col" className="px-4 py-2 font-semibold sm:px-5">Assignee</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item._id} className="border-b border-slate-100 last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-600 sm:px-5">{taskKey(item, projectKey) || '–'}</td>
                  <td className="max-w-72 px-3 py-2.5">
                    <Link
                      to={`/${slug}/tasks?task=${encodeURIComponent(item._id)}`}
                      className="line-clamp-2 rounded text-slate-900 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {item.title}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5"><TaskTypeBadge type={item.type} /></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {item.storyPoints ?? <><span aria-hidden>–</span><span className="sr-only">Not estimated</span></>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 sm:px-5">
                    {item.assignees.length > 0 ? item.assignees.map(user => user.name).join(', ') : <span className="text-slate-600">Unassigned</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Surface>
  );
};

export default ReportTable;
