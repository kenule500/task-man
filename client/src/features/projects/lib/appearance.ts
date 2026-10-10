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

// Full class names so Tailwind can see them. Colors are theme tokens (index.css --color-project-*):
// calm, deep tones on which white text keeps at least 5:1; -deep is the back panel.
export const PROJECT_COLOR_STYLES: Record<ProjectColor, ProjectColorStyle> = {
  blue: { label: 'Dusk blue', body: 'bg-project-blue', back: 'bg-project-blue-deep', tile: 'bg-project-blue', swatch: 'bg-project-blue', fill: 'text-project-blue', fillBack: 'text-project-blue-deep' },
  violet: { label: 'Iris', body: 'bg-project-violet', back: 'bg-project-violet-deep', tile: 'bg-project-violet', swatch: 'bg-project-violet', fill: 'text-project-violet', fillBack: 'text-project-violet-deep' },
  rose: { label: 'Berry', body: 'bg-project-rose', back: 'bg-project-rose-deep', tile: 'bg-project-rose', swatch: 'bg-project-rose', fill: 'text-project-rose', fillBack: 'text-project-rose-deep' },
  orange: { label: 'Terracotta', body: 'bg-project-orange', back: 'bg-project-orange-deep', tile: 'bg-project-orange', swatch: 'bg-project-orange', fill: 'text-project-orange', fillBack: 'text-project-orange-deep' },
  amber: { label: 'Ochre', body: 'bg-project-amber', back: 'bg-project-amber-deep', tile: 'bg-project-amber', swatch: 'bg-project-amber', fill: 'text-project-amber', fillBack: 'text-project-amber-deep' },
  emerald: { label: 'Pine', body: 'bg-project-emerald', back: 'bg-project-emerald-deep', tile: 'bg-project-emerald', swatch: 'bg-project-emerald', fill: 'text-project-emerald', fillBack: 'text-project-emerald-deep' },
  teal: { label: 'Lagoon', body: 'bg-project-teal', back: 'bg-project-teal-deep', tile: 'bg-project-teal', swatch: 'bg-project-teal', fill: 'text-project-teal', fillBack: 'text-project-teal-deep' },
  slate: { label: 'Slate', body: 'bg-project-slate', back: 'bg-project-slate-deep', tile: 'bg-project-slate', swatch: 'bg-project-slate', fill: 'text-project-slate', fillBack: 'text-project-slate-deep' },
};

export const colorStyleOf = (color: string | undefined): ProjectColorStyle =>
  PROJECT_COLOR_STYLES[color as ProjectColor] ?? PROJECT_COLOR_STYLES.blue;
