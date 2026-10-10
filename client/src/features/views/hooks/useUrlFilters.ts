import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { filtersKey, parseFilterParams, withFilterParams, type TaskFilters } from '@/features/tasks';

/**
 * Task filters that live in the URL (`?q=bug&status=pending&assignedToMe=1`) so every view is shareable.
 *
 * The page works from local state, so typing in the search box never waits for the router; each change is
 * written to the URL with `replace` (no history entry). When the URL changes by itself (a saved view, a pasted
 * link, Back) the state follows. Other parameters (`view`, `task`, `col`, `qf`, `group`) are never touched.
 */
export const useUrlFilters = (): [TaskFilters, (next: TaskFilters) => void] => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<TaskFilters>(() => parseFilterParams(searchParams));
  const urlFilters = useMemo(() => parseFilterParams(searchParams), [searchParams]);
  const urlKey = filtersKey(urlFilters);
  // Keys we wrote that the router has not reported back yet: when they arrive they are echoes, not outside changes
  const [written, setWritten] = useState<string[]>([]);

  const [seenKey, setSeenKey] = useState(urlKey);
  if (seenKey !== urlKey) {
    setSeenKey(urlKey);
    const echoAt = written.indexOf(urlKey);
    if (echoAt !== -1) setWritten(written.slice(echoAt + 1));
    else if (filtersKey(filters) !== urlKey) setFilters(urlFilters);
  }

  const update = useCallback((next: TaskFilters) => {
    setFilters(next);
    // A write that leaves the filters part of the URL as it is never comes back as a change
    const key = filtersKey(next);
    if (key !== urlKey) setWritten(list => [...list.slice(-9), key]);
    setSearchParams(prev => withFilterParams(prev, next), { replace: true });
  }, [setSearchParams, urlKey]);

  return [filters, update];
};
