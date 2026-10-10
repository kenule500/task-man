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
| Text | `text-slate-900` titles, `text-slate-700` body, `text-slate-500` meta (slate-500 is tuned to #5b6b82 so it passes AA on slate-100 too); `slate-400` only for icons and borders, never text | |
| Popover / muted / border / ring | shadcn tokens mapped to white / slate-100 / slate-200 / blue-300 | Base UI primitives |
| Font | Inter (body); `tabular-nums` for dates and counts | |
| Radius | `rounded-lg` controls, `rounded-xl` cards in lists, `rounded-2xl` page cards | |

### Semantic tokens (tier 2, `index.css`)

Named by job; prefer them in new code. Full tables with hex values and contrast ratios live on `/design-system`
and in `docs/DESIGN_SYSTEM.md`.

| Group | Tokens | Rule |
|---|---|---|
| Surfaces and text | `canvas`, `surface-raised`, `surface-sunken`, `border-subtle`, `border-strong`, `text-strong`, `text-body`, `text-subtle`, `text-faint`, `focus` | `text-faint` is decorative, never text |
| Status | `status-pending|in-progress|completed` (+ `-fg`, `-bg`) | Dot color, text color, soft background |
| Priority | `priority-high|medium|low` (marker) and `-text` (AA words) | Markers for dots and accents, `-text` for labels |
| Task type | `type-story|task|bug|spike` (+ `-bg`) | Emerald, blue, red, violet; always icon plus name |
| Project palette | `project-blue|violet|rose|orange|amber|emerald|teal|slate` | Folder tab, dot, sprint header; never a text color |
| Elevation | `shadow-raised` (cards) · `shadow-floating` (popovers) · `shadow-overlay` (dialogs) · `bg-scrim` | Borders do most of the separating |
| Z-index | `--z-base` 0 · `sticky` 10 · `nav` 30 · `overlay` 40 · `modal` 50 · `toast` 60 · `tooltip` 70 | Use `z-(--z-nav)`; no `z-[9999]` |
| Motion | `--duration-instant|fast|base|slow` 80/150/200/280ms; `ease-standard|enter|exit` | Transform and opacity only; exits faster than entries |
| Spacing | 4px base | Card padding 16 on phones, 20 from `sm` |

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


### Navigation

- **Sidebar** (md and up): workspace switcher, primary destinations, settings last. Below `md` it is a sheet.
- **Mobile bottom tab bar** (`components/MobileTabBar.tsx`, below `md` only): 4–5 items, icon + 11px label, 48px tall,
  `aria-current="page"` and a 2px primary bar on the active tab, `bg-white/95` with a top border, padded with
  `env(safe-area-inset-*)`, `z-(--z-nav)`. Slots a role cannot use stay empty so positions do not shift. Page content
  needs bottom padding equal to the bar so nothing hides behind it.
- **Command palette** (`components/CommandPalette.tsx`, Ctrl/Cmd+K): labelled dialog, search field, results as a
  listbox (arrows move, Enter runs, Escape closes), shortcut hints with `Kbd`, results filtered by permission. Every
  item is also reachable through the normal navigation.
- **Breadcrumbs** only three or more levels deep (Projects › Website › Sprint 4).

### Scrum visuals

Hierarchy: project → sprint → story → task/subtask. Documented live under Patterns → Scrum on `/design-system`.

- **Type colors:** story emerald, task blue, bug red, spike violet (`type-*` tokens, 700 shades). Always `TypeBadge` (icon + name);
  never color a whole row by type.
- **Project palette:** eight colors (`project-*`). A project folder card is a white card with a colored tab at its top-left,
  the project dot beside the name, a `ProgressRing`, open-task count and an `AvatarStack`. The color is never used for text.
- **Sprint card:** name, date range with days left, `StatusPill` (Planned = pending, Active = in progress, Completed), goal line,
  `ProgressBar` of points completed, "21 of 34 points done".
- **Burndown:** solid primary line for remaining, dashed grey line for ideal, labelled axes, and a text alternative stating the
  headline number (`role="img"` + `aria-label`). Never color alone.
- **Backlog row:** checkbox, `TypeBadge`, monospace key (`WEB-12`), title (truncates; wraps below on phones), priority dot + word,
  story points in a neutral pill, `AvatarStack`. Reordering has a menu alternative to dragging.
- **Points** are unitless numbers (Fibonacci-style scale); show "pts" only in totals.

## Components

Three layers; always reuse the highest layer that fits before writing markup.
Open **`/design-system`** (public route; shell in `pages/DesignSystemPage.tsx`, content in `pages/design-system/`) to see tokens,
components, patterns, content rules and the accessibility checklist, with search and live examples.

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
| `ErrorState` | Failed page or panel: what happened · why · what to do (`role="alert"`) | `title`, `reason`, `nextStep`, `action` |
| `ProgressRing` | Circular progress on compact cards (`role="progressbar"`) | `value`, `label`, `size`, `strokeWidth` |
| `StatusPill` / `TypeBadge` | Status (dot + text) and Scrum type (icon + name) from the status and type tokens | `status` · `type`, `size` |
| `AvatarStack` | Assignees with `+N` overflow, group labelled with every name | `people`, `max`, `size` |
| `Kbd` | Keyboard shortcut key cap | `size` |
| `SearchInput` | Search with icon, clear button, Escape to clear | `label`, `value`, `onValueChange` |
| `SegmentedControl` | Choose one of 2–5 (`radiogroup`, arrows, Home/End) | `options`, `value`, `onValueChange`, `aria-label` |
| `Breadcrumbs` | Path to the current page (`aria-current="page"`) | `items`, `label`, `renderLink` |
| `Disclosure` / `Accordion` | Expandable regions (`aria-expanded`, `aria-controls`) | `title`, `open`; `items`, `type` |
| `Timeline` / `ActivityItem` | Chronological activity with `<time>` | `actor`, `timestamp`, `timeLabel` |
| `Divider` | Rule, optionally labelled | `label` |
| `TooltipHint` | Tooltip for one focusable element (icon buttons) | `label`, `side` |

   The authenticated page frame is `components/AppShell.tsx` (guard + sidebar + content column; children or
   `(user) => …`). It stays outside `ds` because it depends on routing and the session.

   Variants are `cva` recipes in `components/ds/variants.ts` (`surfaceVariants`, `tagVariants`, …) for reuse in new components.
3. **Feature components:** `features/tasks/components` (`StatusBadge`, `PriorityIndicator`, `DueDate`,
   `DependencyCount`, `FilterPills`, `OptionSelect`, `InlineText`, `InlineDate`, `TaskActionsMenu`,
   `TaskFormDialog`, `ConfirmDeleteDialog`) and `features/workspace`.

Adding a component: build it from tokens and existing primitives, add it to `components/ds` with a test in
`components/ds/__tests__`, document it on the style guide (a `ComponentDoc` page in `pages/design-system/sections/` plus a line in
`pages/design-system/registry.ts`: purpose, anatomy, variants, states, accessibility, do/don't, code, props), and list it here.
`docs/DESIGN_SYSTEM.md` has the full checklist and the maturity (stable/beta) of every component.

## Responsive & mobile

- Mobile first; breakpoints `sm` 640, `md` 768 (sidebar becomes a sheet below it), `lg` 1024, `xl` 1280.
- No horizontal page scroll at 360px. Wide content scrolls inside its own container (timeline) or changes
  shape: tables → stacked cards, calendar grid → agenda list, board columns → horizontal snap scroller.
- Touch targets ≥ 40px below `md` (44px for the tab bar, disclosure triggers and menu rows); actions hidden behind hover on desktop are always visible on touch.
- Phones get the bottom tab bar (see Navigation); fixed bars pad with `env(safe-area-inset-*)`.
- Inputs use `text-base` on mobile (prevents iOS zoom); dialogs become near full-screen with a sticky footer.
- Respect safe areas (`env(safe-area-inset-*)`) for fixed elements (PWA standalone mode).

## Progressive Web App

- Installable (manifest, icons in `client/public/icons`, theme `#2563EB`, background `#F8FAFC`), standalone display.
- The service worker caches the app shell only; API responses are never cached (private data).
- Updates are opt-in through the "New version available" prompt; an amber banner shows when offline.

## Interaction & accessibility

- Every drag interaction has a keyboard alternative (menu "Move to…", arrow keys on Gantt bars).
- Optimistic updates: the UI changes immediately; failures roll back and show a dismissible red banner.
- Deleting a task is instant with a 6-second **Undo** toast (the request is sent when the toast expires);
  other destructive actions (remove member, delete role, regenerate invite code) confirm with `ConfirmActionDialog`.
- Feedback uses toasts (`toast()` from `@/components/ds`) for success and errors; inline `Alert` for page-level problems.
- Focus is always visible (`focus-visible` ring or outline in primary).
- Empty states explain what to do next; loading uses skeleton cards, not spinners.
- Motion stays subtle (≤150ms color/shadow transitions); no decorative animation. Animate transform and opacity only, exits faster than
  entries, durations from the motion tokens, and everything collapses under `prefers-reduced-motion`.

## Copy

Sentence case, plain verbs on buttons ("Create task", "Save changes", "Delete task"), no exclamation marks, errors that say
*what happened · why · what to do* ("We could not save your changes. You are offline. Reconnect and try again.").
Never show raw API errors. Details: `/design-system` → Content.
