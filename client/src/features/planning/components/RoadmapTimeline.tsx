import { cn } from '@/lib/utils';
import { ProjectFolderIcon } from '@/features/projects';
import { ROADMAP_LABEL_WIDTH } from '../lib/roadmap';
import {
  HEALTH_LABEL, describeEpic, formatSpan, placeSpan,
  type EpicHealth, type RoadmapAxis, type RoadmapEpic, type RoadmapGroup, type SprintBand,
} from '../lib/roadmap';

/** Width of the sticky name column. */
const LABEL_W = ROADMAP_LABEL_WIDTH;
const ROW_H = 48;

const FILL: Record<EpicHealth, string> = {
  done: 'bg-success-dot',
  overdue: 'bg-danger-dot',
  'in-progress': 'bg-primary',
  upcoming: 'bg-primary',
};

const TRACK: Record<EpicHealth, string> = {
  done: 'border-success-solid',
  overdue: 'border-danger-solid',
  'in-progress': 'border-slate-400',
  upcoming: 'border-dashed border-slate-400',
};

const BAND: Record<SprintBand['status'], string> = {
  active: 'border-blue-200 bg-blue-50 text-blue-700',
  planned: 'border-slate-200 bg-slate-100 text-slate-700',
  completed: 'border-success-border bg-success-bg text-success-fg',
};

interface RoadmapTimelineProps {
  groups: RoadmapGroup[];
  axis: RoadmapAxis;
  bands: SprintBand[];
  onOpen: (epic: RoadmapEpic) => void;
}

const HeaderRow = ({ axis, bands }: Pick<RoadmapTimelineProps, 'axis' | 'bands'>) => (
  <div className="flex border-b border-slate-200 bg-white">
    <div
      style={{ width: LABEL_W }}
      className="sticky left-0 z-(--z-sticky) flex shrink-0 items-end border-r border-slate-200 bg-white px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
    >
      Epic
    </div>
    <div className="relative shrink-0" style={{ width: axis.width, height: bands.length > 0 ? 64 : 36 }}>
      {axis.ticks.map(tick => (
        <div
          key={tick.key}
          style={{ left: tick.left, width: tick.width }}
          className="absolute top-0 flex h-9 items-center border-l border-slate-200 px-2 text-xs font-medium tabular-nums text-slate-600"
        >
          <span className="truncate">{tick.label}</span>
        </div>
      ))}
      {bands.map(band => (
        <div
          key={band.id}
          style={{ left: band.left, width: band.width }}
          title={`${band.name} (${band.status})`}
          className={cn('absolute top-9 flex h-6 items-center overflow-hidden rounded-md border px-2 text-xs font-medium', BAND[band.status])}
        >
          <span className="truncate">{band.name}</span>
        </div>
      ))}
      {axis.todayLeft !== null && (
        <span
          style={{ left: axis.todayLeft }}
          className="absolute top-0 z-1 -translate-x-1/2 rounded-b bg-primary px-1.5 text-[11px] font-semibold text-white"
        >
          Today
        </span>
      )}
    </div>
  </div>
);

const EpicRow = ({ epic, axis, onOpen }: { epic: RoadmapEpic; axis: RoadmapAxis; onOpen: RoadmapTimelineProps['onOpen'] }) => {
  const place = placeSpan(epic, axis);
  return (
    <div className="flex border-b border-slate-100" style={{ height: ROW_H }}>
      <div
        style={{ width: LABEL_W }}
        className="sticky left-0 z-(--z-sticky) flex shrink-0 flex-col justify-center border-r border-slate-200 bg-white px-3"
      >
        <span className="truncate text-sm font-medium text-slate-900" title={epic.title}>{epic.title}</span>
        <span className="truncate text-xs tabular-nums text-slate-600">
          {epic.percent}% · {HEALTH_LABEL[epic.health]}
        </span>
      </div>
      <div className="relative shrink-0" style={{ width: axis.width }}>
        <button
          type="button"
          onClick={() => onOpen(epic)}
          aria-label={describeEpic(epic)}
          title={`${epic.title}: ${formatSpan(epic.start, epic.end)}`}
          style={{ left: place.left, width: place.width }}
          className={cn(
            'absolute top-3 h-6 cursor-pointer overflow-hidden rounded-md border-2 bg-slate-100 text-left outline-none transition-shadow hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            TRACK[epic.health],
          )}
        >
          <span aria-hidden className={cn('block h-full', FILL[epic.health])} style={{ width: `${epic.percent}%` }} />
        </button>
      </div>
    </div>
  );
};

/** Desktop roadmap: sticky name column, month/week header with sprint bands, bars as buttons, today line. */
const RoadmapTimeline = ({ groups, axis, bands, onOpen }: RoadmapTimelineProps) => (
  <div
    role="region"
    aria-label="Roadmap timeline"
    // Scrollable regions need a tab stop so the keyboard can scroll them
    tabIndex={0}
    className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white outline-none focus-visible:outline-2 focus-visible:outline-primary md:block"
  >
    <div className="relative" style={{ width: LABEL_W + axis.width }}>
      <HeaderRow axis={axis} bands={bands} />
      {groups.map(group => (
        <section key={group.id} aria-label={group.name}>
          <h2 className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700" style={{ width: LABEL_W + axis.width }}>
            <span className="sticky left-3 flex items-center gap-2">
              {group.project && <ProjectFolderIcon size="xs" color={group.project.color} icon={group.project.icon} />}
              {group.name}
            </span>
          </h2>
          {group.epics.map(epic => <EpicRow key={epic.id} epic={epic} axis={axis} onOpen={onOpen} />)}
        </section>
      ))}
      {axis.todayLeft !== null && (
        <span
          aria-hidden
          style={{ left: LABEL_W + axis.todayLeft }}
          className="pointer-events-none absolute bottom-0 top-9 w-0.5 -translate-x-1/2 bg-primary"
        />
      )}
    </div>
  </div>
);

export default RoadmapTimeline;
