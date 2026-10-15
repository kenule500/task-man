import { Accessibility, Keyboard, Layers, MousePointerClick, Smartphone, Undo2 } from 'lucide-react';
import { IconTile, Surface, Tag } from '@/components/ds';
import { DataTable, DocSection, Prose } from '../kit';

export const OverviewSection = () => (
  <DocSection id="overview" title="Overview" description="What the TaskMan design system is, where it lives and how it is layered.">
    <Prose>
      <p>
        One shared visual language for every TaskMan screen: tokens, accessible components and patterns,
        built on <strong>shadcn (Base UI)</strong> primitives and <strong>Tailwind CSS v4</strong>. It is a calm,
        light productivity UI: white cards on a slate canvas, one blue accent, and color reserved for meaning.
      </p>
    </Prose>

    <div className="grid gap-4 md:grid-cols-3">
      {[
        { layer: '3 · features', where: 'features/*', what: 'StatusBadge, FilterPills, the four task views, project and sprint cards. Know about data and permissions.' },
        { layer: '2 · ds', where: 'components/ds', what: 'PageHeader, Surface, Tag, Field, SegmentedControl, toast. Presentational: no routing, no data.' },
        { layer: '1 · ui', where: 'components/ui', what: 'shadcn primitives on Base UI: Button, Input, Select, Dialog. Generated; restyle through tokens.' },
      ].map(item => (
        <Surface key={item.layer} padding="sm" className="space-y-2">
          <div className="flex items-center gap-2">
            <IconTile size="sm"><Layers /></IconTile>
            <p className="text-sm font-semibold text-text-strong">{item.layer}</p>
          </div>
          <p className="font-mono text-xs text-text-subtle">{item.where}</p>
          <p className="text-sm text-text-body">{item.what}</p>
        </Surface>
      ))}
    </div>
    <p className="text-sm text-text-body">
      Rule: <strong>reuse the highest layer that fits</strong> before writing markup. Pages sit on top of features,
      and features import from <code className="rounded bg-surface-sunken px-1 font-mono text-xs">@/components/ds</code>,
      never the other way round.
    </p>

    <DataTable
      caption="Where things live"
      columns={['What', 'Where']}
      rows={[
        ['This guide (public, no login)', <code key="a" className="font-mono text-xs">/design-system</code>],
        ['Design system code', <code key="b" className="font-mono text-xs">client/src/components/ds/</code>],
        ['Primitives', <code key="c" className="font-mono text-xs">client/src/components/ui/</code>],
        ['Tokens', <code key="d" className="font-mono text-xs">client/src/index.css (@theme)</code>],
        ['Guide source', <code key="e" className="font-mono text-xs">client/src/pages/design-system/</code>],
        ['Written rules', <code key="f" className="font-mono text-xs">DESIGN.md · docs/DESIGN_SYSTEM.md</code>],
      ]}
    />
  </DocSection>
);

const PRINCIPLES = [
  { icon: <Layers />, title: 'Clarity over decoration', body: 'Every pixel earns its place. White cards, one accent, no gradients or ornament. Color means something: status, priority, type, overdue.' },
  { icon: <MousePointerClick />, title: 'One primary action per view', body: 'Each screen has a single filled blue button (Add task, Start sprint). Everything else is outline or ghost.' },
  { icon: <Keyboard />, title: 'Keyboard parity for every drag', body: 'Anything you can drag, you can do from the keyboard or a menu: "Move to…", arrow keys on Gantt bars, Ctrl/Cmd+K for navigation.' },
  { icon: <Smartphone />, title: 'Mobile first', body: 'Design at 360px, then add columns. Tables become cards, the calendar becomes an agenda, the sidebar becomes a bottom tab bar. Targets are at least 44px.' },
  { icon: <Undo2 />, title: 'Honest feedback', body: 'Update the UI immediately, roll back loudly on failure. Prefer Undo over "Are you sure?" and reserve confirmation for what cannot be undone.' },
  { icon: <Accessibility />, title: 'Accessible by default', body: 'Native elements first, visible focus, AA contrast, names for every control, reduced motion. Accessibility is part of "done", not a later pass.' },
];

export const PrinciplesSection = () => (
  <DocSection id="principles" title="Principles" description="Six rules we settle design arguments with.">
    <ol className="grid gap-4 md:grid-cols-2">
      {PRINCIPLES.map((principle, index) => (
        <li key={principle.title}>
          <Surface padding="sm" className="h-full space-y-2">
            <div className="flex items-center gap-3">
              <IconTile size="sm">{principle.icon}</IconTile>
              <h3 className="text-sm font-semibold text-text-strong">
                <span className="mr-1.5 tabular-nums text-text-subtle">{index + 1}.</span>
                {principle.title}
              </h3>
            </div>
            <p className="text-sm text-text-body">{principle.body}</p>
          </Surface>
        </li>
      ))}
    </ol>
  </DocSection>
);

const RELEASES = [
  {
    version: 'v2.0',
    date: 'October 2026',
    changes: [
      'Scrum: projects, sprints, backlog, story points and work item types (story, task, bug, spike).',
      'Mobile bottom tab bar with safe-area padding; the sidebar becomes a sheet below 768px.',
      'Command palette (Ctrl/Cmd+K) for navigation and quick actions.',
      'FAQ and help center with search.',
      'Design system: semantic tokens (status, priority, type, project palette, elevation, z-index, motion) and 15 new components (Kbd, SearchInput, SegmentedControl, Breadcrumbs, Disclosure, Accordion, ProgressRing, StatusPill, TypeBadge, ErrorState, Timeline, AvatarStack, Divider, TooltipHint).',
      'This guide rebuilt as a documentation site with search, scrollspy navigation and a per-component template.',
    ],
  },
  {
    version: 'v1.x',
    date: 'Earlier',
    changes: [
      'Task list, board, calendar and timeline views on shadcn Base UI with Tailwind v4.',
      'Transactional email, workspace demo seeding and the first design system page.',
      'Toasts with Undo, full-screen FormDialog on phones, installable PWA.',
    ],
  },
];

export const ChangelogSection = () => (
  <DocSection id="changelog" title="Changelog" description="What changed in the design system, newest first.">
    <ol className="space-y-4">
      {RELEASES.map(release => (
        <li key={release.version}>
          <Surface padding="sm" className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-text-strong">{release.version}</h3>
              <Tag tone={release.version === 'v2.0' ? 'primary' : 'neutral'} size="sm">{release.date}</Tag>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-text-body">
              {release.changes.map(change => <li key={change}>{change}</li>)}
            </ul>
          </Surface>
        </li>
      ))}
    </ol>
  </DocSection>
);
