import { memo } from 'react';
import type { DocEntry } from './search';
import { AccessibilitySection, ButtonLabelsSection, ErrorMessagesSection, FormatsSection, VoiceSection } from './sections/ContentAndA11y';
import {
  AlertDoc, EmptyStateDoc, ErrorStateDoc, PageHeaderDoc, ProgressBarDoc, ProgressRingDoc, SectionHeaderDoc,
  SkeletonCardsDoc, StatCardDoc, SurfaceDoc, ToastDoc,
} from './sections/ComponentsLayout';
import {
  AvatarStackDoc, BreadcrumbsDoc, DisclosureDoc, DividerDoc, FieldDoc, IconTileDoc, KbdDoc, SearchInputDoc,
  SegmentedControlDoc, StatusPillDoc, TagDoc, TimelineDoc, UserAvatarDoc,
} from './sections/ComponentsData';
import {
  BannerDoc, ComboboxDoc, DescriptionListDoc, HoverCardDoc, PaginationDoc, PopoverDoc, SkeletonVariantsDoc, StepperDoc,
  SwitchDoc, TagInputDoc,
} from './sections/ComponentsEnriched';
import {
  AvatarDoc, ButtonDoc, CheckboxDoc, DialogDoc, DropdownMenuDoc, InputDoc, SelectDoc, SkeletonDoc, TabsDoc, TooltipDoc,
} from './sections/ComponentsUi';
import {
  BreakpointsSection, ColorSection, ElevationSection, IconographySection, MotionSection, RadiusSection, SpacingSection,
  TypographySection, ZIndexSection,
} from './sections/Foundations';
import {
  DataViewsPatternSection, FeedbackPatternSection, FormsPatternSection, MobilePatternSection, NavigationPatternSection,
  StatesPatternSection,
} from './sections/Patterns';
import { DarkModeSection } from './sections/DarkMode';
import { LoadersDoc, MotionComponentsSection } from './sections/MotionDocs';
import { ScrumPatternSection } from './sections/ScrumPattern';
import { ChangelogSection, OverviewSection, PrinciplesSection } from './sections/Start';

// Order here is the order of the page and of the navigation.
// To document something new: build a section or ComponentDoc, then add one line below.
const ENTRIES: DocEntry[] = [
  { id: 'overview', group: 'Start', title: 'Overview', keywords: 'about layers ui ds features where', Component: OverviewSection },
  { id: 'principles', group: 'Start', title: 'Principles', keywords: 'rules values clarity keyboard mobile', Component: PrinciplesSection },
  { id: 'changelog', group: 'Start', title: 'Changelog', keywords: 'release version v2 history new', Component: ChangelogSection },

  { id: 'color', group: 'Foundations', title: 'Color', keywords: 'tokens palette contrast hex status priority type project', Component: ColorSection },
  { id: 'dark-mode', group: 'Foundations', title: 'Dark mode', keywords: 'theme night light system toggle appearance contrast dark class', Component: DarkModeSection },
  { id: 'typography', group: 'Foundations', title: 'Typography', keywords: 'font inter type scale headings text size weight', Component: TypographySection },
  { id: 'spacing', group: 'Foundations', title: 'Spacing', keywords: 'gap padding margin 4px scale', Component: SpacingSection },
  { id: 'radius', group: 'Foundations', title: 'Radius', keywords: 'corners rounded border-radius', Component: RadiusSection },
  { id: 'elevation', group: 'Foundations', title: 'Elevation', keywords: 'shadow scrim depth', Component: ElevationSection },
  { id: 'motion', group: 'Foundations', title: 'Motion', keywords: 'animation duration easing transition reduced', Component: MotionSection },
  { id: 'motion-components', group: 'Foundations', title: 'Motion components', keywords: 'animation fade stagger tilt 3d press animated number count up burst reduced motion spring', Component: MotionComponentsSection },
  { id: 'z-index', group: 'Foundations', title: 'Z-index', keywords: 'layers stacking order', Component: ZIndexSection },
  { id: 'breakpoints', group: 'Foundations', title: 'Breakpoints', keywords: 'responsive screen width mobile', Component: BreakpointsSection },
  { id: 'iconography', group: 'Foundations', title: 'Iconography', keywords: 'icons lucide sizes stroke', Component: IconographySection },

  { id: 'c-page-header', group: 'Components', title: 'PageHeader', keywords: 'title h1 heading actions', Component: PageHeaderDoc },
  { id: 'c-surface', group: 'Components', title: 'Surface', keywords: 'card panel container', Component: SurfaceDoc },
  { id: 'c-section-header', group: 'Components', title: 'SectionHeader', keywords: 'heading card title count', Component: SectionHeaderDoc },
  { id: 'c-stat-card', group: 'Components', title: 'StatCard', keywords: 'metric number kpi dashboard', Component: StatCardDoc },
  { id: 'c-alert', group: 'Components', title: 'Alert', keywords: 'banner message info warning error success inline', Component: AlertDoc },
  { id: 'c-empty-state', group: 'Components', title: 'EmptyState', keywords: 'no data blank', Component: EmptyStateDoc },
  { id: 'c-error-state', group: 'Components', title: 'ErrorState', keywords: 'failure retry what happened', Component: ErrorStateDoc },
  { id: 'c-loaders', group: 'Components', title: 'Loaders', keywords: 'spinner dots progress bar page loader button loading pending busy suspense', Component: LoadersDoc },
  { id: 'c-skeleton-cards', group: 'Components', title: 'SkeletonCards', keywords: 'loading placeholder', Component: SkeletonCardsDoc },
  { id: 'c-progress-bar', group: 'Components', title: 'ProgressBar', keywords: 'completion percent linear', Component: ProgressBarDoc },
  { id: 'c-progress-ring', group: 'Components', title: 'ProgressRing', keywords: 'circular donut percent sprint', Component: ProgressRingDoc },
  { id: 'c-toast', group: 'Components', title: 'Toast', keywords: 'snackbar notification undo toaster', Component: ToastDoc },
  { id: 'c-tag', group: 'Components', title: 'Tag', keywords: 'badge label chip role', Component: TagDoc },
  { id: 'c-status-pill', group: 'Components', title: 'StatusPill and TypeBadge', keywords: 'badge status type story bug spike task pending completed', Component: StatusPillDoc },
  { id: 'c-icon-tile', group: 'Components', title: 'IconTile', keywords: 'icon square tint', Component: IconTileDoc },
  { id: 'c-user-avatar', group: 'Components', title: 'UserAvatar', keywords: 'person picture initials', Component: UserAvatarDoc },
  { id: 'c-avatar-stack', group: 'Components', title: 'AvatarStack', keywords: 'avatar group assignees people overflow', Component: AvatarStackDoc },
  { id: 'c-field', group: 'Components', title: 'Field', keywords: 'form label hint error validation input', Component: FieldDoc },
  { id: 'c-kbd', group: 'Components', title: 'Kbd', keywords: 'keyboard shortcut key', Component: KbdDoc },
  { id: 'c-search-input', group: 'Components', title: 'SearchInput', keywords: 'search filter clear query', Component: SearchInputDoc },
  { id: 'c-segmented-control', group: 'Components', title: 'SegmentedControl', keywords: 'toggle switch view radio group', Component: SegmentedControlDoc },
  { id: 'c-breadcrumbs', group: 'Components', title: 'Breadcrumbs', keywords: 'path trail navigation hierarchy', Component: BreadcrumbsDoc },
  { id: 'c-disclosure', group: 'Components', title: 'Disclosure and Accordion', keywords: 'expand collapse faq details', Component: DisclosureDoc },
  { id: 'c-timeline', group: 'Components', title: 'Timeline and ActivityItem', keywords: 'activity history feed log', Component: TimelineDoc },
  { id: 'c-divider', group: 'Components', title: 'Divider', keywords: 'separator rule hr or', Component: DividerDoc },
  { id: 'c-button', group: 'Components', title: 'Button', keywords: 'action primary outline ghost destructive shadcn', Component: ButtonDoc },
  { id: 'c-input', group: 'Components', title: 'Input', keywords: 'text field form shadcn', Component: InputDoc },
  { id: 'c-select', group: 'Components', title: 'Select', keywords: 'dropdown choose option shadcn', Component: SelectDoc },
  { id: 'c-checkbox', group: 'Components', title: 'Checkbox', keywords: 'check toggle boolean shadcn', Component: CheckboxDoc },
  { id: 'c-tabs', group: 'Components', title: 'Tabs', keywords: 'tablist panel shadcn', Component: TabsDoc },
  { id: 'c-dialog', group: 'Components', title: 'Dialog', keywords: 'modal popup overlay shadcn', Component: DialogDoc },
  { id: 'c-dropdown-menu', group: 'Components', title: 'DropdownMenu', keywords: 'menu actions context shadcn', Component: DropdownMenuDoc },
  { id: 'c-tooltip', group: 'Components', title: 'Tooltip', keywords: 'hint hover tooltiphint shadcn', Component: TooltipDoc },
  { id: 'c-avatar', group: 'Components', title: 'Avatar', keywords: 'picture shadcn', Component: AvatarDoc },
  { id: 'c-switch', group: 'Components', title: 'Switch', keywords: 'toggle on off setting boolean switchfield label description base ui', Component: SwitchDoc },
  { id: 'c-skeleton-variants', group: 'Components', title: 'Skeleton variants', keywords: 'loading placeholder list board table chart detail skeletonlist skeletonboard skeletontable skeletonchart skeletondetail', Component: SkeletonVariantsDoc },
  { id: 'c-pagination', group: 'Components', title: 'Pagination', keywords: 'pages next previous page size rows cursor older newer', Component: PaginationDoc },
  { id: 'c-stepper', group: 'Components', title: 'Stepper', keywords: 'steps wizard progress onboarding checklist current completed', Component: StepperDoc },
  { id: 'c-banner', group: 'Components', title: 'Banner', keywords: 'notice page offline update warning info dismiss announcement', Component: BannerDoc },
  { id: 'c-popover', group: 'Components', title: 'Popover', keywords: 'floating panel overlay trigger filters base ui', Component: PopoverDoc },
  { id: 'c-hover-card', group: 'Components', title: 'HoverCard', keywords: 'preview hover focus avatar task key user card preview card', Component: HoverCardDoc },
  { id: 'c-combobox', group: 'Components', title: 'Combobox', keywords: 'autocomplete search select multi assignee picker filter listbox chips', Component: ComboboxDoc },
  { id: 'c-description-list', group: 'Components', title: 'DescriptionList', keywords: 'key value details dl dt dd properties definition', Component: DescriptionListDoc },
  { id: 'c-tag-input', group: 'Components', title: 'TagInput', keywords: 'chips labels tags free text enter comma suggestions', Component: TagInputDoc },
  { id: 'c-skeleton', group: 'Components', title: 'Skeleton', keywords: 'loading placeholder shimmer shadcn', Component: SkeletonDoc },

  { id: 'p-forms', group: 'Patterns', title: 'Forms and validation', keywords: 'form errors required submit focus', Component: FormsPatternSection },
  { id: 'p-states', group: 'Patterns', title: 'Empty, loading and error states', keywords: 'empty loading error skeleton offline', Component: StatesPatternSection },
  { id: 'p-feedback', group: 'Patterns', title: 'Feedback', keywords: 'toast undo confirm destructive optimistic', Component: FeedbackPatternSection },
  { id: 'p-navigation', group: 'Patterns', title: 'Navigation', keywords: 'sidebar tab bar command palette ctrl k menu', Component: NavigationPatternSection },
  { id: 'p-data-views', group: 'Patterns', title: 'Data views', keywords: 'list board calendar timeline gantt table', Component: DataViewsPatternSection },
  { id: 'p-scrum', group: 'Patterns', title: 'Scrum visuals', keywords: 'project folder sprint burndown backlog story points', Component: ScrumPatternSection },
  { id: 'p-mobile', group: 'Patterns', title: 'Mobile and PWA', keywords: 'safe area touch target install offline phone', Component: MobilePatternSection },

  { id: 'content-voice', group: 'Content', title: 'Voice and tone', keywords: 'writing copy tone sentence case', Component: VoiceSection },
  { id: 'content-errors', group: 'Content', title: 'Error messages', keywords: 'copy errors what happened why what to do', Component: ErrorMessagesSection },
  { id: 'content-buttons', group: 'Content', title: 'Button and link labels', keywords: 'copy verb cta links', Component: ButtonLabelsSection },
  { id: 'content-formats', group: 'Content', title: 'Dates and numbers', keywords: 'format date number locale intl', Component: FormatsSection },

  { id: 'a11y', group: 'Accessibility', title: 'WCAG 2.2 AA checklist', keywords: 'accessibility wcag keyboard focus contrast screen reader zoom', Component: AccessibilitySection },
];

/** Sections are static, so memoize them: typing in the search box must not re-render every demo. */
export const DOC_ENTRIES: DocEntry[] = ENTRIES.map(entry => ({ ...entry, Component: memo(entry.Component) }));
