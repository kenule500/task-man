import { ALL_EVENTS } from '../types';

// Mirrors server/src/config/permissions.ts (scopes) and models/activityModel.ts (events)

export interface ScopeOption { key: string; label: string; group: string }

export const SCOPES: ScopeOption[] = [
  { key: 'projects:read', label: 'View projects', group: 'Projects' },
  { key: 'projects:write', label: 'Create and edit projects', group: 'Projects' },
  { key: 'projects:delete', label: 'Delete projects', group: 'Projects' },
  { key: 'tasks:read', label: 'View tasks', group: 'Tasks' },
  { key: 'tasks:write', label: 'Create and edit tasks', group: 'Tasks' },
  { key: 'tasks:delete', label: 'Delete tasks', group: 'Tasks' },
  { key: 'users:read', label: 'View team members', group: 'Users' },
  { key: 'users:write', label: 'Invite and remove members', group: 'Users' },
  { key: 'reports:read', label: 'View analytics', group: 'Reports' },
  { key: 'settings:manage', label: 'Change workspace settings', group: 'Settings' },
];

/** Scopes a person may give a token: only ones they hold themselves. */
export const grantableScopes = (permissions: string[]): ScopeOption[] =>
  SCOPES.filter(scope => permissions.includes(scope.key));

export interface ScopeGroup { group: string; scopes: ScopeOption[] }

export const groupScopes = (scopes: ScopeOption[]): ScopeGroup[] => {
  const groups = new Map<string, ScopeOption[]>();
  for (const scope of scopes) groups.set(scope.group, [...(groups.get(scope.group) ?? []), scope]);
  return [...groups].map(([group, items]) => ({ group, scopes: items }));
};

/** Read scopes are preselected: the safe default for a new token. */
export const defaultScopes = (scopes: ScopeOption[]): string[] =>
  scopes.filter(scope => scope.key.endsWith(':read')).map(scope => scope.key);

export interface ExpiryOption { value: string; label: string; days: number | null }

export const EXPIRY_OPTIONS: ExpiryOption[] = [
  { value: '30', label: '30 days', days: 30 },
  { value: '90', label: '90 days', days: 90 },
  { value: '365', label: '1 year', days: 365 },
  { value: 'never', label: 'No expiry', days: null },
];

export const DEFAULT_EXPIRY = '90';

export interface EventOption { key: string; label: string }
export interface EventGroup { area: string; events: EventOption[] }

export const EVENT_GROUPS: EventGroup[] = [
  { area: 'Tasks', events: [
    { key: 'task.created', label: 'Task created' },
    { key: 'task.updated', label: 'Task updated' },
    { key: 'task.deleted', label: 'Task deleted' },
    { key: 'task.duplicated', label: 'Task duplicated' },
    { key: 'task.commented', label: 'Comment added' },
    { key: 'task.comment_deleted', label: 'Comment deleted' },
    { key: 'task.attachment_added', label: 'Attachment added' },
    { key: 'task.attachment_removed', label: 'Attachment removed' },
  ] },
  { area: 'Projects', events: [
    { key: 'project.created', label: 'Project created' },
    { key: 'project.updated', label: 'Project updated' },
    { key: 'project.deleted', label: 'Project deleted' },
  ] },
  { area: 'Sprints', events: [
    { key: 'sprint.created', label: 'Sprint created' },
    { key: 'sprint.updated', label: 'Sprint updated' },
    { key: 'sprint.started', label: 'Sprint started' },
    { key: 'sprint.completed', label: 'Sprint completed' },
    { key: 'sprint.deleted', label: 'Sprint deleted' },
  ] },
  { area: 'Members and roles', events: [
    { key: 'member.joined', label: 'Member joined' },
    { key: 'member.left', label: 'Member left' },
    { key: 'member.removed', label: 'Member removed' },
    { key: 'member.role_changed', label: 'Member role changed' },
    { key: 'role.created', label: 'Role created' },
    { key: 'role.updated', label: 'Role updated' },
    { key: 'role.deleted', label: 'Role deleted' },
    { key: 'invitation.sent', label: 'Invitation sent' },
    { key: 'invitation.cancelled', label: 'Invitation cancelled' },
  ] },
  { area: 'Automations and workflow', events: [
    { key: 'automation.created', label: 'Automation created' },
    { key: 'automation.updated', label: 'Automation updated' },
    { key: 'automation.deleted', label: 'Automation deleted' },
    { key: 'automation.ran', label: 'Automation ran' },
    { key: 'workflow.updated', label: 'Workflow stages changed' },
  ] },
  { area: 'Workspace', events: [
    { key: 'workspace.updated', label: 'Workspace settings changed' },
    { key: 'workspace.invite_code_regenerated', label: 'Invite code regenerated' },
    { key: 'integration.updated', label: 'Integration changed' },
    { key: 'webhook.created', label: 'Webhook created' },
    { key: 'webhook.updated', label: 'Webhook changed' },
    { key: 'webhook.deleted', label: 'Webhook deleted' },
    { key: 'token.created', label: 'API token created' },
    { key: 'token.revoked', label: 'API token revoked' },
    { key: 'audit.exported', label: 'Audit log exported' },
  ] },
];

export const ALL_EVENT_KEYS: string[] = EVENT_GROUPS.flatMap(group => group.events.map(event => event.key));

const LABELS = new Map<string, string>(EVENT_GROUPS.flatMap(group => group.events.map(event => [event.key, event.label] as const)));
LABELS.set('ping', 'Test event');

export const eventLabel = (key: string): string => LABELS.get(key) ?? key;

/** "All events", "Task created", or "3 events". */
export const describeEvents = (events: string[]): string => {
  if (events.includes(ALL_EVENTS)) return 'All events';
  if (events.length === 1) return eventLabel(events[0]);
  return `${events.length} events`;
};
