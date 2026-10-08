# DESIGN.md

TaskMan's UI is a calm, light productivity dashboard: white cards on a soft slate background, one blue
accent, color reserved for meaning (status, priority, deadlines). References: the Renza tasks screen
(stat row + dense task table) and Planora (soft, scannable kanban cards).

## Tokens

Defined in `client/src/index.css` (`@theme`). Use the semantic token or the listed Tailwind class, not raw hex.

| Role | Value | Usage |
|---|---|---|
| Primary | `#2563EB` (`bg-primary`, hover `bg-primary-hover`) | Primary buttons, active pills, focus, today marker |
| Page background | `bg-slate-50` | App canvas |
| Surface | `bg-white` + `border-slate-100` + `shadow-sm` | Cards, tables, columns, toolbars |
| Text | `text-slate-900` titles, `text-slate-700` body, `text-slate-500/400` meta | |
| Popover / muted / border / ring | shadcn tokens mapped to white / slate-100 / slate-200 / blue-300 | Base UI primitives |
| Font | Inter (body); `tabular-nums` for dates and counts | |
| Radius | `rounded-lg` controls, `rounded-xl` cards in lists, `rounded-2xl` page cards | |

## Meaning colors (single source: `features/tasks/constants.ts`)

| Status | Badge | Dot |
|---|---|---|
| Pending | slate-100 / slate-700 | slate-400 |
| In Progress | blue-50 / blue-700 | blue-600 |
| Completed | emerald-50 / emerald-700 | emerald-500 |

| Priority | Text | Accent |
|---|---|---|
| High | red-600 | red |
| Medium | amber-600 | amber |
| Low | emerald-600 | emerald |

Overdue (unfinished and due before today) is always **red-600** text or a red chip, plus a
screen-reader "(overdue)" label. Never use color as the only signal: pair it with a label or dot + text.

## Layout patterns

- **Page:** title + subtitle left, primary action ("Add Task") right; stat row (Total, In Progress,
  Completed, Overdue); then a white toolbar card (view switcher, status pills with counts, search,
  priority, sort); then the active view.
- **List:** grid table, uppercase 12px headers, rows `py-3`, inline editing on hover/focus, actions menu
  revealed on hover and always reachable by keyboard.
- **Board:** three columns (Pending > In Progress > Completed) on slate-50, white cards with a 3px top
  accent in the priority color, due date + dependency count footer.
- **Calendar:** month grid, 6 fixed weeks, today in a filled blue circle, chips tinted by status.
- **Timeline:** sticky task-name column, day/week zoom, weekends shaded, blue today line, grey
  dependency arrows, red dashed arrows for scheduling conflicts.

## Components

Three layers; always reuse the highest layer that fits before writing markup.
Open **`/design-system`** (public route, `pages/DesignSystemPage.tsx`) to see every component live.

1. **Primitives:** `components/ui` (shadcn Base UI): `Button`, `Input`, `Textarea`, `Select`, `Tabs`,
   `Checkbox`, `Dialog`, `AlertDialog`, `DropdownMenu`, `Avatar`, `Skeleton`, `Sidebar`. Generated; restyle through tokens.
2. **Design system:** `components/ds` (`import { … } from '@/components/ds'`):

| Component | Use it for | Key props |
|---|---|---|
| `PageHeader` | The page `h1`, subtitle and primary actions (wrap full width on mobile) | `title`, `description`, `actions` |
| `Surface` | Any white card / panel | `padding` none·sm·md·lg, `radius` lg·xl, `interactive`, `as` |
| `SectionHeader` | Heading row inside a Surface | `title`, `count`, `icon`, `action` |
| `StatCard` | Key numbers in stat rows | `title`, `value`, `subtitle`, `icon`, `colorClass` |
| `Alert` | Inline feedback (`error` → `role="alert"`, others `role="status"`) | `tone` info·success·warning·error, `title`, `onDismiss` |
| `EmptyState` | Empty lists: explain and offer the next action | `title`, `description`, `icon`, `action` |
| `SkeletonCards` | Loading placeholders | `count`, `columns` |
| `ProgressBar` | Completion (green at 100%) | `value`, `label`, `showValue` |
| `Tag` | Roles, categories, small states | `tone` neutral·primary·success·warning·danger·dark, `size` |
| `IconTile` | Decorative icon in a tinted square | `tone`, `size` |
| `UserAvatar` | People (image or initials) | `name`, `src`, `size` |
| `Field` | Label + control + hint/error (`fieldMessageId(id)` for `aria-describedby`) | `label`, `htmlFor`, `required`, `hint`, `error` |

   The authenticated page frame is `components/AppShell.tsx` (guard + sidebar + content column; children or
   `(user) => …`). It stays outside `ds` because it depends on routing and the session.

   Variants are `cva` recipes in `components/ds/variants.ts` (`surfaceVariants`, `tagVariants`, …) for reuse in new components.
3. **Feature components:** `features/tasks/components` (`StatusBadge`, `PriorityIndicator`, `DueDate`,
   `DependencyCount`, `FilterPills`, `OptionSelect`, `InlineText`, `InlineDate`, `TaskActionsMenu`,
   `TaskFormDialog`, `ConfirmDeleteDialog`) and `features/workspace`.

Adding a component: build it from tokens and existing primitives, add it to `components/ds` with a test in
`components/ds/__tests__`, show its variants and states on the style guide page, and list it here.

## Responsive & mobile

- Mobile first; breakpoints `sm` 640, `md` 768 (sidebar becomes a sheet below it), `lg` 1024, `xl` 1280.
- No horizontal page scroll at 360px. Wide content scrolls inside its own container (timeline) or changes
  shape: tables → stacked cards, calendar grid → agenda list, board columns → horizontal snap scroller.
- Touch targets ≥ 40px below `md`; actions hidden behind hover on desktop are always visible on touch.
- Inputs use `text-base` on mobile (prevents iOS zoom); dialogs become near full-screen with a sticky footer.
- Respect safe areas (`env(safe-area-inset-*)`) for fixed elements (PWA standalone mode).

## Progressive Web App

- Installable (manifest, icons in `client/public/icons`, theme `#2563EB`, background `#F8FAFC`), standalone display.
- The service worker caches the app shell only; API responses are never cached (private data).
- Updates are opt-in through the "New version available" prompt; an amber banner shows when offline.

## Interaction & accessibility

- Every drag interaction has a keyboard alternative (menu "Move to…", arrow keys on Gantt bars).
- Optimistic updates: the UI changes immediately; failures roll back and show a dismissible red banner.
- Destructive actions confirm with an `AlertDialog`; everything else is instant and reversible.
- Focus is always visible (`focus-visible` ring or outline in primary).
- Empty states explain what to do next; loading uses skeleton cards, not spinners.
- Motion stays subtle (≤150ms color/shadow transitions); no decorative animation.

## Copy

Sentence case, plain verbs on buttons ("Create task", "Save changes", "Delete task"), errors that say what
happened and how to fix it ("Start date must be on or before the due date.").
