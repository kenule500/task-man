import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessagesSquare } from 'lucide-react';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { useChannelMessages } from '../hooks/useChannelMessages';
import { useTyping } from '../hooks/useTyping';
import { getDraft, setDraft } from '../lib/drafts';
import { firstUnreadId } from '../lib/messages';
import type { ChatChannel, ChatMember } from '../types';
import ChannelHeader from './ChannelHeader';
import Composer from './Composer';
import MessageList from './MessageList';
import TypingIndicator from './TypingIndicator';

interface ChannelViewProps {
  slug: string;
  channel: ChatChannel;
  label: string;
  selfId: string;
  members: ChatMember[];
  online: string[];
  backHref: string;
  canManage: boolean;
  onRename: (name: string) => Promise<void>;
  onArchive: () => Promise<void>;
}

/** One open conversation: header, history, typing line and composer. Mount with `key={channel._id}`. */
const ChannelView = ({
  slug, channel, label, selfId, members, online, backHref, canManage, onRename, onArchive,
}: ChannelViewProps) => {
  const { t } = useTranslation('chat');
  const chat = useChannelMessages(slug, channel._id, selfId);
  const { typers, announce } = useTyping(channel._id, selfId);
  // Unread at the moment the conversation was opened; the divider is placed once from it
  const [unreadAtOpen] = useState(channel.unread);
  const [dividerId, setDividerId] = useState<string | null | undefined>(undefined);
  if (dividerId === undefined && chat.status === 'ready') {
    setDividerId(firstUnreadId(chat.messages, selfId, unreadAtOpen));
  }

  // Everyone for a public channel; the named members for a private one
  const audience = channel.type === 'dm' || channel.private ? channel.memberIds : members.map(member => member._id);
  const composerName = channel.type === 'dm' ? label : `# ${label}`;

  let body;
  if (chat.status === 'loading') {
    body = <div className="flex-1 p-4"><SkeletonList rows={6} trailing={false} bare label={t('messages.loading')} /></div>;
  } else if (chat.status === 'error') {
    body = (
      <div className="flex-1 overflow-y-auto">
        <ErrorState
          title={t('messages.errorTitle')}
          reason={chat.error}
          nextStep={t('messages.errorNext')}
          action={<Button type="button" onClick={chat.retry}>{t('list.retry')}</Button>}
        />
      </div>
    );
  } else if (chat.messages.length === 0) {
    body = (
      <div className="flex-1 overflow-y-auto">
        <EmptyState
          headingLevel="h3"
          icon={<MessagesSquare />}
          title={t('messages.emptyTitle')}
          description={t('messages.emptyDescription', { channel: composerName })}
          className="py-12 sm:py-12"
        />
      </div>
    );
  } else {
    body = (
      <MessageList
        messages={chat.messages}
        members={members}
        selfId={selfId}
        hasMore={chat.hasMore}
        loadingOlder={chat.loadingOlder}
        onLoadOlder={() => { void chat.loadOlder(); }}
        dividerId={dividerId ?? null}
        onEdit={async (id, text) => { await chat.edit(id, text); }}
        onRemove={chat.remove}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChannelHeader
        channel={channel}
        label={label}
        selfId={selfId}
        memberIds={audience}
        online={online}
        connection={chat.connection}
        backHref={backHref}
        canManage={canManage}
        onRename={onRename}
        onArchive={onArchive}
      />

      {chat.connection === 'offline' && (
        <p role="status" className="shrink-0 border-b border-warning-border bg-warning-bg px-4 py-1.5 text-xs text-warning-fg">
          {t('status.offlineBanner')}
        </p>
      )}

      {body}

      {/* New messages from others are read out politely; the history itself is not re-announced */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{chat.announcement}</div>
      <TypingIndicator names={typers} />
      <Composer
        key={channel._id}
        channelName={composerName}
        members={members}
        selfId={selfId}
        initialDraft={getDraft(channel._id)}
        onDraftChange={text => setDraft(channel._id, text)}
        onSend={async text => { await chat.send(text); }}
        onTyping={announce}
      />
    </div>
  );
};

export default ChannelView;
