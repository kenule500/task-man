# DESIGN.md

TaskMan's UI is a calm productivity dashboard in a light and an authored dark theme: cards on a soft slate canvas, one blue
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
| Semantic tones | `danger|success|warning|info` + `-solid`, `-solid-hover`, `-dot`, `-fg`, `-bg`, `-border` | See Color below; the only reds, greens, ochres and blues |
| Status | `status-pending|in-progress|completed` (+ `-fg`, `-bg`) | Dot color, text color, soft background |
| Priority | `priority-high|medium|low` (marker) and `-text` (AA words) | Markers for dots and accents, `-text` for labels |
| Task type | `type-story|task|bug|spike` (+ `-bg`) | Success green, blue, danger brick, violet; always icon plus name |
| Project palette | `project-blue|violet|rose|orange|amber|emerald|teal|slate` | Folder tab, dot, sprint header; never a text color |
| Elevation | `shadow-raised` (cards) · `shadow-floating` (popovers) · `shadow-overlay` (dialogs) · `bg-scrim` | Borders do most of the separating |
| Z-index | `--z-base` 0 · `sticky` 10 · `nav` 30 · `overlay` 40 · `modal` 50 · `toast` 60 · `tooltip` 70 | Use `z-(--z-nav)`; no `z-[9999]` |
| Motion | `--duration-instant|fast|base|slow` 80/150/200/280ms; `--motion-fast|base|slow` 120/200/320ms; `ease-standard|enter|exit` | Transform and opacity only; exits faster than entries; see Motion |
| Spacing | 4px base | Card padding 16 on phones, 20 from `sm` |

## Color

One calm system of five tones. Color is reserved for meaning and comes from tokens, never from raw Tailwind hues.

| Tone | Use it for | Light solid / fg / bg | Dark fg / bg |
|---|---|---|---|
| Neutral (`slate`, `text-*`, `surface-*`) | Default text, surfaces, borders, pending | n/a | n/a |
| `info` | In progress, selected, links, neutral news (the blue family, same hue as `primary`) | `#2563EB` / `#1D4ED8` / `#EFF6FF` | `#93C5FD` / `#13244A` |
| `success` | Completed, saved, done, low priority, stories (calm sage green) | `#2E7D5B` / `#1F6B4A` / `#EDF6F1` | `#8FD3B4` / `#0F2620` |
| `warning` | Needs attention, at risk, offline, medium priority (ochre) | `#946212` / `#8A5B0F` / `#FBF3E1` | `#E6BE6A` / `#2A2008` |
| `danger` | Errors, overdue, destructive actions, bugs, high priority (muted brick) | `#B4493E` / `#A33A30` / `#FBF0EE` | `#F0A79E` / `#2B1816` |

Each tone has six parts, authored for light and for dark (dark is not an inversion):

| Part | Class examples | Rule |
|---|---|---|
| `-solid`, `-solid-hover` | `bg-danger-solid text-white hover:bg-danger-solid-hover` | Filled buttons and badges. White text is at least 5.0:1 |
| `-dot` | `bg-success-dot`, `fill-warning-dot`, `border-t-danger-dot` | Markers, bars, chart fills. At least 3.4:1 on surfaces; never text |
| `-fg` | `text-danger-fg` | Text and icons on a surface and on `-bg`. At least 4.5:1 (5.3:1 or better in light) |
| `-bg`, `-border` | `bg-warning-bg border-warning-border` | Soft chip, alert and hover backgrounds and borders |

- **Shared recipes:** `components/ds/variants.ts` (`tagVariants`, `alertVariants`, `iconTileVariants`) and the `destructive` button variant use these tokens, so every surface shows the same tones.
- **Never use raw red, green, emerald, rose or amber utilities** (`bg-red-50`, `text-emerald-600`). ESLint (`no-restricted-syntax`) rejects them outside the style guide page.
  The Tailwind `red`, `rose`, `emerald`, `green` and `amber` scales are re-pointed at the tones in `index.css` as a safety net only.
- Pair color with a word or icon (a danger dot plus "Overdue"). Tones are checked in light and dark by `pages/design-system/__tests__`; ratios are listed on `/design-system` → Color.

## Dark mode

Light, Dark or System (default), chosen in Settings → Profile → Appearance or with `ThemeToggle` (`components/ThemeToggle.tsx`).
The choice is stored in `localStorage` (`taskman.theme`, applied in `main.tsx` before the first render because the CSP forbids inline
scripts) and on the account (`theme` on `PUT /api/profile`). `lib/theme.ts` toggles `dark` on `<html>`; `index.css` has
`@custom-variant dark (&:where(.dark, .dark *))` and a `.dark` block.

- **Re-authored variables, not `dark:` variants.** The `.dark` block re-maps the slate ramp (`white` = card `#0F172A`, `slate-50` = canvas `#0B1220`,
  `slate-100` = raised well `#172033`, `slate-200` = border, text steps 500 `#94A3B8` … 900 `#F1F5F9`), the tint ramps (`-50/-100/-200` become deep panels,
  `-600/-700/-800/-900` become light text), the semantic tones (`danger`, `success`, `warning`, `info`, authored separately for dark) and the shadcn, role, status,
  priority and type tokens. Existing `bg-white`, `text-slate-500`, `bg-danger-bg text-danger-fg` switch with no change. Elevation is lightness: canvas < card < raised well; shadows get heavier but borders still do the separating.
- **Fixed colors are pinned** in an `@layer utilities` block in `index.css`: `text-white` and white overlays on solid fills stay white, `bg-slate-900/800` become the
  inverse surface, `text-primary` turns `#60A5FA` (solid primary buttons stay `#2563EB` with white text).
  New code uses `bg-inverse text-inverse-text` (tokens `inverse`, `inverse-text`, `inverse-muted`, `inverse-border`) for surfaces that stay dark in both themes.
- **Contrast:** every text pair is at least 4.5:1 and icon/focus pairs at least 3:1. `pages/design-system/darkTokens.ts` lists the pairs and `darkTheme.test.ts`
  checks them against `index.css`. Adding a color means adding both values and its pairs.
- Never write raw hex or `dark:bg-[#…]` for colors the ramp already covers. Verify each screen in both themes, including focus, disabled, error and empty states.

## Meaning colors (single source: `features/tasks/constants.ts`)

| Status | Badge | Dot |
|---|---|---|
| Pending | slate-100 / slate-700 | slate-400 |
| In Progress | `info-bg` / `info-fg` | `info-dot` |
| Completed | `success-bg` / `success-fg` | `success-dot` |

| Priority | Text | Accent |
|---|---|---|
| High | `danger-fg` | `danger-dot` |
| Medium | `warning-fg` | `warning-dot` |
| Low | `success-fg` | `success-dot` |

Overdue (unfinished and due before today) is always `danger-fg` text or a danger chip, plus a
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

- **Type colors:** story success green, task blue, bug danger brick, spike violet (`type-*` tokens). Always `TypeBadge` (icon + name);
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
   `Checkbox`, `Switch`, `Dialog`, `AlertDialog`, `DropdownMenu`, `Popover`, `HoverCard`, `Combobox`, `Avatar`, `Skeleton`, `Sidebar`.
   Generated; restyle through tokens.
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
| `SwitchField` (+ `ui/Switch`) | On/off setting applied at once: label, description, `role="switch"`. Never hand-roll a switch | `label`, `description`, `checked`, `onCheckedChange`, `size` sm·md |
| `SkeletonList` · `SkeletonBoard` · `SkeletonTable` · `SkeletonChart` · `SkeletonDetail` | Loading placeholders shaped like the content (one `aria-busy` status region with hidden "Loading …" text) | `label`, `rows`/`columns`/`cards`, `bare` |
| `Pagination` | Numbered pages with ellipsis, page size, "x–y of z"; `compact` for cursor lists (audit log) | `page`, `total`, `pageSize`, `onPageChange`, `compact`, `summary` |
| `Stepper` | Progress through ordered steps (onboarding, dashboard setup), horizontal or vertical | `steps`, `current`, `orientation`, `label` |
| `Banner` | Page-level notice (offline, update, sprint ending); one action, dismissible | `tone` info·success·warning·danger, `title`, `action`, `onDismiss` |
| `OptionCombobox` (+ `ui/Combobox`) | Searchable single or multiple select (assignees, link work) | `options`, `value`, `onValueChange`, `multiple`, `label` |
| `DescriptionList` + `DescriptionItem` | Label/value details in a real `<dl>` (task dialog) | `layout` stacked·inline, `columns` 1·2·3, `wide` |
| `TagInput` | Free-text chips with suggestions (labels) | `value`, `onChange`, `suggestions`, `noun`, `max` |

   Floating UI that is not a ds component: `ui/Popover` (interactive panel from a button) and `ui/HoverCard` (read-only preview after 400 ms
   hover or focus; `TaskKey preview`, `AssigneeStack preview` and breadcrumb crumbs use it). A hover card never holds the only copy of information.
| `FadeIn` / `Stagger` + `StaggerItem` / `AnimatedNumber` / `TiltCard` / `Pressable` / `CheckBurst` | Entrances, count-up stats, 3D hover tilt, press and completion feedback | `delay`; `value`, `format`; `max` |
| `Spinner` / `DotsLoader` / `TopProgressBar` / `PageLoader` | Waits for actions and lazy routes (`Button loading` for pending buttons) | `size`, `label`, `decorative`, `fullscreen` |

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

- Installable (manifest, icons in `client/public/icons`, theme `#2563EB`, background `#F8FAFC`), standalone display. The browser theme color follows the active theme (`#2563EB` light, `#0B1220` dark, set by `lib/theme.ts`).
- The service worker caches the app shell only; API responses are never cached (private data).
- Updates are opt-in through the "New version available" prompt; an amber banner shows when offline.

## Interaction & accessibility

- Every drag interaction has a keyboard alternative (menu "Move to…", arrow keys on Gantt bars).
- Optimistic updates: the UI changes immediately; failures roll back and show a dismissible red banner.
- Deleting a task is instant with a 6-second **Undo** toast (the request is sent when the toast expires);
  other destructive actions (remove member, delete role, regenerate invite code) confirm with `ConfirmActionDialog`.
- Feedback uses toasts (`toast()` from `@/components/ds`) for success and errors; inline `Alert` for page-level problems.
- Focus is always visible (`focus-visible` ring or outline in primary).
- Empty states explain what to do next; loading content uses the matching skeleton (`SkeletonList`, `SkeletonBoard`, `SkeletonTable`, `SkeletonChart`, `SkeletonDetail`). Spinners and the top progress bar are for actions and route changes (see Motion).
- Motion stays subtle and purposeful; see the Motion section below. Everything collapses under `prefers-reduced-motion`.


## Motion

Motion explains change and confirms actions; it never blocks input and never carries meaning alone. Tokens live in `lib/motion.ts`
(JavaScript) and `index.css` (`--motion-fast|base|slow`, `--ease-*`, `--ease-spring-bouncy|soft`); components in `components/ds/motion.tsx`
and `loaders.tsx`, documented on `/design-system` → Motion components and Loaders.

| When | What | Duration |
|---|---|---|
| Press, toggle, exit | Scale 0.98 (`Pressable`), fades, dismissals | fast 120ms |
| Hover lift, small entrances | 2px lift, `FadeIn`, popovers | base 200ms |
| Page and list entrances | `Stagger` (45ms apart, first mount only), toast spring | slow 320ms |
| Counting stats | `AnimatedNumber` (700ms, once, when scrolled into view) | n/a |

- **Animate when it explains a change:** something appeared, moved or finished (card moved column, task completed, toast, loading).
  Do not animate to decorate. The only looping animations are the empty-state icon float, the landing hero float and loaders.
- **Never block input:** no animation delays a click, a key press or a navigation; entrances are CSS and start at once; heavy motion features
  (`MotionProvider`) load after first paint; the 3D landing mock loads when the page is idle.
- **Transform and opacity only.** Exits are faster than entries. Tilt is at most 6 degrees and only on fine pointers; keyboard focus gets a lift instead.
- **Reduced motion:** `prefers-reduced-motion: reduce` is the single switch (no in-app setting). CSS collapses to 0.01ms globally; JS effects check
  `useReducedMotionSafe()` and skip tilt, scale, layout glides, count-up and bursts. State is never conveyed by motion alone (counters keep the final
  value for screen readers, loaders keep a text label).
- **Loaders:** skeletons for content; `Spinner` and `Button loading` for actions (the button keeps its width, sets `aria-busy` and disables);
  `TopProgressBar` and `PageLoader` are the Suspense fallbacks for lazy routes (they appear after 160ms so quick loads never flash).

## Copy

Sentence case, plain verbs on buttons ("Create task", "Save changes", "Delete task"), no exclamation marks, errors that say
*what happened · why · what to do* ("We could not save your changes. You are offline. Reconnect and try again.").
Never show raw API errors. Details: `/design-system` → Content.
