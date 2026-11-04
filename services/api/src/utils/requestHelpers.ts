// ============================================================
// Shared helpers for controllers
// ============================================================

/**
 * Base URL of the frontend (Vercel / localhost).
 * Falls back to localhost if CLIENT_URL is not set.
 */
export const getClientUrl = (): string =>
  process.env.CLIENT_URL || 'http://localhost:5173';

/**
 * Whether the app is in "dev auto-verify" mode.
 * When true, signups are automatically verified (no email required).
 */
export const isDevAutoVerify = (): boolean =>
  process.env.DEV_AUTO_VERIFY === 'true';

/**
 * Build the email-verification link for a given token.
 */
export const buildVerifyLink = (token: string): string =>
  `${getClientUrl()}/verify-email/${token}`;

/**
 * Build the password-reset link for a given token.
 */
export const buildResetLink = (token: string): string =>
  `${getClientUrl()}/reset-password/${token}`;

/**
 * Build the workspace-invitation link for a given token.
 */
export const buildInviteLink = (token: string): string =>
  `${getClientUrl()}/accept-invite/${token}`;