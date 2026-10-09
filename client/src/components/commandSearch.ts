import {
  BarChart3, Calendar, CheckSquare, FolderKanban, GanttChart, HelpCircle,
  LayoutDashboard, Columns3, ScrollText, Settings, Timer, Users, type LucideIcon,
} from 'lucide-react';
import { FAQ_CATEGORIES } from '@/content/faq';
import type { Project } from '@/features/projects';
import type { Task } from '@/features/tasks';
import { taskKey } from '@/features/tasks/lib/taskKey';

export type CommandGroup = 'Pages' | 'Tasks' | 'Projects' | 'Sprints' | 'Help';

/** Display order of the result groups. */
export const COMMAND_GROUPS: CommandGroup[] = ['Pages', 'Tasks', 'Projects', 'Sprints', 'Help'];

export interface CommandItem {
  id: string;
  group: CommandGroup;
  label: string;
  /** Secondary text (key and project name for tasks, task count for projects). */
  hint?: string;
  href: string;
  /** Extra searchable text that is not displayed. */
  keywords?: string;
  icon?: LucideIcon;
  task?: Task;
  /** Set on project results so the palette can draw the project's folder instead of `icon`. */
  project?: Project;
}

const MAX_TASKS = 8;
const MAX_PROJECTS = 5;
const MAX_SPRINTS = 4;
const MAX_HELP = 4;
const MAX_RECENT_TASKS = 5;

interface PageDef {
  key: string;
  label: string;
  icon: LucideIcon;
  permission: string | null;
  path: string;
  keywords?: string;
}

// Same permission gates as the sidebar navigation
const PAGES: PageDef[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: null, path: 'dashboard', keywords: 'home overview' },
  { key: 'tasks', label: 'Tasks', icon: CheckSquare, permission: 'tasks:read', path: 'tasks', keywords: 'list todo' },
  { key: 'board', label: 'Board', icon: Columns3, permission: 'tasks:read', path: 'tasks?view=board', keywords: 'kanban' },
  { key: 'calendar', label: 'Calendar', icon: Calendar, permission: 'tasks:read', path: 'tasks?view=calendar', keywords: 'schedule' },
  { key: 'timeline', label: 'Timeline', icon: GanttChart, permission: 'tasks:read', path: 'tasks?view=timeline', keywords: 'gantt' },
  { key: 'projects', label: 'Projects', icon: FolderKanban, permission: 'projects:read', path: 'projects' },
  { key: 'reports', label: 'Reports', icon: BarChart3, permission: 'reports:read', path: 'reports', keywords: 'analytics stats' },
  { key: 'team', label: 'Team', icon: Users, permission: 'users:read', path: 'team', keywords: 'members people' },
  { key: 'settings', label: 'Settings', icon: Settings, permission: 'settings:manage', path: 'settings', keywords: 'workspace roles' },
  { key: 'audit', label: 'Audit log', icon: ScrollText, permission: 'settings:manage', path: 'settings/audit', keywords: 'activity history changes export security log' },
  { key: 'help', label: 'Help', icon: HelpCircle, permission: null, path: 'help', keywords: 'support center' },
];

/**
 * Searchable items for the workspace: pages the user may open, tasks, projects with their open sprints,
 * and help answers. Without `projects` (not loaded yet), project names are taken from the tasks.
 */
export const buildCommandItems = (
  slug: string,
  can: (permission: string) => boolean,
  tasks: Task[] = [],
  projects?: Project[],
): CommandItem[] => {
  const base = `/${slug}`;
  const pages: CommandItem[] = PAGES
    .filter(page => !page.permission || can(page.permission))
    .map(page => ({
      id: `page-${page.key}`, group: 'Pages', label: page.label, href: `${base}/${page.path}`, icon: page.icon, keywords: page.keywords,
    }));

  const projectKeys = new Map((projects ?? []).map(project => [project.name.trim().toLowerCase(), project.key]));
  // While projects load, a task of a project has no known key yet: show none rather than a wrong "TM-" one
  const keyOf = (task: Task) => (task.project && !projects
    ? ''
    : taskKey(task, task.project ? projectKeys.get(task.project.trim().toLowerCase()) : undefined));

  const canReadTasks = can('tasks:read');
  const recentFirst = [...tasks].sort((a, b) => (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? ''));
  const taskItems: CommandItem[] = canReadTasks
    ? recentFirst.map(task => {
      const key = keyOf(task);
      return {
        id: `task-${task._id}`,
        group: 'Tasks' as const,
        label: task.title,
        hint: [key, task.project].filter(Boolean).join(' · ') || undefined,
        href: `${base}/tasks?task=${encodeURIComponent(task._id)}`,
        // "WEB-12", "#12" and "12" all find the task
        keywords: [key, typeof task.number === 'number' ? `#${task.number}` : '', task.description, task.project, ...(task.labels ?? [])]
          .filter(Boolean).join(' '),
        task,
      };
    })
    : [];

  const helpItems: CommandItem[] = FAQ_CATEGORIES.flatMap(category => category.items.map(item => ({
    id: `help-${item.id}`,
    group: 'Help' as const,
    label: item.question,
    hint: category.title,
    href: `${base}/help?q=${encodeURIComponent(item.question)}`,
    icon: HelpCircle,
  })));

  if (projects && can('projects:read')) {
    const taskCount = (name: string) =>
      tasks.filter(task => !task.parent && task.project?.trim().toLowerCase() === name.toLowerCase()).length;
    const projectItems: CommandItem[] = projects.map(project => ({
      id: `project-${project._id}`,
      group: 'Projects',
      label: project.name,
      hint: `${project.key} · ${taskCount(project.name)} tasks${project.archived ? ' · archived' : ''}`,
      href: `${base}/projects/${encodeURIComponent(project._id)}`,
      keywords: project.description,
      icon: FolderKanban,
      project,
    }));
    const sprintItems: CommandItem[] = projects.flatMap(project => project.sprints
      .filter(sprint => sprint.status !== 'completed')
      .map(sprint => ({
        id: `sprint-${sprint._id}`,
        group: 'Sprints' as const,
        label: sprint.name,
        hint: `${project.name} · ${sprint.status}`,
        href: `${base}/projects/${encodeURIComponent(project._id)}`,
        keywords: `${sprint.goal ?? ''} sprint`,
        icon: Timer,
      })));
    return [...pages, ...taskItems, ...projectItems, ...sprintItems, ...helpItems];
  }

  const counts = new Map<string, number>();
  if (canReadTasks && can('projects:read')) {
    for (const task of tasks) {
      const name = task.project?.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const projectItems: CommandItem[] = [...counts.entries()].map(([name, count]) => ({
    id: `project-${name}`,
    group: 'Projects',
    label: name,
    hint: `${count} ${count === 1 ? 'task' : 'tasks'}`,
    href: `${base}/projects`,
    icon: FolderKanban,
  }));

  return [...pages, ...taskItems, ...projectItems, ...helpItems];
};

const normalize = (value: string) => value.toLowerCase().trim();

/**
 * Filters `items` for a query and returns them grouped in display order (Pages, Tasks, Projects).
 * Every word of the query must appear in the label, hint or keywords (case-insensitive).
 * An empty query lists the pages and the most recent tasks (items are expected newest first).
 */
export const searchCommands = (query: string, items: CommandItem[]): CommandItem[] => {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const byGroup = (group: CommandGroup) => items.filter(item => item.group === group);

  if (terms.length === 0) {
    return [...byGroup('Pages'), ...byGroup('Tasks').slice(0, MAX_RECENT_TASKS)];
  }

  const match = (group: CommandGroup, limit: number) =>
    byGroup(group)
      .map(item => {
        const label = normalize(item.label);
        const haystack = `${label} ${normalize(item.hint ?? '')} ${normalize(item.keywords ?? '')}`;
        if (!terms.every(term => haystack.includes(term))) return null;
        // Prefix matches on the title first, then other title matches, then the rest
        const rank = label.startsWith(terms[0]) ? 0 : terms.every(term => label.includes(term)) ? 1 : 2;
        return { item, rank };
      })
      .filter((entry): entry is { item: CommandItem; rank: number } => entry !== null)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, limit)
      .map(entry => entry.item);

  return [
    ...match('Pages', PAGES.length), ...match('Tasks', MAX_TASKS), ...match('Projects', MAX_PROJECTS),
    ...match('Sprints', MAX_SPRINTS), ...match('Help', MAX_HELP),
  ];
};
