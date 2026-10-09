import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  contrastLevel, contrastRatio, formatRatio, hexToRgb, relativeLuminance,
} from '../contrast';
import {
  ALL_COLOR_TOKENS, DURATIONS, EASINGS, ELEVATION_LEVELS, RADIUS_SCALE, Z_INDEX,
} from '../tokens';

describe('contrast helpers', () => {
  it('parses 3 and 6 digit hex and rejects garbage', () => {
    expect(hexToRgb('#2563EB')).toEqual({ r: 37, g: 99, b: 235 });
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(() => hexToRgb('blue')).toThrow('Invalid hex color');
  });

  it('computes luminance extremes', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('matches known WCAG ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    // slate-500 on white is the lowest text color we allow for body copy
    expect(contrastRatio('#64748B', '#FFFFFF')).toBeCloseTo(4.76, 1);
    // primary on white
    expect(contrastRatio('#2563EB', '#FFFFFF')).toBeGreaterThan(5);
    // amber-500 does not pass for text
    expect(contrastRatio('#F59E0B', '#FFFFFF')).toBeLessThan(3);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#0F172A', '#F8FAFC')).toBeCloseTo(contrastRatio('#F8FAFC', '#0F172A'), 10);
  });

  it('maps ratios to WCAG levels', () => {
    expect(contrastLevel(21)).toBe('AAA');
    expect(contrastLevel(7)).toBe('AAA');
    expect(contrastLevel(4.5)).toBe('AA');
    expect(contrastLevel(3.2)).toBe('AA large');
    expect(contrastLevel(2.9)).toBe('Fail');
  });

  it('formats without rounding up across a threshold', () => {
    expect(formatRatio(4.499)).toBe('4.49:1');
    expect(formatRatio(21)).toBe('21.00:1');
  });
});

describe('documented tokens', () => {
  const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');

  it('every documented color exists in index.css with the same hex', () => {
    for (const color of ALL_COLOR_TOKENS) {
      const match = css.match(new RegExp(`${color.name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`));
      expect({ name: color.name, found: Boolean(match) }).toEqual({ name: color.name, found: true });
      expect({ name: color.name, hex: match?.[1].toUpperCase() }).toEqual({ name: color.name, hex: color.hex.toUpperCase() });
    }
  });

  it('has no duplicate token names', () => {
    const names = ALL_COLOR_TOKENS.map(color => color.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('documents the scales that exist in index.css', () => {
    for (const item of [...ELEVATION_LEVELS, ...EASINGS]) expect(css).toContain(`${item.token}:`);
    for (const item of [...DURATIONS, ...Z_INDEX]) expect(css).toContain(`${item.token}:`);
    for (const item of RADIUS_SCALE.filter(radius => radius.token.startsWith('--'))) expect(css).toContain(`${item.token}:`);
  });

  it('keeps z-index and durations ordered', () => {
    expect(Z_INDEX.map(item => item.value)).toEqual([...Z_INDEX.map(item => item.value)].sort((a, b) => a - b));
    expect(DURATIONS.map(item => item.ms)).toEqual([80, 150, 200, 280]);
  });

  it('text roles used for words pass AA on white', () => {
    const wordTokens = ['text-strong', 'text-body', 'text-subtle', 'priority-high-text', 'priority-medium-text', 'priority-low-text', 'status-in-progress-fg', 'status-completed-fg'];
    for (const utility of wordTokens) {
      const color = ALL_COLOR_TOKENS.find(item => item.utility === utility);
      expect(color).toBeDefined();
      expect({ utility, ok: contrastRatio(color!.hex, '#FFFFFF') >= 4.5 }).toEqual({ utility, ok: true });
    }
  });

  it('label colors pass AA on the soft background they sit on', () => {
    const byName = (utility: string) => ALL_COLOR_TOKENS.find(item => item.utility === utility)!.hex;
    const pairs: [string, string][] = [
      ['status-pending-fg', 'status-pending-bg'],
      ['status-in-progress-fg', 'status-in-progress-bg'],
      ['status-completed-fg', 'status-completed-bg'],
      ['type-story', 'type-story-bg'],
      ['type-task', 'type-task-bg'],
      ['type-bug', 'type-bug-bg'],
      ['type-spike', 'type-spike-bg'],
    ];
    for (const [foreground, background] of pairs) {
      expect({ pair: `${foreground} on ${background}`, ok: contrastRatio(byName(foreground), byName(background)) >= 4.5 }).toEqual({
        pair: `${foreground} on ${background}`,
        ok: true,
      });
    }
  });
});
