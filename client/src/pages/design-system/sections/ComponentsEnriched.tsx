import { useState } from 'react';
import { CalendarDays, Settings2 } from 'lucide-react';
import {
  Banner, DescriptionItem, DescriptionList, OptionCombobox, Pagination, SkeletonBoard, SkeletonChart, SkeletonDetail,
  SkeletonList, SkeletonTable, Stepper, SwitchField, TagInput, UserAvatar, type ComboboxOption,
} from '@/components/ds';
import { Button, buttonVariants } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { ComponentDoc } from '../kit';

// Components added to complete the set: Switch, Skeleton variants, Pagination, Stepper, Banner, Popover,
// HoverCard, Combobox, DescriptionList and TagInput.

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

const SwitchDemo = ({ size, label }: { size?: 'sm' | 'md'; label: string }) => {
  const [checked, setChecked] = useState(true);
  return <SwitchField size={size} label={label} checked={checked} onCheckedChange={setChecked} className="w-64" />;
};

export const SwitchDoc = () => (
  <ComponentDoc
    id="c-switch"
    name="Switch"
    source="@/components/ui/switch · @/components/ds (SwitchField)"
    maturity="stable"
    purpose="Turn one setting on or off with immediate effect (notification emails, a rule being active). Use a Checkbox when the choice is applied later with a Save button."
    anatomy={['Track', 'Thumb', 'Label', 'Description (optional)']}
    variants={
      <>
        <SwitchDemo label="Medium switch" />
        <SwitchDemo size="sm" label="Small switch" />
        <SwitchField
          label="Weekly digest"
          description="One email every Monday with what changed."
          defaultChecked
          className="w-full max-w-md"
        />
      </>
    }
    states={[
      { label: 'Off', node: <Switch aria-label="Off example" /> },
      { label: 'On', node: <Switch aria-label="On example" defaultChecked /> },
      { label: 'Focus-visible (Tab to it)', node: <Switch aria-label="Focus example" className="outline-2 outline-offset-2 outline-focus" /> },
      { label: 'Disabled off', node: <Switch aria-label="Disabled off example" disabled /> },
      { label: 'Disabled on', node: <Switch aria-label="Disabled on example" disabled defaultChecked /> },
    ]}
    a11y={[
      'Exposed with the switch role and aria-checked; Space toggles it and the label text is clickable.',
      'Always named: SwitchField wires the label and description with aria-labelledby and aria-describedby; a bare Switch needs aria-label.',
      'The off track is slate-500 against the white thumb (3:1 or more) so the state does not rely on color alone; the thumb position also changes.',
      'The hit area extends past the track (44px on touch) and the thumb transition stops under prefers-reduced-motion.',
    ]}
    doText="Label the setting, not the action (“Weekly digest”), and apply the change at once with a toast on failure."
    dontText="Use a switch inside a form that needs a Save button, or for choosing between two named options (use SegmentedControl)."
    code={`<SwitchField
  label="Weekly digest"
  description="One email every Monday."
  checked={enabled}
  onCheckedChange={setEnabled}
/>

<Switch aria-label="Rule: Close stale tasks" size="sm" checked={on} onCheckedChange={setOn} />`}
    props={[
      { name: 'checked / defaultChecked', type: 'boolean', description: 'Controlled or initial state.' },
      { name: 'onCheckedChange', type: '(checked: boolean) => void', description: 'Called when toggled.' },
      { name: 'size', type: "'sm' | 'md'", default: "'md'", description: '20 or 24px tall track.' },
      { name: 'disabled', type: 'boolean', description: 'Dims and blocks interaction.' },
      { name: 'label / description', type: 'ReactNode', description: 'SwitchField only: visible text beside the switch.' },
      { name: 'switchPosition', type: "'start' | 'end'", default: "'end'", description: 'SwitchField only: side of the switch.' },
    ]}
  />
);

// ---------------------------------------------------------------------------
// Skeleton variants
// ---------------------------------------------------------------------------

export const SkeletonVariantsDoc = () => (
  <ComponentDoc
    id="c-skeleton-variants"
    name="Skeleton variants"
    source="@/components/ds"
    maturity="stable"
    purpose="Loading placeholders that copy the shape of the content they replace (list, board, table, chart, detail body) so the page does not jump when data arrives. Prefer them to spinners for first loads."
    anatomy={['Live region (role="status", aria-busy)', 'Hidden “Loading …” text', 'Shaped bars']}
    variants={
      <div className="grid w-full min-w-0 gap-4 lg:grid-cols-2">
        <SkeletonList rows={3} label="Loading list example" />
        <SkeletonTable rows={3} columns={3} label="Loading table example" />
        <SkeletonChart label="Loading chart example" height="h-32" bars={6} />
        <SkeletonDetail label="Loading detail example" fields={2} lines={2} />
        <div className="min-w-0 lg:col-span-2"><SkeletonBoard columns={3} cards={2} label="Loading board example" /></div>
      </div>
    }
    a11y={[
      'Each variant is one live region: aria-busy="true" with a visually hidden label such as “Loading tasks”. The bars are aria-hidden.',
      'Name what is loading (label="Loading audit log"), not just “Loading”.',
      'The pulse stops under prefers-reduced-motion; the layout is the signal.',
      'Replace the whole region with the real content; do not keep both mounted.',
    ]}
    doText="Pick the variant that matches the final layout: SkeletonBoard for the board, SkeletonTable for tables, SkeletonList for rows."
    dontText="Show a skeleton for a refresh of content that is already on screen (keep the old data and show a small busy indicator instead)."
    code={`{loading ? <SkeletonList label="Loading tasks" rows={6} /> : <TaskList />}
{loading ? <SkeletonBoard label="Loading board" /> : <Board />}
{loading ? <SkeletonTable label="Loading audit log" columns={4} /> : <Table />}`}
    props={[
      { name: 'label', type: 'string', description: 'Announced to screen readers; each variant has a sensible default.' },
      { name: 'rows / columns / cards', type: 'number', description: 'How many placeholder rows, columns or cards.' },
      { name: 'avatar / trailing', type: 'boolean', default: 'true', description: 'SkeletonList: leading avatar and trailing pill.' },
      { name: 'bare', type: 'boolean', default: 'false', description: 'SkeletonList and SkeletonChart: skip the surrounding card.' },
      { name: 'height / bars', type: 'string / number', description: 'SkeletonChart: plot height class and bar count.' },
      { name: 'fields / lines', type: 'number', description: 'SkeletonDetail: key/value rows and paragraph lines.' },
    ]}
  />
);

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

const PaginationDemo = () => {
  const [page, setPage] = useState(4);
  const [pageSize, setPageSize] = useState(10);
  return (
    <div className="w-full min-w-0">
      <Pagination
        label="Example results"
        page={page}
        total={243}
        pageSize={pageSize}
        onPageChange={setPage}
        pageSizeOptions={[10, 25, 50]}
        onPageSizeChange={size => { setPageSize(size); setPage(1); }}
      />
    </div>
  );
};

export const PaginationDoc = () => (
  <ComponentDoc
    id="c-pagination"
    name="Pagination"
    source="@/components/ds"
    maturity="stable"
    purpose="Move through a long list in pages. Numbered mode shows the first, last and nearby pages with an ellipsis; compact mode is Previous/Next with a summary, for cursor-based lists where the page count is unknown (the audit log)."
    anatomy={['Summary (“x–y of z”)', 'Page size select', 'Previous', 'Page numbers', 'Next']}
    variants={
      <>
        <PaginationDemo />
        <div className="w-full min-w-0">
          <Pagination
            compact
            label="Example cursor pages"
            summary="Showing entries from 2 Oct 2026, 09:10 to 2 Oct 2026, 14:42"
            previousLabel="Newer"
            nextLabel="Older"
            hasPrevious={false}
            hasNext
            onPrevious={() => undefined}
            onNext={() => undefined}
          />
        </div>
      </>
    }
    a11y={[
      'A <nav> landmark named by `label`; the buttons are a list. The current page has aria-current="page".',
      'Number buttons are named “Page 5”; Previous and Next keep their words (icon-only labels are visually hidden on phones, not removed).',
      'The summary is a polite live region, so changing page announces the new range.',
      'Disabled ends use the native disabled state. Touch targets are 40px below md.',
    ]}
    doText="Keep the page size select (10, 25, 50) for tables people scan, and reset to page 1 when it changes."
    dontText="Use numbered pages for a feed that people read in order (use “Load older”) or when new items arrive at the top."
    code={`<Pagination
  page={page}
  total={243}
  pageSize={pageSize}
  onPageChange={setPage}
  pageSizeOptions={[10, 25, 50]}
  onPageSizeChange={setPageSize}
/>

<Pagination compact summary="Showing entries 1–20" previousLabel="Newer" nextLabel="Older"
  hasPrevious={hasNewer} hasNext={hasOlder} onPrevious={newer} onNext={older} />`}
    props={[
      { name: 'page / total / pageSize', type: 'number', description: 'Current page (1-based), item count and items per page.' },
      { name: 'onPageChange', type: '(page: number) => void', description: 'Called with the new page.' },
      { name: 'pageSizeOptions / onPageSizeChange', type: 'number[] / (n) => void', description: 'Shows “Rows per page” when both are given.' },
      { name: 'compact', type: 'boolean', default: 'false', description: 'Only Previous and Next (cursor mode).' },
      { name: 'hasPrevious / hasNext', type: 'boolean', description: 'Override the page-derived enabled state (cursors).' },
      { name: 'onPrevious / onNext', type: '() => void', description: 'Cursor handlers; default to onPageChange.' },
      { name: 'summary', type: 'ReactNode', description: 'Replaces “x–y of z”.' },
      { name: 'label', type: 'string', default: "'Pagination'", description: 'Name of the navigation landmark.' },
    ]}
  />
);

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 'role', title: 'Role', description: 'What you do' },
  { id: 'team', title: 'Team size' },
  { id: 'workspace', title: 'Workspace' },
];

export const StepperDoc = () => (
  <ComponentDoc
    id="c-stepper"
    name="Stepper"
    source="@/components/ds"
    maturity="stable"
    purpose="Show where someone is in a short, ordered process: onboarding, the dashboard setup checklist, a wizard. Horizontal for one-screen wizards, vertical when each step has text or an action."
    anatomy={['Marker (number or check)', 'Connector', 'Title', 'Description', 'Action (optional)']}
    variants={
      <div className="w-full min-w-0 space-y-6">
        <Stepper steps={STEPS} current={1} label="Horizontal example" />
        <Stepper
          steps={[
            { id: 'a', title: 'Create your first task', description: 'Add a title and a due date.', complete: true },
            { id: 'b', title: 'Invite a teammate', description: 'Send an invitation by email.', action: <Button variant="outline" size="sm">Invite teammate</Button> },
            { id: 'c', title: 'Try the board view' },
          ]}
          current={1}
          orientation="vertical"
          label="Vertical example"
        />
      </div>
    }
    states={[
      { label: 'Completed, current, upcoming', node: <Stepper steps={STEPS} current={1} size="sm" label="States example" className="w-full" /> },
      { label: 'All done', node: <Stepper steps={STEPS} current={3} size="sm" label="Done example" className="w-full" /> },
    ]}
    a11y={[
      'An ordered list named by `label`; the current step has aria-current="step".',
      'Each title is followed by visually hidden status text (“, completed”, “, current step”, “, not started”) so state never relies on color or the check icon.',
      'Markers are decorative (aria-hidden). Steps are not links: put an action inside a step if it needs one.',
    ]}
    doText="Use 3 to 5 steps with one- or two-word titles, and move focus to the new step’s heading when the content changes."
    dontText="Use it for navigation between pages (use Tabs) or for long forms with more than six steps."
    code={`<Stepper steps={[{ id: 'role', title: 'Role' }, { id: 'team', title: 'Team size' }]} current={step - 1} label="Onboarding progress" />

<Stepper orientation="vertical" label="Setup steps" current={firstOpen}
  steps={items.map(i => ({ id: i.id, title: i.title, complete: i.done, action: i.link }))} />`}
    props={[
      { name: 'steps', type: 'StepperStep[]', description: '{ id, title, description?, action?, complete? }.' },
      { name: 'current', type: 'number', description: '0-based index of the current step; earlier steps are complete.' },
      { name: 'orientation', type: "'horizontal' | 'vertical'", default: "'horizontal'", description: 'Layout.' },
      { name: 'size', type: "'sm' | 'md'", default: "'md'", description: 'Marker size.' },
      { name: 'label', type: 'string', description: 'Accessible name of the list (required).' },
    ]}
  />
);

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

const BannerDemo = () => {
  const [open, setOpen] = useState(true);
  return open ? (
    <Banner tone="info" title="New version available" action={<Button size="sm">Reload</Button>} onDismiss={() => setOpen(false)} dismissLabel="Remind me later">
      Reload to get the latest TaskMan.
    </Banner>
  ) : (
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Show banner again</Button>
  );
};

export const BannerDoc = () => (
  <ComponentDoc
    id="c-banner"
    name="Banner"
    source="@/components/ds"
    maturity="stable"
    purpose="Page-level notice above the content that applies to the whole screen: offline, a new version, a sprint about to end. For a message about one form or panel use Alert."
    anatomy={['Icon', 'Title (optional)', 'Message', 'Action (optional)', 'Dismiss (optional)']}
    variants={
      <div className="w-full min-w-0 space-y-2">
        <BannerDemo />
        <Banner tone="success">Your changes were saved.</Banner>
        <Banner tone="warning" action={<Button variant="outline" size="sm">Review sprint</Button>}>This sprint ends in 2 days. Finish or move open work.</Banner>
        <Banner tone="danger">We could not reach the server. Your last changes are not saved yet.</Banner>
      </div>
    }
    states={[
      { label: 'Full width (top of the page)', node: <Banner tone="warning" rounded={false} className="w-full">You&apos;re offline. Changes can&apos;t be saved until you reconnect.</Banner> },
    ]}
    a11y={[
      'Danger uses role="alert" (announced at once); info, success and warning use role="status" (polite).',
      'Tone is also carried by the icon and the words; never color alone.',
      'The dismiss button is named (“Dismiss”, or “Remind me later” when it only postpones) and is 32px, 44px of hit area with padding.',
      'Keep one action. The banner does not steal focus when it appears.',
    ]}
    doText="Say what happened and what to do in one sentence, and offer one action (“Reload”)."
    dontText="Stack several banners, or use one for feedback on a button press (use a toast)."
    code={`<Banner tone="info" title="New version available"
  action={<Button size="sm" onClick={reload}>Reload</Button>}
  onDismiss={later} dismissLabel="Remind me later">
  Reload to get the latest TaskMan.
</Banner>`}
    props={[
      { name: 'tone', type: "'info' | 'success' | 'warning' | 'danger'", default: "'info'", description: 'Meaning, icon and role.' },
      { name: 'title', type: 'ReactNode', description: 'Bold lead-in.' },
      { name: 'action', type: 'ReactNode', description: 'One button or link.' },
      { name: 'onDismiss / dismissLabel', type: '() => void / string', description: 'Shows a dismiss button; the caller removes the banner.' },
      { name: 'rounded', type: 'boolean', default: 'true', description: 'false for full-width bars at the edge of the page.' },
      { name: 'sticky', type: 'boolean', default: 'false', description: 'Sticks to the top of the scroll container.' },
    ]}
  />
);

// ---------------------------------------------------------------------------
// Popover
// ---------------------------------------------------------------------------

export const PopoverDoc = () => (
  <ComponentDoc
    id="c-popover"
    name="Popover"
    source="@/components/ui/popover"
    maturity="stable"
    purpose="Small floating panel opened by a button, holding interactive content such as quick filters or a short form. Use a Dialog for anything long or blocking and a Tooltip for a label only."
    anatomy={['Trigger', 'Panel', 'Title', 'Description', 'Content']}
    variants={
      <>
        <Popover>
          <PopoverTrigger className={buttonVariants({ variant: 'outline' })}><Settings2 aria-hidden />Display options</PopoverTrigger>
          <PopoverContent width="md">
            <PopoverTitle>Display options</PopoverTitle>
            <PopoverDescription>Changes apply to this view only.</PopoverDescription>
            <div className="mt-3 space-y-3">
              <SwitchField size="sm" label="Show completed tasks" defaultChecked />
              <SwitchField size="sm" label="Show subtasks" />
            </div>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger className={buttonVariants({ variant: 'ghost' })}><CalendarDays aria-hidden />Due date</PopoverTrigger>
          <PopoverContent width="sm" side="top">
            <PopoverTitle>Due date</PopoverTitle>
            <PopoverDescription>Opens above the trigger.</PopoverDescription>
          </PopoverContent>
        </Popover>
      </>
    }
    a11y={[
      'The trigger is a button with aria-expanded and aria-controls; Enter or Space opens the panel.',
      'Escape and a click outside close it and return focus to the trigger; focus moves into the panel when it opens.',
      'PopoverTitle and PopoverDescription name and describe the panel for screen readers.',
      'It is not modal: Tab can leave the panel. Do not put critical content only in a popover.',
    ]}
    doText="Keep it under about 20 controls and give it a visible title."
    dontText="Open it on hover (use HoverCard for read-only previews) or nest popovers."
    code={`<Popover>
  <PopoverTrigger className={buttonVariants({ variant: 'outline' })}>Display options</PopoverTrigger>
  <PopoverContent width="md">
    <PopoverTitle>Display options</PopoverTitle>
    <SwitchField label="Show completed" checked={on} onCheckedChange={setOn} />
  </PopoverContent>
</Popover>`}
    props={[
      { name: 'width', type: "'auto' | 'sm' | 'md' | 'lg'", default: "'md'", description: 'PopoverContent: 14, 18 or 24rem.' },
      { name: 'padding', type: "'none' | 'sm' | 'md'", default: "'md'", description: 'PopoverContent inner padding.' },
      { name: 'side / align', type: "'top' | 'bottom' | …", default: "'bottom' / 'start'", description: 'Placement; flips when there is no room.' },
      { name: 'open / onOpenChange', type: 'boolean / fn', description: 'Controlled state (Popover root).' },
      { name: 'render', type: 'ReactElement', description: 'PopoverTrigger: render as your own button.' },
    ]}
  />
);

// ---------------------------------------------------------------------------
// HoverCard
// ---------------------------------------------------------------------------

export const HoverCardDoc = () => (
  <ComponentDoc
    id="c-hover-card"
    name="HoverCard"
    source="@/components/ui/hover-card"
    maturity="beta"
    purpose="Read-only preview of a person or task that appears when the pointer rests on, or keyboard focus reaches, an avatar or task key (delay 400 ms). It repeats information that already exists on the page."
    anatomy={['Trigger (avatar or key)', 'Card', 'Preview content']}
    variants={
      <>
        <HoverCard>
          <HoverCardTrigger render={<button type="button" className="inline-flex items-center gap-2 rounded-md px-1 py-0.5 text-sm font-medium outline-none hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-focus" />}>
            <UserAvatar name="Ada Lovelace" size="sm" />
            Ada Lovelace
          </HoverCardTrigger>
          <HoverCardContent width="sm" side="bottom">
            <div className="flex items-center gap-3">
              <UserAvatar name="Ada Lovelace" size="lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">Ada Lovelace</p>
                <p className="text-xs text-muted-foreground">Assignee</p>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
        <HoverCard>
          <HoverCardTrigger render={<span tabIndex={0} className="rounded font-mono text-xs tabular-nums text-slate-500 outline-none focus-visible:outline-2 focus-visible:outline-focus" />}>
            WEB-12
          </HoverCardTrigger>
          <HoverCardContent width="md">
            <p className="font-mono text-xs text-muted-foreground">WEB-12</p>
            <p className="text-sm font-semibold text-foreground">Redesign the pricing page</p>
            <p className="mt-1 text-xs text-muted-foreground">In progress · High priority · Due 14 Oct</p>
          </HoverCardContent>
        </HoverCard>
      </>
    }
    a11y={[
      'Opens on hover and on keyboard focus of its trigger after 400 ms; Escape closes it. Pointer movement between trigger and card keeps it open.',
      'Never the only way to reach information: avatars keep their names in screen-reader text and keys sit next to the title.',
      'Avatars in dense lists are not focusable (the card is a pointer shortcut); keys and breadcrumb items are, because they are few.',
      'Touch devices do not hover, so nothing important may live in the card.',
    ]}
    doText="Show the same facts the destination shows (title, status, due date) in under five lines."
    dontText="Put buttons or forms in it (use Popover), or open it on elements with no visible text."
    code={`<HoverCard>
  <HoverCardTrigger render={<button type="button" />}>Ada Lovelace</HoverCardTrigger>
  <HoverCardContent width="sm">…</HoverCardContent>
</HoverCard>

<TaskKey task={task} preview={task} />   // features/tasks`}
    props={[
      { name: 'delay', type: 'number', default: '400', description: 'HoverCardTrigger: ms before opening.' },
      { name: 'closeDelay', type: 'number', default: '300', description: 'HoverCardTrigger: ms before closing.' },
      { name: 'width / padding', type: 'see Popover', description: 'HoverCardContent size steps.' },
      { name: 'render', type: 'ReactElement', description: 'HoverCardTrigger renders a link by default; pass a button or span.' },
    ]}
  />
);

// ---------------------------------------------------------------------------
// Combobox
// ---------------------------------------------------------------------------

const PEOPLE_OPTIONS: ComboboxOption[] = [
  { value: 'ada', label: 'Ada Lovelace', description: 'Engineering' },
  { value: 'grace', label: 'Grace Hopper', description: 'Platform' },
  { value: 'alan', label: 'Alan Turing', description: 'Research' },
  { value: 'barbara', label: 'Barbara Liskov', description: 'Engineering' },
  { value: 'edsger', label: 'Edsger Dijkstra' },
];

const ComboboxDemo = ({ multiple }: { multiple?: boolean }) => {
  const [one, setOne] = useState<string | null>('grace');
  const [many, setMany] = useState<string[]>(['ada']);
  return (
    <div className="w-full max-w-sm">
      {multiple ? (
        <OptionCombobox multiple label="Assignees" placeholder="Search people" options={PEOPLE_OPTIONS} value={many} onValueChange={setMany} />
      ) : (
        <OptionCombobox label="Owner" placeholder="Search people" options={PEOPLE_OPTIONS} value={one} onValueChange={setOne} clearable />
      )}
    </div>
  );
};

export const ComboboxDoc = () => (
  <ComponentDoc
    id="c-combobox"
    name="Combobox"
    source="@/components/ds (OptionCombobox) · @/components/ui/combobox"
    maturity="beta"
    purpose="Pick from a list that is too long for a Select, by typing to filter. Single mode fills the input with the choice; multiple mode shows removable chips. Used for assignees and for finding a task to link."
    anatomy={['Input', 'Chips (multiple)', 'Clear / chevron', 'List', 'Option', 'Empty message']}
    variants={
      <>
        <ComboboxDemo />
        <ComboboxDemo multiple />
      </>
    }
    states={[
      { label: 'Disabled', node: <div className="w-full"><OptionCombobox label="Disabled owner" options={PEOPLE_OPTIONS} value="ada" onValueChange={() => undefined} disabled /></div> },
      { label: 'Invalid', node: <div className="w-full"><OptionCombobox label="Invalid owner" options={PEOPLE_OPTIONS} value={null} onValueChange={() => undefined} invalid placeholder="Required" /></div> },
    ]}
    a11y={[
      'role="combobox" on the input with aria-expanded, aria-controls and aria-activedescendant; the list is a listbox of options.',
      'Typing filters; Arrow keys move through options, Enter selects, Escape closes. In multiple mode Backspace removes the last chip and Left Arrow from the start focuses the chips.',
      'Every combobox needs a name (`label` becomes aria-label); chips and their remove buttons are named “Remove Ada Lovelace”.',
      'The empty message is announced when nothing matches. Selected options show a check as well as the highlight.',
    ]}
    doText="Use ids as values and a plain-text label for each option so filtering and chips read well."
    dontText="Use it for fewer than about seven options (use Select) or for free text (use TagInput or Input)."
    code={`<OptionCombobox
  multiple
  label="Assignees"
  options={members.map(m => ({ value: m._id, label: m.name, leading: <UserAvatar name={m.name} size="sm" /> }))}
  value={assigneeIds}
  onValueChange={setAssigneeIds}
/>`}
    props={[
      { name: 'options', type: 'ComboboxOption[]', description: '{ value, label, description?, leading?, disabled? }.' },
      { name: 'value / onValueChange', type: 'string | null  ·  string[]', description: 'Controlled ids; an array when `multiple`.' },
      { name: 'multiple', type: 'boolean', default: 'false', description: 'Chips instead of a single value.' },
      { name: 'label', type: 'string', description: 'Accessible name (required).' },
      { name: 'emptyText / placeholder', type: 'string', description: 'No-result message and input hint.' },
      { name: 'clearable', type: 'boolean', description: 'Single mode: show a clear button.' },
      { name: 'limit', type: 'number', default: '100', description: 'Most options rendered at once.' },
    ]}
  />
);

// ---------------------------------------------------------------------------
// DescriptionList
// ---------------------------------------------------------------------------

export const DescriptionListDoc = () => (
  <ComponentDoc
    id="c-description-list"
    name="DescriptionList"
    source="@/components/ds"
    maturity="stable"
    purpose="Label/value pairs for the details of one thing: a task’s due date, sprint and labels. A real <dl>, so assistive technology announces each label with its value."
    anatomy={['List', 'Label (dt)', 'Value (dd)']}
    variants={
      <div className="grid w-full min-w-0 gap-6 lg:grid-cols-2">
        <DescriptionList columns={3} className="gap-4">
          <DescriptionItem label="Due date">14 Oct 2026</DescriptionItem>
          <DescriptionItem label="Start date"><span className="text-text-subtle">Not set</span></DescriptionItem>
          <DescriptionItem label="Sprint">Sprint 4</DescriptionItem>
          <DescriptionItem label="Labels" wide>frontend, design</DescriptionItem>
        </DescriptionList>
        <DescriptionList layout="inline">
          <DescriptionItem label="Owner">Ada Lovelace</DescriptionItem>
          <DescriptionItem label="Created">2 Oct 2026</DescriptionItem>
          <DescriptionItem label="Status">In progress</DescriptionItem>
        </DescriptionList>
      </div>
    }
    a11y={[
      'Uses <dl>, <dt> and <dd>; screen readers announce “Due date: 14 Oct 2026”.',
      'Empty values still render text (“Not set”, “None”) instead of leaving a gap, so the label is never orphaned.',
      'Labels are 12px uppercase in text-subtle (5.9:1 on white); values are 14px text-body.',
    ]}
    doText="Group at most eight pairs; let long values (labels, descriptions) span the row with `wide`."
    dontText="Use it for tabular data with many rows and columns (use a table) or as a form."
    code={`<DescriptionList columns={3} className="gap-4">
  <DescriptionItem label="Due date">14 Oct 2026</DescriptionItem>
  <DescriptionItem label="Labels" wide>frontend, design</DescriptionItem>
</DescriptionList>`}
    props={[
      { name: 'layout', type: "'stacked' | 'inline'", default: "'stacked'", description: 'Label above the value, or labels in an aligned column.' },
      { name: 'columns', type: '1 | 2 | 3', default: '1', description: 'Columns from sm up (two below sm for 3).' },
      { name: 'label', type: 'ReactNode', description: 'DescriptionItem: the term.' },
      { name: 'wide', type: 'boolean', default: 'false', description: 'DescriptionItem: span every column.' },
    ]}
  />
);

// ---------------------------------------------------------------------------
// TagInput
// ---------------------------------------------------------------------------

const TagInputDemo = ({ max }: { max?: number }) => {
  const [tags, setTags] = useState(['frontend']);
  return (
    <div className="w-full max-w-md">
      <TagInput value={tags} onChange={setTags} suggestions={['backend', 'design', 'bug', 'docs']} noun="label" max={max} />
    </div>
  );
};

export const TagInputDoc = () => (
  <ComponentDoc
    id="c-tag-input"
    name="TagInput"
    source="@/components/ds"
    maturity="stable"
    purpose="Free-text chips: type a word, press Enter or comma, and it becomes a removable chip. Used for task labels, with one-tap suggestions from the labels already in the workspace."
    anatomy={['Field', 'Chips', 'Text input', 'Hint and counter', 'Suggestions']}
    variants={<TagInputDemo />}
    states={[
      { label: 'At the maximum (1)', node: <TagInputDemo max={1} /> },
    ]}
    a11y={[
      'The input is a labelled text field (give it an id and a <label> via Field); the hint is linked with aria-describedby.',
      'Enter or comma adds, Backspace on an empty field removes the last chip, each chip has a “Remove label …” button.',
      'Suggestions are real buttons named “Add label …”; at the maximum the input is disabled and the hint says so.',
      'Enter never submits the surrounding form while the field has text.',
    ]}
    doText="Show the limit and offer existing tags so people reuse spellings."
    dontText="Use it when the options are fixed and known (use Combobox with multiple)."
    code={`<Field label="Labels" htmlFor="labels">
  <TagInput id="labels" noun="label" value={labels} onChange={setLabels}
    suggestions={workspaceLabels} max={10} maxLength={30} />
</Field>`}
    props={[
      { name: 'value / onChange', type: 'string[] / (tags) => void', description: 'Controlled tags.' },
      { name: 'suggestions', type: 'string[]', description: 'Existing tags offered while typing.' },
      { name: 'noun', type: 'string', default: "'tag'", description: 'Singular word used in hints and button names.' },
      { name: 'max / maxLength', type: 'number', default: '10 / 30', description: 'Most tags and longest tag.' },
      { name: 'renderTag', type: '(tag, onRemove?) => ReactNode', description: 'Custom chip (colored labels); onRemove is omitted for suggestions.' },
    ]}
  />
);
