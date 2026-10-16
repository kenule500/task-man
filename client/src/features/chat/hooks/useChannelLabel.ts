import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { dmPartner } from '../lib/channels';
import type { ChatChannel } from '../types';

/** Display name of a channel: the other person for a direct message, a translated name for #general. */
export const useChannelLabel = (selfId: string): ((channel: ChatChannel) => string) => {
  const { t } = useTranslation('chat');
  return useCallback((channel: ChatChannel) => {
    if (channel.type === 'dm') return dmPartner(channel, selfId)?.name ?? t('channel.directMessage');
    if (channel.isDefault) return t('channel.general');
    return channel.name;
  }, [selfId, t]);
};
