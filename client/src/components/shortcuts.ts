// Keyboard shortcuts: the table behind both the key handler and the "Keyboard shortcuts" dialog.

/** After `g`, the second key has this long to arrive. */
export const GO_SEQUENCE_MS = 1000;

/** Other parts of the app can open the shortcuts dialog with `window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT))`. */
export const OPEN_SHORTCUTS_EVENT = 'taskman:open-shortcuts';

export interface GoTarget {
  /** Key pressed after `g`. */
  key: string;
  /** Name of the destination. */
  label: string;
  /** Permission the destination needs; without it the shortcut does nothing. */
  permission?: string;
  path: (slug: string) => string;
}

export const GO_TARGETS: GoTarget[] = [
  { key: 'd', label: 'Dashboard', path: slug => `/${slug}/dashboard` },
  { key: 't', label: 'Tasks', permission: 'tasks:read', path: slug => `/${slug}/tasks` },
  { key: 'p', label: 'Projects', permission: 'projects:read', path: slug => `/${slug}/projects` },
  { key: 'b', label: 'Board', permission: 'tasks:read', path: slug => `/${slug}/tasks?view=board` },
  { key: 'c', label: 'Calendar', permission: 'tasks:read', path: slug => `/${slug}/calendar` },
  { key: 'r', label: 'Reports', permission: 'reports:read', path: slug => `/${slug}/reports` },
];

export interface ShortcutEntry {
  label: string;
  /** Key caps in order. */
  keys: string[];
  /** True when the keys are pressed one after the other (`G` then `D`) instead of together. */
  sequence?: boolean;
}

export interface ShortcutGroup {
  title: string;
  entries: ShortcutEntry[];
}

export const isMacPlatform = (): boolean =>
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || '');

/** The modifier key cap for this platform. */
export const modifierKey = (): string => (isMacPlatform() ? '⌘' : 'Ctrl');

export const shortcutGroups = (): ShortcutGroup[] => [
  {
    title: 'Go to',
    entries: GO_TARGETS.map(target => ({ label: `Go to ${target.label.toLowerCase()}`, keys: ['G', target.key.toUpperCase()], sequence: true })),
  },
  {
    title: 'Actions',
    entries: [
      { label: 'Create a task', keys: ['C'] },
      { label: 'Search tasks, or open search from other pages', keys: ['/'] },
      { label: 'Open search from anywhere', keys: [modifierKey(), 'K'] },
      { label: 'Show keyboard shortcuts', keys: ['?'] },
    ],
  },
  {
    title: 'In a view',
    entries: [
      { label: 'Jump to today (Calendar)', keys: ['T'] },
      { label: 'Move a bar one day (Timeline, bar focused)', keys: ['←', '→'] },
      { label: 'Resize a bar (Timeline, bar focused)', keys: ['Shift', '←', '→'] },
      { label: 'Send a comment', keys: [modifierKey(), 'Enter'] },
      { label: 'Close a dialog or menu', keys: ['Esc'] },
    ],
  },
];

/** True when typing into the target: shortcuts must not steal letters from text fields. */
export const isTextEntryTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return true;
  if (target.isContentEditable) return true;
  const editable = target.closest('[contenteditable]');
  return editable !== null && editable.getAttribute('contenteditable') !== 'false';
};

const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/** True while a dialog, sheet, menu or listbox is open on the page. */
export const isOverlayOpen = (doc: Document = document): boolean => doc.querySelector(OVERLAY_SELECTOR) !== null;
