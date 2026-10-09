import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { PageHeader, surfaceVariants } from '@/components/ds';
import { cn } from '@/lib/utils';

interface HelpSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

const HelpSection = ({ title, defaultOpen = false, children }: HelpSectionProps) => (
  <details
    open={defaultOpen}
    className={cn(surfaceVariants({ padding: 'none' }), 'group transition-shadow open:shadow-md')}
  >
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-4 sm:px-5 text-sm font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
      {title}
      <ChevronDown className="size-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
    </summary>
    <div className="space-y-3 px-4 pb-5 sm:px-5 text-sm leading-relaxed text-slate-700">{children}</div>
  </details>
);

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-700">
    {children}
  </kbd>
);

const SHORTCUTS: { keys: ReactNode; action: string }[] = [
  { keys: <Kbd>N</Kbd>, action: 'Create a new task' },
  { keys: <Kbd>/</Kbd>, action: 'Focus the search box' },
  { keys: <><Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> <Kbd>4</Kbd></>, action: 'Switch view: List, Board, Calendar, Timeline' },
];

const HelpPage = () => (
  <AppShell>
    <div className="w-full max-w-3xl space-y-6">
      <PageHeader title="Help center" description="Short guides for getting the most out of TaskMan." />

      <div className="space-y-3">
        <HelpSection title="Getting started" defaultOpen>
          <p>
            A workspace holds your tasks and your team. After onboarding you land on the dashboard, which shows
            totals, what is due this week and what is overdue.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Open <strong>Tasks</strong> in the sidebar and choose <strong>Add Task</strong> to create your first task.</li>
            <li>Give it a title, a due date, a priority and, optionally, a start date and prerequisites.</li>
            <li>
              Invite teammates by email from <strong>Team members</strong>, or share the invite code from the dashboard
              or <strong>Settings</strong>.
            </li>
            <li>Use the workspace switcher at the top of the sidebar to move between workspaces.</li>
          </ul>
        </HelpSection>

        <HelpSection title="The four views">
          <p>All views show the same tasks and stay in sync. Switch between them with the view switcher on the Tasks page.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>List:</strong> a dense table. Click a title, status, priority or date to edit it inline. The
              actions menu on each row is always reachable by keyboard.
            </li>
            <li>
              <strong>Board:</strong> columns for Pending, In Progress and Completed. Drag a card to another column
              to change its status. Without a mouse, open the card menu and choose <strong>Move to…</strong>.
            </li>
            <li>
              <strong>Calendar:</strong> a month grid of deadlines. Click a day to add a task on that date and click
              a chip to edit it.
            </li>
            <li>
              <strong>Timeline:</strong> a Gantt chart of start and due dates. Drag a bar to reschedule it, or focus a
              bar and press <Kbd>←</Kbd> / <Kbd>→</Kbd> to move it one day. <Kbd>Shift</Kbd> + <Kbd>←</Kbd> /{' '}
              <Kbd>→</Kbd> resizes the bar instead.
            </li>
          </ul>
        </HelpSection>

        <HelpSection title="Dependencies and conflicts">
          <p>
            A task can depend on other tasks that must finish first. Pick prerequisites in the task form; the count
            appears on list rows and board cards, and the timeline draws grey arrows between linked bars.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Circular dependencies are rejected with the message "This dependency would create a cycle".</li>
            <li>
              A scheduling conflict appears when a task starts before its prerequisite is due. The timeline shows a
              red dashed arrow so you can move one of the two dates.
            </li>
            <li>Deleting a task removes it from the prerequisites of other tasks.</li>
          </ul>
        </HelpSection>

        <HelpSection title="Teams, roles and permissions">
          <p>
            Every member has a role that decides what they can see and change. Pages and buttons you cannot use are
            hidden, and opening one by link shows an access message instead.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Owners and admins invite people by email under <strong>Team members</strong> and pick a role for each invitation.</li>
            <li>Change a member&apos;s role from the role menu on their row; remove them with the bin button.</li>
            <li>Under <strong>Settings &gt; Roles and permissions</strong> you can create custom roles with exactly the permissions you want.</li>
            <li>Regenerating the invite code stops the old code and links from working; existing members keep access.</li>
          </ul>
        </HelpSection>

        <HelpSection title="Keyboard shortcuts">
          <p>
            These work on the Tasks page whenever you are not typing in a field. Press <Kbd>Esc</Kbd> to leave a field
            first.
          </p>
          <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {SHORTCUTS.map(({ keys, action }) => (
              <div key={action} className="flex items-center justify-between gap-4 px-3 py-2.5">
                <dt className="text-slate-700">{action}</dt>
                <dd className="flex shrink-0 items-center gap-1">{keys}</dd>
              </div>
            ))}
          </dl>
          <h3 className="pt-1 text-sm font-semibold text-slate-900">Moving around</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li><Kbd>Tab</Kbd> and <Kbd>Shift</Kbd> + <Kbd>Tab</Kbd> move focus; the focused control always has a blue outline.</li>
            <li><Kbd>Enter</Kbd> or <Kbd>Space</Kbd> activates buttons and opens menus; <Kbd>Esc</Kbd> closes dialogs and menus.</li>
            <li>Inside a menu, <Kbd>↑</Kbd> and <Kbd>↓</Kbd> move between items.</li>
            <li><Kbd>←</Kbd> <Kbd>→</Kbd> on a timeline bar moves it by a day; add <Kbd>Shift</Kbd> to change its length.</li>
            <li>Board cards offer a <strong>Move to…</strong> menu as an alternative to dragging.</li>
            <li>Choose <strong>Skip to content</strong> (the first Tab stop on every page) to jump past the sidebar.</li>
          </ul>
        </HelpSection>

        <HelpSection title="Account and security">
          <ul className="list-disc space-y-1 pl-5">
            <li>Edit your name, job title and other details under <strong>Settings &gt; Profile</strong>.</li>
            <li>
              Changing your password signs you out of all your other devices. This device stays signed in; the others
              must sign in again with the new password.
            </li>
            <li>If your session expires you are returned to the sign-in page with a notice; your work is saved on the server.</li>
            <li>Forgot your password? Use <strong>Forgot password</strong> on the sign-in page to get a reset link by email.</li>
          </ul>
        </HelpSection>

        <HelpSection title="Contact">
          <p>
            Something not working or missing? Ask a workspace owner first, as they can manage members and invite
            codes from the Team page. For product questions or bug reports, email{' '}
            <a href="mailto:support@taskman.io" className="text-primary font-medium hover:underline">
              support@taskman.io
            </a>{' '}
            with the page you were on and what you expected to happen.
          </p>
        </HelpSection>
      </div>
    </div>
  </AppShell>
);

export default HelpPage;
