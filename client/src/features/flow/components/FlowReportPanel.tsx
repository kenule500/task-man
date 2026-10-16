import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { Activity, CheckCircle2, Gauge, Hourglass, RefreshCw } from 'lucide-react';
import { EmptyState, ErrorState, SegmentedControl, SkeletonChart, StatCard, Surface } from '@/components/ds';
import { Button } from '@/components/ui/button';
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
  { value: 'cycle' as const, get label() { return i18n.t('reports:flow.cycleTime'); } },
  { value: 'lead' as const, get label() { return i18n.t('reports:flow.leadTime'); } },
];

const FlowSkeleton = () => {
  const { t } = useTranslation('reports');
  return <SkeletonChart label={t('flow.loading')} height="h-72" />;
};

const FlowBody = ({ report }: { report: FlowReport }) => {
  const { t } = useTranslation('reports');
  const [metric, setMetric] = useState<TimeMetric>('cycle');
  const stats = metric === 'cycle' ? report.cycleTime : report.leadTime;
  const name = metric === 'cycle' ? t('flow.cycleTime') : t('flow.leadTime');
  const p85 = report.cycleTime.p85;
  const over = countOverP85(report.aging, p85);

  return (
    <div className="space-y-5">
      <section aria-label={t('flow.summary')} className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        <StatCard className="p-4 sm:p-5" title={t('flow.completed')} value={totalThroughput(report)} subtitle={t('flow.lastDays', { days: report.range.days })} icon={<CheckCircle2 className="size-4" />} colorClass="text-success-fg" />
        <StatCard className="p-4 sm:p-5" title={t('flow.medianCycle')} value={formatDays(report.cycleTime.p50)} subtitle={report.cycleTime.count === 0 ? t('flow.noFinished') : t('flow.measured', { count: report.cycleTime.count })} icon={<Gauge className="size-4" />} colorClass="text-blue-600" />
        <StatCard className="p-4 sm:p-5" title={t('flow.p85')} value={formatDays(report.cycleTime.p85)} subtitle={t('flow.p85Sub')} icon={<Activity className="size-4" />} colorClass="text-warning-fg" />
        <StatCard className="p-4 sm:p-5" title={t('flow.inProgressNow')} value={report.aging.length} subtitle={p85 === null ? t('flow.noBaseline') : t('flow.overP85', { n: over })} icon={<Hourglass className="size-4" />} colorClass={over > 0 ? 'text-danger-fg' : 'text-slate-600'} />
      </section>

      <ChartCard
        id="flow-cfd"
        title={t('flow.cfdTitle')}
        description={t('flow.cfdDescription')}
      >
        <CumulativeFlowChart cfd={report.cfd} />
      </ChartCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          id="flow-time"
          title={t('flow.timeTitle')}
          description={metric === 'cycle' ? t('flow.timeCycleDescription') : t('flow.timeLeadDescription')}
          action={(
            <SegmentedControl options={TIME_OPTIONS} value={metric} onValueChange={setMetric} aria-label={t('flow.timeMeasure')} size="sm" />
          )}
        >
          <TimeScatterChart name={name} stats={stats} range={report.range} />
        </ChartCard>
        <ChartCard id="flow-throughput" title={t('flow.throughputTitle')} description={t('flow.throughputDescription')}>
          <ThroughputChart weeks={report.throughput} />
        </ChartCard>
      </div>

      <ChartCard id="flow-aging" title={t('flow.agingTitle')} description={t('flow.agingDescription')}>
        <AgingWipList items={report.aging} p85={p85} />
      </ChartCard>
    </div>
  );
};

/** The Flow tab of the Reports page: filters, then the Kanban flow charts for the chosen scope. */
const FlowReportPanel = ({ slug, projects }: { slug: string; projects: Project[] }) => {
  const { t } = useTranslation('reports');
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
      <Surface as="section" aria-label={t('flow.filters')} padding="sm" className="sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SelectField
            label={t('flow.project')}
            value={project}
            onValueChange={changeProject}
            options={[{ value: '', label: t('flow.allProjects') }, ...projects.map(item => ({ value: item.name, label: item.name }))]}
          />
          <SelectField
            label={t('flow.sprint')}
            value={sprint}
            onValueChange={setSprint}
            options={[{ value: '', label: t('flow.allSprints') }, ...sprintOptions]}
          />
          <SelectField
            label={t('flow.dateRange')}
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
            title={t('flow.errorTitle')}
            reason={error || t('flow.noAnswer')}
            nextStep={t('flow.checkConnection')}
            action={(
              <Button onClick={retry} variant="outline" className="h-10 gap-2 rounded-lg">
                <RefreshCw className="size-4" aria-hidden /> {t('actions.retry')}
              </Button>
            )}
          />
        </Surface>
      ) : isEmptyReport(report) ? (
        <Surface padding="none">
          <EmptyState
            icon={<Activity />}
            title={t('flow.emptyTitle')}
            description={t('flow.emptyDescription')}
          />
        </Surface>
      ) : (
        <FlowBody key={`${project}|${sprint}|${preset}`} report={report} />
      )}
    </div>
  );
};

export default FlowReportPanel;
