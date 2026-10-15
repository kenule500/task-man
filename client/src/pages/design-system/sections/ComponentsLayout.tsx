import { CheckSquare, Clock, FolderKanban, ListTodo, Plus, RefreshCw } from 'lucide-react';
import {
  Alert, EmptyState, ErrorState, IconTile, PageHeader, ProgressBar, ProgressRing, SectionHeader, SkeletonCards,
  StatCard, Surface, toast,
} from '@/components/ds';
import { Button } from '@/components/ui/button';
import { ComponentDoc } from '../kit';

export const PageHeaderDoc = () => (
  <ComponentDoc
    id="c-page-header"
    name="PageHeader"
    source="@/components/ds"
    maturity="stable"
    purpose="The title block of a page: the one h1, a short description and the primary actions. Actions wrap full width on phones."
    anatomy={['Title (h1)', 'Description', 'Actions']}
    variants={
      <div className="w-full space-y-4">
        <PageHeader headingLevel={3} title="My tasks" description="Manage and track all your tasks" actions={<Button><Plus aria-hidden />Add task</Button>} />
        <PageHeader headingLevel={3} title="Projects" />
      </div>
    }
    a11y={['Renders the page h1: use exactly once per page.', 'Actions are real buttons or links in DOM order after the title.']}
    doText="Put the single primary action here and name it with a verb: “Add task”."
    dontText="Add a second filled button, or a different h1 elsewhere on the page."
    code={`<PageHeader
  title="My tasks"
  description="Manage and track all your tasks"
  actions={<Button><Plus />Add task</Button>}
/>`}
    props={[
      { name: 'title', type: 'ReactNode', description: 'Page title, rendered as the h1.' },
      { name: 'headingLevel', type: '1 | 2 | 3', default: '1', description: 'Heading element; only documentation demos change it.' },
      { name: 'description', type: 'ReactNode', description: 'One line under the title.' },
      { name: 'actions', type: 'ReactNode', description: 'Right-aligned on desktop, stacked full width below sm.' },
      { name: 'className', type: 'string', description: 'Merged last.' },
    ]}
  />
);

export const SurfaceDoc = () => (
  <ComponentDoc
    id="c-surface"
    name="Surface"
    source="@/components/ds"
    maturity="stable"
    purpose="The white card that holds every section, list and widget: white, 1px slate-100 border, raised shadow."
    anatomy={['Container', 'Padding', 'Radius']}
    variants={
      <div className="grid w-full gap-3 sm:grid-cols-3">
        <Surface padding="sm" radius="lg">Small, lg radius</Surface>
        <Surface>Medium (default)</Surface>
        <Surface padding="lg">Large padding</Surface>
      </div>
    }
    states={[
      { label: 'Static', node: <Surface padding="sm">Plain card</Surface> },
      { label: 'Interactive (hover to lift)', node: <Surface padding="sm" interactive>Hover me</Surface> },
    ]}
    a11y={['Renders a div by default. Use as="section" with a heading, or as="article" for repeating items.', 'An interactive Surface is only a style: put the link or button inside it, not an onClick on the card.']}
    doText="Use one Surface per concern and a SectionHeader for its title."
    dontText="Nest a Surface in a Surface, or add a custom shadow per page."
    code={`<Surface as="section" aria-labelledby="due">
  <SectionHeader title="Due this week" count={3} />
  ...
</Surface>`}
    props={[
      { name: 'padding', type: "'none' | 'sm' | 'md' | 'lg'", default: "'md'", description: 'Inner spacing: none, 16px, 20px, 24–32px.' },
      { name: 'radius', type: "'lg' | 'xl'", default: "'xl'", description: '12px or 16px corners.' },
      { name: 'interactive', type: 'boolean', default: 'false', description: 'Adds the hover lift.' },
      { name: 'as', type: "'div' | 'section' | 'article'", default: "'div'", description: 'Element to render.' },
    ]}
  />
);

export const SectionHeaderDoc = () => (
  <ComponentDoc
    id="c-section-header"
    name="SectionHeader"
    source="@/components/ds"
    maturity="stable"
    purpose="The heading row inside a Surface: title, optional icon, count and a trailing action."
    anatomy={['Icon', 'Title (h2)', 'Count', 'Action']}
    variants={
      <Surface className="w-full">
        <SectionHeader title="Due this week" count={3} icon={<IconTile size="sm"><Clock /></IconTile>} action={<Button variant="ghost" size="sm">View all</Button>} />
        <SectionHeader title="Recent activity" className="mb-0" />
      </Surface>
    }
    a11y={['Renders an h2. Pick a Surface heading level that continues the page outline.', 'The count is plain text and is read after the title.']}
    doText="Keep titles to 2–4 words and put the count next to them."
    dontText="Put long descriptions or several buttons in the action slot."
    code={`<SectionHeader
  title="Due this week"
  count={3}
  action={<Button variant="ghost" size="sm">View all</Button>}
/>`}
    props={[
      { name: 'title', type: 'ReactNode', description: 'Heading text (truncates).' },
      { name: 'count', type: 'number', description: 'Small badge after the title.' },
      { name: 'icon', type: 'ReactNode', description: 'Leading icon, usually an IconTile.' },
      { name: 'action', type: 'ReactNode', description: 'Trailing control.' },
    ]}
  />
);

export const StatCardDoc = () => (
  <ComponentDoc
    id="c-stat-card"
    name="StatCard"
    source="@/components/ds"
    maturity="stable"
    purpose="A key number with a label, used in the stat row of dashboards and task pages."
    anatomy={['Icon', 'Title', 'Value', 'Subtitle']}
    variants={
      <div className="grid w-full grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Total tasks" value={24} subtitle="5 pending" icon={<ListTodo />} colorClass="text-slate-600" />
        <StatCard title="In progress" value={7} subtitle="Being worked on" icon={<Clock />} colorClass="text-blue-600" />
        <StatCard title="Completed" value={12} subtitle="50% of all tasks" icon={<CheckSquare />} colorClass="text-success-fg" />
        <StatCard title="Overdue" value={2} subtitle="Missed deadlines" icon={<Clock />} colorClass="text-danger-fg" />
      </div>
    }
    a11y={['The icon is decorative (aria-hidden); the title carries the meaning.', 'Numbers use tabular-nums so rows do not jitter.']}
    doText="Show four or fewer cards and keep the subtitle factual."
    dontText="Use color alone to say “bad”. Overdue is red and also named."
    code={`<StatCard title="Overdue" value={2} subtitle="Missed deadlines" icon={<Clock />} colorClass="text-danger-fg" />`}
    props={[
      { name: 'title', type: 'string', description: 'Label next to the icon.' },
      { name: 'value', type: 'ReactNode', description: 'The number.' },
      { name: 'subtitle', type: 'ReactNode', description: 'Small supporting text.' },
      { name: 'icon', type: 'ReactNode', description: 'Decorative icon.' },
      { name: 'colorClass', type: 'string', default: "'text-primary'", description: 'Text color class of the icon.' },
    ]}
  />
);

export const AlertDoc = () => (
  <ComponentDoc
    id="c-alert"
    name="Alert"
    source="@/components/ds"
    maturity="stable"
    purpose="An inline message tied to the content around it: info, success, warning or error. Use a toast for transient confirmations."
    anatomy={['Icon', 'Title', 'Message', 'Dismiss']}
    variants={
      <div className="grid w-full gap-3">
        <Alert tone="info">Your session expired. Sign in again to continue.</Alert>
        <Alert tone="success" title="Saved">Workspace renamed to Acme.</Alert>
        <Alert tone="warning">You are offline. Changes cannot be saved until you reconnect.</Alert>
        <Alert tone="error" onDismiss={() => undefined}>This dependency would create a cycle.</Alert>
      </div>
    }
    states={[
      { label: 'Dismissible', node: <Alert tone="info" onDismiss={() => undefined}>Dismiss me</Alert> },
      { label: 'With title', node: <Alert tone="warning" title="Heads up">Sprint ends tomorrow.</Alert> },
    ]}
    a11y={['Errors use role="alert" (announced immediately); other tones use role="status" (polite).', 'Dismiss is a button named “Dismiss”.', 'Icon plus text, so the tone never relies on color.']}
    doText="Say what happened and what to do: “Start date must be on or before the due date.”"
    dontText="Stack more than two alerts, or use an alert for a result the user just caused (use a toast)."
    code={`<Alert tone="error" title="Could not save">
  Check your connection and try again.
</Alert>`}
    props={[
      { name: 'tone', type: "'info' | 'success' | 'warning' | 'error'", default: "'info'", description: 'Meaning and color.' },
      { name: 'title', type: 'ReactNode', description: 'Bold first line.' },
      { name: 'onDismiss', type: '() => void', description: 'Shows a Dismiss button.' },
      { name: 'children', type: 'ReactNode', description: 'Message.' },
    ]}
  />
);

export const EmptyStateDoc = () => (
  <ComponentDoc
    id="c-empty-state"
    name="EmptyState"
    source="@/components/ds"
    maturity="stable"
    purpose="Explains why a list is empty and offers the next step. Never leave an empty box."
    anatomy={['Icon', 'Title', 'Description', 'Action']}
    variants={
      <Surface padding="none" className="w-full">
        <EmptyState icon={<FolderKanban />} title="No projects yet" description="Create a project to group tasks into sprints." action={<Button><Plus aria-hidden />New project</Button>} />
      </Surface>
    }
    a11y={['Title is an h3: place it under a section heading.', 'The icon is decorative.']}
    doText="Differentiate “nothing yet” from “no results for this filter” and offer a way out of each."
    dontText="Write “No data” or leave the action out when the person can create something."
    code={`<EmptyState
  icon={<FolderKanban />}
  title="No projects yet"
  description="Create a project to group tasks into sprints."
  action={<Button>New project</Button>}
/>`}
    props={[
      { name: 'title', type: 'string', description: 'What is empty.' },
      { name: 'description', type: 'string', description: 'Why, and what to do.' },
      { name: 'icon', type: 'ReactNode', description: 'Defaults to an info icon.' },
      { name: 'action', type: 'ReactNode', description: 'Primary next step.' },
    ]}
  />
);

export const ErrorStateDoc = () => (
  <ComponentDoc
    id="c-error-state"
    name="ErrorState"
    source="@/components/ds"
    maturity="beta"
    purpose="A failed page or panel, written as what happened, why, and what to do. For inline field problems use Alert."
    anatomy={['Icon', 'What happened', 'Why', 'What to do', 'Action']}
    variants={
      <Surface padding="none" className="w-full">
        <ErrorState
          title="We could not load your tasks"
          reason="The server did not respond."
          nextStep="Check your connection, then try again."
          action={<Button variant="outline"><RefreshCw aria-hidden />Try again</Button>}
        />
      </Surface>
    }
    a11y={['Container has role="alert" so the message is announced when it appears.', 'Move focus to the retry button only when the failure replaces the whole page.']}
    doText="Keep the three parts: “We could not save your changes. You are offline. Reconnect and try again.”"
    dontText="Show “Something went wrong” or a stack trace."
    code={`<ErrorState
  title="We could not load your tasks"
  reason="The server did not respond."
  nextStep="Check your connection, then try again."
  action={<Button variant="outline" onClick={retry}>Try again</Button>}
/>`}
    props={[
      { name: 'title', type: 'string', description: 'What happened.' },
      { name: 'reason', type: 'string', description: 'Why, in plain words.' },
      { name: 'nextStep', type: 'string', description: 'What the person can do.' },
      { name: 'action', type: 'ReactNode', description: 'Recovery button.' },
    ]}
  />
);

export const SkeletonCardsDoc = () => (
  <ComponentDoc
    id="c-skeleton-cards"
    name="SkeletonCards"
    source="@/components/ds"
    maturity="stable"
    purpose="Placeholder cards that keep the layout stable while a page loads. Prefer them to spinners."
    anatomy={['Grid', 'Card', 'Skeleton bars']}
    variants={<div className="w-full"><SkeletonCards count={3} columns="grid-cols-1 sm:grid-cols-3" /></div>}
    a11y={['The grid is aria-busy with a “Loading” label.', 'Skeletons are not focusable and have no text, so the real content replaces them without a focus jump.']}
    doText="Match the shape of the content that will load."
    dontText="Show a skeleton for more than a few seconds without an error or timeout path."
    code={`{loading ? <SkeletonCards count={4} /> : <Stats />}`}
    props={[
      { name: 'count', type: 'number', default: '4', description: 'Number of placeholder cards.' },
      { name: 'columns', type: 'string', default: "'md:grid-cols-2 lg:grid-cols-4'", description: 'Grid column classes.' },
    ]}
  />
);

export const ProgressBarDoc = () => (
  <ComponentDoc
    id="c-progress-bar"
    name="ProgressBar"
    source="@/components/ds"
    maturity="stable"
    purpose="Thin completion bar; turns green at 100%. Use for task and project progress in lists."
    anatomy={['Track', 'Fill', 'Value']}
    variants={
      <div className="grid w-full gap-3 sm:grid-cols-2">
        <ProgressBar value={35} label="Website v1 progress" showValue />
        <ProgressBar value={100} label="Docs progress" showValue />
      </div>
    }
    states={[
      { label: 'Empty (0%)', node: <ProgressBar value={0} label="Not started" showValue className="w-full" /> },
      { label: 'Over 100 is clamped', node: <ProgressBar value={140} label="Clamped" showValue className="w-full" /> },
    ]}
    a11y={['role="progressbar" with aria-valuenow, min and max, and a required label.', 'Pair with a number when exact progress matters.']}
    doText="Label what is progressing: “Sprint 4 progress”."
    dontText="Use it for indeterminate loading; use a skeleton."
    code={`<ProgressBar value={35} label="Website v1 progress" showValue />`}
    props={[
      { name: 'value', type: 'number', description: '0–100, clamped.' },
      { name: 'label', type: 'string', description: 'Accessible name (required).' },
      { name: 'showValue', type: 'boolean', default: 'false', description: 'Percentage text beside the bar.' },
    ]}
  />
);

export const ProgressRingDoc = () => (
  <ComponentDoc
    id="c-progress-ring"
    name="ProgressRing"
    source="@/components/ds"
    maturity="beta"
    purpose="Circular progress for compact cards: sprint and project folder cards, the profile checklist."
    anatomy={['Track', 'Arc', 'Value']}
    variants={
      <>
        <ProgressRing value={25} label="Sprint 3 progress" />
        <ProgressRing value={68} label="Sprint 4 progress" size={64} />
        <ProgressRing value={100} label="Sprint 2 progress" />
        <ProgressRing value={40} label="Sprint 5 progress" size={32} strokeWidth={4} showValue={false} />
      </>
    }
    a11y={['The wrapper has role="progressbar" with value and name; the svg is hidden from assistive tech.', 'Do not rely on the arc alone: keep the percentage visible at 40px or larger.']}
    doText="Use for one value per card, near its name."
    dontText="Use a ring for lists of many rows; use ProgressBar there."
    code={`<ProgressRing value={68} label="Sprint 4 progress" size={64} />`}
    props={[
      { name: 'value', type: 'number', description: '0–100, clamped.' },
      { name: 'label', type: 'string', description: 'Accessible name (required).' },
      { name: 'size', type: 'number', default: '48', description: 'Diameter in px.' },
      { name: 'strokeWidth', type: 'number', default: '5', description: 'Arc thickness in px.' },
      { name: 'showValue', type: 'boolean', default: 'true', description: 'Percentage in the middle.' },
    ]}
  />
);

export const ToastDoc = () => (
  <ComponentDoc
    id="c-toast"
    name="Toast"
    source="@/components/ds · toast() + Toaster"
    maturity="stable"
    purpose="Transient feedback after an action, with an optional action such as Undo. Mounted once by the app shell."
    anatomy={['Title', 'Description', 'Action', 'Dismiss']}
    variants={
      <>
        <Button variant="outline" onClick={() => toast.success('Task created')}>Success toast</Button>
        <Button variant="outline" onClick={() => toast.error('Could not save your change.')}>Error toast</Button>
        <Button
          variant="outline"
          onClick={() => toast({ title: 'Task deleted', description: 'Launch v1', action: { label: 'Undo', onClick: () => toast.success('Task restored') } })}
        >
          Toast with action (Undo)
        </Button>
      </>
    }
    a11y={['The region is a polite live region; error toasts use role="alert" so they are announced immediately.', 'The countdown pauses while a toast is hovered or focused (pauseOnHover), and a toast never holds the only copy of important information.', 'The Undo action is a real button in the tab order.']}
    doText="Confirm with the result: “Task created”, “Task deleted” plus Undo."
    dontText="Use a toast for validation errors (use inline messages) or for anything the person must read."
    code={`toast.success('Task created');
toast({
  title: 'Task deleted',
  description: 'Launch v1',
  action: { label: 'Undo', onClick: restore },
});`}
    props={[
      { name: 'toast(options)', type: 'ToastOptions', description: 'title, description, tone, duration (0 = until dismissed), action, pauseOnHover.' },
      { name: 'toast.success(text)', type: 'string', description: 'Green confirmation.' },
      { name: 'toast.error(text)', type: 'string', description: 'Red failure message.' },
      { name: 'action', type: '{ label; onClick }', description: 'Optional button, typically Undo.' },
    ]}
  />
);
