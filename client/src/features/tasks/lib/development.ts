import type { TaskLink } from '../types';

export interface DevelopmentGroups {
  pullRequests: TaskLink[];
  commits: TaskLink[];
  branches: TaskLink[];
}

const STATE_ORDER: Record<string, number> = { open: 0, merged: 1, closed: 2 };

const byRecent = (a: TaskLink, b: TaskLink) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || 0;

/** Pull requests (open first), commits and branches (newest first) of a task. */
export const groupDevelopmentLinks = (links: TaskLink[] | undefined): DevelopmentGroups => {
  const all = (links ?? []).filter(link => link.provider === 'github');
  return {
    pullRequests: all
      .filter(link => link.kind === 'pull_request')
      .sort((a, b) => (STATE_ORDER[a.state ?? 'open'] - STATE_ORDER[b.state ?? 'open']) || byRecent(a, b)),
    commits: all.filter(link => link.kind === 'commit').sort(byRecent),
    branches: all.filter(link => link.kind === 'branch').sort(byRecent),
  };
};

/** Seven characters, like `git log --oneline`. */
export const shortSha = (sha: string | undefined): string => (sha ?? '').slice(0, 7);

/** Only https://github.com links are rendered as hrefs (the server filters too; this is the second check). */
export const safeLinkHref = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'github.com' ? parsed.href : null;
  } catch {
    return null;
  }
};
