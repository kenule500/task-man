/** Sliding-window limiter for one socket: at most `max` events in any `windowMs`. */
export interface SocketLimiter {
  allow: (now?: number) => boolean;
}

export const createSocketLimiter = (max: number, windowMs: number): SocketLimiter => {
  let hits: number[] = [];
  return {
    allow: (now = Date.now()) => {
      hits = hits.filter(at => now - at < windowMs);
      if (hits.length >= max) return false;
      hits.push(now);
      return true;
    },
  };
};

/** Lets an action through at most once per `intervalMs` per key (typing indicators). */
export const createThrottle = (intervalMs: number) => {
  const last = new Map<string, number>();
  return (key: string, now = Date.now()): boolean => {
    const previous = last.get(key);
    if (previous !== undefined && now - previous < intervalMs) return false;
    last.set(key, now);
    return true;
  };
};

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
