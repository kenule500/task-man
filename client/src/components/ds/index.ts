// TaskMan design system: presentational building blocks on top of shadcn (Base UI)
// primitives in components/ui. Import from '@/components/ds'. No routing or data here;
// the authenticated page frame lives in components/AppShell.tsx.
// Living style guide: /design-system (pages/DesignSystemPage + pages/design-system/*). Rules: DESIGN.md.

export {
  Alert, EmptyState, Field, IconTile, PageHeader, ProgressBar, SectionHeader,
  SkeletonCards, StatCard, Surface, Tag, UserAvatar,
} from './primitives';
export { Kbd, SearchInput, SegmentedControl, type SegmentedOption } from './inputs';
export { Accordion, Breadcrumbs, Disclosure, type AccordionItem, type BreadcrumbItem } from './navigation';
export {
  ActivityItem, AvatarStack, Divider, ErrorState, ProgressRing, StatusPill, Timeline, TooltipHint, TypeBadge,
} from './display';
export { Toaster } from './Toaster';
export { toast, useToast, type ToastAction, type ToastItem, type ToastOptions, type ToastTone } from './toastStore';
export {
  alertVariants, fieldMessageId, getInitials, iconTileVariants, kbdVariants, segmentedItemVariants,
  statusDotVariants, statusPillVariants, surfaceVariants, tagVariants, typeBadgeVariants,
} from './variants';
