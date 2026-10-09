import { Link, useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, ExternalLink, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Project } from '../types';
import { colorStyleOf } from '../lib/appearance';
import ProjectIcon from './ProjectIcon';
import type { ProjectStats } from '../lib/summary';

interface ProjectFolderCardProps {
  project: Project;
  summary: ProjectStats;
  workspaceSlug: string;
  /** Alternates the angle of the paper sheets so a grid of folders does not look stamped. */
  index?: number;
  canWrite: boolean;
  canDelete: boolean;
  onEdit: (project: Project) => void;
  onToggleArchive: (project: Project) => void;
  onDelete: (project: Project) => void;
}

/** Item rows are 40px on touch, compact from `md`. */
const ITEM_CLASS = 'min-h-10 text-slate-700 md:min-h-0';

/** The back panel, tab and paper sheets that make a card read as a folder. */
export const FolderBack = ({ backClass, index = 0 }: { backClass: string; index?: number }) => (
  <>
    <div aria-hidden className={cn('absolute inset-x-0 bottom-0 top-3 rounded-2xl rounded-tl-none', backClass)} />
    <div
      aria-hidden
      className={cn(
        'absolute top-2 h-10 w-[44%] rounded-md bg-white shadow-sm',
        index % 2 === 0 ? 'right-4 -rotate-3' : 'right-6 rotate-2',
      )}
    />
    <div
      aria-hidden
      className={cn(
        'absolute top-3.5 h-10 w-[38%] rounded-md bg-slate-100 shadow-sm',
        index % 2 === 0 ? 'right-9 rotate-2' : 'right-12 -rotate-2',
      )}
    />
    <div aria-hidden className={cn('absolute left-0 top-0 h-6 w-[36%] max-w-24 rounded-t-xl', backClass)} />
  </>
);

/**
 * A project as a colored folder with paper sheets peeking out. The whole card is one link
 * (stretched over the card through the title) and the actions menu is the only other tab stop.
 */
const ProjectFolderCard = ({
  project, summary, workspaceSlug, index = 0, canWrite, canDelete, onEdit, onToggleArchive, onDelete,
}: ProjectFolderCardProps) => {
  const navigate = useNavigate();
  const style = colorStyleOf(project.color);
  const href = `/${workspaceSlug}/projects/${project._id}`;
  const taskLabel = `${summary.total} ${summary.total === 1 ? 'task' : 'tasks'}`;

  return (
    <li className="group relative flex flex-col motion-safe:transition-transform motion-safe:duration-150 motion-safe:hover:-translate-y-0.5">
      <FolderBack backClass={style.back} index={index} />

      <div
        className={cn(
          'relative mt-7 flex flex-1 flex-col rounded-2xl p-3.5 text-white shadow-sm transition-shadow duration-150 group-hover:shadow-lg sm:p-4',
          style.body,
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span aria-hidden className="flex size-9 items-center justify-center rounded-lg bg-white/20">
            <ProjectIcon icon={project.icon} className="size-5" />
          </span>
          <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${project.name}`}
                    className="relative z-10 -m-1.5 size-11 text-white hover:bg-white/20 hover:text-white focus-visible:ring-white/70 aria-expanded:bg-white/20 md:size-8"
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 md:w-48">
                <DropdownMenuItem onClick={() => navigate(href)} className={ITEM_CLASS}>
                  <ExternalLink /> Open
                </DropdownMenuItem>
                {canWrite && (
                  <>
                    <DropdownMenuItem onClick={() => onEdit(project)} className={ITEM_CLASS}>
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onToggleArchive(project)} className={ITEM_CLASS}>
                      {project.archived ? <ArchiveRestore /> : <Archive />}
                      {project.archived ? 'Unarchive' : 'Archive'}
                    </DropdownMenuItem>
                  </>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator className="bg-slate-100" />
                    <DropdownMenuItem variant="destructive" onClick={() => onDelete(project)} className="min-h-10 md:min-h-0">
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
        </div>

        <h2 className="mt-3 line-clamp-2 hyphens-auto break-words text-base font-bold leading-snug">
          <Link
            to={href}
            className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-primary"
          >
            {project.name}
          </Link>
        </h2>
        <p className="mt-0.5 text-sm tabular-nums">
          {taskLabel}
          <span aria-hidden> · </span>
          <span className="font-medium">{project.key}</span>
          {project.archived && <span className="ml-2 rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">Archived</span>}
        </p>

        <div className="mt-auto space-y-1.5 pt-4">
          <div
            role="progressbar"
            aria-label={`${project.name} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={summary.progress}
            className="h-1.5 overflow-hidden rounded-full bg-white/30"
          >
            <div className="h-full rounded-full bg-white" style={{ width: `${summary.progress}%` }} />
          </div>
          <p className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs tabular-nums">
            <span>{summary.progress}% done</span>
            {summary.overdue > 0 && (
              <span className="rounded bg-white px-1.5 py-0.5 font-semibold text-red-700">{summary.overdue} overdue</span>
            )}
          </p>
          <p className="truncate text-xs" title={summary.activeSprint?.name}>
            {summary.activeSprint
              ? `${summary.activeSprint.name} · ${summary.activeProgress?.percent ?? 0}%`
              : 'No active sprint'}
          </p>
        </div>
      </div>
    </li>
  );
};

export default ProjectFolderCard;
