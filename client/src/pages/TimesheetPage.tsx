import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Timer } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Alert, EmptyState, ErrorState, PageHeader, SkeletonTable, Surface, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { downloadBlob } from '@/features/audit/api';
import SelectField from '@/features/planning/components/SelectField';
import { getApiErrorMessage, timeApi } from '@/features/time/api';
import WeekGridTable from '@/features/time/components/WeekGridTable';
import { useTimesheet } from '@/features/time/hooks/useTimesheet';
import { formatDuration, describeDuration } from '@/features/time/lib/duration';
import {
  buildWeekGrid, shiftWeekStart, startOfIsoWeek, weekDayKeys, weekRange,
} from '@/features/time/lib/timesheet';
import { formatDate, toDateKey } from '@/features/tasks/lib/date';
import { useWorkspaceMembers } from '@/features/tasks/hooks/useWorkspaceMembers';

const rangeLabel = (days: string[]) =>
  `${formatDate(days[0], { month: 'short', day: 'numeric' })} to ${formatDate(days[6], { month: 'short', day: 'numeric', year: 'numeric' })}`;

/** Logged time per task and day for one week, with week navigation, a person filter for managers and CSV export. */
const TimesheetPage = () => {
  const { workspaceSlug = '' } = useParams<{ workspaceSlug: string }>();
  const { can, user } = usePermissions();
  const isManager = can('settings:manage');
  const [weekStart, setWeekStart] = useState(() => toDateKey(startOfIsoWeek(new Date())));
  const [person, setPerson] = useState('');
  const [exporting, setExporting] = useState(false);

  const days = useMemo(() => weekDayKeys(weekStart), [weekStart]);
  const range = useMemo(() => weekRange(weekStart), [weekStart]);
  const query = { from: range.from, to: range.to, user: isManager ? person : '' };
  const { data, loading, error, retry } = useTimesheet(can('tasks:read') ? workspaceSlug : undefined, query);
  const { members } = useWorkspaceMembers(workspaceSlug, isManager && can('users:read'));

  const grid = useMemo(() => buildWeekGrid(data?.entries ?? [], days), [data, days]);
  const thisWeek = toDateKey(startOfIsoWeek(new Date()));
  const isCurrentWeek = weekStart === thisWeek;

  const personOptions = useMemo(() => {
    const options = [{ value: '', label: 'Everyone' }];
    const seen = new Set<string>();
    for (const member of members) {
      seen.add(member._id);
      options.push({ value: member._id, label: member._id === user?._id ? `${member.name} (you)` : member.name });
    }
    // Without the member list, still offer the people who logged time
    for (const entry of data?.totals.byUser ?? []) {
      if (!seen.has(entry.user)) options.push({ value: entry.user, label: entry.name });
    }
    return options;
  }, [members, data, user?._id]);

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await timeApi.exportCsv(workspaceSlug, query);
      downloadBlob(blob, `timesheet-${workspaceSlug}-${weekStart}.csv`);
      toast.success('Timesheet exported');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not export the timesheet.'));
    } finally {
      setExporting(false);
    }
  };

  const showingEveryone = isManager && !person;
  const byUser = data?.totals.byUser ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Timesheet"
        description={isManager ? 'Time logged per task and day. Choose a person or see everyone.' : 'Your logged time per task and day.'}
        actions={(
          <Button
            type="button"
            variant="outline"
            loading={exporting}
            disabled={loading || Boolean(error && !data)}
            onClick={() => { void exportCsv(); }}
            className="h-11 w-full gap-1.5 border-slate-300 text-slate-700 sm:h-9 sm:w-auto"
          >
            <Download className="size-4" aria-hidden /> Export CSV
          </Button>
        )}
      />

      <Surface as="section" aria-label="Week and filters" padding="sm" className="sm:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto" role="group" aria-label="Week">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous week"
              onClick={() => setWeekStart(current => shiftWeekStart(current, -1))}
              className="size-11 border-slate-300 md:size-9"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <p className="min-w-0 flex-1 px-1 text-center text-sm font-medium tabular-nums text-slate-900 sm:min-w-44 sm:flex-none" aria-live="polite">
              {rangeLabel(days)}
            </p>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next week"
              onClick={() => setWeekStart(current => shiftWeekStart(current, 1))}
              className="size-11 border-slate-300 md:size-9"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isCurrentWeek}
              onClick={() => setWeekStart(thisWeek)}
              className="h-11 text-slate-700 md:h-9"
            >
              This week
            </Button>
          </div>
          {isManager && personOptions.length > 1 && (
            <SelectField label="Person" value={person} onValueChange={setPerson} options={personOptions} className="w-full sm:w-56" />
          )}
          {data && (
            <p className="ml-auto text-sm text-slate-600">
              <span className="font-semibold tabular-nums text-slate-900" aria-hidden>{formatDuration(grid.total)}</span>
              <span className="sr-only">{describeDuration(grid.total)}</span> this week
            </p>
          )}
        </div>
      </Surface>

      {data?.truncated && (
        <Alert tone="warning">
          Only the most recent entries are shown. Narrow the week or choose a person to see the rest, or export the CSV.
        </Alert>
      )}

      {loading ? (
        <SkeletonTable label="Loading timesheet" rows={5} columns={5} />
      ) : error && !data ? (
        <Surface padding="none" radius="xl">
          <ErrorState
            title="We could not load the timesheet"
            reason={error}
            nextStep="Check your connection and try again."
            action={<Button type="button" onClick={retry} className="bg-primary text-white hover:bg-primary-hover">Try again</Button>}
          />
        </Surface>
      ) : grid.rows.length === 0 ? (
        <Surface padding="none" radius="xl">
          <EmptyState
            icon={<Timer className="size-6" aria-hidden />}
            title={isCurrentWeek ? 'No time logged this week' : 'No time logged in this week'}
            description="Start a timer or log time from a task, and it appears here by day."
            action={(
              <Button render={<Link to={`/${workspaceSlug}/tasks`} />} className="bg-primary text-white hover:bg-primary-hover">
                Open tasks
              </Button>
            )}
          />
        </Surface>
      ) : (
        <>
          {error && <Alert tone="error">{error}</Alert>}
          <WeekGridTable grid={grid} slug={workspaceSlug} />
          {showingEveryone && byUser.length > 1 && (
            <Surface as="section" aria-label="Time by person" padding="sm" radius="xl" className="sm:p-5">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">By person</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {byUser.map(entry => (
                  <li key={entry.user} className="flex items-center justify-between py-2">
                    <span className="text-slate-700">{entry.name}</span>
                    <span className="font-medium tabular-nums text-slate-900">
                      <span aria-hidden>{formatDuration(entry.minutes)}</span>
                      <span className="sr-only">{describeDuration(entry.minutes)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Surface>
          )}
        </>
      )}
    </AppShell>
  );
};

export default TimesheetPage;
