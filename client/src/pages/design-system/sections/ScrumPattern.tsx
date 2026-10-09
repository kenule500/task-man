import { CalendarDays, Target } from 'lucide-react';
import {
  AvatarStack, ProgressBar, StatusPill, Surface, TypeBadge,
} from '@/components/ds';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  BurndownChart, ProjectFolderCard, buildBurndown, type Project, type ProjectStats, type Sprint,
} from '@/features/projects';
import type { Task } from '@/features/tasks';
import { DoDont, DocSection, Prose, Specimen } from '../kit';

// The project folders and the burndown are the real components from '@/features/projects', fed with sample
// data; the sprint card and backlog rows below are simplified anatomy drawings of the real ones.

const SAMPLE_TODAY = new Date(2030, 0, 13);
const sampleSprint = (overrides: Partial<Sprint>): Sprint => ({
  _id: 'sprint-4', project: 'web', name: 'Sprint 4', goal: 'Ship the board', status: 'active',
  startDate: '2030-01-06T00:00:00.000Z', endDate: '2030-01-19T00:00:00.000Z', ...overrides,
});
const sampleProject = (overrides: Partial<Project>): Project => ({
  _id: 'web', name: 'Website v1', key: 'WEB', color: 'blue', icon: 'code', archived: false, sprints: [], ...overrides,
});
const SAMPLE_FOLDERS: { project: Project; summary: ProjectStats }[] = [
  {
    project: sampleProject({ sprints: [sampleSprint({})] }),
    summary: { total: 18, completed: 11, progress: 62, overdue: 1, activeSprint: sampleSprint({}) },
  },
  {
    project: sampleProject({ _id: 'app', name: 'Mobile app', key: 'APP', color: 'violet', icon: 'rocket' }),
    summary: { total: 7, completed: 2, progress: 29, overdue: 0 },
  },
  {
    project: sampleProject({ _id: 'brand', name: 'Brand refresh', key: 'BRD', color: 'rose', icon: 'palette' }),
    summary: { total: 3, completed: 3, progress: 100, overdue: 0 },
  },
];
const sampleTask = (id: string, points: number, completedOn?: string): Task => ({
  _id: id, title: id, status: completedOn ? 'completed' : 'pending', priority: 'medium', deadline: '2030-01-19',
  position: 0, dependencies: [], sprint: 'sprint-4', storyPoints: points,
  completedAt: completedOn ? `${completedOn}T12:00:00.000Z` : undefined,
});
const SAMPLE_BURNDOWN = buildBurndown(sampleSprint({}), [
  sampleTask('a', 5, '2030-01-08'), sampleTask('b', 3, '2030-01-09'), sampleTask('c', 8, '2030-01-12'),
  sampleTask('d', 5), sampleTask('e', 8),
], SAMPLE_TODAY);
const noop = () => undefined;

const PEOPLE = [{ name: 'Ada Lovelace' }, { name: 'Grace Hopper' }, { name: 'Linus Torvalds' }, { name: 'Alan Turing' }, { name: 'Edsger Dijkstra' }];

const SprintCardMock = () => (
  <Surface as="article" aria-label="Sprint 4" padding="sm" className="space-y-3">
    <div className="flex items-start justify-between gap-2">
      <div>
        <h4 className="text-sm font-semibold text-text-strong">Sprint 4</h4>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-text-subtle"><CalendarDays aria-hidden className="size-3.5" />Oct 5 to Oct 18 · 6 days left</p>
      </div>
      <StatusPill status="in-progress" size="sm">Active</StatusPill>
    </div>
    <p className="flex items-start gap-1.5 text-sm text-text-body"><Target aria-hidden className="mt-0.5 size-4 shrink-0 text-text-subtle" />Goal: ship checkout and the new onboarding.</p>
    <ProgressBar value={62} label="Sprint 4 points completed" />
    <p className="text-xs tabular-nums text-text-subtle">21 of 34 points done</p>
  </Surface>
);

const BACKLOG = [
  { key: 'WEB-12', type: 'story' as const, title: 'Guest checkout with saved address', points: 5, priority: 'High', dot: 'bg-priority-high', people: PEOPLE.slice(0, 2) },
  { key: 'WEB-15', type: 'bug' as const, title: 'Cart total wrong after removing a coupon', points: 2, priority: 'High', dot: 'bg-priority-high', people: PEOPLE.slice(2, 3) },
  { key: 'WEB-18', type: 'spike' as const, title: 'Evaluate address autocomplete providers', points: 3, priority: 'Medium', dot: 'bg-priority-medium', people: [] },
  { key: 'WEB-21', type: 'task' as const, title: 'Update order confirmation email copy', points: 1, priority: 'Low', dot: 'bg-priority-low', people: PEOPLE.slice(3, 5) },
];

const BacklogRowsMock = () => (
  <Surface padding="none" className="overflow-hidden">
    <h4 className="border-b border-border-subtle px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-subtle">Backlog · 4 items · 11 points</h4>
    <ul className="divide-y divide-border-subtle">
      {BACKLOG.map(row => (
        <li key={row.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 sm:flex-nowrap">
          <Checkbox aria-label={`Select ${row.key}`} />
          <TypeBadge type={row.type} size="sm" />
          <span className="font-mono text-xs text-text-subtle">{row.key}</span>
          <span className="min-w-0 basis-full text-sm text-text-strong sm:flex-1 sm:basis-auto sm:truncate">{row.title}</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-text-body"><span aria-hidden className={cn('size-2 rounded-full', row.dot)} />{row.priority}</span>
          <span className="inline-flex min-w-7 justify-center rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-semibold tabular-nums text-text-body" aria-label={`${row.points} story points`}>{row.points}</span>
          <AvatarStack people={row.people} max={2} />
        </li>
      ))}
    </ul>
  </Surface>
);

export const ScrumPatternSection = () => (
  <DocSection id="p-scrum" title="Scrum visuals" description="Projects hold sprints, sprints hold stories, stories hold tasks. These are the shapes and colors that make that hierarchy scannable.">
    <Specimen label="Project folder cards: a tab in the project color" bare>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {SAMPLE_FOLDERS.map(({ project, summary }, index) => (
          <ProjectFolderCard
            key={project._id}
            project={project}
            summary={summary}
            workspaceSlug="demo-workspace"
            index={index}
            canWrite={false}
            canDelete={false}
            onEdit={noop}
            onToggleArchive={noop}
            onDelete={noop}
          />
        ))}
      </div>
    </Specimen>
    <div className="grid gap-4 lg:grid-cols-2">
      <Specimen label="Sprint card" bare><SprintCardMock /></Specimen>
      <Specimen label="Burndown (SVG with a text alternative)" bare>
        <Surface padding="sm"><BurndownChart burndown={SAMPLE_BURNDOWN} title="Sprint 4" today={SAMPLE_TODAY} /></Surface>
      </Specimen>
    </div>
    <Specimen label="Backlog rows" bare><BacklogRowsMock /></Specimen>
    <Prose>
      <ul>
        <li><strong>Type colors:</strong> story emerald, task blue, bug red, spike violet. Always icon plus name, never color alone.</li>
        <li><strong>Project color</strong> picks from the eight-color palette; it appears as the folder tab, the dot beside the name and the sprint header, never as a text color.</li>
        <li><strong>Progress</strong> is story points completed over committed, shown as a ProgressRing on folders and a ProgressBar on sprints.</li>
        <li><strong>Charts</strong> need a text alternative that states the headline number, and must not rely on color alone: use dashed against solid.</li>
        <li><strong>Backlog rows</strong> wrap on phones: title on its own line, meta below. Reordering has a menu alternative to dragging.</li>
      </ul>
    </Prose>
    <DoDont
      doText="Show points as a number in a neutral pill and keep estimates unitless."
      dontText="Color the whole row by type or project; the row stays white and the badge carries the type."
    />
  </DocSection>
);
