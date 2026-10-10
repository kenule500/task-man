// Soft work-in-progress limits per board column: the header warns, nothing is ever blocked.
import { TASK_STATUSES } from '../constants';
import type { TaskStatus } from '../types';

/** `null` = no limit. Mirrors GET/PUT /workspaces/:slug/board-settings. */
export type WipLimits = Record<TaskStatus, number | null>;

export const MAX_WIP_LIMIT = 999;

export const NO_WIP_LIMITS: WipLimits = { pending: null, 'in-progress': null, completed: null };

const asLimit = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_WIP_LIMIT ? value : null;

/** Anything the server (or a 404 body) may return -> a complete, valid `WipLimits`. */
export const normalizeWipLimits = (raw: unknown): WipLimits => {
  const source = (raw && typeof raw === 'object' && 'wipLimits' in raw ? (raw as { wipLimits: unknown }).wipLimits : raw) as
    Partial<Record<TaskStatus, unknown>> | null | undefined;
  const limits = { ...NO_WIP_LIMITS };
  for (const status of TASK_STATUSES) limits[status] = asLimit(source?.[status]);
  return limits;
};

/** True when a limit is set and the column holds more cards than it. */
export const isOverWip = (count: number, limit: number | null | undefined): boolean =>
  limit !== null && limit !== undefined && count > limit;

/** "5 / 4" next to a limit, plain "5" without one. */
export const wipCountLabel = (count: number, limit: number | null | undefined): string =>
  limit === null || limit === undefined ? String(count) : `${count} / ${limit}`;

/** Text of a limit field -> number, `null` when empty (no limit), `undefined` when invalid. */
export const parseWipInput = (text: string): number | null | undefined => {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  return asLimit(Number(trimmed)) ?? undefined;
};

export const wipLimitsEqual = (a: WipLimits, b: WipLimits): boolean =>
  TASK_STATUSES.every(status => a[status] === b[status]);
