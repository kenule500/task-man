/** Largest estimate the API accepts. */
export const MAX_ESTIMATE_MINUTES = 100000;
/** Largest single entry. */
export const MAX_ENTRY_MINUTES = 1440;

const PART = /(\d+(?:[.,]\d+)?)\s*(hours|hour|hrs|hr|h|minutes|minute|mins|min|m)(?![a-z])/y;

/**
 * Reads a duration typed by a person: "2h 30m", "2h30", "90m", "1.5h", "1:30" or a bare number of minutes ("45").
 * Returns whole minutes, or null when the text is not a duration (empty text included).
 */
export const parseDuration = (text: string): number | null => {
  const value = text.trim().toLowerCase();
  if (!value) return null;

  const clock = /^(\d{1,4}):([0-5]?\d)$/.exec(value);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  if (/^\d+$/.test(value)) return Number(value);

  // "2h30" (minutes without a unit after hours) is common shorthand
  const shorthand = /^(\d+)\s*h\s*(\d{1,2})$/.exec(value);
  if (shorthand) return Number(shorthand[1]) * 60 + Number(shorthand[2]);

  let total = 0;
  let index = 0;
  let matched = 0;
  const seen = new Set<string>();
  while (index < value.length) {
    PART.lastIndex = index;
    const part = PART.exec(value);
    if (!part) return null;
    const unit = part[2].startsWith('h') ? 'h' : 'm';
    if (seen.has(unit)) return null;
    seen.add(unit);
    const amount = Number(part[1].replace(',', '.'));
    total += unit === 'h' ? amount * 60 : amount;
    matched += 1;
    index = PART.lastIndex;
    while (value[index] === ' ' || value[index] === ',') index += 1;
  }
  return matched > 0 ? Math.round(total) : null;
};

/** "2h 30m", "45m", "3h", "0m". */
export const formatDuration = (minutes: number): string => {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

/** Spoken form for screen readers: "2 hours 30 minutes". */
export const describeDuration = (minutes: number): string => {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (rest > 0 || hours === 0) parts.push(`${rest} ${rest === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ');
};

/** Clock face of a running timer: "4:05" under an hour, "1:02:05" after. */
export const formatElapsed = (milliseconds: number): string => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
};

export interface TimeProgress {
  /** 0-100, capped. */
  percent: number;
  over: boolean;
  /** Minutes left (0 when over). */
  remaining: number;
  /** Minutes past the estimate (0 when within). */
  overBy: number;
}

/** Logged time against an estimate; null when there is no estimate to compare with. */
export const timeProgress = (logged: number, estimate: number | null | undefined): TimeProgress | null => {
  if (!estimate || estimate <= 0) return null;
  return {
    percent: Math.min(100, Math.round((logged / estimate) * 100)),
    over: logged > estimate,
    remaining: Math.max(0, estimate - logged),
    overBy: Math.max(0, logged - estimate),
  };
};

/** One line summary: "3h 15m of 2h 30m (45m over)", "1h logged", "Nothing logged yet". */
export const describeProgress = (logged: number, estimate: number | null | undefined): string => {
  const progress = timeProgress(logged, estimate);
  if (!progress || !estimate) return logged > 0 ? `${formatDuration(logged)} logged` : 'Nothing logged yet';
  const base = `${formatDuration(logged)} of ${formatDuration(estimate)}`;
  return progress.over ? `${base} (${formatDuration(progress.overBy)} over)` : `${base} (${formatDuration(progress.remaining)} left)`;
};
