import { useId, useState } from 'react';
import { Info, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { TooltipHint } from '@/components/ds';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ComponentDoc } from '../kit';

export const ButtonDoc = () => (
  <ComponentDoc
    id="c-button"
    name="Button"
    source="@/components/ui/button"
    maturity="stable"
    purpose="Every action that changes something. Links that navigate use anchors or router links styled as buttons."
    anatomy={['Container', 'Leading icon', 'Label', 'Trailing icon']}
    variants={
      <>
        <Button className="bg-primary text-white hover:bg-primary-hover"><Plus aria-hidden />Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
        <Button size="icon" variant="outline" aria-label="More actions"><MoreHorizontal aria-hidden /></Button>
      </>
    }
    states={[
      { label: 'Default', node: <Button variant="outline">Save</Button> },
      { label: 'Hover (move the pointer here)', node: <Button variant="outline" className="bg-muted">Save</Button> },
      { label: 'Focus-visible (Tab to it)', node: <Button variant="outline" className="border-ring ring-3 ring-ring/50">Save</Button> },
      { label: 'Disabled', node: <Button variant="outline" disabled>Save</Button> },
      { label: 'Loading', node: <Button variant="outline" disabled aria-busy><Loader2 className="animate-spin" aria-hidden />Saving…</Button> },
      { label: 'Error (invalid action)', node: <Button variant="destructive">Delete task</Button> },
    ]}
    a11y={['A native button; Space and Enter activate it.', 'Icon-only buttons need aria-label and a tooltip.', 'Loading keeps the label (“Saving…”), sets aria-busy and disables repeat clicks.', 'Below md the minimum hit area is 40px; the tab bar and dialogs use 44px.']}
    doText="One filled primary button per view, labelled with a verb: “Create task”."
    dontText="Use two primary buttons side by side, or a label like “OK” or “Submit”."
    code={`<Button className="bg-primary text-white hover:bg-primary-hover">
  <Plus aria-hidden />Add task
</Button>
<Button variant="outline">Cancel</Button>`}
    props={[
      { name: 'variant', type: "'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'", default: "'default'", description: 'Visual weight.' },
      { name: 'size', type: "'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg'", default: "'default'", description: 'Height and padding.' },
      { name: 'disabled', type: 'boolean', description: 'Removes from the tab order and dims.' },
      { name: 'render', type: 'ReactElement', description: 'Base UI: render as another element (a link).' },
    ]}
  />
);

export const InputDoc = () => {
  const id = useId();
  return (
    <ComponentDoc
      id="c-input"
      name="Input"
      source="@/components/ui/input"
      maturity="stable"
      purpose="Single-line text entry. Always wrap it in a Field so it has a visible label."
      anatomy={['Container', 'Value or placeholder']}
      variants={
        <div className="grid w-full max-w-md gap-3">
          <Input aria-label="Default input" placeholder="Default" className="h-10 bg-white" />
          <Input aria-label="Email" type="email" placeholder="name@company.com" className="h-10 bg-white" />
        </div>
      }
      states={[
        { label: 'Default', node: <Input aria-label="State default" placeholder="Placeholder" className="h-10 bg-white" /> },
        { label: 'Focus-visible', node: <Input aria-label="State focus" defaultValue="Focused" className="h-10 border-ring bg-white ring-3 ring-ring/50" /> },
        { label: 'Disabled', node: <Input aria-label="State disabled" defaultValue="Read only" disabled className="h-10 bg-white" /> },
        { label: 'Error', node: <Input id={id} aria-label="State error" aria-invalid defaultValue="Oops" className="h-10 bg-white" /> },
      ]}
      a11y={['Text is 16px below md (prevents iOS zoom) and 14px from md.', 'Use aria-invalid with aria-describedby for errors (Field does this).', 'Never use the placeholder as the only label.']}
      doText="Set the right type and autocomplete (email, tel) so keyboards and password managers help."
      dontText="Validate on every keystroke before the person has finished typing."
      code={`<Field label="Email" htmlFor="email" required error={error}>
  <Input id="email" type="email" autoComplete="email" aria-invalid={!!error} />
</Field>`}
      props={[
        { name: 'type', type: 'string', default: "'text'", description: 'Native input type.' },
        { name: 'aria-invalid', type: 'boolean', description: 'Red border and ring.' },
        { name: 'disabled', type: 'boolean', description: 'Dims and blocks input.' },
        { name: '...input props', type: 'ComponentProps<"input">', description: 'Everything else is forwarded.' },
      ]}
    />
  );
};

const SelectDemo = ({ disabled }: { disabled?: boolean }) => {
  const [value, setValue] = useState<string | null>('sprint-4');
  return (
    <Select value={value} onValueChange={setValue} disabled={disabled}>
      <SelectTrigger aria-label="Sprint" className="h-9 w-48 bg-white">
        <SelectValue placeholder="Choose a sprint" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="backlog">Backlog</SelectItem>
        <SelectItem value="sprint-3">Sprint 3</SelectItem>
        <SelectItem value="sprint-4">Sprint 4</SelectItem>
      </SelectContent>
    </Select>
  );
};

export const SelectDoc = () => (
  <ComponentDoc
    id="c-select"
    name="Select"
    source="@/components/ui/select"
    maturity="stable"
    purpose="Choose one value from 5 to about 15 options. Fewer options: SegmentedControl or radios."
    anatomy={['Trigger', 'Value', 'Popup', 'Item']}
    variants={<SelectDemo />}
    states={[
      { label: 'Default', node: <SelectDemo /> },
      { label: 'Disabled', node: <SelectDemo disabled /> },
    ]}
    a11y={['Base UI select: arrow keys and type-ahead in the list, Escape closes and returns focus to the trigger.', 'Always name the trigger (aria-label or a Field label).', 'The popup renders in a portal above modals.']}
    doText="Show the current value in the trigger and keep options short."
    dontText="Use a Select for a yes/no choice or for navigation."
    code={`<Select value={sprint} onValueChange={setSprint}>
  <SelectTrigger aria-label="Sprint"><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="backlog">Backlog</SelectItem>
  </SelectContent>
</Select>`}
    props={[
      { name: 'value / onValueChange', type: 'string | null / fn', description: 'Controlled value.' },
      { name: 'disabled', type: 'boolean', description: 'Disables the trigger.' },
      { name: 'items', type: '{ value; label }[]', description: 'Optional: lets SelectValue show labels before the popup opens.' },
    ]}
  />
);

const CheckboxDemo = ({ disabled, invalid, initial = false }: { disabled?: boolean; invalid?: boolean; initial?: boolean }) => {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-10 items-center gap-2.5 text-sm text-text-body">
      <Checkbox id={id} defaultChecked={initial} disabled={disabled} aria-invalid={invalid} />
      Notify assignees
    </label>
  );
};

export const CheckboxDoc = () => (
  <ComponentDoc
    id="c-checkbox"
    name="Checkbox"
    source="@/components/ui/checkbox"
    maturity="stable"
    purpose="Independent on/off choices and multi-select lists, such as bulk selection in the backlog."
    anatomy={['Box', 'Check indicator', 'Label']}
    variants={<><CheckboxDemo /><CheckboxDemo initial /></>}
    states={[
      { label: 'Unchecked', node: <CheckboxDemo /> },
      { label: 'Checked', node: <CheckboxDemo initial /> },
      { label: 'Disabled', node: <CheckboxDemo disabled /> },
      { label: 'Error', node: <CheckboxDemo invalid /> },
    ]}
    a11y={['Pair with a label element so the whole row is clickable and named.', 'The hit area extends beyond the 16px box.', 'Space toggles.']}
    doText="Phrase the label as the thing being turned on."
    dontText="Use a checkbox where the change applies instantly (use a switch pattern with an explicit result)."
    code={`<label htmlFor="notify">
  <Checkbox id="notify" /> Notify assignees
</label>`}
    props={[
      { name: 'checked / defaultChecked', type: 'boolean', description: 'Controlled or uncontrolled.' },
      { name: 'onCheckedChange', type: '(checked: boolean) => void', description: 'Change handler.' },
      { name: 'disabled', type: 'boolean', description: 'Disables.' },
      { name: 'aria-invalid', type: 'boolean', description: 'Error styling.' },
    ]}
  />
);

export const TabsDoc = () => (
  <ComponentDoc
    id="c-tabs"
    name="Tabs"
    source="@/components/ui/tabs"
    maturity="stable"
    purpose="Switch between related panels on the same page (Overview, Backlog, Reports). Not for filters; use FilterPills."
    anatomy={['Tab list', 'Tab', 'Active indicator', 'Panel']}
    variants={
      <Tabs defaultValue="overview" className="w-full">
        <TabsList aria-label="Project sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="backlog">Backlog</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="text-sm text-text-body">Overview panel</TabsContent>
        <TabsContent value="backlog" className="text-sm text-text-body">Backlog panel</TabsContent>
        <TabsContent value="reports" className="text-sm text-text-body">Reports panel</TabsContent>
      </Tabs>
    }
    states={[
      { label: 'Disabled tab', node: <Tabs defaultValue="a"><TabsList aria-label="Example"><TabsTrigger value="a">Open</TabsTrigger><TabsTrigger value="b" disabled>Archived</TabsTrigger></TabsList></Tabs> },
    ]}
    a11y={['tablist, tab and tabpanel roles with arrow-key navigation; Tab moves into the panel.', 'Give the list an aria-label.', 'The active tab is marked with aria-selected, not only color.']}
    doText="Keep to five tabs or fewer with one-word labels."
    dontText="Hide the only way to complete a task behind a tab people will not open."
    code={`<Tabs defaultValue="overview">
  <TabsList aria-label="Project sections">
    <TabsTrigger value="overview">Overview</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">…</TabsContent>
</Tabs>`}
    props={[
      { name: 'value / defaultValue', type: 'string', description: 'Active tab.' },
      { name: 'onValueChange', type: '(value) => void', description: 'Change handler.' },
      { name: 'orientation', type: "'horizontal' | 'vertical'", default: "'horizontal'", description: 'Layout and arrow keys.' },
    ]}
  />
);

export const DialogDoc = () => (
  <ComponentDoc
    id="c-dialog"
    name="Dialog"
    source="@/components/ui/dialog"
    maturity="stable"
    purpose="A focused task that needs a decision before returning to the page: create a task, edit a role. Phones show it near full-screen with a sticky footer (FormDialog)."
    anatomy={['Overlay', 'Popup', 'Title', 'Description', 'Body', 'Footer actions', 'Close']}
    variants={
      <Dialog>
        <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>Projects group sprints and tasks.</DialogDescription>
          </DialogHeader>
          <Input aria-label="Project name" placeholder="Project name" className="h-10" />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button className="bg-primary text-white hover:bg-primary-hover">Create project</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    }
    a11y={['Focus moves into the dialog, is trapped, and returns to the trigger on close.', 'Escape closes; the title names the dialog and the description supplies context.', 'Always include a visible Cancel next to the primary action.']}
    doText="Title it with the action: “Create project”, and keep the primary button on the right."
    dontText="Open a dialog from a dialog, or use it for a message that is only informational (use Alert or toast)."
    code={`<Dialog>
  <DialogTrigger render={<Button variant="outline" />}>Open</DialogTrigger>
  <DialogContent>
    <DialogHeader><DialogTitle>Create project</DialogTitle></DialogHeader>
    <DialogFooter><Button>Create project</Button></DialogFooter>
  </DialogContent>
</Dialog>`}
    props={[
      { name: 'open / onOpenChange', type: 'boolean / fn', description: 'Controlled state.' },
      { name: 'showCloseButton', type: 'boolean', default: 'true', description: 'DialogContent: the X button.' },
      { name: 'render', type: 'ReactElement', description: 'DialogTrigger / DialogClose: render as a Button.' },
    ]}
  />
);

export const DropdownMenuDoc = () => (
  <ComponentDoc
    id="c-dropdown-menu"
    name="DropdownMenu"
    source="@/components/ui/dropdown-menu"
    maturity="stable"
    purpose="A short list of actions for one item: task actions (Edit, Move to…, Delete). It is also the keyboard alternative to drag and drop."
    anatomy={['Trigger', 'Popup', 'Item', 'Separator']}
    variants={
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Task actions" />}><MoreHorizontal aria-hidden /></DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem><Pencil aria-hidden />Edit</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive"><Trash2 aria-hidden />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    }
    a11y={['Arrow keys move, Enter or Space selects, Escape closes and returns focus to the trigger.', 'Icon-only triggers need aria-label.', 'Destructive items sit last, apart from the others.']}
    doText="Start labels with a verb and list the safe action first."
    dontText="Hide the only way to reach an action on hover; keep a visible trigger on touch."
    code={`<DropdownMenu>
  <DropdownMenuTrigger render={<Button size="icon" aria-label="Task actions" />}>…</DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onClick={edit}>Edit</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`}
    props={[
      { name: 'align', type: "'start' | 'center' | 'end'", default: "'start'", description: 'DropdownMenuContent alignment.' },
      { name: 'variant', type: "'default' | 'destructive'", description: 'DropdownMenuItem color.' },
      { name: 'onClick', type: '() => void', description: 'DropdownMenuItem action.' },
    ]}
  />
);

export const TooltipDoc = () => (
  <ComponentDoc
    id="c-tooltip"
    name="Tooltip"
    source="@/components/ui/tooltip · TooltipHint in @/components/ds"
    maturity="stable"
    purpose="A short name or hint for a control, shown on hover and keyboard focus. TooltipHint wraps the three parts for the common case."
    anatomy={['Trigger', 'Popup', 'Arrow']}
    variants={
      <TooltipProvider>
        <TooltipHint label="Add task">
          <Button size="icon" variant="outline" aria-label="Add task"><Plus aria-hidden /></Button>
        </TooltipHint>
        <Tooltip>
          <TooltipTrigger render={<Button size="icon" variant="outline" aria-label="About story points" />}><Info aria-hidden /></TooltipTrigger>
          <TooltipContent side="bottom">Story points estimate effort, not time</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    }
    a11y={['Opens on focus as well as hover and closes with Escape.', 'The trigger keeps its own accessible name; the tooltip is a supplement.', 'Never put essential information or interactive content in a tooltip; touch devices do not show it.']}
    doText="Name icon-only buttons with 1–3 words."
    dontText="Explain errors or required steps in a tooltip."
    code={`<TooltipHint label="Add task">
  <Button size="icon" aria-label="Add task"><Plus /></Button>
</TooltipHint>`}
    props={[
      { name: 'label', type: 'ReactNode', description: 'TooltipHint: the text.' },
      { name: 'side', type: "'top' | 'bottom' | 'left' | 'right'", default: "'top'", description: 'Where it appears.' },
      { name: 'children', type: 'ReactElement', description: 'TooltipHint: one focusable element.' },
    ]}
  />
);

export const AvatarDoc = () => (
  <ComponentDoc
    id="c-avatar"
    name="Avatar"
    source="@/components/ui/avatar"
    maturity="stable"
    purpose="The shadcn primitive behind UserAvatar: an image with a fallback. Use UserAvatar in app code."
    anatomy={['Root', 'Image', 'Fallback']}
    variants={
      <>
        <Avatar><AvatarFallback>AL</AvatarFallback></Avatar>
        <Avatar size="sm"><AvatarFallback>GH</AvatarFallback></Avatar>
        <Avatar size="lg"><AvatarFallback>MR</AvatarFallback></Avatar>
      </>
    }
    a11y={['Images use empty alt when the person is named nearby.', 'Fallback initials are real text but redundant with the name: hide them with aria-hidden when a name is next to the avatar.']}
    doText="Use initials on the primary tint when there is no photo."
    dontText="Use a random color per person; it carries no meaning."
    code={`<Avatar><AvatarFallback>AL</AvatarFallback></Avatar>`}
    props={[
      { name: 'size', type: "'sm' | 'default' | 'lg'", default: "'default'", description: 'Root size.' },
      { name: 'AvatarImage src', type: 'string', description: 'Picture.' },
    ]}
  />
);

export const SkeletonDoc = () => (
  <ComponentDoc
    id="c-skeleton"
    name="Skeleton"
    source="@/components/ui/skeleton"
    maturity="stable"
    purpose="A pulsing placeholder for text, avatars and cards while content loads."
    anatomy={['Bar']}
    variants={
      <div className="w-full max-w-sm space-y-3" aria-hidden>
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full bg-slate-200" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4 bg-slate-200" />
            <Skeleton className="h-3 w-1/2 bg-slate-200" />
          </div>
        </div>
      </div>
    }
    a11y={['Decorative: mark the loading region with aria-busy and a label (SkeletonCards does).', 'The pulse is removed under prefers-reduced-motion.']}
    doText="Match the layout it replaces so nothing jumps."
    dontText="Animate a spinner next to a skeleton."
    code={`<Skeleton className="h-4 w-3/4 bg-slate-200" />`}
    props={[
      { name: 'className', type: 'string', description: 'Size and shape (h-4 w-24 rounded-full).' },
    ]}
  />
);
