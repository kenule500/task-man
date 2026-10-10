import mongoose from 'mongoose';
import { ACTIVITY_ACTIONS } from '../models/activityModel.js';

/** Where a client stopped reading the change feed: the entry's createdAt (ms) and its id as a tiebreak. */
export interface ChangeCursor {
  at: Date;
  id: mongoose.Types.ObjectId | null;
}

const CURSOR_PATTERN = /^(\d{1,15})_([a-f0-9]{24})$/;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/;

export const formatCursor = (entry: { createdAt: Date; _id: mongoose.Types.ObjectId | string }): string =>
  `${entry.createdAt.getTime()}_${String(entry._id)}`;

/** The cursor of a feed that has no entries yet: everything created later is "new". */
export const EMPTY_CURSOR = `0_${'0'.repeat(24)}`;

/**
 * Reads `since` as a cursor ("<ms>_<id>") or an ISO date; anything else is rejected.
 * A date has no id, so it means "strictly after that instant".
 */
export const parseCursor = (value: unknown): ChangeCursor | null => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 40) return null;
  const match = CURSOR_PATTERN.exec(value);
  if (match) {
    const at = new Date(Number(match[1]));
    return Number.isNaN(at.getTime()) ? null : { at, id: new mongoose.Types.ObjectId(match[2]) };
  }
  if (!ISO_PATTERN.test(value)) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : { at, id: null };
};

/** Mongo filter for entries after the cursor (values are cast Dates and ObjectIds, never raw input). */
export const afterCursor = (cursor: ChangeCursor): Record<string, unknown> =>
  cursor.id
    ? { $or: [{ createdAt: { $gt: cursor.at } }, { createdAt: { $eq: cursor.at }, _id: { $gt: cursor.id } }] }
    : { createdAt: { $gt: cursor.at } };

// Entries only people who manage the workspace should see (audit trail, secrets, integrations)
const AUDIT_AREAS = ['audit', 'token', 'webhook'];
const PROJECT_AREAS = ['project', 'sprint'];

const actionsOf = (areas: string[]) => ACTIVITY_ACTIONS.filter(action => areas.includes(action.split('.')[0]));

/** Actions a member must not see in the feed, given their permissions. */
export const hiddenActions = (permissions: readonly string[]): string[] => [
  ...(permissions.includes('settings:manage') ? [] : actionsOf(AUDIT_AREAS)),
  ...(permissions.includes('projects:read') ? [] : actionsOf(PROJECT_AREAS)),
];
