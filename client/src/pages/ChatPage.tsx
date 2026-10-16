import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessagesSquare } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { EmptyState } from '@/components/ds';
import { buttonVariants } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import {
  ChannelList, ChannelView, NewChannelDialog, NewDmDialog, chatApi, chatClient, canManageChannel,
  useChannelLabel, useChatMembers, useChatState,
  type ChatChannel,
} from '@/features/chat';

interface ChatScreenProps {
  slug: string;
  channelId?: string;
  selfId: string;
}

const ChatScreen = ({ slug, channelId, selfId }: ChatScreenProps) => {
  const { t } = useTranslation('chat');
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { can } = usePermissions();
  const { channels, loaded, error, online } = useChatState();
  const { members } = useChatMembers(slug);
  const labelOf = useChannelLabel(selfId);
  const [newChannelOpen, setNewChannelOpen] = useState(false);
  const [newDmOpen, setNewDmOpen] = useState(false);

  const channel = channels.find(item => item._id === channelId);
  const root = `/${slug}/chat`;
  const hrefFor = (item: ChatChannel) => `${root}/${item._id}`;

  // Wide screens open #general straight away; on a phone the list is the landing view
  if (!channelId && !isMobile && loaded && channels.length > 0) {
    const first = channels.find(item => item.isDefault) ?? channels[0];
    return <Navigate to={hrefFor(first)} replace />;
  }

  const createChannel = async (input: { name: string; private: boolean; members: string[] }) => {
    const created = await chatApi.createChannel(slug, input);
    chatClient.upsertChannel(created);
    navigate(hrefFor(created));
  };

  const openDm = async (member: { _id: string }) => {
    const dm = await chatApi.openDm(slug, member._id);
    chatClient.upsertChannel(dm);
    navigate(hrefFor(dm));
  };

  let conversation;
  if (channel) {
    conversation = (
      <ChannelView
        key={channel._id}
        slug={slug}
        channel={channel}
        label={labelOf(channel)}
        selfId={selfId}
        members={members}
        online={online}
        backHref={root}
        canManage={canManageChannel(channel, selfId, can('settings:manage'))}
        onRename={async name => {
          chatClient.upsertChannel(await chatApi.updateChannel(slug, channel._id, { name }));
        }}
        onArchive={async () => {
          await chatApi.archiveChannel(slug, channel._id);
          chatClient.removeChannel(channel._id);
          navigate(root, { replace: true });
        }}
      />
    );
  } else if (channelId && loaded) {
    conversation = (
      <EmptyState
        headingLevel="h2"
        icon={<MessagesSquare />}
        title={t('notFound.title')}
        description={t('notFound.description')}
        action={<Link to={root} className={buttonVariants({ variant: 'outline' })}>{t('notFound.back')}</Link>}
      />
    );
  } else {
    conversation = (
      <EmptyState
        headingLevel="h2"
        icon={<MessagesSquare />}
        title={t('pick.title')}
        description={t('pick.description')}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex min-h-[26rem] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm',
        // Page padding and the top bar (and the tab bar on phones) are subtracted so only the messages scroll
        'h-[calc(100dvh-9.5rem)] md:h-[calc(100dvh-5.5rem)] lg:h-[calc(100dvh-7.5rem)]',
      )}
    >
      <aside className={cn('min-w-0 shrink-0 flex-col border-e border-slate-200 max-md:w-full md:flex md:w-72 lg:w-80', channelId ? 'hidden' : 'flex')}>
        <ChannelList
          channels={channels}
          loaded={loaded}
          error={error}
          onRetry={() => { void chatClient.refreshChannels(); }}
          selfId={selfId}
          activeId={channelId}
          online={online}
          labelOf={labelOf}
          hrefFor={hrefFor}
          canCreate={can('tasks:write')}
          onNewChannel={() => setNewChannelOpen(true)}
          onNewDm={() => setNewDmOpen(true)}
        />
      </aside>

      <section aria-label={t('conversation')} className={cn('min-w-0 flex-1 flex-col md:flex', channelId ? 'flex' : 'hidden')}>
        {conversation}
      </section>

      <NewChannelDialog open={newChannelOpen} onOpenChange={setNewChannelOpen} members={members} selfId={selfId} onCreate={createChannel} />
      <NewDmDialog open={newDmOpen} onOpenChange={setNewDmOpen} members={members} selfId={selfId} online={online} onPick={openDm} />
    </div>
  );
};

/** Team chat: channels on the left, the open conversation on the right; one pane at a time on a phone. */
const ChatPage = () => {
  const { workspaceSlug = '', channelId } = useParams<{ workspaceSlug: string; channelId: string }>();
  return (
    <AppShell>
      {user => <ChatScreen slug={workspaceSlug} channelId={channelId} selfId={user._id} />}
    </AppShell>
  );
};

export default ChatPage;
