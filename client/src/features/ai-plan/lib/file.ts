import { toDateKey } from '@/features/tasks/lib/date';
import type { PlanApiError } from '../types';

// Choosing the document and reading the server's refusals.

export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.markdown'] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',');
/** Fallback when the server did not say (AI_PLAN_MAX_MB defaults to 4). */
export const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

export type FileProblem = 'type' | 'doc' | 'empty' | 'size';

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
};

/** Why a file cannot be uploaded, or null. The server checks the real content again. */
export const fileProblem = (file: { name: string; size: number }, maxBytes: number = DEFAULT_MAX_BYTES): FileProblem | null => {
  const extension = extensionOf(file.name);
  if (extension === '.doc') return 'doc';
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extension)) return 'type';
  if (file.size === 0) return 'empty';
  if (file.size > maxBytes) return 'size';
  return null;
};

/** "1.4 MB" style size; the unit words are not translated (they are symbols). */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(bytes < 10_000 ? 1 : 0)} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
};

/** The next Monday after `from` as YYYY-MM-DD (the default start of the first sprint, like the server). */
export const nextMondayKey = (from: Date = new Date()): string => {
  const days = ((8 - from.getDay()) % 7) || 7;
  return toDateKey(new Date(from.getFullYear(), from.getMonth(), from.getDate() + days));
};

/** Code, message and suggestion of an API refusal, whatever shape axios gave it. */
export const readPlanError = (error: unknown, fallback: string): PlanApiError => {
  const { response, request } = error as { response?: { status?: number; data?: unknown }; request?: unknown };
  if (!response) return { status: null, code: request ? 'NETWORK' : '', message: fallback, suggestion: '' };
  const data = (typeof response.data === 'object' && response.data ? response.data : {}) as {
    code?: unknown; message?: unknown; suggestion?: unknown; errors?: { msg?: unknown }[];
  };
  const message = typeof data.message === 'string' && data.message
    ? data.message
    : typeof data.errors?.[0]?.msg === 'string' ? data.errors[0].msg : '';
  return {
    status: response.status ?? null,
    code: typeof data.code === 'string' ? data.code : '',
    message: message || fallback,
    suggestion: typeof data.suggestion === 'string' ? data.suggestion : '',
  };
};
