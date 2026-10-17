import { API_URL } from '@/config';

/**
 * Absolute URL of a channel avatar. The API returns a route relative to the workspace, and serves the
 * file only to callers who may read that channel.
 */
export const avatarSrc = (avatarUrl: string | null | undefined): string | undefined => {
  if (!avatarUrl) return undefined;
  return avatarUrl.startsWith('http') ? avatarUrl : `${API_URL}${avatarUrl}`;
};
