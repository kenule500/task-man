import { useId, useState } from 'react';
import { CheckSquare, Clock, FolderKanban, GitBranch, LayoutGrid, List, MessageSquare, Calendar } from 'lucide-react';
import {
  Accordion, ActivityItem, AvatarStack, Breadcrumbs, Disclosure, Divider, Field, IconTile, Kbd, SearchInput,
  SegmentedControl, StatusPill, Tag, Timeline, TypeBadge, UserAvatar, fieldMessageId,
} from '@/components/ds';
import { Input } from '@/components/ui/input';
import { ComponentDoc } from '../kit';

const PEOPLE = ['Ada Lovelace', 'Grace Hopper', 'Linus Torvalds', 'Alan Turing', 'Edsger Dijkstra', 'Barbara Liskov'].map(name => ({ name }));

export const TagDoc = () => (
  <ComponentDoc
    id="c-tag"
    name="Tag"
    source="@/components/ds"
    maturity="stable"
    purpose="Small rounded label for roles, categories and states that are not workflow status."
    anatomy={['Container', 'Text']}
    variants={
      <>
        <Tag tone="neutral">Member</Tag>
        <Tag tone="primary">Owner</Tag>
        <Tag tone="dark">Admin</Tag>
        <Tag tone="success">Done</Tag>
        <Tag tone="warning">At risk</Tag>
        <Tag tone="danger">Blocked</Tag>
        <Tag tone="neutral" size="sm">Website v1</Tag>
      </>
    }
    a11y={['A plain span: the text is the meaning. Do not rely on tone alone.', 'Not interactive. Use a button or link if it must be clickable.']}
    doText="Use one or two words, sentence case."
    dontText="Use a Tag for workflow status (use StatusPill) or for long sentences."
    code={`<Tag tone="warning">At risk</Tag>`}
    props={[
      { name: 'tone', type: "'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'dark'", default: "'neutral'", description: 'Meaning and color.' },
      { name: 'size', type: "'sm' | 'md'", default: "'md'", description: '11px or 12px text.' },
    ]}
  />
);

export const StatusPillDoc = () => (
  <ComponentDoc
    id="c-status-pill"
    name="StatusPill and TypeBadge"
    source="@/components/ds"
    maturity="beta"
    purpose="StatusPill shows workflow status (dot + word) from the status tokens. TypeBadge shows a Scrum work item type (icon + name) from the type tokens."
    anatomy={['Dot or icon', 'Label']}
    variants={
      <>
        <StatusPill status="pending" />
        <StatusPill status="in-progress" />
        <StatusPill status="completed" />
        <StatusPill status="in-progress" size="sm">Active sprint</StatusPill>
        <TypeBadge type="story" />
        <TypeBadge type="task" />
        <TypeBadge type="bug" />
        <TypeBadge type="spike" size="sm" />
      </>
    }
    a11y={['Both always include text, so color is never the only signal.', 'The dot and icon are aria-hidden.']}
    doText="Use StatusPill in tables and cards, and TypeBadge beside the task key in backlog rows."
    dontText="Invent new status colors. Add a token and a variant if a status is added."
    code={`<StatusPill status="in-progress" />
<TypeBadge type="bug" size="sm" />`}
    props={[
      { name: 'status', type: "'pending' | 'in-progress' | 'completed'", default: "'pending'", description: 'StatusPill: workflow state.' },
      { name: 'type', type: "'story' | 'task' | 'bug' | 'spike'", default: "'task'", description: 'TypeBadge: work item type.' },
      { name: 'size', type: "'sm' | 'md'", default: "'md'", description: 'Text size.' },
      { name: 'children', type: 'ReactNode', description: 'StatusPill only: replaces the default label.' },
    ]}
  />
);

export const IconTileDoc = () => (
  <ComponentDoc
    id="c-icon-tile"
    name="IconTile"
    source="@/components/ds"
    maturity="stable"
    purpose="A decorative icon inside a tinted rounded square, for section headers and stat blocks."
    anatomy={['Tile', 'Icon']}
    variants={
      <>
        <IconTile tone="primary"><FolderKanban /></IconTile>
        <IconTile tone="neutral"><List /></IconTile>
        <IconTile tone="success"><CheckSquare /></IconTile>
        <IconTile tone="warning"><Clock /></IconTile>
        <IconTile tone="danger" size="lg"><Clock /></IconTile>
        <IconTile size="sm"><GitBranch /></IconTile>
      </>
    }
    a11y={['The tile is aria-hidden: it must sit next to a text label.']}
    doText="Pair with a visible heading."
    dontText="Use as a button. Put the icon inside a real Button instead."
    code={`<IconTile tone="success"><CheckSquare /></IconTile>`}
    props={[
      { name: 'tone', type: "'primary' | 'neutral' | 'success' | 'warning' | 'danger'", default: "'primary'", description: 'Tint.' },
      { name: 'size', type: "'sm' | 'md' | 'lg'", default: "'md'", description: '32, 40 or 56px.' },
    ]}
  />
);

export const UserAvatarDoc = () => (
  <ComponentDoc
    id="c-user-avatar"
    name="UserAvatar"
    source="@/components/ds"
    maturity="stable"
    purpose="A person's picture with an initials fallback."
    anatomy={['Image', 'Initials fallback']}
    variants={
      <>
        <UserAvatar name="Ada Lovelace" size="sm" />
        <UserAvatar name="Grace Hopper" />
        <UserAvatar name="Mohamed Reda" size="lg" />
      </>
    }
    a11y={['The image has empty alt: the person is named by adjacent text or by an AvatarStack group label.']}
    doText="Show the name next to a lone avatar."
    dontText="Use an avatar as the only way to tell who is assigned."
    code={`<UserAvatar name="Ada Lovelace" src={user.avatarUrl} size="sm" />`}
    props={[
      { name: 'name', type: 'string', description: 'Used for the initials.' },
      { name: 'src', type: 'string', description: 'Image URL.' },
      { name: 'size', type: "'sm' | 'md' | 'lg'", default: "'md'", description: '28, 36 or 48px.' },
    ]}
  />
);

export const AvatarStackDoc = () => (
  <ComponentDoc
    id="c-avatar-stack"
    name="AvatarStack"
    source="@/components/ds"
    maturity="beta"
    purpose="Overlapping avatars with a +N counter, for assignees and sprint members. Features use AssigneeStack; this is the generic version."
    anatomy={['Avatars', '+N counter']}
    variants={
      <>
        <AvatarStack people={PEOPLE.slice(0, 2)} />
        <AvatarStack people={PEOPLE} max={3} />
        <AvatarStack people={PEOPLE} max={4} size="md" />
        <AvatarStack people={[]} />
      </>
    }
    a11y={['The group is labelled “Assigned to Ada Lovelace, Grace Hopper, …” so hidden members are still announced.', 'The +N counter is aria-hidden to avoid double reading.']}
    doText="Show at most four avatars on cards."
    dontText="Stack more than six people without a way to see all of them."
    code={`<AvatarStack people={members} max={3} />`}
    props={[
      { name: 'people', type: '{ name; src? }[]', description: 'Everyone in the stack.' },
      { name: 'max', type: 'number', default: '4', description: 'Avatars before the counter.' },
      { name: 'size', type: "'sm' | 'md'", default: "'sm'", description: '28 or 36px.' },
    ]}
  />
);

const FieldDemo = ({ error }: { error?: string }) => {
  const id = `ds-field-${useId().replace(/:/g, '')}`;
  return (
    <Field label="Task title" htmlFor={id} required hint={error ? undefined : 'Short and specific works best.'} error={error} className="w-full max-w-sm">
      <Input id={id} aria-invalid={Boolean(error)} aria-describedby={fieldMessageId(id)} placeholder="e.g. Prepare sprint review" className="h-10 bg-white text-base sm:text-sm" />
    </Field>
  );
};

export const FieldDoc = () => (
  <ComponentDoc
    id="c-field"
    name="Field"
    source="@/components/ds"
    maturity="stable"
    purpose="A visible label, a control and a hint or error, wired together for screen readers."
    anatomy={['Label', 'Required marker', 'Control', 'Hint or error']}
    variants={<FieldDemo />}
    states={[
      { label: 'Default with hint', node: <FieldDemo /> },
      { label: 'Error', node: <FieldDemo error="Task title is required" /> },
    ]}
    a11y={['The label is a real <label for>.', 'Give the control aria-describedby={fieldMessageId(id)} and aria-invalid when there is an error.', 'The required asterisk is aria-hidden: also set the required attribute on the control.']}
    doText="Write the error under the field: “Task title is required.”"
    dontText="Use the placeholder as the label, or show errors only as red borders."
    code={`<Field label="Task title" htmlFor="title" required error={error}>
  <Input id="title" aria-invalid={!!error} aria-describedby={fieldMessageId('title')} />
</Field>`}
    props={[
      { name: 'label', type: 'ReactNode', description: 'Visible label.' },
      { name: 'htmlFor', type: 'string', description: 'The control id.' },
      { name: 'required', type: 'boolean', description: 'Shows the asterisk.' },
      { name: 'hint', type: 'ReactNode', description: 'Helper text.' },
      { name: 'error', type: 'string', description: 'Replaces the hint, in red.' },
    ]}
  />
);

export const KbdDoc = () => (
  <ComponentDoc
    id="c-kbd"
    name="Kbd"
    source="@/components/ds"
    maturity="beta"
    purpose="A key cap that shows a keyboard shortcut in help text, menus and the command palette."
    anatomy={['Key cap']}
    variants={
      <>
        <span className="inline-flex items-center gap-1"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
        <span className="inline-flex items-center gap-1"><Kbd>Esc</Kbd></span>
        <span className="inline-flex items-center gap-1 text-sm text-text-body">Press <Kbd size="sm">/</Kbd> to search</span>
      </>
    }
    a11y={['Renders a native kbd element.', 'Spell out symbols for screen readers when ambiguous (use aria-label on the group, “Control plus K”).']}
    doText="Show the platform key (⌘ on Mac, Ctrl elsewhere)."
    dontText="Advertise a shortcut that does not work in the current view."
    code={`<Kbd>Ctrl</Kbd> <Kbd>K</Kbd>`}
    props={[
      { name: 'size', type: "'sm' | 'md'", default: "'md'", description: '20 or 24px tall.' },
      { name: 'children', type: 'ReactNode', description: 'The key name.' },
    ]}
  />
);

const SearchDemo = ({ initial = '' }: { initial?: string }) => {
  const [value, setValue] = useState(initial);
  return <SearchInput label="Search tasks" value={value} onValueChange={setValue} className="w-full max-w-sm" />;
};

export const SearchInputDoc = () => (
  <ComponentDoc
    id="c-search-input"
    name="SearchInput"
    source="@/components/ds"
    maturity="beta"
    purpose="A search field with a leading icon and a clear button. Used by task toolbars, the FAQ and this guide."
    anatomy={['Icon', 'Input (type=search)', 'Clear button']}
    variants={<SearchDemo />}
    states={[
      { label: 'Empty', node: <SearchDemo /> },
      { label: 'With text (clear visible)', node: <SearchDemo initial="sprint" /> },
    ]}
    a11y={['A native type="search" input named by its label prop (aria-label).', 'Escape clears the text, and the clear button returns focus to the field.', 'The text is 16px on phones to prevent iOS zoom.']}
    doText="Filter as you type and say how many results there are."
    dontText="Run a request on every keystroke without debouncing."
    code={`const [query, setQuery] = useState('');
<SearchInput label="Search tasks" value={query} onValueChange={setQuery} />`}
    props={[
      { name: 'label', type: 'string', description: 'Accessible name and default placeholder.' },
      { name: 'value', type: 'string', description: 'Controlled value.' },
      { name: 'onValueChange', type: '(value: string) => void', description: 'Called on every change and on clear.' },
      { name: 'placeholder', type: 'string', description: 'Defaults to label.' },
      { name: 'onClear', type: '() => void', description: 'Extra callback after clearing.' },
    ]}
  />
);

const SegmentedDemo = ({ iconOnlyOnMobile }: { iconOnlyOnMobile?: boolean }) => {
  const [value, setValue] = useState('list');
  return (
    <SegmentedControl
      aria-label="View"
      value={value}
      onValueChange={setValue}
      iconOnlyOnMobile={iconOnlyOnMobile}
      options={[
        { value: 'list', label: 'List', icon: <List /> },
        { value: 'board', label: 'Board', icon: <LayoutGrid /> },
        { value: 'calendar', label: 'Calendar', icon: <Calendar /> },
      ]}
    />
  );
};

export const SegmentedControlDoc = () => (
  <ComponentDoc
    id="c-segmented-control"
    name="SegmentedControl"
    source="@/components/ds"
    maturity="beta"
    purpose="Choose one of two to five options that change the view of the same content (list/board, week/month). Not for navigation between pages."
    anatomy={['Track', 'Option', 'Selected option']}
    variants={
      <>
        <SegmentedDemo />
        <SegmentedControl aria-label="Density" size="sm" value="comfortable" onValueChange={() => undefined} options={[{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }]} />
      </>
    }
    states={[
      { label: 'Icon only on phones', node: <SegmentedDemo iconOnlyOnMobile /> },
      { label: 'Disabled option', node: <SegmentedControl aria-label="Mode" value="a" onValueChange={() => undefined} options={[{ value: 'a', label: 'Open' }, { value: 'b', label: 'Closed', disabled: true }]} /> },
    ]}
    a11y={['role="radiogroup" with radio items: one tab stop on the selected item.', 'Arrow keys move and select, wrapping at the ends and skipping disabled options; Home and End jump.', 'Name the group with aria-label (“View”, “Density”).']}
    doText="Keep labels to one word and use icons only as a supplement."
    dontText="Use it for more than five options (use Select) or to switch pages (use Tabs or links)."
    code={`<SegmentedControl
  aria-label="View"
  value={view}
  onValueChange={setView}
  options={[{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }]}
/>`}
    props={[
      { name: 'options', type: 'SegmentedOption<T>[]', description: '{ value, label, icon?, disabled? }.' },
      { name: 'value', type: 'T', description: 'Selected value (controlled).' },
      { name: 'onValueChange', type: '(value: T) => void', description: 'Called when selection changes.' },
      { name: 'aria-label', type: 'string', description: 'Name of the group (required).' },
      { name: 'size', type: "'sm' | 'md'", default: "'md'", description: '28 or 32px tall.' },
      { name: 'iconOnlyOnMobile', type: 'boolean', default: 'false', description: 'Hides labels below sm; they stay in the accessible name.' },
    ]}
  />
);

export const BreadcrumbsDoc = () => (
  <ComponentDoc
    id="c-breadcrumbs"
    name="Breadcrumbs"
    source="@/components/ds"
    maturity="beta"
    purpose="Shows where the person is in a hierarchy: Projects › Website v1 › Sprint 4."
    anatomy={['Nav', 'Ancestor links', 'Separator', 'Current page']}
    variants={
      <>
        <Breadcrumbs items={[{ label: 'Projects', href: '#c-breadcrumbs' }, { label: 'Website v1', href: '#c-breadcrumbs' }, { label: 'Sprint 4' }]} />
        <Breadcrumbs label="Settings path" items={[{ label: 'Settings', href: '#c-breadcrumbs' }, { label: 'Roles' }]} />
      </>
    }
    a11y={['A nav landmark named “Breadcrumb” containing an ordered list.', 'The last item is text with aria-current="page".', 'Separators are aria-hidden.']}
    doText="Pass renderLink to use the router’s Link and avoid full reloads."
    dontText="Use breadcrumbs for a flat page, or repeat the page title as a link."
    code={`<Breadcrumbs
  items={[{ label: 'Projects', href: '/projects' }, { label: 'Sprint 4' }]}
  renderLink={(item, className) => <Link to={item.href} className={className}>{item.label}</Link>}
/>`}
    props={[
      { name: 'items', type: 'BreadcrumbItem[]', description: '{ label, href? }; the last is the current page.' },
      { name: 'label', type: 'string', default: "'Breadcrumb'", description: 'Accessible name of the nav.' },
      { name: 'renderLink', type: '(item, className) => ReactNode', description: 'Custom link element.' },
    ]}
  />
);

export const DisclosureDoc = () => (
  <ComponentDoc
    id="c-disclosure"
    name="Disclosure and Accordion"
    source="@/components/ds"
    maturity="beta"
    purpose="Disclosure shows or hides one block of content. Accordion stacks several (FAQ, grouped settings)."
    anatomy={['Heading', 'Trigger button', 'Chevron', 'Panel']}
    variants={
      <div className="w-full space-y-4">
        <Accordion
          defaultOpenIds={['one']}
          items={[
            { id: 'one', title: 'What is a sprint?', content: 'A fixed period, usually one to four weeks, in which the team completes a set of stories.' },
            { id: 'two', title: 'Can I move tasks between sprints?', content: 'Yes. Open the task and choose another sprint, or move it back to the backlog.' },
          ]}
        />
        <div className="rounded-xl border border-border bg-white px-4">
          <Disclosure title="Advanced options" headingLevel={4}>Only shown when expanded.</Disclosure>
        </div>
      </div>
    }
    states={[
      { label: 'Collapsed', node: <div className="w-full rounded-lg border border-border bg-white px-3"><Disclosure title="Collapsed" headingLevel={4}>Hidden</Disclosure></div> },
      { label: 'Expanded', node: <div className="w-full rounded-lg border border-border bg-white px-3"><Disclosure title="Expanded" defaultOpen headingLevel={4}>Visible</Disclosure></div> },
    ]}
    a11y={['Each trigger is a button with aria-expanded and aria-controls, inside a heading.', 'The panel is a labelled region and uses the hidden attribute when collapsed, so it leaves the accessibility tree.', 'Enter and Space toggle; the 44px minimum height is the touch target.']}
    doText="Put the question or topic in the trigger and keep panels short."
    dontText="Hide content people need to complete the task, or nest accordions."
    code={`<Accordion
  type="single"
  items={[{ id: 'sprint', title: 'What is a sprint?', content: '…' }]}
/>`}
    props={[
      { name: 'items', type: 'AccordionItem[]', description: 'Accordion: { id, title, content }.' },
      { name: 'type', type: "'single' | 'multiple'", default: "'single'", description: 'Accordion: one or many open.' },
      { name: 'defaultOpenIds', type: 'string[]', default: '[]', description: 'Accordion: initially open items.' },
      { name: 'title / children', type: 'ReactNode', description: 'Disclosure: trigger text and panel.' },
      { name: 'defaultOpen / open / onOpenChange', type: 'boolean / boolean / fn', description: 'Disclosure: uncontrolled or controlled.' },
      { name: 'headingLevel', type: '2 | 3 | 4', default: '3', description: 'Keeps the outline correct.' },
    ]}
  />
);

export const TimelineDoc = () => (
  <ComponentDoc
    id="c-timeline"
    name="Timeline and ActivityItem"
    source="@/components/ds"
    maturity="beta"
    purpose="A chronological list of what happened on a task, sprint or project. Not the Gantt TimelineView."
    anatomy={['List', 'Avatar or icon', 'Actor and action', 'Time']}
    variants={
      <Timeline aria-label="Task activity" className="w-full">
        <ActivityItem actor="Ada Lovelace" timestamp="2026-10-09T10:00:00Z" timeLabel="2 hours ago">moved this to <strong>In progress</strong></ActivityItem>
        <ActivityItem actor="Grace Hopper" timestamp="2026-10-08T15:30:00Z" timeLabel="Yesterday" icon={<MessageSquare />}>commented on this task</ActivityItem>
      </Timeline>
    }
    a11y={['An ordered list, so screen readers announce the count.', 'Times use the time element with a machine-readable datetime.', 'Avatars and icons are decorative; the actor is always named in text.']}
    doText="Write in the past tense and start with the person."
    dontText="Show only icons or bare timestamps."
    code={`<Timeline aria-label="Task activity">
  <ActivityItem actor="Ada Lovelace" timestamp={iso} timeLabel="2 hours ago">
    moved this to In progress
  </ActivityItem>
</Timeline>`}
    props={[
      { name: 'actor', type: 'string', description: 'ActivityItem: who did it.' },
      { name: 'children', type: 'ReactNode', description: 'ActivityItem: what they did.' },
      { name: 'timestamp', type: 'string', description: 'ISO value for the time element.' },
      { name: 'timeLabel', type: 'string', description: 'Human readable time.' },
      { name: 'icon', type: 'ReactNode', description: 'Replaces the actor avatar.' },
    ]}
  />
);

export const DividerDoc = () => (
  <ComponentDoc
    id="c-divider"
    name="Divider"
    source="@/components/ds"
    maturity="stable"
    purpose="A horizontal rule, optionally with a centered label such as “or”."
    anatomy={['Line', 'Label']}
    variants={
      <div className="w-full space-y-4">
        <Divider />
        <Divider label="or" />
        <Divider label="Continue with email" />
      </div>
    }
    a11y={['Without a label it is a native hr (a separator).', 'With a label the lines are decorative and the text is read as normal content.']}
    doText="Use it to split genuinely different choices, like sign-in methods."
    dontText="Use it between every row; spacing and cards already group content."
    code={`<Divider label="or" />`}
    props={[
      { name: 'label', type: 'string', description: 'Text in the middle.' },
      { name: 'className', type: 'string', description: 'Merged last.' },
    ]}
  />
);
