import { useEffect, useState } from 'react';
import { chatApi } from '../api';
import type { ChatMember } from '../types';

const cache = new Map<string, ChatMember[]>();

/** Workspace members (name and avatar) for mentions and direct messages; fetched once per workspace. */
export const useChatMembers = (slug: string): { members: ChatMember[]; loading: boolean } => {
  const [state, setState] = useState<{ slug: string; members: ChatMember[] } | null>(
    () => (cache.has(slug) ? { slug, members: cache.get(slug)! } : null),
  );

  useEffect(() => {
    if (!slug || cache.has(slug)) return undefined;
    let cancelled = false;
    chatApi.members(slug)
      .then(members => {
        cache.set(slug, members);
        if (!cancelled) setState({ slug, members });
      })
      .catch(() => {
        if (!cancelled) setState({ slug, members: [] });
      });
    return () => { cancelled = true; };
  }, [slug]);

  const members = state?.slug === slug ? state.members : (cache.get(slug) ?? []);
  return { members, loading: !cache.has(slug) && state?.slug !== slug };
};

/** Forgets the cached members (tests and sign-out). */
export const clearChatMembersCache = (): void => cache.clear();
