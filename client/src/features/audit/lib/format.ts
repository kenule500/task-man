import {
  CheckCircle2, Copy, Download, FolderPlus, FolderX, GitPullRequest, KeyRound, LogOut, Mail, MailX, MessageSquare,
  MessageSquareX, Package, Paperclip, Pencil, Play, Plus, Rocket, Settings, ShieldCheck, ShieldX, Timer, Trash2, UserCog, UserMinus,
  UserPlus, Webhook, Zap, type LucideIcon,
} from 'lucide-react';
import { toDateKey } from '@/features/tasks/lib/date';
import type { AuditArea, AuditChange, AuditEntry } from '../types';

export type AuditTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export interface ActionMeta {
  label: string;
  icon: LucideIcon;
  tone: AuditTone;
}

export const AREA_LABELS: Record<AuditArea, string> = {
  task: 'Tasks',
  project: 'Projects',
  sprint: 'Sprints',
  member: 'Members',
  invitation: 'Invitations',
  workspace: 'Workspace',
  audit: 'Exports',
  automation: 'Automations',
  workflow: 'Workflow',
  webhook: 'Webhooks',
  token: 'API tokens',
  time: 'Time',
  release: 'Releases',
  field: 'Custom fields',
  import: 'Imports',
};

export const ACTION_META: Record<string, ActionMeta> = {
  'task.created': { label: 'Task created', icon: Plus, tone: 'success' },
  'task.updated': { label: 'Task updated', icon: Pencil, tone: 'primary' },
  'task.deleted': { label: 'Task deleted', icon: Trash2, tone: 'danger' },
  'task.commented': { label: 'Comment added', icon: MessageSquare, tone: 'neutral' },
  'task.attachment_added': { label: 'File added', icon: Paperclip, tone: 'neutral' },
  'task.attachment_removed': { label: 'File removed', icon: Paperclip, tone: 'warning' },
  'project.created': { label: 'Project created', icon: FolderPlus, tone: 'success' },
  'project.updated': { label: 'Project updated', icon: Pencil, tone: 'primary' },
  'project.deleted': { label: 'Project deleted', icon: FolderX, tone: 'danger' },
  'sprint.created': { label: 'Sprint created', icon: Timer, tone: 'success' },
  'sprint.updated': { label: 'Sprint updated', icon: Pencil, tone: 'primary' },
  'sprint.started': { label: 'Sprint started', icon: Play, tone: 'primary' },
  'sprint.completed': { label: 'Sprint completed', icon: CheckCircle2, tone: 'success' },
  'sprint.deleted': { label: 'Sprint deleted', icon: Trash2, tone: 'danger' },
  'member.role_changed': { label: 'Role changed', icon: UserCog, tone: 'warning' },
  'member.removed': { label: 'Member removed', icon: UserMinus, tone: 'danger' },
  'member.joined': { label: 'Member joined', icon: UserPlus, tone: 'success' },
  'invitation.sent': { label: 'Invitation sent', icon: Mail, tone: 'primary' },
  'invitation.cancelled': { label: 'Invitation cancelled', icon: MailX, tone: 'warning' },
  'workspace.updated': { label: 'Workspace updated', icon: Settings, tone: 'primary' },
  'workspace.invite_code_regenerated': { label: 'Invite code reset', icon: KeyRound, tone: 'warning' },
  'audit.exported': { label: 'Log exported', icon: Download, tone: 'neutral' },
  'member.left': { label: 'Member left', icon: LogOut, tone: 'warning' },
  'role.created': { label: 'Role created', icon: ShieldCheck, tone: 'success' },
  'role.updated': { label: 'Role updated', icon: ShieldCheck, tone: 'primary' },
  'role.deleted': { label: 'Role deleted', icon: ShieldX, tone: 'danger' },
  'task.comment_deleted': { label: 'Comment deleted', icon: MessageSquareX, tone: 'warning' },
  'integration.updated': { label: 'Integration updated', icon: GitPullRequest, tone: 'primary' },
  'task.duplicated': { label: 'Task duplicated', icon: Copy, tone: 'success' },
  'automation.created': { label: 'Automation created', icon: Zap, tone: 'success' },
  'automation.updated': { label: 'Automation updated', icon: Zap, tone: 'primary' },
  'automation.deleted': { label: 'Automation deleted', icon: Zap, tone: 'danger' },
  'automation.ran': { label: 'Automation ran', icon: Zap, tone: 'neutral' },
  'workflow.updated': { label: 'Workflow updated', icon: Settings, tone: 'primary' },
  'webhook.created': { label: 'Webhook added', icon: Webhook, tone: 'success' },
  'webhook.updated': { label: 'Webhook updated', icon: Webhook, tone: 'primary' },
  'webhook.deleted': { label: 'Webhook removed', icon: Webhook, tone: 'danger' },
  'token.created': { label: 'API token created', icon: KeyRound, tone: 'warning' },
  'token.revoked': { label: 'API token revoked', icon: KeyRound, tone: 'danger' },
  'time.logged': { label: 'Time logged', icon: Timer, tone: 'primary' },
  'time.deleted': { label: 'Time entry removed', icon: Timer, tone: 'warning' },
  'release.created': { label: 'Release created', icon: Package, tone: 'success' },
  'release.updated': { label: 'Release updated', icon: Package, tone: 'primary' },
  'release.deleted': { label: 'Release deleted', icon: Package, tone: 'danger' },
  'release.released': { label: 'Version released', icon: Rocket, tone: 'success' },
  'field.created': { label: 'Custom field added', icon: Settings, tone: 'success' },
  'field.updated': { label: 'Custom field updated', icon: Settings, tone: 'primary' },
  'field.deleted': { label: 'Custom field removed', icon: Settings, tone: 'danger' },
  'import.completed': { label: 'Import completed', icon: Download, tone: 'success' },
};

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const humanize = (text: string) => text.replace(/[_.]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

/** Label, icon and tone of an action; unknown actions (newer server) fall back to a readable label. */
export const actionMeta = (action: string): ActionMeta =>
  ACTION_META[action] ?? { label: sentenceCase(humanize(action)), icon: Pencil, tone: 'neutral' };

export const areaOf = (action: string): string => action.split('.')[0];

export const areaLabel = (action: string): string => AREA_LABELS[areaOf(action) as AuditArea] ?? sentenceCase(areaOf(action));

const FIELD_LABELS: Record<string, string> = {
  startDate: 'start date',
  deadline: 'due date',
  storyPoints: 'story points',
  completedPoints: 'completed points',
  movedTasks: 'moved tasks',
};

export const fieldLabel = (field: string): string => FIELD_LABELS[field] ?? humanize(field);

/** Who did it: the member, "GitHub" for webhook-driven changes, otherwise a removed account. */
export const actorName = (entry: Pick<AuditEntry, 'actor'> & { summary?: string }): string =>
  entry.actor?.name || (entry.summary?.includes('via GitHub') ? 'GitHub' : 'A removed user');

/** "status: Pending → In progress". A value missing on one side shows as "none". */
export const formatChange = (change: AuditChange): string => {
  const label = fieldLabel(change.field);
  if (change.field === 'description') return `${label}: edited`;
  if (change.field === 'sprint') return `${label}: ${change.from ? 'sprint' : 'backlog'} → ${change.to ? 'sprint' : 'backlog'}`;
  if (change.from === undefined && change.to === undefined) return `${label}: changed`;
  if (change.from === undefined) return `${label}: ${change.to}`;
  if (change.to === undefined) return `${label}: ${change.from} → none`;
  return `${label}: ${change.from} → ${change.to}`;
};

/** Compact one-line summary for a table cell: the first `max` changes plus "+N more". */
export const summarizeChanges = (changes: AuditChange[], max = 2): string => {
  if (changes.length === 0) return '';
  const shown = changes.slice(0, max).map(formatChange).join('; ');
  return changes.length > max ? `${shown}; +${changes.length - max} more` : shown;
};

const changeOf = (entry: AuditEntry, field: string) => entry.changes.find(change => change.field === field);

const quote = (text: string) => `"${text}"`;
const points = (value: string) => `${value} ${Number(value) === 1 ? 'point' : 'points'}`;

const taskChangeSentence = (name: string, title: string, changes: AuditChange[]): string => {
  const subject = title ? quote(title) : 'a task';
  if (changes.length === 0) return `${name} updated ${subject}`;
  if (changes.length > 1) return `${name} updated ${changes.map(change => fieldLabel(change.field)).join(', ')} of ${subject}`;
  const [change] = changes;
  const label = fieldLabel(change.field);
  if (change.field === 'description') return `${name} edited the description of ${subject}`;
  if (change.field === 'sprint') return `${name} moved ${subject} ${change.to ? 'to another sprint' : 'to the backlog'}`;
  if (change.from !== undefined && change.to !== undefined) return `${name} changed the ${label} of ${subject} from ${change.from} to ${change.to}`;
  if (change.to !== undefined) return `${name} set the ${label} of ${subject} to ${change.to}`;
  return `${name} cleared the ${label} of ${subject}`;
};

/** One human sentence for an entry: "Ada changed the role of Sam from Developer to Scrum Master". */
export const describeEntry = (entry: AuditEntry): string => {
  const name = actorName(entry);
  const summary = entry.summary?.trim() ?? '';
  const subject = summary ? quote(summary) : '';

  switch (entry.action) {
    case 'task.created':
      return `${name} created ${changeOf(entry, 'parent') ? 'subtask' : 'task'} ${subject}`.trim();
    case 'task.updated':
      return taskChangeSentence(name, summary, entry.changes);
    case 'task.deleted':
      return `${name} deleted task ${subject}`.trim();
    case 'task.commented':
      return `${name} commented on ${subject || 'a task'}`;
    case 'task.attachment_added':
      return `${name} attached ${changeOf(entry, 'file')?.to ?? 'a file'} to ${subject || 'a task'}`;
    case 'task.attachment_removed':
      return `${name} removed ${changeOf(entry, 'file')?.from ?? 'a file'} from ${subject || 'a task'}`;
    case 'project.created':
      return `${name} created project ${subject}`.trim();
    case 'project.updated':
      return `${name} updated project ${subject}`.trim();
    case 'project.deleted':
      return `${name} deleted project ${subject}`.trim();
    case 'sprint.created': {
      const [sprint, project] = summary.split(' · ');
      return project ? `${name} created ${sprint} in ${project}` : `${name} created ${sprint || 'a sprint'}`;
    }
    case 'sprint.started':
      return `${name} started ${summary || 'a sprint'}`;
    case 'sprint.completed': {
      const done = changeOf(entry, 'completedPoints')?.to;
      return `${name} completed ${summary || 'a sprint'}${done ? ` (${points(done)})` : ''}`;
    }
    case 'sprint.updated':
      return `${name} updated ${summary || 'a sprint'}`;
    case 'sprint.deleted':
      return `${name} deleted ${summary || 'a sprint'}`;
    case 'member.role_changed': {
      const role = changeOf(entry, 'role');
      const who = summary || 'a member';
      if (role?.from && role.to) return `${name} changed the role of ${who} from ${role.from} to ${role.to}`;
      return role?.to ? `${name} changed the role of ${who} to ${role.to}` : `${name} changed the role of ${who}`;
    }
    case 'member.removed':
      return `${name} removed ${summary || 'a member'} from the workspace`;
    case 'member.joined':
      return `${summary || name} joined the workspace`;
    case 'invitation.sent': {
      const role = changeOf(entry, 'role')?.to;
      return `${name} invited ${summary || 'someone'}${role ? ` as ${role}` : ''}`;
    }
    case 'invitation.cancelled':
      return `${name} cancelled the invitation for ${summary || 'someone'}`;
    case 'workspace.updated': {
      const rename = changeOf(entry, 'name');
      if (rename?.from && rename.to) return `${name} renamed the workspace from ${rename.from} to ${rename.to}`;
      return `${name} updated the workspace settings`;
    }
    case 'workspace.invite_code_regenerated':
      return `${name} regenerated the invite code`;
    case 'audit.exported':
      return `${name} exported the audit log${summary ? ` (${summary})` : ''}`;
    default:
      return `${name} ${humanize(entry.action)}${summary ? ` ${quote(summary)}` : ''}`;
  }
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fullFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const weekdayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** "9 Oct 2026, 14:03" */
export const formatDateTime = (iso: string): string => dateTimeFormat.format(new Date(iso));
/** "Fri, 9 October 2026, 14:03:09" */
export const formatFullDateTime = (iso: string): string => fullFormat.format(new Date(iso));
/** "14:03" */
export const formatTime = (iso: string): string => timeFormat.format(new Date(iso));

export interface AuditDayGroup {
  /** Local `YYYY-MM-DD` */
  key: string;
  label: string;
  entries: AuditEntry[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const dayLabel = (key: string, now: Date): string => {
  if (key === toDateKey(now)) return 'Today';
  if (key === toDateKey(new Date(now.getTime() - DAY_MS))) return 'Yesterday';
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${weekdayFormat.format(date)}, ${dateFormat.format(date)}`;
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
  return `from ${formatDateTime(entries[entries.length - 1].createdAt)} to ${formatDateTime(entries[0].createdAt)}`;
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
  if (browser && system) return `${browser} on ${system}`;
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
  if (entry.task) return { href: `${base}/tasks?task=${encodeURIComponent(entry.task)}`, label: 'Open task' };
  if (entry.project) return { href: `${base}/projects/${encodeURIComponent(entry.project)}`, label: entry.sprint ? 'Open sprint project' : 'Open project' };
  return null;
};
