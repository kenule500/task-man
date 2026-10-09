// Pure WCAG 2.x contrast helpers used by the style guide's color documentation.

export interface Rgb { r: number; g: number; b: number }

/** "#2563EB" or "#26E" → { r, g, b } (0–255). Throws on anything else. */
export const hexToRgb = (hex: string): Rgb => {
  const clean = hex.trim().replace(/^#/, '');
  const full = clean.length === 3 ? clean.split('').map(char => char + char).join('') : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Invalid hex color: ${hex}`);
  const value = parseInt(full, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
};

const channel = (value: number): number => {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance per WCAG (0 = black, 1 = white). */
export const relativeLuminance = (hex: string): number => {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** Contrast ratio between two colors, 1–21. */
export const contrastRatio = (foreground: string, background: string): number => {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [light, dark] = a >= b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
};

export type ContrastLevel = 'AAA' | 'AA' | 'AA large' | 'Fail';

/** Level reached by a ratio: AAA ≥ 7, AA ≥ 4.5, AA large (≥ 18px or 14px bold, and UI parts) ≥ 3. */
export const contrastLevel = (ratio: number): ContrastLevel => {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA large';
  return 'Fail';
};

/** "4.76:1" (truncated, never rounded up across a threshold). */
export const formatRatio = (ratio: number): string => `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
