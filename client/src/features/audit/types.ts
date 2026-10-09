/** Areas an audit entry belongs to (the part of the action before the dot). */
export const AUDIT_AREAS = ['task', 'project', 'sprint', 'member', 'invitation', 'workspace', 'audit'] as const;
export type AuditArea = (typeof AUDIT_AREAS)[number];

export interface AuditActor {
  _id: string;
  name: string;
  avatarUrl?: string;
}

export interface AuditChange {
  field: string;
  from?: string;
  to?: string;
}

/** One append-only audit entry: who (actor), what (action, summary, changes), when and where (ip, userAgent). */
export interface AuditEntry {
  _id: string;
  /** `<area>.<verb>`, for example `member.role_changed` */
  action: string;
  summary: string;
  /** Null when the account no longer exists */
  actor: AuditActor | null;
  changes: AuditChange[];
  ip?: string;
  userAgent?: string;
  task?: string;
  project?: string;
  sprint?: string;
  createdAt: string;
}

export interface AuditPage {
  items: AuditEntry[];
  /** Cursor of the next (older) page; null on the last page */
  nextBefore: string | null;
  retentionDays: number;
  areas: string[];
}

/** Filters kept in the URL (`?area=task&actor=<userId>`). Empty string means "all". */
export interface AuditFilters {
  area: AuditArea | '';
  actor: string;
}
