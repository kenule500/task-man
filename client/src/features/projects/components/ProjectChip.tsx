import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useProjectDirectory } from '../context/ProjectsContext';
import type { Project } from '../types';
import ProjectFolderIcon from './ProjectFolderIcon';

interface ProjectChipProps {
  /** Project name as stored on the task; resolved through the workspace directory. */
  name: string;
  /** Pass the project when you already have it (skips the directory lookup). */
  project?: Project;
  /** Shows the project key in mono after the name. */
  showKey?: boolean;
  /** Set to false inside another link or button (a link cannot nest in a link). */
  link?: boolean;
  className?: string;
}

/**
 * A project reference: its folder icon (xs) and name. Links to the project when it is known;
 * unknown names (deleted project, no permission) show a neutral folder and plain text.
 */
const ProjectChip = ({ name, project, showKey = false, link = true, className }: ProjectChipProps) => {
  const directory = useProjectDirectory();
  const found = project ?? directory.byName(name);
  const content = (
    <>
      <ProjectFolderIcon size="xs" color={found?.color ?? 'slate'} icon={found?.icon ?? 'folder'} />
      <span className="min-w-0 truncate">{found?.name ?? name}</span>
      {showKey && found && <span className="shrink-0 font-mono text-[11px] text-slate-600">{found.key}</span>}
    </>
  );
  const base = 'inline-flex min-w-0 max-w-full items-center gap-1 rounded bg-slate-100 px-1.5 text-xs text-slate-600';

  if (found && link && directory.slug) {
    return (
      <Link
        to={`/${directory.slug}/projects/${found._id}`}
        title={`Project: ${found.name}`}
        // Rows and cards around the chip open the task on click; the chip only navigates
        onClick={event => event.stopPropagation()}
        className={cn(base, 'min-h-6 outline-none hover:bg-slate-200 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary', className)}
      >
        {content}
      </Link>
    );
  }
  return (
    <span title="Project" className={cn(base, className)}>
      {content}
    </span>
  );
};

export default ProjectChip;
