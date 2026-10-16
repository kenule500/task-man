import {
  CRITERION_TONE, SEVERITY_TONE, VERDICT_TONE, groupIssues, hasActiveReview, isActive, isPullRequestUrl, pickShown, prLabel, runBlock, totalCriteria,
  POLL_GIVE_UP_MS,
} from '../lib/review';
import {
  MAX_CRITERIA, MAX_CRITERION_TEXT, addCriterion, canAddCriterion, cleanCriterionText, moveCriterion, newCriterionId, removeCriterion,
  renameCriterion, toCriteriaInput,
} from '../lib/criteria';
import type { ReviewIssue } from '../types';

const issue = (severity: ReviewIssue['severity'], message = 'm'): ReviewIssue => ({ severity, category: 'bug', file: 'a.ts', line: 1, message });

describe('tones', () => {
  it('maps Match, Partial and Mismatch to success, warning and danger', () => {
    expect(VERDICT_TONE).toEqual({ match: 'success', partial: 'warning', mismatch: 'danger' });
    expect(CRITERION_TONE).toEqual({ met: 'success', partial: 'warning', missing: 'danger' });
    expect(SEVERITY_TONE.high).toBe('danger');
  });
});

describe('review state helpers', () => {
  it('knows which reviews are still being worked on', () => {
    expect(isActive({ status: 'queued' })).toBe(true);
    expect(isActive({ status: 'running' })).toBe(true);
    expect(isActive({ status: 'completed' })).toBe(false);
    expect(isActive({ status: 'failed' })).toBe(false);
    expect(isActive(null)).toBe(false);
  });

  it('keeps polling for a fresh running review but gives up on an abandoned one', () => {
    const now = Date.parse('2026-10-16T12:00:00Z');
    const fresh = { status: 'running' as const, createdAt: new Date(now - 60_000).toISOString() };
    const stale = { status: 'running' as const, createdAt: new Date(now - POLL_GIVE_UP_MS - 1000).toISOString() };
    expect(hasActiveReview([fresh], now)).toBe(true);
    expect(hasActiveReview([stale], now)).toBe(false);
    expect(hasActiveReview([{ status: 'completed', createdAt: fresh.createdAt }], now)).toBe(false);
    expect(hasActiveReview([], now)).toBe(false);
  });

  it('groups issues by severity, most severe first, and leaves out empty groups', () => {
    const groups = groupIssues([issue('low', 'l'), issue('high', 'h1'), issue('low', 'l2'), issue('high', 'h2')]);
    expect(groups.map(group => group.severity)).toEqual(['high', 'low']);
    expect(groups[0].issues.map(item => item.message)).toEqual(['h1', 'h2']);
    expect(groupIssues(undefined)).toEqual([]);
  });

  it('counts criteria and labels the pull request', () => {
    expect(totalCriteria({ met: 2, partial: 1, missing: 3, issues: 9 })).toBe(6);
    expect(prLabel({ repo: 'acme/app', number: 7 })).toBe('acme/app#7');
  });

  it('shows the selected review, else the newest', () => {
    const list = [{ _id: 'new' }, { _id: 'old' }];
    expect(pickShown(list, 'old')?._id).toBe('old');
    expect(pickShown(list, 'gone')?._id).toBe('new');
    expect(pickShown(list, null)?._id).toBe('new');
    expect(pickShown([], null)).toBeNull();
  });
});

describe('isPullRequestUrl', () => {
  it('accepts only github.com pull request addresses', () => {
    expect(isPullRequestUrl('https://github.com/acme/app/pull/12')).toBe(true);
    expect(isPullRequestUrl('  https://github.com/acme/app/pull/12 ')).toBe(true);
    for (const bad of [
      '', 'http://github.com/acme/app/pull/12', 'https://evil.com/acme/app/pull/12', 'https://github.com/acme/app/pull/12/files',
      'https://github.com/acme/app/issues/12', 'https://github.com/acme/app/pull/0', 'https://github.com/acme/pull/12',
    ]) expect(isPullRequestUrl(bad)).toBe(false);
  });
});

describe('runBlock', () => {
  const on = { available: true, enabled: true };

  it('explains the first thing in the way, in the order people can fix them', () => {
    expect(runBlock({ settings: null, canWrite: true, hasPullRequest: true })).toBe('unavailable');
    expect(runBlock({ settings: { available: false, enabled: true }, canWrite: true, hasPullRequest: true })).toBe('unavailable');
    expect(runBlock({ settings: { available: true, enabled: false }, canWrite: true, hasPullRequest: true })).toBe('disabled');
    expect(runBlock({ settings: on, canWrite: false, hasPullRequest: true })).toBe('readOnly');
    expect(runBlock({ settings: on, canWrite: true, hasPullRequest: false })).toBe('noPr');
    expect(runBlock({ settings: on, canWrite: true, hasPullRequest: true })).toBeNull();
  });
});

describe('criteria editing', () => {
  const items = [{ _id: 'a', text: 'First' }, { _id: 'b', text: 'Second' }, { _id: 'c', text: 'Third' }];

  it('trims text and refuses empty or over-long text', () => {
    expect(cleanCriterionText('  hi  ')).toBe('hi');
    expect(cleanCriterionText('   ')).toBeNull();
    expect(cleanCriterionText('x'.repeat(MAX_CRITERION_TEXT))).not.toBeNull();
    expect(cleanCriterionText('x'.repeat(MAX_CRITERION_TEXT + 1))).toBeNull();
  });

  it('adds with a fresh 24-hex id, up to the limit', () => {
    const added = addCriterion(items, ' Fourth ', 'd'.repeat(24));
    expect(added.at(-1)).toEqual({ _id: 'd'.repeat(24), text: 'Fourth' });
    expect(addCriterion(items, '   ')).toEqual(items);
    expect(newCriterionId()).toMatch(/^[a-f0-9]{24}$/);
    const full = Array.from({ length: MAX_CRITERIA }, (_, index) => ({ _id: String(index), text: 'x' }));
    expect(canAddCriterion(full)).toBe(false);
    expect(addCriterion(full, 'one more')).toHaveLength(MAX_CRITERIA);
  });

  it('renames, removes and moves without touching the input', () => {
    expect(renameCriterion(items, 'b', ' Changed ').map(item => item.text)).toEqual(['First', 'Changed', 'Third']);
    expect(renameCriterion(items, 'b', '  ')).toEqual(items);
    expect(removeCriterion(items, 'a').map(item => item._id)).toEqual(['b', 'c']);
    expect(moveCriterion(items, 'b', -1).map(item => item._id)).toEqual(['b', 'a', 'c']);
    expect(moveCriterion(items, 'b', 1).map(item => item._id)).toEqual(['a', 'c', 'b']);
    expect(moveCriterion(items, 'a', -1)).toEqual(items);
    expect(moveCriterion(items, 'c', 1)).toEqual(items);
    expect(moveCriterion(items, 'zzz', 1)).toEqual(items);
    expect(items.map(item => item._id)).toEqual(['a', 'b', 'c']);
  });

  it('sends ids and text only', () => {
    expect(toCriteriaInput([{ _id: 'a', text: 'First' }])).toEqual([{ _id: 'a', text: 'First' }]);
  });
});
