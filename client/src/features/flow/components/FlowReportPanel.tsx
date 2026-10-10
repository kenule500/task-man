import { useMemo, useState } from 'react';
import { Activity, CheckCircle2, Gauge, Hourglass, RefreshCw } from 'lucide-react';
import { EmptyState, ErrorState, SegmentedControl, StatCard, Surface } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import SelectField from '@/features/planning/components/SelectField';
import type { Project } from '@/features/projects';
import { useFlowReport } from '../hooks/useFlowReport';
import {
  DEFAULT_RANGE_PRESET, RANGE_PRESETS, countOverP85, formatDays, isEmptyReport, presetDays, rangeFor, totalThroughput,
} from '../lib/flow';
import type { FlowReport } from '../types';
import AgingWipList from './AgingWipList';
import { ChartCard } from './ChartParts';
import CumulativeFlowChart from './CumulativeFlowChart';
import ThroughputChart from './ThroughputChart';
import TimeScatterChart from './TimeScatterChart';

type TimeMetric = 'cycle' | 'lead';

const TIME_OPTIONS = [
  { value: 'cycle' as const, label: 'Cycle time' },
  { value: 'lead' as const, label: 'Lead time' },
];

const FlowSkeleton = () => (
  <div role="status" aria-busy="true" aria-label="Loading the flow report" className="space-y-5">
    <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
      {[0, 1, 2, 3].map(index => (
        <Surface key={index} className="space-y-3 p-4 sm:p-5">
          <Skeleton className="h-4 w-24 bg-slate-200" />
          <Skeleton className="h-8 w-14 bg-slate-200" />
          <Skeleton className="h-3 w-32 bg-slate-200" />
        </Surface>
      ))}
    </div>
    <Surface className="space-y-3"><Skeleton className="h-4 w-40 bg-slate-200" /><Skeleton className="h-56 w-full bg-slate-200" /></Surface>
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Surface className="space-y-3"><Skeleton className="h-4 w-32 bg-slate-200" /><Skeleton className="h-44 w-full bg-slate-200" /></Surface>
      <Surface className="space-y-3"><Skeleton className="h-4 w-32 bg-slate-200" /><Skeleton className="h-44 w-full bg-slate-200" /></Surface>
    </div>
  </div>
);

const FlowBody = ({ report }: { report: FlowReport }) => {
  const [metric, setMetric] = useState<TimeMetric>('cycle');
  const stats = metric === 'cycle' ? report.cycleTime : report.leadTime;
  const name = metric === 'cycle' ? 'Cycle time' : 'Lead time';
  const p85 = report.cycleTime.p85;
  const over = countOverP85(report.aging, p85);

  return (
    <div className="space-y-5">
      <section aria-label="Flow summary" className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        <StatCard className="p-4 sm:p-5" title="Completed" value={totalThroughput(report)} subtitle={`in the last ${report.range.days} days`} icon={<CheckCircle2 className="size-4" />} colorClass="text-emerald-600" />
        <StatCard className="p-4 sm:p-5" title="Median cycle time" value={formatDays(report.cycleTime.p50)} subtitle={report.cycleTime.count === 0 ? 'No finished work yet' : `${report.cycleTime.count} tasks measured`} icon={<Gauge className="size-4" />} colorClass="text-blue-600" />
        <StatCard className="p-4 sm:p-5" title="85th percentile" value={formatDays(report.cycleTime.p85)} subtitle="85% finish within this" icon={<Activity className="size-4" />} colorClass="text-amber-600" />
        <StatCard className="p-4 sm:p-5" title="In progress now" value={report.aging.length} subtitle={p85 === null ? 'No baseline yet' : `${over} over the 85th percentile`} icon={<Hourglass className="size-4" />} colorClass={over > 0 ? 'text-red-600' : 'text-slate-600'} />
      </section>

      <ChartCard
        id="flow-cfd"
        title="Cumulative flow"
        description="Tasks in each status at the end of every day. A band that keeps widening means work is piling up there."
      >
        <CumulativeFlowChart cfd={report.cfd} />
      </ChartCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          id="flow-time"
          title="Time to finish"
          description={metric === 'cycle' ? 'Days from first in progress to completed.' : 'Days from creation to completed.'}
          action={(
            <SegmentedControl options={TIME_OPTIONS} value={metric} onValueChange={setMetric} aria-label="Time measure" size="sm" />
          )}
        >
          <TimeScatterChart name={name} stats={stats} range={report.range} />
        </ChartCard>
        <ChartCard id="flow-throughput" title="Throughput" description="Tasks completed per week.">
          <ThroughputChart weeks={report.throughput} />
        </ChartCard>
      </div>

      <ChartCard id="flow-aging" title="Aging work in progress" description="Tasks in progress, oldest first.">
        <AgingWipList items={report.aging} p85={p85} />
      </ChartCard>
    </div>
  );
};

/** The Flow tab of the Reports page: filters, then the Kanban flow charts for the chosen scope. */
const FlowReportPanel = ({ slug, projects }: { slug: string; projects: Project[] }) => {
  const [project, setProject] = useState('');
  const [sprint, setSprint] = useState('');
  const [preset, setPreset] = useState<string>(DEFAULT_RANGE_PRESET);
  const range = useMemo(() => rangeFor(presetDays(preset)), [preset]);
  const { report, error, loading, retry } = useFlowReport(slug, { project, sprint, ...range });

  const sprintOptions = useMemo(() => {
    const scoped = project ? projects.filter(item => item.name === project) : projects;
    return scoped.flatMap(item => item.sprints.map(entry => ({
      value: entry._id,
      label: project ? entry.name : `${entry.name} (${item.name})`,
    })));
  }, [project, projects]);

  const changeProject = (name: string) => {
    setProject(name);
    const owner = projects.find(item => item.name === name);
    if (owner && !owner.sprints.some(entry => entry._id === sprint)) setSprint('');
  };

  return (
    <div className="space-y-5">
      <Surface as="section" aria-label="Flow filters" padding="sm" className="sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SelectField
            label="Project"
            value={project}
            onValueChange={changeProject}
            options={[{ value: '', label: 'All projects' }, ...projects.map(item => ({ value: item.name, label: item.name }))]}
          />
          <SelectField
            label="Sprint"
            value={sprint}
            onValueChange={setSprint}
            options={[{ value: '', label: 'All sprints' }, ...sprintOptions]}
          />
          <SelectField
            label="Date range"
            value={preset}
            onValueChange={setPreset}
            options={RANGE_PRESETS.map(item => ({ value: item.value, label: item.label }))}
          />
        </div>
      </Surface>

      {loading ? (
        <FlowSkeleton />
      ) : error || !report ? (
        <Surface padding="none">
          <ErrorState
            title="We could not load the flow report"
            reason={error || 'The server did not answer.'}
            nextStep="Check your connection and try again."
            action={(
              <Button onClick={retry} variant="outline" className="h-10 gap-2 rounded-lg">
                <RefreshCw className="size-4" aria-hidden /> Try again
              </Button>
            )}
          />
        </Surface>
      ) : isEmptyReport(report) ? (
        <Surface padding="none">
          <EmptyState
            icon={<Activity />}
            title="No flow data yet"
            description="Flow charts fill in as tasks are created and moved between Pending, In progress and Completed. Try a wider date range or another project."
          />
        </Surface>
      ) : (
        <FlowBody key={`${project}|${sprint}|${preset}`} report={report} />
      )}
    </div>
  );
};

export default FlowReportPanel;
