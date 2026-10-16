// Pure form validation for the auth screens. Messages say what is wrong and how to fix it.
import { t } from '@/i18n';

export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const validateName = (value: string): string =>
  value.trim().length < 2 ? t('auth:validation.name') : '';

export const validateEmail = (value: string): string => {
  const email = value.trim();
  if (!email) return t('auth:validation.emailRequired');
  return EMAIL_PATTERN.test(email) ? '' : t('auth:validation.emailInvalid');
};

/** Sign-in only checks presence: never tell attackers or typo-ers about password rules. */
export const validateRequiredPassword = (value: string): string =>
  value ? '' : t('auth:validation.passwordRequired');

export const validateNewPassword = (value: string): string => {
  if (!value) return t('auth:validation.passwordChoose');
  return value.length < MIN_PASSWORD_LENGTH
    ? t('auth:validation.passwordShort', { min: MIN_PASSWORD_LENGTH, more: MIN_PASSWORD_LENGTH - value.length })
    : '';
};

export const validateConfirmPassword = (value: string, password: string): string => {
  if (!value) return t('auth:validation.confirmRequired');
  return value === password ? '' : t('auth:validation.confirmMismatch');
};

export interface PasswordStrength {
  /** 0 (empty) to 4 (strong) */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

/** Rough length and variety heuristic: a hint for the user, never a gate. */
export const getPasswordStrength = (value: string): PasswordStrength => {
  if (!value) return { score: 0, label: '' };
  if (value.length < MIN_PASSWORD_LENGTH) return { score: 1, label: t('auth:validation.strength.tooShort') };

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(value)).length;
  let points = classes;
  if (value.length >= 12) points += 1;
  if (value.length >= 16) points += 1;

  if (points <= 2) return { score: 2, label: t('auth:validation.strength.weak') };
  if (points === 3) return { score: 3, label: t('auth:validation.strength.fair') };
  if (points === 4) return { score: 3, label: t('auth:validation.strength.good') };
  return { score: 4, label: t('auth:validation.strength.strong') };
};
