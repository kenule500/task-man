import type { AgingItem, CfdDay, FlowReport, FlowStatusKey, TimeStats } from '../types';

const DAY_MS = 86_400_000;

export const RANGE_PRESETS = [
  { value: '14', label: 'Last 14 days', days: 14 },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '90', label: 'Last 90 days', days: 90 },
  { value: '180', label: 'Last 180 days', days: 180 },
] as const;

export const DEFAULT_RANGE_PRESET = '30';

/** Stacking order from the bottom: finished work at the base, the backlog on top. */
export const STACK_ORDER: FlowStatusKey[] = ['completed', 'inProgress', 'pending'];

export const FLOW_STATUS_LABEL: Record<FlowStatusKey, string> = {
  pending: 'Pending',
  inProgress: 'In progress',
  completed: 'Completed',
};

/** The last `days` UTC calendar days ending today (the server counts days in UTC). */
export const rangeFor = (days: number, now: Date = new Date()): { from: string; to: string } => {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${to}T00:00:00.000Z`) - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  return { from, to };
};

export const presetDays = (value: string): number => RANGE_PRESETS.find(preset => preset.value === value)?.days ?? 30;

/** "1 day", "3.5 days"; rounds to one decimal. */
export const formatDays = (days: number | null): string => {
  if (days === null) return '–';
  const rounded = Math.round(days * 10) / 10;
  return `${rounded} ${rounded === 1 ? 'day' : 'days'}`;
};

/** Short form for chart labels: "3.5d". */
export const shortDays = (days: number | null): string => (days === null ? '–' : `${Math.round(days * 10) / 10}d`);

/** A round upper bound for an axis and evenly spaced ticks from 0 to it (`max` of 0 still gives 1). */
export const axisScale = (max: number, steps = 4): { max: number; ticks: number[] } => {
  const safe = Math.max(max, 1);
  const rough = safe / steps;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(candidate => candidate >= rough) ?? rough;
  const top = Math.ceil(safe / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 1000; value += step) ticks.push(Math.round(value * 100) / 100);
  return { max: top, ticks };
};

/** Highest total of tasks on any day: the height of the cumulative flow chart. */
export const cfdMax = (cfd: CfdDay[]): number =>
  cfd.reduce((max, day) => Math.max(max, day.pending + day.inProgress + day.completed), 0);

export interface StackedBand {
  status: FlowStatusKey;
  /** Cumulative value at the top and bottom edge of the band, one per day. */
  upper: number[];
  lower: number[];
}

/** Cumulative bands per status in `STACK_ORDER`, each starting where the one below ends. */
export const stackBands = (cfd: CfdDay[]): StackedBand[] => {
  const base = cfd.map(() => 0);
  return STACK_ORDER.map(status => {
    const lower = base.slice();
    const upper = cfd.map((day, index) => lower[index] + day[status]);
    upper.forEach((value, index) => { base[index] = value; });
    return { status, upper, lower };
  });
};

/** SVG path of the area between two edges; `xs` are the horizontal positions, edges already scaled to y. */
export const areaPath = (xs: number[], upperY: number[], lowerY: number[]): string => {
  if (xs.length === 0) return '';
  const top = xs.map((x, index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${upperY[index].toFixed(1)}`);
  const bottom = xs.map((_, index) => xs.length - 1 - index).map(index => `L${xs[index].toFixed(1)} ${lowerY[index].toFixed(1)}`);
  return `${top.join(' ')} ${bottom.join(' ')} Z`;
};

/** Up to `count` evenly spaced indexes that always include the first and last of `length` items. */
export const labelIndexes = (length: number, count = 5): number[] => {
  if (length <= 0) return [];
  if (length <= count) return Array.from({ length }, (_, index) => index);
  const picked = new Set<number>();
  for (let step = 0; step < count; step++) picked.add(Math.round((step * (length - 1)) / (count - 1)));
  return [...picked];
};

export type AgingLevel = 'ok' | 'watch' | 'over' | 'unknown';

/**
 * How old a task in progress is against the 85th percentile of cycle time: over it is an outlier,
 * past half of it deserves a look. Without a baseline nothing can be judged.
 */
export const agingLevel = (days: number, p85: number | null): AgingLevel => {
  if (p85 === null || p85 <= 0) return 'unknown';
  if (days > p85) return 'over';
  if (days > p85 / 2) return 'watch';
  return 'ok';
};

export const AGING_META: Record<AgingLevel, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  ok: { label: 'On track', tone: 'success' },
  watch: { label: 'Watch', tone: 'warning' },
  over: { label: 'Over p85', tone: 'danger' },
  unknown: { label: 'No baseline', tone: 'neutral' },
};

export const countOverP85 = (aging: AgingItem[], p85: number | null): number =>
  aging.filter(item => agingLevel(item.days, p85) === 'over').length;

/** True when the range holds no tasks at all, so the charts would be blank. */
export const isEmptyReport = (report: FlowReport): boolean =>
  report.aging.length === 0
  && report.cycleTime.count === 0
  && report.leadTime.count === 0
  && report.cfd.every(day => day.pending + day.inProgress + day.completed === 0)
  && report.throughput.every(week => week.count === 0);

export const totalThroughput = (report: Pick<FlowReport, 'throughput'>): number =>
  report.throughput.reduce((sum, week) => sum + week.count, 0);

const plural = (count: number, singular: string) => `${count} ${singular}${count === 1 ? '' : 's'}`;

/** Text alternative of the cumulative flow chart. */
export const describeCfd = (cfd: CfdDay[]): string => {
  const first = cfd[0];
  const last = cfd[cfd.length - 1];
  if (!first || !last) return 'Cumulative flow: no data.';
  return `Cumulative flow from ${first.date} to ${last.date}. On the last day ${last.pending} pending, ${last.inProgress} in progress and ${last.completed} completed.`;
};

/** Text alternative of a cycle or lead time scatter plot. */
export const describeStats = (name: string, stats: TimeStats): string => {
  if (stats.count === 0) return `${name} scatter plot: no completed tasks in this range.`;
  return `${name} scatter plot of ${plural(stats.count, 'completed task')}. Median ${formatDays(stats.p50)}, 85th percentile ${formatDays(stats.p85)}, 95th percentile ${formatDays(stats.p95)}.`;
};
