import {
  BookOpen, CheckCircle2, Copy, Download, FolderPlus, FolderX, GitPullRequest, KeyRound, LogOut, Mail, MailX, MessageSquare,
  MessageSquareX, Package, Paperclip, Pencil, Play, Plus, Rocket, Settings, ShieldCheck, ShieldX, Timer, Trash2, UserCog, UserMinus,
  UserPlus, Webhook, Zap, type LucideIcon,
} from 'lucide-react';
import { t } from '@/i18n';
import { localeFormatter } from '@/i18n/format';
import { toDateKey } from '@/features/tasks/lib/date';
import type { AuditArea, AuditChange, AuditEntry } from '../types';

export type AuditTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export interface ActionMeta {
  label: string;
  icon: LucideIcon;
  tone: AuditTone;
}

/** Name of an area (the part of an action before the dot) in the interface language. */
export const areaName = (area: AuditArea): string => t(`settings:audit.areas.${area}`);

/** Icon and tone of every action the server records; the label comes from `settings:audit.actions`. */
export const ACTION_STYLE: Record<string, Pick<ActionMeta, 'icon' | 'tone'>> = {
  'task.created': { icon: Plus, tone: 'success' },
  'task.updated': { icon: Pencil, tone: 'primary' },
  'task.deleted': { icon: Trash2, tone: 'danger' },
  'task.commented': { icon: MessageSquare, tone: 'neutral' },
  'task.attachment_added': { icon: Paperclip, tone: 'neutral' },
  'task.attachment_removed': { icon: Paperclip, tone: 'warning' },
  'project.created': { icon: FolderPlus, tone: 'success' },
  'project.updated': { icon: Pencil, tone: 'primary' },
  'project.deleted': { icon: FolderX, tone: 'danger' },
  'sprint.created': { icon: Timer, tone: 'success' },
  'sprint.updated': { icon: Pencil, tone: 'primary' },
  'sprint.started': { icon: Play, tone: 'primary' },
  'sprint.completed': { icon: CheckCircle2, tone: 'success' },
  'sprint.deleted': { icon: Trash2, tone: 'danger' },
  'member.role_changed': { icon: UserCog, tone: 'warning' },
  'member.removed': { icon: UserMinus, tone: 'danger' },
  'member.joined': { icon: UserPlus, tone: 'success' },
  'invitation.sent': { icon: Mail, tone: 'primary' },
  'invitation.cancelled': { icon: MailX, tone: 'warning' },
  'workspace.updated': { icon: Settings, tone: 'primary' },
  'workspace.invite_code_regenerated': { icon: KeyRound, tone: 'warning' },
  'audit.exported': { icon: Download, tone: 'neutral' },
  'member.left': { icon: LogOut, tone: 'warning' },
  'role.created': { icon: ShieldCheck, tone: 'success' },
  'role.updated': { icon: ShieldCheck, tone: 'primary' },
  'role.deleted': { icon: ShieldX, tone: 'danger' },
  'task.comment_deleted': { icon: MessageSquareX, tone: 'warning' },
  'integration.updated': { icon: GitPullRequest, tone: 'primary' },
  'task.duplicated': { icon: Copy, tone: 'success' },
  'automation.created': { icon: Zap, tone: 'success' },
  'automation.updated': { icon: Zap, tone: 'primary' },
  'automation.deleted': { icon: Zap, tone: 'danger' },
  'automation.ran': { icon: Zap, tone: 'neutral' },
  'workflow.updated': { icon: Settings, tone: 'primary' },
  'webhook.created': { icon: Webhook, tone: 'success' },
  'webhook.updated': { icon: Webhook, tone: 'primary' },
  'webhook.deleted': { icon: Webhook, tone: 'danger' },
  'token.created': { icon: KeyRound, tone: 'warning' },
  'token.revoked': { icon: KeyRound, tone: 'danger' },
  'time.logged': { icon: Timer, tone: 'primary' },
  'time.deleted': { icon: Timer, tone: 'warning' },
  'release.created': { icon: Package, tone: 'success' },
  'release.updated': { icon: Package, tone: 'primary' },
  'release.deleted': { icon: Package, tone: 'danger' },
  'release.released': { icon: Rocket, tone: 'success' },
  'field.created': { icon: Settings, tone: 'success' },
  'field.updated': { icon: Settings, tone: 'primary' },
  'field.deleted': { icon: Settings, tone: 'danger' },
  'import.completed': { icon: Download, tone: 'success' },
  'page.created': { icon: BookOpen, tone: 'success' },
  'page.updated': { icon: BookOpen, tone: 'primary' },
  'page.deleted': { icon: BookOpen, tone: 'danger' },
};

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const humanize = (text: string) => text.replace(/[_.]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

/** Translation key part of an action: dots would read as key separators. */
const actionKey = (action: string) => action.replace(/\./g, '_');

/** Label, icon and tone of an action; unknown actions (newer server) fall back to a readable label. */
export const actionMeta = (action: string): ActionMeta => {
  const style = ACTION_STYLE[action] ?? { icon: Pencil, tone: 'neutral' as const };
  return { ...style, label: t(`settings:audit.actions.${actionKey(action)}`, { defaultValue: sentenceCase(humanize(action)) }) };
};

export const areaOf = (action: string): string => action.split('.')[0];

export const areaLabel = (action: string): string =>
  t(`settings:audit.areas.${areaOf(action)}`, { defaultValue: sentenceCase(areaOf(action)) });

export const fieldLabel = (field: string): string => t(`settings:audit.fields.${field}`, { defaultValue: humanize(field) });

/** Who did it: the member, "GitHub" for webhook-driven changes, otherwise a removed account. */
export const actorName = (entry: Pick<AuditEntry, 'actor'> & { summary?: string }): string =>
  entry.actor?.name || (entry.summary?.includes('via GitHub') ? 'GitHub' : t('settings:audit.removedUser'));

const arrow = () => t('settings:audit.arrow');

/** "status: Pending → In progress". A value missing on one side shows as "none". */
export const formatChange = (change: AuditChange): string => {
  const label = fieldLabel(change.field);
  if (change.field === 'description') return t('settings:audit.change.edited', { label });
  if (change.field === 'sprint') {
    const side = (value?: string) => (value ? t('settings:audit.change.sprint') : t('settings:audit.change.backlog'));
    return `${label}: ${side(change.from)} ${arrow()} ${side(change.to)}`;
  }
  if (change.from === undefined && change.to === undefined) return t('settings:audit.change.changed', { label });
  if (change.from === undefined) return `${label}: ${change.to}`;
  if (change.to === undefined) return `${label}: ${change.from} ${arrow()} ${t('settings:audit.change.none')}`;
  return `${label}: ${change.from} ${arrow()} ${change.to}`;
};

/** Compact one-line summary for a table cell: the first `max` changes plus "+N more". */
export const summarizeChanges = (changes: AuditChange[], max = 2): string => {
  if (changes.length === 0) return '';
  const separator = t('settings:audit.change.separator');
  const shown = changes.slice(0, max).map(formatChange).join(separator);
  return changes.length > max ? `${shown}${separator}${t('settings:audit.change.more', { count: changes.length - max })}` : shown;
};

const changeOf = (entry: AuditEntry, field: string) => entry.changes.find(change => change.field === field);

const quote = (text: string) => t('settings:audit.quote', { text });
const points = (value: string) => t('settings:audit.sentence.points', { count: Number(value) });

const taskChangeSentence = (name: string, title: string, changes: AuditChange[]): string => {
  const subject = title ? quote(title) : t('settings:audit.sentence.aTask');
  if (changes.length === 0) return t('settings:audit.sentence.taskUpdated', { name, subject });
  if (changes.length > 1) {
    return t('settings:audit.sentence.taskFieldsUpdated', {
      name, subject, fields: changes.map(change => fieldLabel(change.field)).join(t('settings:audit.change.listSeparator')),
    });
  }
  const [change] = changes;
  const field = fieldLabel(change.field);
  if (change.field === 'description') return t('settings:audit.sentence.descriptionEdited', { name, subject });
  if (change.field === 'sprint') {
    return change.to
      ? t('settings:audit.sentence.movedToSprint', { name, subject })
      : t('settings:audit.sentence.movedToBacklog', { name, subject });
  }
  if (change.from !== undefined && change.to !== undefined) {
    return t('settings:audit.sentence.fieldChanged', { name, subject, field, from: change.from, to: change.to });
  }
  if (change.to !== undefined) return t('settings:audit.sentence.fieldSet', { name, subject, field, to: change.to });
  return t('settings:audit.sentence.fieldCleared', { name, subject, field });
};

/** One human sentence for an entry: "Ada changed the role of Sam from Developer to Scrum Master". */
export const describeEntry = (entry: AuditEntry): string => {
  const name = actorName(entry);
  const summary = entry.summary?.trim() ?? '';
  const subject = summary ? quote(summary) : '';
  const s = (key: string, values: Record<string, unknown> = {}) => t(`settings:audit.sentence.${key}`, { name, subject, ...values }).trim();
  const aTask = () => subject || t('settings:audit.sentence.aTask');
  const aSprint = () => summary || t('settings:audit.sentence.aSprint');
  const aMember = () => summary || t('settings:audit.sentence.aMember');

  switch (entry.action) {
    case 'task.created':
      return s(changeOf(entry, 'parent') ? 'subtaskCreated' : 'taskCreated');
    case 'task.updated':
      return taskChangeSentence(name, summary, entry.changes);
    case 'task.deleted':
      return s('taskDeleted');
    case 'task.commented':
      return s('taskCommented', { task: aTask() });
    case 'task.attachment_added':
      return s('attachmentAdded', { file: changeOf(entry, 'file')?.to ?? t('settings:audit.sentence.aFile'), task: aTask() });
    case 'task.attachment_removed':
      return s('attachmentRemoved', { file: changeOf(entry, 'file')?.from ?? t('settings:audit.sentence.aFile'), task: aTask() });
    case 'project.created':
      return s('projectCreated');
    case 'project.updated':
      return s('projectUpdated');
    case 'project.deleted':
      return s('projectDeleted');
    case 'sprint.created': {
      const [sprint, project] = summary.split(' · ');
      return project ? s('sprintCreatedIn', { sprint, project }) : s('sprintCreated', { sprint: sprint || t('settings:audit.sentence.aSprint') });
    }
    case 'sprint.started':
      return s('sprintStarted', { sprint: aSprint() });
    case 'sprint.completed': {
      const done = changeOf(entry, 'completedPoints')?.to;
      return done
        ? s('sprintCompletedPoints', { sprint: aSprint(), points: points(done) })
        : s('sprintCompleted', { sprint: aSprint() });
    }
    case 'sprint.updated':
      return s('sprintUpdated', { sprint: aSprint() });
    case 'sprint.deleted':
      return s('sprintDeleted', { sprint: aSprint() });
    case 'member.role_changed': {
      const role = changeOf(entry, 'role');
      const who = aMember();
      if (role?.from && role.to) return s('roleChangedFromTo', { who, from: role.from, to: role.to });
      return role?.to ? s('roleChangedTo', { who, to: role.to }) : s('roleChanged', { who });
    }
    case 'member.removed':
      return s('memberRemoved', { who: aMember() });
    case 'member.joined':
      return s('memberJoined', { who: summary || name });
    case 'invitation.sent': {
      const role = changeOf(entry, 'role')?.to;
      const who = summary || t('settings:audit.sentence.someone');
      return role ? s('invitedAs', { who, role }) : s('invited', { who });
    }
    case 'invitation.cancelled':
      return s('invitationCancelled', { who: summary || t('settings:audit.sentence.someone') });
    case 'workspace.updated': {
      const rename = changeOf(entry, 'name');
      if (rename?.from && rename.to) return s('workspaceRenamed', { from: rename.from, to: rename.to });
      return s('workspaceUpdated');
    }
    case 'workspace.invite_code_regenerated':
      return s('inviteCodeRegenerated');
    case 'audit.exported':
      return summary ? s('auditExportedWith', { summary }) : s('auditExported');
    default:
      return `${name} ${humanize(entry.action)}${summary ? ` ${quote(summary)}` : ''}`;
  }
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

// English keeps the day-month order of the log (en-GB); other languages use their own locale. Rebuilt when the language changes.
const dateTimeFormat = localeFormatter({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }, 'en-GB');
const fullFormat = localeFormatter({
  weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
}, 'en-GB');
const timeFormat = localeFormatter({ hour: '2-digit', minute: '2-digit' }, 'en-GB');
const weekdayFormat = localeFormatter({ weekday: 'long' }, 'en-GB');
const dateFormat = localeFormatter({ day: 'numeric', month: 'long', year: 'numeric' }, 'en-GB');

/** "9 Oct 2026, 14:03" */
export const formatDateTime = (iso: string): string => dateTimeFormat(new Date(iso));
/** "Fri, 9 October 2026, 14:03:09" */
export const formatFullDateTime = (iso: string): string => fullFormat(new Date(iso));
/** "14:03" */
export const formatTime = (iso: string): string => timeFormat(new Date(iso));

export interface AuditDayGroup {
  /** Local `YYYY-MM-DD` */
  key: string;
  label: string;
  entries: AuditEntry[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const dayLabel = (key: string, now: Date): string => {
  if (key === toDateKey(now)) return t('settings:audit.today');
  if (key === toDateKey(new Date(now.getTime() - DAY_MS))) return t('settings:audit.yesterday');
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${weekdayFormat(date)}, ${dateFormat(date)}`;
};

/** Groups entries (already newest first) by local calendar day, keeping their order. */
export const groupByDay = (entries: AuditEntry[], now: Date = new Date()): AuditDayGroup[] => {
  const groups: AuditDayGroup[] = [];
  for (const entry of entries) {
    const key = toDateKey(new Date(entry.createdAt));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, label: dayLabel(key, now), entries: [entry] });
  }
  return groups;
};

/** "from 2 Oct 2026, 09:10 to 9 Oct 2026, 14:03" for a page of entries (newest first); empty for no entries. */
export const describeRange = (entries: AuditEntry[]): string => {
  if (entries.length === 0) return '';
  return t('settings:audit.range', { from: formatDateTime(entries[entries.length - 1].createdAt), to: formatDateTime(entries[0].createdAt) });
};

// ---------------------------------------------------------------------------
// Where and links
// ---------------------------------------------------------------------------

/** "Chrome on Windows" from a user-agent string; falls back to the raw text. */
export const describeUserAgent = (userAgent?: string): string => {
  if (!userAgent) return '';
  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
      : /OPR\/|Opera/.test(userAgent) ? 'Opera'
        : /Firefox\//.test(userAgent) ? 'Firefox'
          : /Chrome\//.test(userAgent) ? 'Chrome'
            : /Safari\//.test(userAgent) ? 'Safari'
              : '';
  const system =
    /Windows/.test(userAgent) ? 'Windows'
      : /Android/.test(userAgent) ? 'Android'
        : /iPhone|iPad|iOS/.test(userAgent) ? 'iOS'
          : /Mac OS X|Macintosh/.test(userAgent) ? 'macOS'
            : /Linux/.test(userAgent) ? 'Linux'
              : '';
  if (browser && system) return t('settings:devices.browserOnOs', { browser, os: system });
  return browser || system || userAgent;
};

export interface AuditLink {
  href: string;
  label: string;
}

/** Where to look at the subject of an entry; deleted subjects have nothing to open. */
export const entryLink = (slug: string, entry: AuditEntry): AuditLink | null => {
  if (entry.action.endsWith('.deleted')) return null;
  const base = `/${slug}`;
  if (entry.task) return { href: `${base}/tasks?task=${encodeURIComponent(entry.task)}`, label: t('settings:audit.openTask') };
  if (entry.project) {
    return {
      href: `${base}/projects/${encodeURIComponent(entry.project)}`,
      label: entry.sprint ? t('settings:audit.openSprintProject') : t('settings:audit.openProject'),
    };
  }
  return null;
};
