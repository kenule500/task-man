import { cn } from '@/lib/utils';
import { colorStyleOf } from '../lib/appearance';
import ProjectIcon from './ProjectIcon';

export type ProjectFolderIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Box (16 / 20 / 28 / 40 / 56 px) and white glyph size for each step. Full class names for Tailwind. */
const SIZES: Record<ProjectFolderIconSize, { box: string; glyph: string }> = {
  xs: { box: 'size-4', glyph: 'size-2.5!' },
  sm: { box: 'size-5', glyph: 'size-3!' },
  md: { box: 'size-7', glyph: 'size-3.5!' },
  lg: { box: 'size-10', glyph: 'size-5!' },
  xl: { box: 'size-14', glyph: 'size-6!' },
};

interface ProjectFolderIconProps {
  color?: string;
  icon?: string;
  size?: ProjectFolderIconSize;
  /** Accessible name. Without it the icon is decorative (`aria-hidden`). */
  label?: string;
  className?: string;
}

/**
 * A project's identity: a rounded folder in the project color with its chosen glyph in white on the front panel.
 * The fill follows `currentColor`, so the palette classes of `lib/appearance.ts` (600/700 tones, AA with white) drive it.
 */
const ProjectFolderIcon = ({ color, icon, size = 'sm', label, className }: ProjectFolderIconProps) => {
  const style = colorStyleOf(color);
  const { box, glyph } = SIZES[size];

  return (
    <span
      data-testid="project-folder-icon"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('relative inline-block shrink-0 align-middle', box, className)}
    >
      <svg viewBox="0 0 24 24" aria-hidden focusable="false" className="absolute inset-0 size-full!">
        {/* Back panel with the tab */}
        <path
          className={style.fillBack}
          fill="currentColor"
          d="M2 6a2 2 0 0 1 2-2h5.2a2 2 0 0 1 1.5.7L12 6h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"
        />
        {/* Front panel */}
        <rect className={style.fill} fill="currentColor" x="1.5" y="8.5" width="21" height="12.5" rx="2.5" />
      </svg>
      <ProjectIcon
        icon={icon}
        className={cn('absolute left-1/2 top-[61.5%] -translate-x-1/2 -translate-y-1/2 text-white', glyph)}
      />
    </span>
  );
};

export default ProjectFolderIcon;
