import { MAX_SPRINT_NAME } from '../../../models/sprintModel.js';

// Sprint names are unique by convention in a project, so a generated name that the target already uses gets a
// numeric suffix. The comparison ignores case and the result stays inside the schema's length limit.

export const dedupeSprintName = (name: string, taken: Set<string>): string => {
  const base = name.trim();
  let candidate = base;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
    const suffix = ` (${n})`;
    candidate = `${base.slice(0, MAX_SPRINT_NAME - suffix.length).trimEnd()}${suffix}`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
};

/** Deduplicates the plan's sprint names against each other and the target's existing names (lower-case). */
export const dedupeSprintNames = (names: string[], existing: Iterable<string>): string[] => {
  const taken = new Set(Array.from(existing, name => name.trim().toLowerCase()));
  return names.map(name => dedupeSprintName(name, taken));
};
