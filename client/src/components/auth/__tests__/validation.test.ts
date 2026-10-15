import {
  getPasswordStrength, validateConfirmPassword, validateEmail, validateName, validateNewPassword,
  validateRequiredPassword,
} from '../validation';

describe('auth validation', () => {
  it('requires a plausible email', () => {
    expect(validateEmail('')).toMatch(/Enter your email/);
    expect(validateEmail('nope')).toMatch(/valid email/);
    expect(validateEmail('a@b')).toMatch(/valid email/);
    expect(validateEmail(' ada@example.com ')).toBe('');
  });

  it('requires a name of two characters', () => {
    expect(validateName(' a ')).not.toBe('');
    expect(validateName('Ada')).toBe('');
  });

  it('only checks presence when signing in', () => {
    expect(validateRequiredPassword('')).not.toBe('');
    expect(validateRequiredPassword('x')).toBe('');
  });

  it('enforces the 8 character minimum for new passwords and says how many are missing', () => {
    expect(validateNewPassword('')).toMatch(/Choose a password/);
    expect(validateNewPassword('abc')).toMatch(/5 more/);
    expect(validateNewPassword('abcdefgh')).toBe('');
  });

  it('compares the confirmation', () => {
    expect(validateConfirmPassword('', 'abcdefgh')).not.toBe('');
    expect(validateConfirmPassword('abcdefgx', 'abcdefgh')).toMatch(/do not match/);
    expect(validateConfirmPassword('abcdefgh', 'abcdefgh')).toBe('');
  });
});

describe('getPasswordStrength', () => {
  it('grades by length and variety', () => {
    expect(getPasswordStrength('')).toEqual({ score: 0, label: '' });
    expect(getPasswordStrength('abc')).toEqual({ score: 1, label: 'Too short' });
    expect(getPasswordStrength('abcdefgh').label).toBe('Weak');
    expect(getPasswordStrength('Abcdefg1').label).toBe('Fair');
    expect(getPasswordStrength('Abcdefg1!').label).toBe('Good');
    expect(getPasswordStrength('Abcdefg1!xyz').label).toBe('Strong');
  });
});
