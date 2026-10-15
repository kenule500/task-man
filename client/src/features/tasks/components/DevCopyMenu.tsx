import { Code2, GitBranch, GitCommitHorizontal, Link2 } from 'lucide-react';
import { toast } from '@/components/ds';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTaskKey } from '../hooks/useTaskKey';
import { branchName, commitMessage, markdownLink } from '../lib/devNames';
import { copyToClipboard, taskLink } from '../lib/taskKey';
import type { Task } from '../types';

interface DevCopyMenuProps {
  task: Pick<Task, '_id' | 'title' | 'type' | 'number' | 'project'>;
  /** Workspace slug; without it "Copy markdown link" is hidden. */
  workspaceSlug?: string;
}

const ITEM_CLASS = 'min-h-10 text-slate-700 md:min-h-0';

/** Copy-to-clipboard shortcuts for developers: branch name, commit message and markdown link. */
const DevCopyMenu = ({ task, workspaceSlug }: DevCopyMenuProps) => {
  const key = useTaskKey(task);

  const copy = async (text: string, done: string) => {
    if (await copyToClipboard(text)) toast.success(done);
    else toast.error('Could not copy. Your browser blocked clipboard access.');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Developer shortcuts"
        className="inline-flex min-h-8 items-center gap-1 rounded px-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary data-popup-open:bg-slate-100 sm:min-h-6"
      >
        <Code2 className="size-3.5" aria-hidden /> Developer
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem className={ITEM_CLASS} onClick={() => { void copy(branchName(task, key), 'Branch name copied'); }}>
          <GitBranch /> Copy branch name
        </DropdownMenuItem>
        <DropdownMenuItem className={ITEM_CLASS} onClick={() => { void copy(commitMessage(task, key), 'Commit message copied'); }}>
          <GitCommitHorizontal /> Copy commit message
        </DropdownMenuItem>
        {workspaceSlug && (
          <DropdownMenuItem
            className={ITEM_CLASS}
            onClick={() => { void copy(markdownLink(task, taskLink(window.location.origin, workspaceSlug, task._id), key), 'Markdown link copied'); }}
          >
            <Link2 /> Copy markdown link
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default DevCopyMenu;
