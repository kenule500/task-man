import { onActivity, type RecordedActivity } from '../utils/activity.js';
import { formatCursor } from '../utils/changeCursor.js';
import { auditRoom, emitToRoom, projectRoom, workspaceRoom } from './bus.js';

// Mirrors hiddenActions() in utils/changeCursor.ts: entries in these areas are only for callers with
// the matching permission. Emitting to the permission room means the filter happens once per entry
// instead of once per connected socket (spec RISK-002).
const AUDIT_AREAS = ['audit', 'token', 'webhook'];
const PROJECT_AREAS = ['project', 'sprint'];

const roomFor = (workspaceId: string, action: string): string => {
  const area = action.split('.')[0];
  if (AUDIT_AREAS.includes(area)) return auditRoom(workspaceId);
  if (PROJECT_AREAS.includes(area)) return projectRoom(workspaceId);
  return workspaceRoom(workspaceId);
};

let unsubscribe: (() => void) | null = null;

/**
 * Pushes each recorded activity entry to connected members as the same shape the REST change feed
 * returns, so the client merges it exactly as it would a polled batch.
 */
export const registerActivityRealtime = (): void => {
  if (unsubscribe) return;

  unsubscribe = onActivity((req, entry: RecordedActivity) => {
    const id = entry._id;
    if (!id) return;

    const actorId = req.user?._id ?? entry.actor;
    const change = {
      id: String(id),
      action: entry.action,
      task: entry.task ? String(entry.task) : undefined,
      project: entry.project ? String(entry.project) : undefined,
      sprint: entry.sprint ? String(entry.sprint) : undefined,
      actor: actorId ? { _id: String(actorId), name: req.user?.name ?? '' } : null,
      summary: entry.summary,
      fields: (entry.changes ?? []).map(({ field, from, to }) => ({ field, from, to })),
      at: entry.createdAt.toISOString(),
    };

    // The cursor lets a reconnecting client resume exactly after this entry (spec NFR-015)
    const cursor = formatCursor({ createdAt: entry.createdAt, _id: id });
    emitToRoom(roomFor(String(entry.workspace), entry.action), 'activity:changed', { change, cursor });
  });
};
