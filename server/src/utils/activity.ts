import { Request } from 'express';
import mongoose from 'mongoose';
import Activity, { ActivityAction, IActivityChange, MAX_CHANGE_VALUE } from '../models/activityModel.js';

type Id = mongoose.Types.ObjectId | string;

export interface ActivityInput {
  action: ActivityAction;
  summary: string;
  task?: Id | null;
  project?: Id | null;
  sprint?: Id | null;
  changes?: IActivityChange[];
}

/** Turns any stored value into a short, display-ready string (dates as YYYY-MM-DD, lists comma-separated). */
export const formatChangeValue = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  let text: string;
  if (value instanceof Date) text = value.toISOString().slice(0, 10);
  else if (Array.isArray(value)) text = value.map(item => formatChangeValue(item) ?? '').filter(Boolean).join(', ');
  else text = String(value);
  return text.length > MAX_CHANGE_VALUE ? `${text.slice(0, MAX_CHANGE_VALUE - 1)}…` : text;
};

/**
 * Field-by-field differences between two snapshots, limited to `fields`.
 * Values are compared after formatting, so equal dates or lists are not reported.
 */
export const diffFields = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[],
): IActivityChange[] => fields.flatMap(field => {
  const from = formatChangeValue(before[field]);
  const to = formatChangeValue(after[field]);
  return from === to ? [] : [{ field, from, to }];
});

/** Runs a lookup used only to label an audit entry; failures give `undefined` instead of failing the request. */
export const auditLookup = async <T>(lookup: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await lookup();
  } catch {
    return undefined;
  }
};

/**
 * Appends an entry to the workspace activity log. Never throws: an audit write must not fail the
 * user's request, so problems are logged instead.
 */
export const recordActivity = async (req: Request, input: ActivityInput): Promise<void> => {
  const workspace = (req.workspace as { _id?: Id } | undefined)?._id;
  if (!workspace) return;
  try {
    await Activity.create({
      workspace,
      actor: req.user?._id,
      action: input.action,
      summary: input.summary.slice(0, 200),
      task: input.task ?? undefined,
      project: input.project ?? undefined,
      sprint: input.sprint ?? undefined,
      changes: input.changes ?? [],
      ip: req.ip?.slice(0, 64),
      userAgent: req.get('user-agent')?.slice(0, 200),
    });
  } catch (error) {
    console.error('recordActivity error:', (error as Error).message);
  }
};
