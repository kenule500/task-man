import {
  MAX_AGE_MS, clearCache, fetchCached, getCached, invalidate, invalidatePrefix, projectsKey, setCached, subscribe, tasksKey,
} from '../queryCache';

describe('queryCache', () => {
  afterEach(() => {
    clearCache();
    jest.useRealTimers();
  });

  it('stores and returns values by key', () => {
    setCached('tasks:a', [1]);
    expect(getCached('tasks:a')).toEqual([1]);
    expect(getCached('tasks:b')).toBeUndefined();
    expect(tasksKey('acme')).toBe('tasks:acme');
    expect(projectsKey('acme')).toBe('projects:acme');
  });

  it('expires entries after the max age', () => {
    jest.useFakeTimers();
    setCached('k', 'v');
    jest.advanceTimersByTime(MAX_AGE_MS - 1);
    expect(getCached('k')).toBe('v');
    jest.advanceTimersByTime(2);
    expect(getCached('k')).toBeUndefined();
  });

  it('notifies subscribers on write and invalidate, and stops after unsubscribe', () => {
    const listener = jest.fn();
    const off = subscribe('k', listener);
    setCached('k', 1);
    expect(listener).toHaveBeenCalledTimes(1);
    setCached('k', 1); // same reference: no change
    expect(listener).toHaveBeenCalledTimes(1);
    invalidate('k');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getCached('k')).toBeUndefined();
    off();
    setCached('k', 2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('invalidates by prefix', () => {
    setCached('tasks:a', 1);
    setCached('tasks:b', 2);
    setCached('projects:a', 3);
    invalidatePrefix('tasks:');
    expect(getCached('tasks:a')).toBeUndefined();
    expect(getCached('tasks:b')).toBeUndefined();
    expect(getCached('projects:a')).toBe(3);
  });

  it('shares concurrent requests until they settle', async () => {
    const fetcher = jest.fn().mockResolvedValue(['x']);
    const [a, b] = await Promise.all([fetchCached('k', fetcher), fetchCached('k', fetcher)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    await fetchCached('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2); // nothing in flight any more
  });

  it('leaves writing to the caller', async () => {
    await fetchCached('k', () => Promise.resolve('v'));
    expect(getCached('k')).toBeUndefined();
  });

  it('force starts a new request instead of joining the running one', async () => {
    let resolveOld: (value: string) => void = () => {};
    const old = fetchCached('k', () => new Promise<string>(resolve => { resolveOld = resolve; }));
    const fresh = fetchCached('k', () => Promise.resolve('fresh'), true);
    await expect(fresh).resolves.toBe('fresh');
    // later callers join the forced request's slot, not the superseded one
    resolveOld('old');
    await expect(old).resolves.toBe('old');
  });

  it('does not reuse a failed request', async () => {
    await expect(fetchCached('k', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(fetchCached('k', () => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('forgets in-flight requests on clearCache (logout) so the next user never joins them', async () => {
    let resolve: (value: string) => void = () => {};
    const first = fetchCached('k', () => new Promise<string>(r => { resolve = r; }));
    clearCache();
    const fetcher = jest.fn().mockResolvedValue('new user');
    await expect(fetchCached('k', fetcher)).resolves.toBe('new user');
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve('previous user');
    await first;
  });
});
