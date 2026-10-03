import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckSquare, Clock, FolderKanban, ListTodo, Plus } from 'lucide-react';
import {
  Alert, EmptyState, Field, IconTile, PageHeader, ProgressBar, SectionHeader, SkeletonCards,
  StatCard, Surface, Tag, UserAvatar, fieldMessageId,
} from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DueDate, FilterPills, PriorityIndicator, PrioritySelect, StatusBadge, StatusSelect, STATUS_OPTIONS,
  TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus,
} from '@/features/tasks';

// Living style guide: every reusable building block with its variants and states.
// Public route (/design-system) so designers and reviewers can open it without an account.

const COLOR_TOKENS = [
  { name: 'primary', className: 'bg-primary', value: '#2563EB' },
  { name: 'primary-hover', className: 'bg-primary-hover', value: '#1D4ED8' },
  { name: 'background', className: 'bg-slate-50 border border-slate-200', value: 'slate-50' },
  { name: 'surface', className: 'bg-white border border-slate-200', value: '#FFFFFF' },
  { name: 'foreground', className: 'bg-slate-900', value: 'slate-900' },
  { name: 'muted-foreground', className: 'bg-slate-500', value: 'slate-500' },
  { name: 'border', className: 'bg-slate-200', value: 'slate-200' },
  { name: 'destructive', className: 'bg-red-600', value: 'red-600' },
];

const SECTIONS = ['Foundations', 'Layout', 'Feedback', 'Data display', 'Forms', 'Task components'] as const;

const Section = ({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) => (
  <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-4">
    <div>
      <h2 id={`${id}-title`} className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
    {children}
  </section>
);

const Specimen = ({ label, children }: { label: string; children: ReactNode }) => (
  <Surface className="space-y-3">
    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
    <div className="flex flex-wrap items-center gap-3">{children}</div>
  </Surface>
);

const toSlug = (title: string) => title.toLowerCase().replace(/\s+/g, '-');

const DesignSystemPage = () => {
  const [status, setStatus] = useState<TaskStatus>('in-progress');
  const [priority, setPriority] = useState<TaskPriority>('high');
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');
  const [title, setTitle] = useState('');

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6 lg:py-12">
        <PageHeader
          title="TaskMan design system"
          description="Tokens, components and patterns shared by every screen. Rules live in DESIGN.md."
          actions={<Link to="/" className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Back to app</Link>}
        />

        <nav aria-label="Sections" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {SECTIONS.map(section => (
            <a key={section} href={`#${toSlug(section)}`} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900">
              {section}
            </a>
          ))}
        </nav>

        <Section id="foundations" title="Foundations" description="Color tokens from index.css (@theme), type scale and radius.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COLOR_TOKENS.map(token => (
              <Surface key={token.name} padding="sm" className="space-y-2">
                <div className={`h-12 rounded-lg ${token.className}`} />
                <p className="text-sm font-medium text-slate-900">{token.name}</p>
                <p className="font-mono text-xs text-slate-500">{token.value}</p>
              </Surface>
            ))}
          </div>
          <Specimen label="Type scale (Inter)">
            <div className="space-y-1">
              <p className="text-2xl font-bold tracking-tight text-slate-900">Page title · 24/700</p>
              <p className="text-lg font-bold text-slate-900">Section title · 18/700</p>
              <p className="text-sm font-semibold text-slate-900">Card heading · 14/600</p>
              <p className="text-sm text-slate-700">Body · 14/400</p>
              <p className="text-xs text-slate-500">Meta · 12/400 · <span className="tabular-nums">Oct 12, 2026</span></p>
            </div>
          </Specimen>
        </Section>

        <Section id="layout" title="Layout" description="AppShell frames authenticated pages; PageHeader, Surface and SectionHeader structure content.">
          <Surface padding="none" className="overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">PageHeader</div>
            <div className="p-5">
              <PageHeader
                title="My Tasks"
                description="Manage and track all your tasks"
                actions={<Button className="h-9 gap-2 bg-primary text-white hover:bg-primary-hover"><Plus className="size-4" />Add Task</Button>}
              />
            </div>
          </Surface>
          <div className="grid gap-4 md:grid-cols-2">
            <Surface>
              <SectionHeader title="Due this week" count={3} icon={<IconTile size="sm"><Clock /></IconTile>} action={<Button variant="ghost" size="sm">View all</Button>} />
              <p className="text-sm text-slate-500">Surface (padding md) with a SectionHeader.</p>
            </Surface>
            <Surface interactive>
              <p className="text-sm font-semibold text-slate-900">Interactive surface</p>
              <p className="text-sm text-slate-500">Lifts on hover; use for clickable cards.</p>
            </Surface>
          </div>
        </Section>

        <Section id="feedback" title="Feedback" description="Alerts for inline messages, skeletons while loading, empty states that point to the next step.">
          <div className="grid gap-3">
            <Alert tone="info">Your session expired. Please sign in again.</Alert>
            <Alert tone="success" title="Saved">Workspace renamed to Acme.</Alert>
            <Alert tone="warning">You're offline. Changes can't be saved until you reconnect.</Alert>
            <Alert tone="error" onDismiss={() => undefined}>This dependency would create a cycle.</Alert>
          </div>
          <SkeletonCards count={4} columns="grid-cols-2 lg:grid-cols-4" />
          <Surface padding="none">
            <EmptyState icon={<FolderKanban />} title="No projects yet" description="Set a Project on a task and it will appear here with its progress." action={<Button className="bg-primary text-white hover:bg-primary-hover">Add task</Button>} />
          </Surface>
        </Section>

        <Section id="data-display" title="Data display" description="Stat cards, tags, progress, avatars and icon tiles.">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard title="Total Tasks" value={24} subtitle="5 pending" icon={<ListTodo />} colorClass="text-slate-600" />
            <StatCard title="In Progress" value={7} subtitle="Being worked on" icon={<Clock />} colorClass="text-blue-600" />
            <StatCard title="Completed" value={12} subtitle="50% of all tasks" icon={<CheckSquare />} colorClass="text-emerald-600" />
            <StatCard title="Overdue" value={2} subtitle="Missed deadlines" icon={<Clock />} colorClass="text-red-600" />
          </div>
          <Specimen label="Tag tones">
            <Tag tone="neutral">Member</Tag>
            <Tag tone="primary">Owner</Tag>
            <Tag tone="dark">Admin</Tag>
            <Tag tone="success">Done</Tag>
            <Tag tone="warning">At risk</Tag>
            <Tag tone="danger">Blocked</Tag>
            <Tag tone="neutral" size="sm">Website v1</Tag>
          </Specimen>
          <Specimen label="Progress">
            <ProgressBar value={35} label="Website v1 progress" showValue className="w-64" />
            <ProgressBar value={100} label="Docs progress" showValue className="w-64" />
          </Specimen>
          <Specimen label="Avatars and icon tiles">
            <UserAvatar name="Ada Lovelace" size="sm" />
            <UserAvatar name="Grace Hopper" />
            <UserAvatar name="Mohamed Reda" size="lg" />
            <IconTile tone="primary"><FolderKanban /></IconTile>
            <IconTile tone="success"><CheckSquare /></IconTile>
            <IconTile tone="warning"><Clock /></IconTile>
            <IconTile tone="danger" size="lg"><Clock /></IconTile>
          </Specimen>
        </Section>

        <Section id="forms" title="Forms" description="Field pairs a visible label with hint or error text wired for screen readers.">
          <Surface className="grid gap-4 md:grid-cols-2">
            <Field label="Title" htmlFor="ds-title" required hint="Short and specific works best.">
              <Input id="ds-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Prepare sprint review" aria-describedby={fieldMessageId('ds-title')} className="h-10 bg-white text-base sm:text-sm" />
            </Field>
            <Field label="Workspace name" htmlFor="ds-error" required error="Workspace name is required">
              <Input id="ds-error" aria-invalid aria-describedby={fieldMessageId('ds-error')} className="h-10 bg-white text-base sm:text-sm" />
            </Field>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button className="bg-primary text-white hover:bg-primary-hover">Primary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button disabled className="bg-primary text-white">Disabled</Button>
            </div>
          </Surface>
        </Section>

        <Section id="task-components" title="Task components" description="Feature building blocks from @/features/tasks, shared by the four task views.">
          <Specimen label="Status and priority">
            {TASK_STATUSES.map(item => <StatusBadge key={item} status={item} />)}
            {TASK_PRIORITIES.map(item => <PriorityIndicator key={item} priority={item} />)}
            <DueDate deadline="2026-10-12" />
            <DueDate deadline="2000-01-01" />
          </Specimen>
          <Specimen label="Inline selects">
            <StatusSelect variant="inline" value={status} onChange={setStatus} />
            <PrioritySelect variant="inline" value={priority} onChange={setPriority} />
          </Specimen>
          <Specimen label="Filter pills">
            <FilterPills
              aria-label="Filter by status"
              value={filter}
              onChange={setFilter}
              options={[{ value: 'all' as const, label: 'All', count: 12 }, ...STATUS_OPTIONS.map((option, index) => ({ ...option, count: [5, 4, 3][index] }))]}
            />
          </Specimen>
        </Section>
      </div>
    </div>
  );
};

export default DesignSystemPage;
