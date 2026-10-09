import { formatRelativeTime } from '../lib/date';
import {
  MAX_ATTACHMENT_BYTES, fileKindFromMimetype, formatFileSize, isImageMimetype, validateAttachment,
} from '../lib/files';
import { addLabel, collectLabels, getLabelStyle, normalizeLabel, suggestLabels } from '../lib/labels';
import { MAX_LABELS } from '../types';
import { makeTask } from './fixtures';

describe('getLabelStyle', () => {
  it('gives the same label the same colors, ignoring case and padding', () => {
    expect(getLabelStyle('Backend')).toBe(getLabelStyle('backend'));
    expect(getLabelStyle('Backend')).toBe(getLabelStyle('  Backend '));
  });

  it('spreads different labels over the palette and keeps text dark on a light background', () => {
    const styles = new Set(['bug', 'design', 'ops', 'docs', 'api', 'ui', 'infra', 'qa', 'perf'].map(label => getLabelStyle(label).chip));
    expect(styles.size).toBeGreaterThan(3);
    for (const chip of styles) expect(chip).toMatch(/bg-\w+-100 text-\w+-(800|900) border-\w+-200/);
  });
});

describe('label helpers', () => {
  it('normalizes whitespace and length', () => {
    expect(normalizeLabel('  needs   review ')).toBe('needs review');
    expect(normalizeLabel('x'.repeat(50))).toHaveLength(30);
  });

  it('adds labels without duplicates (case-insensitive), blanks or going over the maximum', () => {
    expect(addLabel(['bug'], 'Design')).toEqual(['bug', 'Design']);
    expect(addLabel(['bug'], 'BUG')).toEqual(['bug']);
    expect(addLabel(['bug'], '   ')).toEqual(['bug']);

    const full = Array.from({ length: MAX_LABELS }, (_, i) => `l${i}`);
    expect(addLabel(full, 'extra')).toBe(full);
  });

  it('collects the distinct labels of a workspace, sorted', () => {
    const tasks = [makeTask({ labels: ['ops', 'Bug'] }), makeTask({ labels: ['bug', 'api'] }), makeTask()];
    expect(collectLabels(tasks)).toEqual(['api', 'Bug', 'ops']);
  });

  it('suggests unused labels that match what was typed', () => {
    const all = ['api', 'Backend', 'bug', 'design'];
    expect(suggestLabels(all, ['bug'], 'b')).toEqual(['Backend']);
    expect(suggestLabels(all, [], '')).toEqual(all);
    expect(suggestLabels(all, [], 'zzz')).toEqual([]);
    expect(suggestLabels(all, [], '', 2)).toHaveLength(2);
  });
});

describe('file helpers', () => {
  it.each([
    [500, '500 B'],
    [2048, '2 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
  ])('formats %d bytes as %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });

  it.each([
    ['image/png', 'image'],
    ['application/pdf', 'pdf'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'spreadsheet'],
    ['text/csv', 'spreadsheet'],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'presentation'],
    ['application/msword', 'document'],
    ['text/plain', 'document'],
    ['application/zip', 'archive'],
    ['application/octet-stream', 'other'],
  ])('classifies %s as %s', (mimetype, kind) => {
    expect(fileKindFromMimetype(mimetype)).toBe(kind);
  });

  it('recognises images and validates size before uploading', () => {
    expect(isImageMimetype('image/webp')).toBe(true);
    expect(isImageMimetype('application/pdf')).toBe(false);
    expect(validateAttachment({ name: 'a.pdf', size: 1024 })).toBeNull();
    expect(validateAttachment({ name: 'big.zip', size: MAX_ATTACHMENT_BYTES + 1 })).toMatch(/larger than 4 MB/);
    expect(validateAttachment({ name: 'empty.txt', size: 0 })).toMatch(/empty/);
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-09T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it.each([
    [10 * 1000, 'just now'],
    [60 * 1000, '1 minute ago'],
    [5 * 60 * 1000, '5 minutes ago'],
    [3 * 3600 * 1000, '3 hours ago'],
    [2 * 24 * 3600 * 1000, '2 days ago'],
  ])('%d ms ago reads "%s"', (ms, expected) => {
    expect(formatRelativeTime(ago(ms), now)).toBe(expected);
  });

  it('falls back to a calendar date after a month and tolerates bad input', () => {
    expect(formatRelativeTime('2026-01-15T12:00:00.000Z', now)).toMatch(/Jan 15, 2026/);
    expect(formatRelativeTime('not a date', now)).toBe('');
  });
});
