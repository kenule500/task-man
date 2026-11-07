import type { TFunction } from 'i18next';
import type { AiPlan, PlanApiError } from '../types';

// Plain-language text for the refusals the API gives, in the interface language. Unknown codes fall back to the server's
// own sentence (which is English), and finally to a generic message.

const UPLOAD_CODES = new Set([
  'FILE_TOO_LARGE', 'UNSUPPORTED_TYPE', 'EMPTY_DOCUMENT', 'UNREADABLE', 'AI_DISABLED', 'AI_NOT_CONFIGURED', 'ANALYZER_NOT_CONFIGURED', 'PLAN_IN_PROGRESS',
  'AI_DAILY_LIMIT', 'NO_FILE', 'BAD_UPLOAD', 'PROVIDER_UNKNOWN', 'KEY_MISSING', 'KEY_UNREADABLE', 'MODEL_MISSING',
  'BASE_URL_INVALID', 'BASE_URL_PRIVATE', 'BASE_URL_UNRESOLVED', 'TARGET_INVALID', 'TARGET_NOT_FOUND', 'TARGET_ARCHIVED', 'TARGET_UNAVAILABLE',
]);

/** Why the upload (or a later call) was refused. */
export const describeApiError = (error: PlanApiError, t: TFunction<'aiPlan'>): string => {
  if (UPLOAD_CODES.has(error.code)) return t(`errors.codes.${error.code}`);
  // The platform itself refuses bodies over its limit (Vercel: 4.5 MB) before the API sees them
  if (error.status === 413) return t('errors.codes.FILE_TOO_LARGE');
  if (error.status === 429) return t('errors.rateLimited');
  if (error.code === 'NETWORK') return t('errors.network');
  return error.message || t('errors.uploadFailed');
};

const FAILURE_CODES = new Set([
  'AI_AUTH', 'AI_RATE_LIMIT', 'AI_BAD_REQUEST', 'AI_UNAVAILABLE', 'AI_TIMEOUT', 'AI_UNREACHABLE', 'AI_EMPTY', 'AI_INVALID_OUTPUT',
  'AI_DISABLED', 'AI_NOT_CONFIGURED', 'KEY_MISSING', 'KEY_UNREADABLE', 'MODEL_MISSING', 'BASE_URL_INVALID', 'BASE_URL_PRIVATE',
  'BASE_URL_UNRESOLVED', 'STALE', 'CANCELLED',
  'ANALYZER_UNAVAILABLE', 'ANALYZER_TIMEOUT', 'ANALYZER_INVALID_OUTPUT', 'ANALYZER_UNAUTHORIZED', 'ANALYZER_RATE_LIMITED',
  'ANALYZER_BODY_TOO_LARGE', 'ANALYZER_PROVIDER_ERROR',
  // The analyzer refuses a request it cannot parse (contractVersion mismatch) or one whose text is
  // longer than its ANALYZER_MAX_CHARS. Neither can be fixed from this screen, so the message says
  // so instead of asking for a shorter document.
  'ANALYZER_INVALID_REQUEST',
]);

/** Why a generation ended without a plan. */
export const describeFailure = (plan: Pick<AiPlan, 'errorCode' | 'error'>, t: TFunction<'aiPlan'>): string =>
  FAILURE_CODES.has(plan.errorCode) ? t(`errors.failure.${plan.errorCode}`) : plan.error || t('errors.failed');

/**
 * The server's own sentence for a failure, when it has nothing more to add than `describeFailure`.
 *
 * A described code replaces the raw message (which is English) with a translation of the same reason,
 * so the detail is only worth showing when it differs from both. A known code carries the detail a
 * reader may need to act or to report the failure; an unknown one is already its own message.
 */
export const describeFailureDetail = (plan: Pick<AiPlan, 'errorCode' | 'error'>, t: TFunction<'aiPlan'>): string => {
  const message = plan.error.trim();
  if (!message) return '';
  const described = describeFailure(plan, t);
  return message === described || message === t('errors.failed') ? '' : message;
};
