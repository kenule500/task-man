import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { chatApi } from '../api';
import { activeChannels, defaultChannelId, sortChannels } from '../lib/messages';
import { allLastRead, setLastRead } from '../lib/readState';
import type { ChatChannel, ChatUser } from '../types';

interface Options {
  slug: string | undefined;
  enabled: boolean;
}

/** Channels the member can read, the member directory used for mentions, and the read state per channel. */
export const useChatChannels = ({ slug, enabled }: Options) => {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [members, setMembers] = useState<ChatUser[]>([]);
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const [error, setError] = useState('');
  const loading = Boolean(slug) && enabled && loadedSlug !== slug;

  useEffect(() => {
    if (!slug || !enabled) return undefined;

    let cancelled = false;

    Promise.all([chatApi.channels(slug), chatApi.members(slug)])
      .then(([list, directory]) => {
        if (cancelled) return;
        setChannels(sortChannels(list));
        setMembers(directory);
        setError('');
      })
      .catch(err => {
        if (cancelled) return;
        setError(getApiErrorMessage(err, 'Could not load your channels.'));
      })
      .finally(() => {
        if (!cancelled) setLoadedSlug(slug);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, enabled]);

  // The read state is shared with the sidebar through one storage module
  const [lastRead, setLastReadState] = useState<Record<string, string>>(allLastRead());

  const markRead = useCallback((channelId: string) => {
    setLastRead(channelId);
    setLastReadState(allLastRead());
    if (!slug) return;
    void chatApi.markRead(slug, channelId).catch(() => {
      // The badge is cosmetic: a failed marker must not interrupt reading
    });
  }, [slug]);

  const addChannel = useCallback((channel: ChatChannel) => {
    setChannels(current => (
      current.some(item => item._id === channel._id) ? current : sortChannels([...current, channel])
    ));
  }, []);

  const nameOf = useCallback((userId: string) => (
    members.find(member => member._id === userId)?.name ?? 'Teammate'
  ), [members]);

  const visibleChannels = enabled && slug ? channels : [];

  return {
    channels: visibleChannels,
    active: activeChannels(visibleChannels),
    members: enabled && slug ? members : [],
    loading,
    error,
    lastRead,
    markRead,
    addChannel,
    nameOf,
    defaultChannelId: defaultChannelId(visibleChannels),
  };
};
