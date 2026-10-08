// Pure helpers for task dependency graphs (no database access, easy to unit test).

export type DependencyGraph = Map<string, string[]>;

/**
 * Returns true when giving `taskId` the dependencies `nextDependencies`
 * would create a cycle (A waits for B, B waits for A, ...).
 * `graph` maps every task id to the ids it currently depends on.
 */
export const wouldCreateCycle = (
  taskId: string,
  nextDependencies: string[],
  graph: DependencyGraph,
): boolean => {
  const stack = [...nextDependencies];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    stack.push(...(graph.get(current) ?? []));
  }
  return false;
};

/** Removes duplicates and blank ids while preserving order. */
export const normalizeIds = (ids: unknown): string[] => {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map(String).map(id => id.trim()).filter(Boolean))];
};
