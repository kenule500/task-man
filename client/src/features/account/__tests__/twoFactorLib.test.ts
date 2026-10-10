import {
  formatSecret, isCompleteCode, isCompleteRecoveryCode, normalizeRecoveryInput, recoveryCodesFile, sanitizeCode,
} from '../lib/twoFactor';

describe('sanitizeCode', () => {
  it('keeps six digits from pasted text with spaces or dashes', () => {
    expect(sanitizeCode('123 456')).toBe('123456');
    expect(sanitizeCode('123-456')).toBe('123456');
    expect(sanitizeCode(' 12a3b4c56789')).toBe('123456');
    expect(sanitizeCode('abc')).toBe('');
  });

  it('knows when a code is complete', () => {
    expect(isCompleteCode('123456')).toBe(true);
    expect(isCompleteCode('12345')).toBe(false);
    expect(isCompleteCode('12345a')).toBe(false);
  });
});

describe('formatSecret', () => {
  it('groups the key in fours for reading', () => {
    expect(formatSecret('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
    expect(formatSecret('JBSW Y3DP')).toBe('JBSW Y3DP');
  });
});

describe('recovery code input', () => {
  it('lower-cases and inserts the dash after four characters', () => {
    expect(normalizeRecoveryInput('ABCD')).toBe('abcd');
    expect(normalizeRecoveryInput('ABCDE')).toBe('abcd-e');
    expect(normalizeRecoveryInput('ab cd-ef gh')).toBe('abcd-efgh');
    expect(normalizeRecoveryInput('abcd-efghijk')).toBe('abcd-efgh');
  });

  it('accepts only a complete xxxx-xxxx code', () => {
    expect(isCompleteRecoveryCode('abcd-efgh')).toBe(true);
    expect(isCompleteRecoveryCode('abcd-efg')).toBe(false);
    expect(isCompleteRecoveryCode('abcdefgh')).toBe(false);
  });
});

describe('recoveryCodesFile', () => {
  it('lists the account, the date and one code per line', () => {
    const text = recoveryCodesFile(['aaaa-bbbb', 'cccc-dddd'], 'ada@example.com', new Date('2026-10-10T08:00:00Z'));
    expect(text).toContain('Account: ada@example.com');
    expect(text).toContain('Created: 2026-10-10');
    expect(text.split('\n')).toEqual(expect.arrayContaining(['aaaa-bbbb', 'cccc-dddd']));
  });
});
