import { ExternalLink, GitBranch, GitCommitHorizontal, GitMerge, GitPullRequest, GitPullRequestClosed, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { groupDevelopmentLinks, safeLinkHref, shortSha } from '../lib/development';
import type { Task, TaskLink } from '../types';
import { useTaskKey } from '../hooks/useTaskKey';

const STATE_META: Record<NonNullable<TaskLink['state']>, { label: string; icon: LucideIcon; className: string }> = {
  open: { label: 'Open', icon: GitPullRequest, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  merged: { label: 'Merged', icon: GitMerge, className: 'border-violet-200 bg-violet-50 text-violet-800' },
  closed: { label: 'Closed', icon: GitPullRequestClosed, className: 'border-rose-200 bg-rose-50 text-rose-800' },
};

const ROW_LINK =
  'group flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded px-1 py-1.5 text-sm text-slate-900 hover:underline focus-visible:outline-2 focus-visible:outline-primary sm:min-h-9';

/** Title as a link that opens GitHub in a new tab; plain text when the url is not a github.com link. */
const OutLink = ({ link, children }: { link: TaskLink; children: ReactNode }) => {
  const href = safeLinkHref(link.url);
  if (!href) return <span className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1.5 text-sm text-slate-900">{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={ROW_LINK}>
      {children}
      <ExternalLink aria-hidden className="size-3 shrink-0 text-slate-500" />
      <span className="sr-only">(opens GitHub in a new tab)</span>
    </a>
  );
};

const PullRequestRow = ({ link }: { link: TaskLink }) => {
  const meta = STATE_META[link.state ?? 'open'];
  const Icon = meta.icon;
  return (
    <li className="flex items-center gap-2 px-2">
      <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium', meta.className)}>
        <Icon className="size-3.5" aria-hidden /> {meta.label}
      </span>
      <OutLink link={link}>
        <span className="min-w-0 truncate" title={link.title}>{link.title || `Pull request #${link.number ?? ''}`}</span>
        <span className="shrink-0 text-xs text-slate-600">{link.repo}{link.number ? `#${link.number}` : ''}</span>
      </OutLink>
    </li>
  );
};

const CommitRow = ({ link }: { link: TaskLink }) => (
  <li className="flex items-center gap-2 px-2">
    <GitCommitHorizontal className="size-4 shrink-0 text-slate-500" aria-hidden />
    <code className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">{shortSha(link.sha)}</code>
    <OutLink link={link}>
      <span className="min-w-0 truncate" title={link.title}>{link.title || 'Commit'}</span>
    </OutLink>
  </li>
);

const BranchRow = ({ link }: { link: TaskLink }) => (
  <li className="flex items-center gap-2 px-2">
    <GitBranch className="size-4 shrink-0 text-slate-500" aria-hidden />
    <OutLink link={link}>
      <span className="min-w-0 truncate font-mono text-xs" title={link.title}>{link.title}</span>
      <span className="shrink-0 text-xs text-slate-600">{link.repo}</span>
    </OutLink>
  </li>
);

const Group = ({ title, count, children }: { title: string; count: number; children: ReactNode }) =>
  count === 0 ? null : (
    <div>
      <h4 className="mb-1 text-xs font-medium text-slate-600">
        {title} <span className="tabular-nums">({count})</span>
      </h4>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">{children}</ul>
    </div>
  );

/** "Development" panel: GitHub pull requests, commits and branches that mention the task key. */
const TaskDevelopment = ({ task }: { task: Pick<Task, 'number' | 'project' | 'links'> }) => {
  const key = useTaskKey(task);
  const { pullRequests, commits, branches } = groupDevelopmentLinks(task.links);
  const empty = pullRequests.length + commits.length + branches.length === 0;

  return (
    <section aria-label="Development" className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Development</h3>
      {empty ? (
        <p className="text-sm text-slate-500">
          No pull requests, commits or branches yet. Mention {key || 'WEB-12'} in a branch name, commit message or pull request to link it here.
        </p>
      ) : (
        <>
          <Group title="Pull requests" count={pullRequests.length}>
            {pullRequests.map(link => <PullRequestRow key={link.url} link={link} />)}
          </Group>
          <Group title="Commits" count={commits.length}>
            {commits.map(link => <CommitRow key={link.url} link={link} />)}
          </Group>
          <Group title="Branches" count={branches.length}>
            {branches.map(link => <BranchRow key={link.url} link={link} />)}
          </Group>
        </>
      )}
    </section>
  );
};

export default TaskDevelopment;
