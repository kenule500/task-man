import { API_CACHE_NAME, clearSession, saveSession } from '../session';
import { clearCache, getCached, setCached } from '@/lib/queryCache';

const user = { _id: 'u1', name: 'Ada', email: 'ada@example.com' };

describe('session cache clearing', () => {
  const deleteCache = jest.fn().mockResolvedValue(true);

  beforeEach(() => {
    localStorage.clear();
    clearCache();
    Object.defineProperty(globalThis, 'caches', { value: { delete: deleteCache }, configurable: true });
  });

  afterEach(() => {
    delete (globalThis as { caches?: unknown }).caches;
  });

  it('drops in-memory lists and the service worker API cache on logout', () => {
    saveSession('t', user);
    setCached('tasks:acme', [1]);
    clearSession();
    expect(getCached('tasks:acme')).toBeUndefined();
    expect(deleteCache).toHaveBeenCalledWith(API_CACHE_NAME);
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('starts a new login with a cold cache', () => {
    setCached('projects:acme', [1]);
    saveSession('t2', user);
    expect(getCached('projects:acme')).toBeUndefined();
    expect(localStorage.getItem('token')).toBe('t2');
  });

  it('works where the Cache API does not exist', () => {
    delete (globalThis as { caches?: unknown }).caches;
    expect(() => clearSession()).not.toThrow();
  });
});
