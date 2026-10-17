import { CONTRAST_GROUPS, CONTRAST_PAIRS, pairRatios } from '../contrastPairs';
import { ANIMATIONS, MOTION_TOKENS, SPRINGS } from '../tokens';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('contrast pairs', () => {
  it('lists every group of semantic pairs', () => {
    expect(CONTRAST_GROUPS).toEqual(expect.arrayContaining([
      'Text on surfaces', 'Primary and focus', 'Tone danger', 'Tone success', 'Tone warning', 'Tone info', 'Status', 'Priority', 'Task type', 'Inverse surface',
    ]));
    expect(CONTRAST_PAIRS.length).toBeGreaterThan(60);
  });

  it('keeps every pair at its minimum ratio in light and in dark', () => {
    const failing = CONTRAST_PAIRS.flatMap(item => {
      const { light, dark } = pairRatios(item);
      return [
        light < item.min ? `light ${item.group}: ${item.fg} on ${item.bg} = ${light.toFixed(2)} (needs ${item.min})` : null,
        dark < item.min ? `dark ${item.group}: ${item.fg} on ${item.bg} = ${dark.toFixed(2)} (needs ${item.min})` : null,
      ].filter(Boolean);
    });
    expect(failing).toEqual([]);
  });
});

describe('motion tokens documented on the guide', () => {
  const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');

  it('exist in index.css', () => {
    for (const item of [...MOTION_TOKENS, ...SPRINGS, ...ANIMATIONS]) {
      expect({ token: item.token, found: css.includes(`${item.token}:`) }).toEqual({ token: item.token, found: true });
    }
  });

  it('mirror the motion durations used by JavaScript', () => {
    expect(MOTION_TOKENS.map(item => item.ms)).toEqual([120, 200, 320]);
  });
});
