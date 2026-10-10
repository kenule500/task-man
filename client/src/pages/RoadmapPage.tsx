import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GanttChart } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Alert, EmptyState, PageHeader, SegmentedControl, SkeletonTable, Surface } from '@/components/ds';
import { buttonVariants } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { ROADMAP_LABEL_WIDTH, sprintBands as bandsOf, buildAxis, buildRoadmap, type RoadmapEpic, type RoadmapZoom } from '@/features/planning/lib/roadmap';
import RoadmapList from '@/features/planning/components/RoadmapList';
import RoadmapTimeline from '@/features/planning/components/RoadmapTimeline';
import SelectField from '@/features/planning/components/SelectField';
import { useProjects } from '@/features/projects';
import { dateKeyOf, useTasks } from '@/features/tasks';

const ZOOM_OPTIONS = [
  { value: 'months', label: 'Months' },
  { value: 'weeks', label: 'Weeks' },
] as const;

const Legend = () => (
  <ul className="hidden flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600 md:flex" aria-label="Legend">
    <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-5 rounded-sm border-2 border-slate-400 bg-primary" /> In progress</li>
    <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-5 rounded-sm border-2 border-dashed border-slate-400 bg-slate-100" /> Upcoming</li>
    <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-5 rounded-sm border-2 border-success-solid bg-success-dot" /> Done</li>
    <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-5 rounded-sm border-2 border-danger-solid bg-danger-dot" /> Overdue</li>
    <li className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-0.5 bg-primary" /> Today</li>
  </ul>
);

/** Epics (grouped by project) on a month or week axis, with sprint bands and progress. */
const RoadmapPage = () => {
  const { workspaceSlug = '' } = useParams<{ workspaceSlug: string }>();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { tasks, loading: tasksLoading, error: tasksError, clearError } = useTasks(can('tasks:read') ? workspaceSlug : undefined);
  const { projects, loading: projectsLoading, error: projectsError } = useProjects(workspaceSlug);

  const [projectId, setProjectId] = useState('all');
  const [zoom, setZoom] = useState<RoadmapZoom>('months');
  // The timeline fills the page: its width feeds the axis so months stretch edge to edge
  // (callback ref: the box only exists once data has loaded)
  const [timelineWidth, setTimelineWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const timelineBox = useCallback((box: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!box || typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(([entry]) => setTimelineWidth(Math.floor(entry.contentRect.width)));
    observer.current.observe(box);
  }, []);

  const loading = tasksLoading || projectsLoading;
  const openProjects = useMemo(() => projects.filter(project => !project.archived), [projects]);
  const groups = useMemo(() => buildRoadmap(tasks, projects, { projectId }), [tasks, projects, projectId]);

  // Sprint bands need one project: the chosen one, or the only one there is
  const bandProject = projectId !== 'all'
    ? openProjects.find(project => project._id === projectId)
    : openProjects.length === 1 ? openProjects[0] : undefined;

  const model = useMemo(() => {
    const spans = [
      ...groups.flatMap(group => group.epics),
      ...(bandProject?.sprints.map(sprint => ({ start: dateKeyOf(sprint.startDate), end: dateKeyOf(sprint.endDate) })) ?? []),
    ];
    const axis = buildAxis(spans, zoom, new Date(), Math.max(0, timelineWidth - ROADMAP_LABEL_WIDTH - 2));
    return { axis, bands: bandProject ? bandsOf(bandProject.sprints, axis) : [] };
  }, [groups, bandProject, zoom, timelineWidth]);

  const openEpic = (epic: RoadmapEpic) => navigate(`/${workspaceSlug}/tasks?task=${encodeURIComponent(epic.id)}`);
  const epicCount = groups.reduce((sum, group) => sum + group.epics.length, 0);
  const error = tasksError || projectsError;

  return (
    <AppShell>
      <PageHeader
        title="Roadmap"
        description="Epics over time, from the dates of their items. Select a bar to open the epic."
        actions={openProjects.length > 0 && (
          <>
            <SelectField
              label="Project"
              value={projectId}
              onValueChange={setProjectId}
              options={[{ value: 'all', label: 'All projects' }, ...openProjects.map(project => ({ value: project._id, label: project.name }))]}
              className="sm:w-52"
            />
            <div className="hidden flex-col gap-1 md:flex">
              <span className="text-xs font-medium text-slate-600">Zoom</span>
              <SegmentedControl
                aria-label="Zoom"
                options={ZOOM_OPTIONS.map(option => ({ ...option }))}
                value={zoom}
                onValueChange={setZoom}
              />
            </div>
          </>
        )}
      />

      {loading ? (
        <SkeletonTable label="Loading roadmap" rows={5} columns={5} />
      ) : (
        <>
          {error && <Alert tone="error" onDismiss={tasksError ? clearError : undefined}>{error}</Alert>}

          {epicCount === 0 ? (
            <Surface padding="none">
              <EmptyState
                icon={<GanttChart />}
                title="No epics to plan yet"
                description="An epic is a large piece of work that groups related stories across sprints. Create a work item of type Epic and add stories to it: it then appears here with its dates and progress."
                action={can('tasks:read') && (
                  <Link
                    to={`/${workspaceSlug}/tasks`}
                    className={buttonVariants({ className: 'h-11 rounded-lg bg-primary px-4 text-sm text-white hover:bg-primary-hover md:h-9' })}
                  >
                    Go to tasks
                  </Link>
                )}
              />
            </Surface>
          ) : (
            <>
              <Legend />
              {projectId === 'all' && !bandProject && openProjects.length > 1 && (
                <p className="hidden text-xs text-slate-600 md:block">Choose a project to see its sprints above the timeline.</p>
              )}
              <div ref={timelineBox}>
                <RoadmapTimeline groups={groups} axis={model.axis} bands={model.bands} onOpen={openEpic} />
              </div>
              <RoadmapList groups={groups} slug={workspaceSlug} />
            </>
          )}
        </>
      )}
    </AppShell>
  );
};

export default RoadmapPage;
