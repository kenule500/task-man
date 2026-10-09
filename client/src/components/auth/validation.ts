// Pure form validation for the auth screens. Messages say what is wrong and how to fix it.

export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const validateName = (value: string): string =>
  value.trim().length < 2 ? 'Enter your full name (at least 2 characters).' : '';

export const validateEmail = (value: string): string => {
  const email = value.trim();
  if (!email) return 'Enter your email address.';
  return EMAIL_PATTERN.test(email) ? '' : 'Enter a valid email address, like name@company.com.';
};

/** Sign-in only checks presence: never tell attackers or typo-ers about password rules. */
export const validateRequiredPassword = (value: string): string =>
  value ? '' : 'Enter your password.';

export const validateNewPassword = (value: string): string => {
  if (!value) return 'Choose a password.';
  return value.length < MIN_PASSWORD_LENGTH
    ? `Use at least ${MIN_PASSWORD_LENGTH} characters (${MIN_PASSWORD_LENGTH - value.length} more).`
    : '';
};

export const validateConfirmPassword = (value: string, password: string): string => {
  if (!value) return 'Re-enter the new password.';
  return value === password ? '' : 'The passwords do not match.';
};

export interface PasswordStrength {
  /** 0 (empty) to 4 (strong) */
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong' | '';
}

/** Rough length and variety heuristic: a hint for the user, never a gate. */
export const getPasswordStrength = (value: string): PasswordStrength => {
  if (!value) return { score: 0, label: '' };
  if (value.length < MIN_PASSWORD_LENGTH) return { score: 1, label: 'Too short' };

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(value)).length;
  let points = classes;
  if (value.length >= 12) points += 1;
  if (value.length >= 16) points += 1;

  if (points <= 2) return { score: 2, label: 'Weak' };
  if (points === 3) return { score: 3, label: 'Fair' };
  if (points === 4) return { score: 3, label: 'Good' };
  return { score: 4, label: 'Strong' };
};
