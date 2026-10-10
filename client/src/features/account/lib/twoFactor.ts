/** Pure helpers for the two-factor screens (code entry, secret and recovery-code formatting). */

export const TWO_FACTOR_CODE_LENGTH = 6;

/** Keeps digits only and caps the length: handles pasted "123 456", "123-456" and autofill. */
export const sanitizeCode = (input: string): string =>
  input.replace(/\D/g, '').slice(0, TWO_FACTOR_CODE_LENGTH);

export const isCompleteCode = (code: string): boolean => /^\d{6}$/.test(code);

/** `JBSWY3DPEHPK3PXP` -> `JBSW Y3DP EHPK 3PXP`, easier to read and type. */
export const formatSecret = (secret: string): string =>
  secret.replace(/\s/g, '').match(/.{1,4}/g)?.join(' ') ?? secret;

/** Lower-cases, drops separators and re-inserts the dash once 8 characters are there (`abcd-efgh`). */
export const normalizeRecoveryInput = (input: string): string => {
  const compact = input.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
};

export const isCompleteRecoveryCode = (code: string): boolean => /^[a-z0-9]{4}-[a-z0-9]{4}$/.test(code);

/** Text of the downloadable recovery-code file. */
export const recoveryCodesFile = (codes: string[], account: string, now = new Date()): string =>
  [
    'TaskMan recovery codes',
    `Account: ${account}`,
    `Created: ${now.toISOString().slice(0, 10)}`,
    '',
    'Each code works once. Keep this file somewhere safe, away from your phone.',
    '',
    ...codes,
    '',
  ].join('\n');
