# TaskMan Design System

One shared visual language for every TaskMan screen: tokens, accessible components and patterns, built on
**shadcn (Base UI)** primitives and **Tailwind CSS v4**.

## Where to find it

| What | Where |
|---|---|
| **Live style guide** (every component, variant and state, no login needed) | **Production:** https://taskman-mauve.vercel.app/design-system · **Local:** http://localhost:5173/design-system (or http://127.0.0.1:5173/design-system) |
| Link from the app | Landing page footer → **Design system** |
| Design system code | `client/src/components/ds/` — import from `@/components/ds` |
| Base primitives (shadcn / Base UI) | `client/src/components/ui/` |
| Design tokens | `client/src/index.css` (`@theme`) |
| Style guide page source | `client/src/pages/DesignSystemPage.tsx` |
| Rules (colors, layout, mobile, accessibility, PWA) | [`DESIGN.md`](../DESIGN.md) |
| Teammate UI rules | [`perfect-ui-rules.md`](../perfect-ui-rules.md) |

## Architecture: three layers

```
components/ui        shadcn primitives (Base UI): Button, Input, Select, Tabs, Dialog, DropdownMenu, Avatar, Skeleton…
      ▲
components/ds        TaskMan design system: PageHeader, Surface, StatCard, Alert, Tag, Field, toast… (no routing, no data)
      ▲
features/*           feature components: StatusBadge, TaskChips, TaskDetailDialog, FilterPills…  →  pages
```

Rule: **reuse the highest layer that fits** before writing new markup. The authenticated page frame
(`components/AppShell.tsx`: guard + sidebar + content column) sits outside `ds` because it depends on routing and the session.

## Foundations (tokens)

| Token | Value | Use |
|---|---|---|
| `primary` | `#2563EB` (hover `#1D4ED8`) | Primary actions, active states, focus, "today" markers |
| Background | `slate-50` | Page canvas |
| Surface | `white` + `slate-100` border + `shadow-sm` | Cards, tables, panels |
| Text | `slate-900` titles · `slate-700` body · `slate-500` meta (AA contrast) | |
| Status | Pending `slate` · In Progress `blue` · Completed `emerald` | Badges, dots, columns, bars |
| Priority | High `red` · Medium `amber` · Low `emerald` | Dots, card accents |
| Overdue | `red-600` + "(overdue)" for screen readers | Never color alone |
| Radius | `rounded-lg` controls · `rounded-xl` cards · `rounded-2xl` page cards | |
| Type | Inter; 24/700 page title · 18/700 section · 14/600 card heading · 14 body · 12 meta; `tabular-nums` for numbers and dates | |
| Motion | ≤150 ms color/shadow transitions; global `prefers-reduced-motion` rule | |

## Components (`@/components/ds`)

| Component | Purpose | Key props |
|---|---|---|
| `PageHeader` | Page `h1`, subtitle, primary actions (full width on phones) | `title`, `description`, `actions` |
| `Surface` | White card / panel | `padding` none·sm·md·lg · `radius` lg·xl · `interactive` · `as` |
| `SectionHeader` | Heading row inside a Surface | `title`, `count`, `icon`, `action` |
| `StatCard` | Key number in a stat row | `title`, `value`, `subtitle`, `icon`, `colorClass` |
| `Alert` | Inline message (`error` → `role="alert"`, others `role="status"`) | `tone` info·success·warning·error · `title` · `onDismiss` |
| `toast()` + `Toaster` | Transient feedback, optional action (e.g. **Undo**) | `toast.success(text)`, `toast.error(text)`, `toast({ title, description, action })` |
| `EmptyState` | Explains an empty list and offers the next action | `title`, `description`, `icon`, `action` |
| `SkeletonCards` | Loading placeholders (preferred over spinners) | `count`, `columns` |
| `ProgressBar` | Completion bar, green at 100%, exposed to screen readers | `value`, `label`, `showValue` |
| `Tag` | Roles, categories, small states | `tone` neutral·primary·success·warning·danger·dark · `size` sm·md |
| `IconTile` | Decorative icon in a tinted square | `tone`, `size` |
| `UserAvatar` | Person image with initials fallback | `name`, `src`, `size` sm·md·lg |
| `Field` + `fieldMessageId()` | Label + control + hint/error wired with `aria-describedby` | `label`, `htmlFor`, `required`, `hint`, `error` |

Variants are `cva` recipes in `ds/variants.ts` (`surfaceVariants`, `tagVariants`, `alertVariants`, `iconTileVariants`)
so new components can reuse them. Shared dialogs live next to the shell: `FormDialog` (full-screen on phones, sticky footer)
and `ConfirmActionDialog` (destructive confirmations).

### Feature components (tasks)

`StatusBadge`, `StatusDot`, `PriorityIndicator`, `DueDate`, `DependencyCount`, `FilterPills`, `OptionSelect`,
`StatusSelect`, `PrioritySelect`, `InlineText`, `InlineDate`, `LabelChip`/`LabelList`, `AssigneeStack`, `TaskActionsMenu`,
`TaskFormDialog`, `TaskDetailDialog` — exported from `@/features/tasks`. The four views (List, Board, Calendar, Timeline)
share the `TaskViewProps` contract.

## Usage example

```tsx
import AppShell from '@/components/AppShell';
import { Alert, EmptyState, PageHeader, SectionHeader, Surface, Tag, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';

export default function ProjectsPage() {
  return (
    <AppShell>
      <PageHeader
        title="Projects"
        description="Track progress of tasks grouped by project"
        actions={<Button onClick={() => toast.success('Project created')}>New project</Button>}
      />
      <Alert tone="warning">You're offline. Changes can't be saved until you reconnect.</Alert>
      <Surface>
        <SectionHeader title="Website v1" count={6} action={<Tag tone="success">On track</Tag>} />
        <EmptyState title="No tasks yet" description="Add a task with this project to see it here." />
      </Surface>
    </AppShell>
  );
}
```

## Patterns

- **Responsive:** mobile first (`sm` 640 · `md` 768 · `lg` 1024). No horizontal page scroll at 360 px; tables become
  stacked cards, the calendar becomes an agenda, board columns become a horizontal snap row; 40 px touch targets on phones;
  `text-base` inputs (no iOS zoom); dialogs full-screen with a sticky footer.
- **Accessibility:** one `h1` per page, labelled icon buttons, visible focus, keyboard alternatives for every drag
  (menu "Move to…", arrow keys on Gantt bars), AA contrast, reduced motion.
- **Feedback:** optimistic updates; deleting a task shows a 6-second **Undo** toast; other destructive actions confirm
  with `ConfirmActionDialog`; page-level problems use `Alert`.
- **Permissions:** UI hides what the role can't do (e.g. Viewers see read-only views); the API enforces it anyway.

## Adding a component

1. Build it from tokens and existing primitives in `client/src/components/ds/`.
2. Export it from `ds/index.ts`.
3. Add a test in `ds/__tests__/` (Jest + Testing Library).
4. Show its variants and states on the style guide (`pages/DesignSystemPage.tsx`) — the page is smoke-tested in
   `pages/__tests__/DesignSystemPage.test.tsx`.
5. Document it in the table above and in `DESIGN.md`.
