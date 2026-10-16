export const TYPING_TTL_MS = 4000;

export type TypingMap = Record<string, { name: string; at: number }>;

/** Remembers that `user` is typing now. */
export const noteTyping = (map: TypingMap, user: { _id: string; name: string }, now: number): TypingMap => ({
  ...map,
  [user._id]: { name: user.name, at: now },
});

/** Names of people who typed within the last few seconds (never `selfId`). */
export const activeTypers = (map: TypingMap, now: number, selfId?: string): string[] =>
  Object.entries(map)
    .filter(([id, entry]) => id !== selfId && now - entry.at < TYPING_TTL_MS)
    .map(([, entry]) => entry.name);

/** Drops entries that have expired, keeping the same object when nothing changed. */
export const pruneTyping = (map: TypingMap, now: number): TypingMap => {
  const kept = Object.entries(map).filter(([, entry]) => now - entry.at < TYPING_TTL_MS);
  return kept.length === Object.keys(map).length ? map : Object.fromEntries(kept);
};
