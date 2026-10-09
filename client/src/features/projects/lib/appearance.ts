import type { ProjectColor } from '../types';

export interface ProjectColorStyle {
  label: string;
  /** Front panel of the folder (white text sits on it, AA contrast) */
  body: string;
  /** Back panel and tab, one step darker */
  back: string;
  /** Solid square behind the project icon */
  tile: string;
  /** Color picker swatch */
  swatch: string;
  /** Text color whose `currentColor` fills the front panel of the folder SVG (same tone as `body`) */
  fill: string;
  /** Text color whose `currentColor` fills the back panel and tab of the folder SVG (same tone as `back`) */
  fillBack: string;
}

// Full class names so Tailwind can see them. 600 is only used where white text keeps 4.5:1;
// orange, amber, emerald and teal need 700 for that.
export const PROJECT_COLOR_STYLES: Record<ProjectColor, ProjectColorStyle> = {
  blue: { label: 'Blue', body: 'bg-blue-600', back: 'bg-blue-800', tile: 'bg-blue-600', swatch: 'bg-blue-600', fill: 'text-blue-600', fillBack: 'text-blue-800' },
  violet: { label: 'Violet', body: 'bg-violet-600', back: 'bg-violet-800', tile: 'bg-violet-600', swatch: 'bg-violet-600', fill: 'text-violet-600', fillBack: 'text-violet-800' },
  rose: { label: 'Rose', body: 'bg-rose-600', back: 'bg-rose-800', tile: 'bg-rose-600', swatch: 'bg-rose-600', fill: 'text-rose-600', fillBack: 'text-rose-800' },
  orange: { label: 'Orange', body: 'bg-orange-700', back: 'bg-orange-900', tile: 'bg-orange-700', swatch: 'bg-orange-600', fill: 'text-orange-700', fillBack: 'text-orange-900' },
  amber: { label: 'Amber', body: 'bg-amber-700', back: 'bg-amber-900', tile: 'bg-amber-700', swatch: 'bg-amber-500', fill: 'text-amber-700', fillBack: 'text-amber-900' },
  emerald: { label: 'Emerald', body: 'bg-emerald-700', back: 'bg-emerald-900', tile: 'bg-emerald-700', swatch: 'bg-emerald-600', fill: 'text-emerald-700', fillBack: 'text-emerald-900' },
  teal: { label: 'Teal', body: 'bg-teal-700', back: 'bg-teal-900', tile: 'bg-teal-700', swatch: 'bg-teal-600', fill: 'text-teal-700', fillBack: 'text-teal-900' },
  slate: { label: 'Slate', body: 'bg-slate-600', back: 'bg-slate-800', tile: 'bg-slate-600', swatch: 'bg-slate-600', fill: 'text-slate-600', fillBack: 'text-slate-800' },
};

export const colorStyleOf = (color: string | undefined): ProjectColorStyle =>
  PROJECT_COLOR_STYLES[color as ProjectColor] ?? PROJECT_COLOR_STYLES.blue;
