import { isValidProjectKey, normalizeProjectKey, suggestProjectKey } from '../lib/projectKey';

describe('suggestProjectKey', () => {
  it('uses the initials of several words', () => {
    expect(suggestProjectKey('Mobile App Redesign')).toBe('MAR');
    expect(suggestProjectKey('Marketing  site')).toBe('MS');
  });

  it('skips filler words', () => {
    expect(suggestProjectKey('Rise of the Machines')).toBe('RM');
  });

  it('takes the first letters of a single word', () => {
    expect(suggestProjectKey('Website')).toBe('WEB');
    expect(suggestProjectKey('Go')).toBe('GO');
  });

  it('caps the key at six characters', () => {
    expect(suggestProjectKey('p q r s t u v w')).toBe('PQRSTU');
  });

  it('returns an empty key when the name has nothing usable', () => {
    expect(suggestProjectKey('')).toBe('');
    expect(suggestProjectKey('  !! ')).toBe('');
  });

  it('leaves the key empty for a one-letter word', () => {
    expect(suggestProjectKey('X')).toBe('');
  });
});

describe('project key helpers', () => {
  it('normalizes typing to uppercase letters and digits', () => {
    expect(normalizeProjectKey('we-b 2!x')).toBe('WEB2X');
    expect(normalizeProjectKey('abcdefghij')).toBe('ABCDEF');
  });

  it('validates 2 to 6 uppercase letters or digits', () => {
    expect(isValidProjectKey('WEB')).toBe(true);
    expect(isValidProjectKey('A')).toBe(false);
    expect(isValidProjectKey('TOOLONG')).toBe(false);
    expect(isValidProjectKey('web')).toBe(false);
  });
});
