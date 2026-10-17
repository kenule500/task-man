# TaskMan Design System

One shared visual language for every TaskMan screen: tokens, accessible components and patterns, built on
**shadcn (Base UI)** primitives and **Tailwind CSS v4**. Version **2.1**.

## Where to find it

| What | Where |
|---|---|
| **Live style guide** (documentation site: search by title, keyword and prop name, section navigation and an "On this page" rail, a specimen language toggle (English, Français, العربية with right-to-left) and a theme toggle, "Copy import" and deep links, every component with live variants, states, code and props; no login needed) | **Production:** https://taskman-mauve.vercel.app/design-system · **Local:** http://localhost:5173/design-system |
| Link from the app | Landing page footer → **Design system** |
| Design system components | `client/src/components/ds/`, import from `@/components/ds` |
| Base primitives (shadcn / Base UI) | `client/src/components/ui/` |
| Design tokens | `client/src/index.css` (`@theme`, `.dark` and `:root`) |
| Style guide source | `client/src/pages/DesignSystemPage.tsx` (shell, search, navigation) and `client/src/pages/design-system/` (`registry.ts`, `tokens.ts`, `contrast.ts`, `kit.tsx`, `sections/*`) |
| Rules (colors, layout, mobile, Scrum visuals, accessibility, PWA) | [`DESIGN.md`](../DESIGN.md) |
| Teammate UI rules | [`perfect-ui-rules.md`](../perfect-ui-rules.md) |

The guide is organized as **Start** (overview, principles, changelog) · **Foundations** (color, contrast pairs, dark mode, typography, spacing,
radius, elevation, motion, internationalization and RTL, z-index, breakpoints, iconography) · **Components** (one page each, including LanguageSwitcher) · **Patterns** (forms, states, feedback,
navigation, data views, data visualization, chat, realtime and presence, AI features, Scrum, mobile) · **Content** (voice, errors, labels, writing for three languages, dates and numbers) · **Accessibility**.
Its outline is `h1` page, `h2` group, `h3` section, `h4` sub-heading; headings inside examples are `h5` or lower. It is a single page with anchors (`/design-system#c-button`); on phones the side
navigation becomes a "Jump to section" select.

## Architecture: three layers

```
components/ui        shadcn primitives (Base UI): Button, Input, Select, Tabs, Dialog, DropdownMenu, Avatar, Skeleton…
      ▲
components/ds        TaskMan design system: PageHeader, Surface, Tag, Field, SegmentedControl, toast… (no routing, no data)
      ▲
features/*           feature components: StatusBadge, TaskChips, TaskDetailDialog, FilterPills, project and sprint cards…  →  pages
```

Rule: **reuse the highest layer that fits** before writing new markup. The authenticated page frame
(`components/AppShell.tsx`: guard + sidebar + content column) and the mobile tab bar / command palette sit outside
`ds` because they depend on routing, the session and permissions.

## Foundations (tokens)

Tokens come in two tiers. Tier 1 are the shadcn variables every primitive reads (they keep their names). Tier 2 are
**semantic tokens named by job**, added in v2: use them in new code instead of raw slate steps. The style guide
shows each one with its hex value, usage and computed WCAG contrast ratio; a test (`pages/design-system/__tests__/tokens.test.ts`)
fails when the documented hex values drift from `index.css`.

### Color roles

| Token (`--color-…`) | Hex | Use |
|---|---|---|
| `primary` / `primary-hover` | `#2563EB` / `#1D4ED8` | Primary actions, active states, links |
| `canvas` | `#F8FAFC` | App background behind cards |
| `surface-raised` | `#FFFFFF` | Cards, tables, toolbars, popovers |
| `surface-sunken` | `#F1F5F9` | Wells: segmented control track, kbd, empty tiles |
| `border` / `border-subtle` / `border-strong` | `#E2E8F0` / `#F1F5F9` / `#CBD5E1` | Default borders / hairlines inside a card / inputs and key caps |
| `text-strong` | `#0F172A` | Titles and values |
| `text-body` | `#334155` | Paragraphs and table cells |
| `text-subtle` | `#64748B` | Meta, helper text, placeholders (4.76:1 on white) |
| `text-faint` | `#94A3B8` | Decorative only; never text |
| `focus` | `#2563EB` | 2px focus outline |
| `destructive` | `#DC2626` | Destructive actions and errors |

Legacy names still work: `background`, `surface`, `foreground`, `muted-foreground`, `ring`, `text-main`, `text-muted`.

### Status, priority, type, project

| Group | Tokens | Values |
|---|---|---|
| Status | `status-pending`, `-fg`, `-bg` | `#94A3B8`, `#334155`, `#F1F5F9` |
| | `status-in-progress`, `-fg`, `-bg` | `#2563EB`, `#1D4ED8`, `#EFF6FF` |
| | `status-completed`, `-fg`, `-bg` | `#3A9170`, `#1F6B4A`, `#EDF6F1` |
| Priority | `priority-high` / `-text` | `#C4574A` marker / `#A33A30` text |
| | `priority-medium` / `-text` | `#B8801A` marker / `#8A5B0F` text |
| | `priority-low` / `-text` | `#3A9170` marker / `#1F6B4A` text |
| Task type | `type-story` / `-bg` (success green) | `#1F6B4A` / `#EDF6F1` |
| | `type-task` / `-bg` (blue) | `#1D4ED8` / `#EFF6FF` |
| | `type-bug` / `-bg` (danger brick) | `#A33A30` / `#FBF0EE` |
| | `type-spike` / `-bg` (violet) | `#6D28D9` / `#F5F3FF` |
| Project palette | `project-blue` `violet` `rose` `orange` `amber` `emerald` `teal` `slate` | `#2563EB` `#7C3AED` `#E11D48` `#EA580C` `#D97706` `#059669` `#0D9488` `#475569` |

Marker colors (priority dots, `status-*` dots) are for shapes. For words use the `-text` / `-fg` tokens, which pass AA.
Overdue stays `danger-fg` plus a screen-reader "(overdue)". Never color alone.

### Semantic tones

`danger`, `success`, `warning` and `info` each have `-solid`, `-solid-hover`, `-dot`, `-fg`, `-bg` and `-border` (light in `@theme`, dark authored in `.dark`).
They are the only reds, greens, ochres and blues for meaning; see DESIGN.md → Color and **Foundations → Color** in the guide for every hex and ratio.
Raw `red`, `green`, `emerald`, `rose` and `amber` utilities are rejected by ESLint; those Tailwind scales are re-pointed at the tones as a safety net.

| Tone | Light solid | Light fg on bg | Dark fg on bg | White on solid |
|---|---|---|---|---|
| `danger` | `#B4493E` | 5.87:1 | 8.62:1 | 5.30:1 |
| `success` | `#2E7D5B` | 5.84:1 | 9.21:1 | 5.00:1 |
| `warning` | `#946212` | 5.30:1 | 9.12:1 | 5.23:1 |
| `info` | `#2563EB` | 6.16:1 | 8.45:1 | 5.17:1 |

### Dark mode

Light, Dark or System (default). `lib/theme.ts` (`initTheme`, `setThemePreference`, `syncThemeFromUser`, `useThemePreference`) puts a `dark` class on `<html>`;
`ThemeToggle` and the Appearance section of the profile page change it. It is stored in `localStorage` (`taskman.theme`) and on the account (`theme`).
`index.css` declares `@custom-variant dark` and a `.dark` block that re-authors the variables Tailwind utilities read, so existing components need no `dark:` classes.

| Token or utility | Light | Dark | Notes |
|---|---|---|---|
| `slate-50` / `canvas` | `#F8FAFC` | `#0B1220` | Canvas and input wells (lowest level) |
| `white` / `surface-raised` / `card` | `#FFFFFF` | `#0F172A` | Cards, tables, sidebar |
| `popover` | `#FFFFFF` | `#131D33` | One step above cards |
| `slate-100` / `surface-sunken` / `muted` | `#F1F5F9` | `#172033` | Chips, tracks, hairlines |
| `slate-200` / `border` | `#E2E8F0` | `#263449` | Default borders |
| `slate-300` / `border-strong` / `input` | `#CBD5E1` | `#3A4A63` | Input borders |
| `slate-500` / `text-subtle` | `#5B6B82` | `#94A3B8` | Meta text (6.96:1 on the card) |
| `slate-700` / `text-body` | `#334155` | `#CBD5E1` | Body text |
| `slate-900` / `text-strong` | `#0F172A` | `#F1F5F9` | Titles |
| `text-primary` | `#2563EB` | `#60A5FA` | Solid `bg-primary` buttons keep `#2563EB` + white text |
| `inverse` / `inverse-text` / `inverse-muted` / `inverse-border` | `#0F172A` `#FFFFFF` `#CBD5E1` `#1E293B` | `#1E293B` `#F8FAFC` `#CBD5E1` `#334155` | Toasts, code blocks, dark chips |
| Tint ramps (red, emerald, amber, blue, violet) | `-50/-100/-200` light panels, `-600..-900` dark text | deep panels (for example red-50 `#2B1816`), light text (red-700 `#F0A79E`) | Chips and alerts keep their class names |

Rules: use tokens or the existing utilities (no raw hex, no `dark:` variants for covered colors); `text-white` on solid fills stays white (pinned in the
`@layer utilities` block of `index.css`); surfaces that stay dark in both themes use `bg-inverse text-inverse-text`; borders keep separating cards because
shadows nearly vanish on dark. Every text pair is at least 4.5:1 and icon/focus pairs at least 3:1; `pages/design-system/darkTokens.ts` lists the pairs and
`pages/design-system/__tests__/darkTheme.test.ts` checks them and the hex values against `index.css`. The live page is **Foundations → Dark mode** in the guide.
Adding a color: light value in `@theme`, dark value in `.dark`, mirror in `darkTokens.ts`, list its text pairs.

### Scales

| Scale | Tokens / values | Notes |
|---|---|---|
| Type | Inter. Page title 24/32/700 (20 on phones) · section 18/28/700 · card heading 14/20/600 · body 14/20/400 · meta 12/16/400 · overline 12/16/600 uppercase · code 12 mono | `tabular-nums` for dates and counts |
| Spacing | 4px base; Tailwind steps 1 (4) · 2 (8) · 3 (12) · 4 (16) · 5 (20) · 6 (24) · 8 (32) · 10 (40) · 12 (48) · 16 (64) | Card padding 16 on phones, 20 from `sm` |
| Radius | `--radius-control` 8px (`rounded-lg`) · `--radius-card` 12px (`rounded-xl`) · `--radius-page` 16px (`rounded-2xl`) · `full` | |
| Elevation | `shadow-raised` (cards) · `shadow-floating` (popovers, hover lift) · `shadow-overlay` (dialogs) · `bg-scrim` (`--color-scrim`, slate-900 at 50%) | |
| Z-index | `--z-base` 0 · `--z-sticky` 10 · `--z-nav` 30 · `--z-overlay` 40 · `--z-modal` 50 · `--z-toast` 60 · `--z-tooltip` 70 | Use `z-(--z-nav)` |
| Motion | Durations `--duration-instant` 80ms · `-fast` 150ms · `-base` 200ms · `-slow` 280ms. Easings `ease-standard` `cubic-bezier(0.2,0,0,1)`, `ease-enter` `(0,0,0.2,1)`, `ease-exit` `(0.4,0,1,1)` | Transform and opacity only; exits faster than entries; global `prefers-reduced-motion` rule |
| Breakpoints | `sm` 640 · `md` 768 (sidebar docks, tab bar hides) · `lg` 1024 · `xl` 1280 | Mobile first; 360px minimum |
| Icons | Lucide, outline, stroke 2, sizes 16 / 20 / 24 | Decorative icons are `aria-hidden` |

### Motion and inverse tokens

Also documented with light and dark values on the guide: `--motion-fast|base|slow` (120/200/320ms, shared with `lib/motion.ts`), `--ease-spring-bouncy|soft` (CSS `linear()` curves),
the `--animate-tm-*` utilities, `inverse`, `inverse-text`, `inverse-muted`, `inverse-border`, the `project-*-deep` back panels and the shadcn role variables. **Foundations → Contrast pairs**
lists every text/background pair in both themes; `contrastPairs.test.ts` fails when one drops under 4.5:1 (text) or 3:1 (markers, icons, focus).

### Languages and direction

English, French and Arabic (right to left). Strings go through i18next (one JSON per namespace and language, English fallback, a parity test), layout uses logical utilities (`ms-`, `pe-`, `start-`, `text-start`),
pointing icons carry `rtl:-scale-x-100`, the board, timeline and charts stay left to right, Arabic uses Noto Sans Arabic with Western digits. The full rules, the plural table and the logical-class table are on the guide
(**Foundations → Internationalization and RTL**) and in [`DESIGN.md`](../DESIGN.md#languages-and-right-to-left). Use the guide's **Specimen language** toggle to check a component in each language.

## Components

Import from `@/components/ds` unless noted. **Maturity:** `stable` = used across the app, API frozen except additive
changes · `beta` = new in v2, API may still change in a minor version.

| Component | Purpose | Maturity | Key props |
|---|---|---|---|
| `PageHeader` | Page `h1`, subtitle, primary actions (full width on phones) | stable | `title`, `description`, `actions`, `headingLevel` |
| `Surface` | White card / panel | stable | `padding` none·sm·md·lg, `radius` lg·xl, `interactive`, `as` |
| `SectionHeader` | Heading row inside a Surface (count read after the title) | stable | `title`, `count`, `icon`, `action`, `headingLevel` |
| `StatCard` | Key number in a stat row | stable | `title`, `value`, `subtitle`, `icon`, `colorClass` |
| `Alert` | Inline message (`error` → `role="alert"`) | stable | `tone`, `title`, `onDismiss` |
| `toast()` + `Toaster` | Transient feedback with optional Undo | stable | `toast.success(text)`, `toast({ title, description, action })` |
| `EmptyState` | Explains an empty list, offers the next action | stable | `title`, `description`, `icon`, `action` |
| `ErrorState` | Failed page or panel: what happened · why · what to do | beta | `title`, `reason`, `nextStep`, `action`, `headingLevel` |
| `SkeletonCards` | Loading placeholders (preferred over spinners) | stable | `count`, `columns` |
| `ProgressBar` | Linear completion, green at 100% | stable | `value`, `label`, `showValue` |
| `ProgressRing` | Circular completion for compact cards | beta | `value`, `label`, `size`, `strokeWidth`, `showValue` |
| `Tag` | Roles, categories, small states | stable | `tone`, `size` |
| `StatusPill` | Workflow status as dot + text | beta | `status`, `size` |
| `TypeBadge` | Scrum work item type as icon + name | beta | `type`, `size` |
| `IconTile` | Decorative icon in a tinted square | stable | `tone`, `size` |
| `UserAvatar` | Person image with initials fallback | stable | `name`, `src`, `size` |
| `AvatarStack` | Overlapping avatars with `+N` | beta | `people`, `max`, `size` |
| `Field` + `fieldMessageId()` | Label + control + hint/error | stable | `label`, `htmlFor`, `required`, `hint`, `error` |
| `Kbd` | Keyboard key cap | beta | `size` |
| `SearchInput` | Search field with icon and clear button | beta | `label`, `value`, `onValueChange`, `onClear` |
| `SegmentedControl` | One-of-few choice (`radiogroup`, arrow keys) | beta | `options`, `value`, `onValueChange`, `aria-label`, `size` |
| `Breadcrumbs` | Path to the current page | beta | `items`, `label`, `renderLink` |
| `Disclosure` / `Accordion` | Expandable region(s) | beta | `title`, `open`, `defaultOpen`; `items`, `type`, `defaultOpenIds` |
| `Timeline` + `ActivityItem` | Chronological activity list | beta | `actor`, `timestamp`, `timeLabel`, `icon` |
| `Divider` | Rule, optionally labelled | stable | `label` |
| `TooltipHint` | Tooltip around one focusable element | beta | `label`, `side` |
| `SwitchField` | Switch with label and description (`ui/Switch` is the bare control) | stable | `label`, `description`, `checked`, `onCheckedChange`, `size` |
| `SkeletonList` / `SkeletonBoard` / `SkeletonTable` / `SkeletonChart` / `SkeletonDetail` | Shaped loading placeholders | stable | `label`, `rows`, `columns`, `cards`, `bare` |
| `Pagination` | Numbered or compact (cursor) page navigation | stable | `page`, `total`, `pageSize`, `compact`, `summary` |
| `Stepper` | Ordered progress, horizontal or vertical | stable | `steps`, `current`, `orientation`, `label` |
| `Banner` | Page-level notice with one action | stable | `tone`, `title`, `action`, `onDismiss` |
| `OptionCombobox` | Searchable single/multiple select | beta | `options`, `value`, `multiple`, `label` |
| `DescriptionList` + `DescriptionItem` | Label/value details (`<dl>`) | stable | `layout`, `columns`, `wide` |
| `TagInput` | Free-text chip input with suggestions | stable | `value`, `onChange`, `suggestions`, `noun`, `max` |
| `Spinner` / `DotsLoader` / `TopProgressBar` / `PageLoader` / `BrandMark` | Waits for actions and routes; the logo tile of the page loader | beta | `size`, `label`, `decorative`, `fullscreen` |
| `LanguageSwitcher` (`@/components/LanguageSwitcher`) | Globe menu: English, Français, العربية; applies at once, saved on the account | stable | `labelFrom` |

shadcn primitives in `@/components/ui` (all **stable**, documented in the guide): `Button`, `Input`, `Select`,
`Checkbox`, `Switch`, `Tabs`, `Dialog`, `DropdownMenu`, `Tooltip`, `Popover`, `HoverCard` (beta), `Combobox` (beta), `Avatar`, `Skeleton`; also `Textarea`, `AlertDialog`, `Sheet`, `Sidebar`.
Shared dialogs next to the shell: `FormDialog` (full-screen on phones, sticky footer) and `ConfirmActionDialog` (destructive confirmations).

Variants are `cva` recipes in `ds/variants.ts` (`surfaceVariants`, `tagVariants`, `alertVariants`, `iconTileVariants`,
`statusPillVariants`, `typeBadgeVariants`, `kbdVariants`, `segmentedItemVariants`) so new components can reuse them.

**Feature components** (`@/features/tasks`, `@/features/projects`): `StatusBadge`, `StatusDot`, `PriorityIndicator`, `DueDate`,
`DependencyCount`, `FilterPills`, `OptionSelect`, `StatusSelect`, `PrioritySelect`, `InlineText`, `InlineDate`, `LabelChip`/`LabelList`,
`AssigneeStack`, `TaskActionsMenu`, `TaskFormDialog`, `TaskDetailDialog`, the four views (List, Board, Calendar, Timeline) sharing `TaskViewProps`.
The Scrum project and sprint components live in `features/projects`; the guide shows static mocks built from `ds` until they are wired in.

### Per-component documentation template

Every component page in the guide has the same eight parts, built with `ComponentDoc` (`pages/design-system/kit.tsx`):

1. **Purpose**: one or two sentences, including when not to use it.
2. **Anatomy**: numbered list of parts.
3. **Variants**: live examples of every variant.
4. **States**: default, hover, focus-visible, disabled, loading, error where they apply.
5. **Accessibility**: roles, keyboard map, labelling.
6. **Do and don't**: two short cards.
7. **Code**: a copyable snippet (the Copy button guards `navigator.clipboard`).
8. **Props**: a handwritten table (name, type, default, description).

A test renders the page and fails if a component page is missing any part.

## Usage example

```tsx
import AppShell from '@/components/AppShell';
import { Alert, EmptyState, PageHeader, SectionHeader, SegmentedControl, Surface, Tag, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';

export default function ProjectsPage() {
  return (
    <AppShell>
      <PageHeader
        title="Projects"
        description="Track progress of tasks grouped by project"
        actions={<Button onClick={() => toast.success('Project created')}>New project</Button>}
      />
      <Alert tone="warning">You are offline. Changes cannot be saved until you reconnect.</Alert>
      <Surface>
        <SectionHeader title="Website v1" count={6} action={<Tag tone="success">On track</Tag>} />
        <EmptyState title="No tasks yet" description="Add a task with this project to see it here." />
      </Surface>
    </AppShell>
  );
}
```

## Patterns

Documented with live examples in the guide (Patterns group):

- **Forms and validation:** labels you can see; validate on submit, then on change; message under the field with `Field`; `aria-invalid` +
  `aria-describedby`; an error alert summarizing two or more problems; focus moves to the first invalid field; busy buttons keep their label.
- **Empty, loading, error:** `EmptyState` (first use and no results are different), `SkeletonCards`, `ErrorState` or `Alert`, and an amber offline banner.
- **Feedback:** optimistic updates; toast for results; **Undo** toast (6 seconds) for deleting a task; `ConfirmActionDialog` only for what cannot be undone.
- **Navigation:** sidebar (md and up) · bottom tab bar (below md, 48px, safe-area padded, `aria-current`) · command palette (Ctrl/Cmd+K, labelled dialog,
  combobox + listbox) · breadcrumbs three levels deep.
- **Data views:** list, board, calendar and timeline share `TaskViewProps` and the toolbar; each has a phone shape and a keyboard alternative to drag.
- **Scrum visuals:** project folder cards (tab in the project color), sprint cards, burndown (SVG with a text alternative), backlog rows with `TypeBadge`.
- **Mobile and PWA:** safe areas, 44px targets, 16px inputs, installable, app shell cached only, opt-in updates, offline banner.
- **Data visualization:** token colors (`-dot` marks at 3:1, `text-subtle` labels), `role="img"` plus a hidden table, labelled axes from zero, color never alone, always left to right.
- **Chat building blocks:** `MessageItem`, `Composer`, `TypingIndicator`, `OnlineDot`, `ConnectionBadge` (plain text messages, a polite typing line that reserves its height, dot plus word).
- **Realtime and presence:** live dot with words, held-back updates behind a "3 new changes" pill, polite live regions, pause when hidden, quiet fallback to polling.
- **AI features:** an opt-in notice above the switch (what is sent, to whom), progress in words, a partial-results banner above the summary, verdict tones (Match success, Partial warning, Mismatch danger), output rendered as plain text.
- **Permissions:** the UI hides what the role cannot do; the API enforces it anyway.

## Content

- **Voice:** professional, literal, brief. Sentence case everywhere; **no exclamation marks**; "you" for the person.
- **Error messages:** *what happened · why · what to do*. "We could not save your changes. You are offline. Reconnect and try again." Never raw API errors.
- **Button and link labels:** verb first ("Create task", "Start sprint"), match the dialog title, name the destructive result ("Remove member"), never "OK" or "Click here".
- **Writing for three languages:** about 40% more room than English; whole sentences with placeholders, never concatenation; every plural form (Arabic has six); no text in images; `localeCompare` for sorting.
- **Dates and numbers:** dates are calendar days (`YYYY-MM-DD` on the wire; format with `lib/date.ts`, never `new Date('YYYY-MM-DD')` for display);
  `Intl` for locale formats; `tabular-nums`; correct plurals; overdue in words.

## Accessibility (WCAG 2.2 AA)

The guide lists ten checks with an honest status for TaskMan today. Update the status in the same pull request that changes it.

| # | Check | Status | Note |
|---|---|---|---|
| 1 | Keyboard operable | Pass | Native elements and Base UI; menu or arrow-key alternative for every drag |
| 2 | Focus visible | Pass | Ring or 2px outline on every interactive element |
| 3 | Contrast | Partial | Text tokens pass in light and dark (dark pairs are tested). Existing priority labels still use `amber-600` (3.2:1); migrate to `priority-medium-text` |
| 4 | Labels | Pass | `Field` with `aria-describedby`; no placeholder-only labels |
| 5 | Landmarks and one `h1` | Pass | `PageHeader` is the `h1`; the shell supplies `main`; skip link on the guide |
| 6 | Reduced motion | Pass | Global `prefers-reduced-motion` rule |
| 7 | Zoom 200% / reflow | Pass | Mobile first, no horizontal page scroll at 360px |
| 8 | Touch targets | Partial | 44px on phones; dense desktop controls are 28–32px |
| 9 | Names for assistive tech | Pass | Icon buttons labelled; progress, groups and charts named |
| 10 | Forced colors | To audit | Selected states that rely only on background are not yet checked in high contrast |

## Adding or changing a component

1. Build it from tokens and existing primitives in `client/src/components/ds/` (semantic tokens, `cva` recipe in `variants.ts` if it has variants).
2. Export it from `ds/index.ts`.
3. Add a test in `ds/__tests__/` (Jest + Testing Library): roles, names, keyboard.
4. Document it in the guide (and add its export to `pages/design-system/coverage.ts`; `coverage.test.ts` fails for an export with no page): add a `ComponentDoc` page in `pages/design-system/sections/` (all eight template parts) and one line in `pages/design-system/registry.ts`.
   The smoke test `pages/__tests__/DesignSystemPage.test.tsx` fails if the page is missing, has duplicate ids, or lacks a template part.
5. New color or scale value? Add it to `index.css`, to `pages/design-system/tokens.ts` (the sync test compares the two) and to the tables above.
6. Set its maturity (`beta` until it has shipped in two screens), list it in the table above and in [`DESIGN.md`](../DESIGN.md) if it adds a rule.
7. Run the quality gates: `pnpm --filter client typecheck && pnpm --filter client lint && pnpm --filter client test`.
