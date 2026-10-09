import { useRef, useState, type FormEvent } from 'react';
import {
  CheckSquare, FolderKanban, LayoutDashboard, Menu, Plus, RefreshCw, Search, Undo2,
} from 'lucide-react';
import {
  Alert, EmptyState, ErrorState, Field, Kbd, SkeletonCards, Surface, Tag, fieldMessageId, toast,
} from '@/components/ds';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { CodeBlock, DataTable, DoDont, DocSection, Prose, Specimen } from '../kit';

// ---------------------------------------------------------------------------
// Forms and validation
// ---------------------------------------------------------------------------

const FormDemo = () => {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [errors, setErrors] = useState<{ name?: string; key?: string }>({});
  const [saved, setSaved] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Enter a project name.';
    if (!/^[A-Z]{2,5}$/.test(key)) next.key = 'Use 2 to 5 capital letters, for example WEB.';
    setErrors(next);
    setSaved(false);
    if (next.name) nameRef.current?.focus();
    else if (next.key) keyRef.current?.focus();
    else setSaved(true);
  };

  const count = Object.keys(errors).length;
  return (
    <form noValidate onSubmit={submit} className="w-full max-w-md space-y-4" aria-label="Create project example">
      {count > 0 && (
        <Alert tone="error" title={`Fix ${count} ${count === 1 ? 'field' : 'fields'} to continue`}>
          Errors are listed under each field.
        </Alert>
      )}
      {saved && <Alert tone="success">Project created.</Alert>}
      <Field label="Project name" htmlFor="pattern-name" required error={errors.name} hint="Shown in the sidebar and on reports.">
        <Input ref={nameRef} id="pattern-name" value={name} onChange={event => setName(event.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={fieldMessageId('pattern-name')} className="h-10 bg-white text-base sm:text-sm" />
      </Field>
      <Field label="Project key" htmlFor="pattern-key" required error={errors.key} hint="Prefix of task numbers, like WEB-12.">
        <Input ref={keyRef} id="pattern-key" value={key} onChange={event => setKey(event.target.value.toUpperCase())} aria-invalid={Boolean(errors.key)} aria-describedby={fieldMessageId('pattern-key')} className="h-10 bg-white text-base sm:text-sm" />
      </Field>
      <Button type="submit" className="w-full bg-primary text-white hover:bg-primary-hover sm:w-auto">Create project</Button>
    </form>
  );
};

export const FormsPatternSection = () => (
  <DocSection id="p-forms" title="Forms and validation" description="Labels you can see, errors you can fix, and a button that says what it does.">
    <Specimen label="Live example: submit it empty" bare><FormDemo /></Specimen>
    <Prose>
      <ul>
        <li><strong>Validate on submit</strong>, then re-validate each field on change. Do not show errors while someone is still typing their first answer.</li>
        <li>Show the message under the field with <code>Field</code> and mark the control <code>aria-invalid</code>. For two or more errors add an error alert at the top.</li>
        <li><strong>Move focus</strong> to the first invalid field after a failed submit.</li>
        <li>Mark required fields, not optional ones. Set <code>autoComplete</code> and the right <code>type</code>.</li>
        <li>The submit button keeps its label while busy (“Creating…”), disables repeat clicks, and never relies on a spinner alone.</li>
        <li>Keep the person’s input after an error. On phones dialogs are near full screen with a sticky footer so the button stays reachable.</li>
      </ul>
    </Prose>
    <CodeBlock label="Pattern" code={`const submit = (event: FormEvent) => {
  event.preventDefault();
  const next = validate(values);
  setErrors(next);
  if (next.name) nameRef.current?.focus();
};`} />
  </DocSection>
);

// ---------------------------------------------------------------------------
// Empty, loading, error
// ---------------------------------------------------------------------------

export const StatesPatternSection = () => (
  <DocSection id="p-states" title="Empty, loading and error states" description="Every list, page and panel has all three, designed on purpose.">
    <div className="grid gap-4 lg:grid-cols-2">
      <Surface padding="none">
        <EmptyState icon={<FolderKanban />} title="No projects yet" description="Create a project to plan sprints and track progress." action={<Button className="bg-primary text-white hover:bg-primary-hover"><Plus aria-hidden />New project</Button>} />
      </Surface>
      <Surface padding="none">
        <EmptyState icon={<Search />} title="No tasks match these filters" description="Try a different status or clear the search." action={<Button variant="outline">Clear filters</Button>} />
      </Surface>
      <div className="lg:col-span-2"><SkeletonCards count={4} columns="grid-cols-2 lg:grid-cols-4" /></div>
      <Surface padding="none" className="lg:col-span-2">
        <ErrorState title="We could not load your tasks" reason="The server did not respond." nextStep="Check your connection, then try again." action={<Button variant="outline"><RefreshCw aria-hidden />Try again</Button>} />
      </Surface>
    </div>
    <DataTable
      caption="Which state to use"
      columns={['Situation', 'Use', 'Why']}
      rows={[
        ['First visit, nothing created', 'EmptyState with a create action', 'Teaches what the page is for'],
        ['Filters or search return nothing', 'EmptyState with “Clear filters”', 'The data exists; the view is narrow'],
        ['Waiting for the first response', 'SkeletonCards or skeleton rows', 'Keeps layout stable; no spinner'],
        ['A request failed', 'ErrorState (page) or Alert (inline)', 'Say what happened, why and what to do'],
        ['Offline', 'Amber Alert banner; keep cached shell', 'Changes cannot be saved; say so'],
      ]}
    />
  </DocSection>
);

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

const FeedbackDemo = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => toast({ title: 'Task deleted', description: 'Launch v1', action: { label: 'Undo', onClick: () => toast.success('Task restored') } })}>
        <Undo2 aria-hidden />Delete task (Undo toast)
      </Button>
      <Button variant="destructive" onClick={() => setOpen(true)}>Remove member (confirm)</Button>
      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove Ada Lovelace?"
        description="Ada will lose access to this workspace. Her tasks stay and become unassigned."
        confirmLabel="Remove member"
        onConfirm={() => { setOpen(false); toast.success('Member removed'); }}
      />
    </>
  );
};

export const FeedbackPatternSection = () => (
  <DocSection id="p-feedback" title="Feedback" description="Update immediately, say what happened, and make mistakes cheap to undo.">
    <Specimen label="Try it"><FeedbackDemo /></Specimen>
    <DataTable
      caption="Feedback channels"
      columns={['Channel', 'Use for', 'Duration']}
      rows={[
        ['Optimistic update', 'Moving, editing, completing: the UI changes first, rolls back on failure', 'Instant'],
        ['Toast', 'Result of an action the person just did (created, saved, deleted)', '5s, errors 8s'],
        ['Undo toast', 'Deleting a task. The request is sent when the toast expires', '6s'],
        ['Inline Alert', 'A problem with the page or form that stays until fixed', 'Until resolved'],
        ['Confirm dialog', 'Only what cannot be undone: remove member, delete role, regenerate invite code', 'Until answered'],
      ]}
    />
    <DoDont
      doText="Name the button after the action in the confirm dialog (“Remove member”) and explain the consequence."
      dontText="Ask “Are you sure?” for something Undo can reverse, or confirm with “OK”."
    />
  </DocSection>
);

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const MockTab = ({ icon: Icon, label, active }: { icon: typeof Menu; label: string; active?: boolean }) => (
  <div className={cn('relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', active ? 'text-primary' : 'text-text-subtle')}>
    {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />}
    <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
    {label}
  </div>
);

const RESULTS = [
  { icon: LayoutDashboard, label: 'Go to Dashboard', hint: 'Navigate' },
  { icon: CheckSquare, label: 'Go to Tasks', hint: 'Navigate' },
  { icon: Plus, label: 'Create task', hint: 'Action' },
];

export const NavigationPatternSection = () => (
  <DocSection id="p-navigation" title="Navigation" description="Sidebar on desktop, bottom tab bar on phones, command palette everywhere.">
    <div className="grid gap-4 lg:grid-cols-2">
      <Specimen label="Mobile bottom tab bar (below 768px)" bare>
        <div aria-hidden inert className="mx-auto w-full max-w-xs overflow-hidden rounded-2xl border border-border bg-canvas">
          <div className="h-24 p-3 text-xs text-text-subtle">Page content scrolls behind the bar</div>
          <div className="flex border-t border-border bg-white/95 px-2 pb-[env(safe-area-inset-bottom)]">
            <MockTab icon={LayoutDashboard} label="Home" />
            <MockTab icon={CheckSquare} label="Tasks" active />
            <MockTab icon={FolderKanban} label="Projects" />
            <MockTab icon={Menu} label="Menu" />
          </div>
        </div>
        <p className="mt-3 text-xs text-text-subtle">Static mock; the real bar is <code className="font-mono">components/MobileTabBar.tsx</code> and needs the router, the workspace and permissions.</p>
      </Specimen>
      <Specimen label="Command palette (Ctrl/Cmd + K)" bare>
        <div aria-hidden inert className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-border bg-white shadow-overlay">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 text-sm text-text-subtle"><Search className="size-4" />Search pages and actions…<Kbd size="sm" className="ml-auto">Esc</Kbd></div>
          <ul className="p-1.5">
            {RESULTS.map((result, index) => (
              <li key={result.label} className={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-text-body', index === 0 && 'bg-primary/10 text-text-strong')}>
                <result.icon className="size-4" />{result.label}<span className="ml-auto text-xs text-text-subtle">{result.hint}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-3 border-t border-border px-3 py-2 text-[11px] text-text-subtle"><span><Kbd size="sm">↑</Kbd> <Kbd size="sm">↓</Kbd> move</span><span><Kbd size="sm">Enter</Kbd> open</span></div>
        </div>
        <p className="mt-3 text-xs text-text-subtle">Static mock; the real one is <code className="font-mono">components/CommandPalette.tsx</code>.</p>
      </Specimen>
    </div>
    <Prose>
      <ul>
        <li><strong>Sidebar</strong> (md and up): workspace switcher on top, primary destinations, settings at the bottom. Below md it is a sheet opened from the tab bar’s Menu item.</li>
        <li><strong>Tab bar</strong>: four to five items, 48px tall, icon plus label, <code>aria-current="page"</code> on the active one, padded by <code>env(safe-area-inset-bottom)</code>. Slots a role cannot use stay empty so positions do not shift.</li>
        <li><strong>Command palette</strong>: opens with Ctrl/Cmd+K from anywhere, is a labelled dialog with a combobox and listbox, Arrow keys move, Enter runs, Escape closes. Results respect permissions.</li>
        <li><strong>Breadcrumbs</strong> appear only three or more levels deep (Projects › Website › Sprint 4).</li>
      </ul>
    </Prose>
  </DocSection>
);

// ---------------------------------------------------------------------------
// Data views
// ---------------------------------------------------------------------------

export const DataViewsPatternSection = () => (
  <DocSection id="p-data-views" title="Data views" description="Four views of the same tasks. They share TaskViewProps and the same data from useTasks.">
    <DataTable
      caption="Data view rules"
      columns={['View', 'Desktop', 'Phone', 'Keyboard alternative to drag']}
      rows={[
        ['List', 'Grid table, uppercase 12px headers, inline editing on hover or focus', 'Stacked cards; actions always visible', 'Row actions menu: Edit, Move to…'],
        ['Board', 'Three columns on slate-50; white cards with a priority top accent', 'Horizontal snap scroller', 'Card menu “Move to…”'],
        ['Calendar', 'Month grid, six weeks, today in a filled blue circle', 'Agenda list by day', 'Task menu “Change date”'],
        ['Timeline', 'Sticky name column, day/week zoom, today line, dependency arrows', 'Scrolls inside its own container', 'Arrows move bars, Shift+arrows resize'],
      ]}
    />
    <Prose>
      <ul>
        <li>The toolbar is shared: SegmentedControl for the view, FilterPills with counts for status, SearchInput, priority and sort.</li>
        <li>Every view needs list, loading, empty and error states, and keeps the selected view in the URL (<code>?view=board</code>).</li>
        <li>Overdue is red text plus a screen-reader “(overdue)”; dependency conflicts are dashed red.</li>
      </ul>
    </Prose>
  </DocSection>
);

// ---------------------------------------------------------------------------
// Mobile and PWA
// ---------------------------------------------------------------------------

export const MobilePatternSection = () => (
  <DocSection id="p-mobile" title="Mobile and PWA" description="Phones are the default canvas; the installed app should feel native.">
    <div className="grid gap-4 md:grid-cols-2">
      <Specimen label="Touch targets: 44px" bare>
        <div className="flex items-end gap-4">
          <div className="text-center">
            <div className="flex size-11 items-center justify-center rounded-lg border-2 border-dashed border-primary/50 bg-primary/5"><span className="size-6 rounded-md bg-primary/80" /></div>
            <p className="mt-1 text-xs text-text-subtle">44px hit area, 24px icon</p>
          </div>
          <div className="text-center">
            <div className="flex size-8 items-center justify-center rounded-lg border-2 border-dashed border-red-300 bg-red-50"><span className="size-4 rounded bg-red-400" /></div>
            <p className="mt-1 text-xs text-text-subtle">32px: too small on touch</p>
          </div>
        </div>
      </Specimen>
      <Alert tone="warning" title="Offline">You are offline. Changes cannot be saved until you reconnect.</Alert>
    </div>
    <CodeBlock label="Safe areas" code={`/* fixed bars respect the notch and the home indicator */
className="fixed inset-x-0 bottom-0 pb-[env(safe-area-inset-bottom)]
           pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"`} />
    <Prose>
      <ul>
        <li><strong>Safe areas:</strong> any fixed element pads with <code>env(safe-area-inset-*)</code>; the viewport uses <code>viewport-fit=cover</code>.</li>
        <li><strong>Targets:</strong> at least 44px on phones (48px for the tab bar). Hover-only actions are always visible on touch.</li>
        <li><strong>Inputs:</strong> 16px text below sm to avoid iOS zoom; correct <code>inputmode</code> and <code>autocomplete</code>.</li>
        <li><strong>Install:</strong> manifest with icons, theme <code>#2563EB</code>, standalone display. The install prompt appears after a successful action, never on first load.</li>
        <li><strong>Offline:</strong> the service worker caches the app shell only; API responses are never cached because they are private. An amber banner shows when offline and writes are blocked.</li>
        <li><strong>Updates</strong> are opt-in through a “New version available” prompt, never a surprise reload.</li>
      </ul>
    </Prose>
    <Tag tone="neutral">Test at 360px: no horizontal page scroll</Tag>
  </DocSection>
);
