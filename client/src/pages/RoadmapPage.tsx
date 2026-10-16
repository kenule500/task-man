import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { GanttChart } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Alert, EmptyState, PageHeader, SegmentedControl, SkeletonTable, Surface } from '@/components/ds';
import { buttonVariants } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { ROADMAP_LABEL_WIDTH, releaseMarkers, sprintBands as bandsOf, buildAxis, buildRoadmap, type ReleaseMarker, type RoadmapEpic, type RoadmapZoom } from '@/features/planning/lib/roadmap';
import RoadmapList from '@/features/planning/components/RoadmapList';
import RoadmapTimeline from '@/features/planning/components/RoadmapTimeline';
import SelectField from '@/features/planning/components/SelectField';
import { useProjects } from '@/features/projects';
import { useReleases } from '@/features/releases';
import { dateKeyOf, useTasks } from '@/features/tasks';

const ZOOM_OPTIONS = [
  { value: 'months', get label() { return i18n.t('planning:roadmap.zoom.months'); } },
  { value: 'weeks', get label() { return i18n.t('planning:roadmap.zoom.weeks'); } },
] as const;

const Legend = () => {
  const { t } = useTranslation('planning');
  return (
  <ul className="hidden flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600 md:flex" aria-label={t('roadmap.legend')}>
    <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-5 rounded-sm border-2 border-slate-400 bg-primary" /> {t('roadmap.legendInProgress')}</li>
    <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-5 rounded-sm border-2 border-dashed border-slate-400 bg-slate-100" /> {t('roadmap.legendUpcoming')}</li>
    <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-5 rounded-sm border-2 border-success-solid bg-success-dot" /> {t('roadmap.legendDone')}</li>
    <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-5 rounded-sm border-2 border-danger-solid bg-danger-dot" /> {t('roadmap.legendOverdue')}</li>
    <li className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-0.5 bg-primary" /> {t('roadmap.legendToday')}</li>
    <li className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rotate-45 bg-primary" /> {t('roadmap.legendRelease')}</li>
  </ul>
  );
};

/** Epics (grouped by project) on a month or week axis, with sprint bands and progress. */
const RoadmapPage = () => {
  const { t } = useTranslation('planning');
  const { workspaceSlug = '' } = useParams<{ workspaceSlug: string }>();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { tasks, loading: tasksLoading, error: tasksError, clearError } = useTasks(can('tasks:read') ? workspaceSlug : undefined);
  const { projects, loading: projectsLoading, error: projectsError } = useProjects(workspaceSlug);
  const { releases } = useReleases(workspaceSlug);

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

  // Release milestones sit with the sprint bands: one project at a time
  const projectReleases = useMemo(
    () => (bandProject ? releases.filter(release => release.project === bandProject._id && release.status !== 'archived' && release.releaseDate) : []),
    [releases, bandProject],
  );

  const model = useMemo(() => {
    const spans = [
      ...groups.flatMap(group => group.epics),
      ...projectReleases.map(release => ({ start: dateKeyOf(release.releaseDate as string), end: dateKeyOf(release.releaseDate as string) })),
      ...(bandProject?.sprints.map(sprint => ({ start: dateKeyOf(sprint.startDate), end: dateKeyOf(sprint.endDate) })) ?? []),
    ];
    const axis = buildAxis(spans, zoom, new Date(), Math.max(0, timelineWidth - ROADMAP_LABEL_WIDTH - 2));
    return { axis, bands: bandProject ? bandsOf(bandProject.sprints, axis) : [], markers: releaseMarkers(projectReleases, axis) };
  }, [groups, bandProject, projectReleases, zoom, timelineWidth]);

  const openMarker = (marker: ReleaseMarker) => navigate(`/${workspaceSlug}/projects/${bandProject?._id ?? ''}/releases/${encodeURIComponent(marker.id)}`);
  const openEpic = (epic: RoadmapEpic) => navigate(`/${workspaceSlug}/tasks?task=${encodeURIComponent(epic.id)}`);
  const epicCount = groups.reduce((sum, group) => sum + group.epics.length, 0);
  const error = tasksError || projectsError;

  return (
    <AppShell>
      <PageHeader
        title={t('roadmap.pageTitle')}
        description={t('roadmap.pageDescription')}
        actions={openProjects.length > 0 && (
          <>
            <SelectField
              label={t('roadmap.project')}
              value={projectId}
              onValueChange={setProjectId}
              options={[{ value: 'all', label: t('roadmap.allProjects') }, ...openProjects.map(project => ({ value: project._id, label: project.name }))]}
              className="sm:w-52"
            />
            <div className="hidden flex-col gap-1 md:flex">
              <span className="text-xs font-medium text-slate-600">{t('roadmap.zoomLabel')}</span>
              <SegmentedControl
                aria-label={t('roadmap.zoomLabel')}
                options={ZOOM_OPTIONS.map(option => ({ ...option }))}
                value={zoom}
                onValueChange={setZoom}
              />
            </div>
          </>
        )}
      />

      {loading ? (
        <SkeletonTable label={t('roadmap.loading')} rows={5} columns={5} />
      ) : (
        <>
          {error && <Alert tone="error" onDismiss={tasksError ? clearError : undefined}>{error}</Alert>}

          {epicCount === 0 ? (
            <Surface padding="none">
              <EmptyState
                icon={<GanttChart />}
                title={t('roadmap.emptyTitle')}
                description={t('roadmap.emptyBody')}
                action={can('tasks:read') && (
                  <Link
                    to={`/${workspaceSlug}/tasks`}
                    className={buttonVariants({ className: 'h-11 rounded-lg bg-primary px-4 text-sm text-white hover:bg-primary-hover md:h-9' })}
                  >
                    {t('roadmap.goToTasks')}
                  </Link>
                )}
              />
            </Surface>
          ) : (
            <>
              <Legend />
              {projectId === 'all' && !bandProject && openProjects.length > 1 && (
                <p className="hidden text-xs text-slate-600 md:block">{t('roadmap.chooseProject')}</p>
              )}
              <div ref={timelineBox}>
                <RoadmapTimeline groups={groups} axis={model.axis} bands={model.bands} markers={model.markers} onOpen={openEpic} onOpenMarker={openMarker} />
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
