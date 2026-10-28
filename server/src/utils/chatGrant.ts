/**
 * Who should be told that a project channel was granted to them.
 *
 * A bulk edit can name the same person twice, and two assignee writes can land in one request, so the
 * pairs are collapsed here before any event is emitted (FR-078, EC-033). Pure: it takes ids and
 * returns ids, which makes it unit-testable without a database (CON-109).
 */

/** One grant: this user may now read this project's channel. */
export interface ChannelGrant {
  projectId: string;
  userId: string;
}

const asId = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

/**
 * At most one grant per (project, user) pair.
 *
 * Returns an empty array for a missing project or no added members, which is the caller's signal that
 * nothing should be emitted — an assignee who was already a project member never appears here
 * (FR-078, EC-031).
 */
export const planChannelGrants = (
  projectId: string | null | undefined,
  addedUserIds: readonly unknown[],
): ChannelGrant[] => {
  const project = asId(projectId);
  if (!project) return [];

  const seen = new Set<string>();
  const grants: ChannelGrant[] = [];
  for (const candidate of addedUserIds) {
    const userId = asId(candidate);
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    grants.push({ projectId: project, userId });
  }
  return grants;
};

/**
 * Collapses grants that came from several tasks in the same request, so a bulk edit emits once per
 * project and user rather than once per task (FR-078, EC-033).
 */
export const uniqueChannelGrants = (grants: readonly ChannelGrant[]): ChannelGrant[] => {
  const seen = new Set<string>();
  const unique: ChannelGrant[] = [];
  for (const grant of grants) {
    const projectId = asId(grant.projectId);
    const userId = asId(grant.userId);
    if (!projectId || !userId) continue;
    const key = `${projectId}:${userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ projectId, userId });
  }
  return unique;
};