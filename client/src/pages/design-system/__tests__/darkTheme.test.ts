import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DARK_COLORS, DARK_PAIRS, pairRatio } from '../darkTokens';

const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');

/** Color custom properties declared in the `.dark { … }` block. */
const darkBlock = (): Map<string, string> => {
  const start = css.indexOf('\n.dark {');
  expect(start).toBeGreaterThan(-1);
  const end = css.indexOf('\n}', start);
  const map = new Map<string, string>();
  for (const match of css.slice(start, end).matchAll(/--color-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
    map.set(match[1], match[2].toUpperCase());
  }
  return map;
};

describe('dark theme tokens', () => {
  const declared = darkBlock();

  it('declares the class-based dark variant', () => {
    expect(css).toContain('@custom-variant dark (&:where(.dark, .dark *));');
  });

  it('documents the same hex values as the .dark block in index.css', () => {
    for (const [name, hex] of Object.entries(DARK_COLORS)) {
      expect({ name, hex: declared.get(name) }).toEqual({ name, hex: hex.toUpperCase() });
    }
  });

  it('overrides every surface and text step of the slate ramp', () => {
    for (const step of ['white', 'slate-50', 'slate-100', 'slate-200', 'slate-300', 'slate-400', 'slate-500', 'slate-600', 'slate-700', 'slate-800', 'slate-900']) {
      expect({ step, declared: declared.has(step) }).toEqual({ step, declared: true });
    }
  });

  it('orders the ramp by lightness: surfaces rise from the canvas, text brightens', () => {
    const lightness = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    const order = ['slate-50', 'white', 'slate-100', 'slate-200', 'slate-300', 'slate-400', 'slate-500', 'slate-600', 'slate-700', 'slate-800', 'slate-900'];
    const values = order.map(step => lightness(declared.get(step)!));
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it('authors every semantic tone for dark with all six parts', () => {
    for (const tone of ['danger', 'success', 'warning', 'info']) {
      for (const part of ['solid', 'solid-hover', 'dot', 'fg', 'bg', 'border']) {
        expect({ token: `${tone}-${part}`, declared: declared.has(`${tone}-${part}`) }).toEqual({ token: `${tone}-${part}`, declared: true });
      }
    }
  });

  it('keeps every text pair at WCAG AA (4.5:1) and every icon or focus pair at 3:1', () => {
    const failing = DARK_PAIRS
      .filter(pair => pairRatio(pair) < pair.min)
      .map(pair => `${pair.group}: ${pair.fg} on ${pair.bg} = ${pairRatio(pair).toFixed(2)}`);
    expect(failing).toEqual([]);
  });

  it('pins white text, the inverse surface and blue text in the exceptions layer', () => {
    for (const rule of [
      ':where(.dark) .text-white',
      ':where(.dark) .bg-slate-900',
      ':where(.dark) .text-primary,',
    ]) {
      expect(css).toContain(rule);
    }
  });
});
