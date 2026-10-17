import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, EmptyState, PageLoader, toast } from '@/components/ds';
import { API_URL } from '@/config';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/utils/api';
import { chatApi } from '../api';
import ChannelList from '../components/ChannelList';
import ChatHeader from '../components/ChatHeader';
import Composer from '../components/Composer';
import MessageList from '../components/MessageList';
import SearchPanel, { PinnedPanel } from '../components/Panels';
import ThreadPanel from '../components/ThreadPanel';
import { useChatChannels } from '../hooks/useChatChannels';
import { useChatMessages } from '../hooks/useChatMessages';
import { useChatSocket } from '../hooks/useChatSocket';
import { unreadCount } from '../lib/messages';
import type { ChatMessage, PresenceMap } from '../types';

/** How long a typing indicator stays visible without a new event. */
const TYPING_TTL_MS = 4000;

interface ChatViewProps {
  /** Channel id from the route; absent means "open the first channel". */
  channelId?: string;
}

/**
 * The chat screen: channel list, conversation, threads, search and pins.
 * Every action works over REST and is upgraded to the socket when one is available.
 */
export const ChatView = ({ channelId }: ChatViewProps) => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const navigate = useNavigate();
  const { user } = useAuthGuard();
  const { can, loading: permissionsLoading } = usePermissions();

  const canRead = !permissionsLoading && can('chat:read');
  const canWrite = !permissionsLoading && can('chat:write');
  const canModerate = !permissionsLoading && can('chat:moderate');
  const canDirect = !permissionsLoading && can('chat:dm');

  const {
    channels, active, members, loading: channelsLoading, error: channelsError,
    lastRead, markRead, addChannel, nameOf, defaultChannelId,
  } = useChatChannels({ slug: workspaceSlug, enabled: canRead });

  const currentChannelId = channelId ?? defaultChannelId ?? undefined;
  const channel = active.find(item => item._id === currentChannelId) ?? null;

  // Route the member to the default channel once the list is known
  useEffect(() => {
    if (!workspaceSlug || !canRead || channelId || !defaultChannelId) return;
    navigate(`/${workspaceSlug}/chat/${defaultChannelId}`, { replace: true });
  }, [workspaceSlug, canRead, channelId, defaultChannelId, navigate]);

  const {
    messages, reactions, loading, loadingOlder, error, hasMore,
    applyMessage, applyUpdated, applyReaction, loadOlder,
  } = useChatMessages({ slug: workspaceSlug, channelId: currentChannelId, enabled: canRead });

  const [presence, setPresence] = useState<PresenceMap>({});
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [announcement, setAnnouncement] = useState('');
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null);
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [searching, setSearching] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [pinned, setPinned] = useState<ChatMessage[]>([]);
  const [pinsLoading, setPinsLoading] = useState(false);

  const { state: transport, send, notifyTyping } = useChatSocket({
    slug: workspaceSlug,
    channelId: currentChannelId,
    enabled: Boolean(canRead && workspaceSlug),
    onMessage: incoming => {
      applyMessage(incoming);
      if (incoming.author && typeof incoming.author !== 'string' && incoming.author._id !== user?._id) {
        setAnnouncement(`${incoming.author.name} said: ${incoming.body}`);
      }
      if (incoming.parent && threadParent?._id === incoming.parent) {
        setReplies(current => [...current, incoming]);
      }
    },
    onUpdated: applyUpdated,
    onReaction: applyReaction,
    onTyping: userId => setTyping(current => ({ ...current, [userId]: Date.now() })),
    onPresence: (userId, online) => setPresence(current => ({ ...current, [userId]: online })),
  });

  // Typing indicators expire on their own
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setTyping(current => {
        const next = Object.fromEntries(
          Object.entries(current).filter(([, at]) => now - at < TYPING_TTL_MS),
        );
        return Object.keys(next).length === Object.keys(current).length ? current : next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Opening a channel marks it read
  useEffect(() => {
    if (!currentChannelId) return;
    markRead(currentChannelId);
  }, [currentChannelId, markRead]);

  const unreadByChannel = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of channels) map[item._id] = unreadCount(item, lastRead);
    return map;
  }, [channels, lastRead]);

  const attachmentHref = useCallback((attachmentId: string) => (
    `${API_URL}/workspaces/${encodeURIComponent(workspaceSlug ?? '')}/chat/attachments/${attachmentId}`
  ), [workspaceSlug]);

  /** Sends over the socket when possible, otherwise REST; the ack message is merged either way. */
  const deliver = async (
    body: string,
    options: { parentId?: string | null; mentionIds: string[]; attachmentIds: string[] },
  ): Promise<void> => {
    if (!workspaceSlug || !currentChannelId) return;
    const input = { channelId: currentChannelId, body, ...options };
    const overSocket = await send(input);
    if (overSocket) {
      if (overSocket.parent && threadParent?._id === overSocket.parent) {
        setReplies(current => [...current, overSocket]);
      } else if (!overSocket.parent) {
        applyMessage(overSocket);
      }
      return;
    }
    const created = await chatApi.send(workspaceSlug, input);
    if (created.parent && threadParent?._id === created.parent) {
      setReplies(current => [...current, created]);
    } else {
      applyMessage(created);
    }
  };

  const openThread = async (message: ChatMessage) => {
    setThreadParent(message);
    if (!workspaceSlug || !currentChannelId) return;
    setRepliesLoading(true);
    try {
      setReplies(await chatApi.replies(workspaceSlug, currentChannelId, message._id));
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not load the thread.'));
    } finally {
      setRepliesLoading(false);
    }
  };

  // Search runs as the term changes, debounced so typing does not flood the API
  useEffect(() => {
    if (!searchOpen || !workspaceSlug || !currentChannelId || searchTerm.trim().length === 0) {
      return undefined;
    }
    const term = searchTerm.trim();
    const timer = setTimeout(() => {
      setSearching(true);
      chatApi.search(workspaceSlug, currentChannelId, term)
        .then(page => setSearchResults(page.results))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchOpen, searchTerm, workspaceSlug, currentChannelId]);

  // An empty term shows no results, so clearing the box does not need an effect
  const visibleResults = searchTerm.trim().length > 0 ? searchResults : [];

  const loadPins = useCallback(async () => {
    if (!workspaceSlug || !currentChannelId) return;
    setPinsLoading(true);
    try {
      setPinned(await chatApi.pinned(workspaceSlug, currentChannelId));
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not load pinned messages.'));
    } finally {
      setPinsLoading(false);
    }
  }, [workspaceSlug, currentChannelId]);

  const togglePin = useCallback(async (message: ChatMessage, next: boolean) => {
    if (!workspaceSlug || !currentChannelId) return;
    try {
      const updated = next
        ? await chatApi.pin(workspaceSlug, currentChannelId, message._id)
        : await chatApi.unpin(workspaceSlug, currentChannelId, message._id);
      applyUpdated(updated);
      if (pinsOpen) void loadPins();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not change the pin.'));
    }
  }, [workspaceSlug, currentChannelId, applyUpdated, pinsOpen, loadPins]);

  const deleteMessage = useCallback(async (message: ChatMessage) => {
    if (!workspaceSlug || !currentChannelId) return;
    const snapshot = messages;
    applyUpdated({ ...message, deletedAt: new Date().toISOString(), body: '', attachments: [] });
    try {
      await chatApi.remove(workspaceSlug, currentChannelId, message._id);
    } catch (err) {
      applyUpdated(snapshot.find(item => item._id === message._id) ?? message);
      toast.error(getApiErrorMessage(err, 'Could not delete the message.'));
    }
  }, [workspaceSlug, currentChannelId, messages, applyUpdated]);

  if (!permissionsLoading && !canRead) {
    return (
      <EmptyState
        title="Chat is not available"
        description="Your role does not include access to channels. Ask a workspace administrator for the chat permission."
      />
    );
  }

  if (channelsLoading || permissionsLoading) return <PageLoader label="Loading channels" />;
  if (channelsError) return <Alert tone="error" title="Channels could not be loaded">{channelsError}</Alert>;

  if (!channel) {
    return (
      <EmptyState
        title="No channel selected"
        description="Pick a channel from the sidebar to start reading, or ask an administrator to give you access."
      />
    );
  }

  const others = Object.entries(typing).filter(([userId]) => userId !== user?._id).map(([userId]) => nameOf(userId));
  const onlineUserIds = Object.entries(presence).filter(([, online]) => online).map(([id]) => id);
  const label = channel.kind === 'direct'
    ? nameOf(channel.participants.find(id => id !== user?._id) ?? '')
    : channel.name;

  const startDirect = async (userId: string) => {
    if (!workspaceSlug) return;
    try {
      const created = await chatApi.startDirect(workspaceSlug, userId);
      addChannel(created);
      navigate(`/${workspaceSlug}/chat/${created._id}`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not open that conversation.'));
    }
  };

  return (
    <div className="flex h-[calc(100dvh-var(--workspace-header,0px))] min-h-0">
      {/* The sidebar carries the list on wide screens; this copy covers phones and tablets */}
      <div className="flex w-full shrink-0 flex-col border-r border-slate-200 bg-sidebar p-2 lg:hidden lg:w-56">
        <h2 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/60">Chat</h2>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChannelList
            channels={active}
            currentChannelId={currentChannelId}
            currentUserId={user?._id}
            members={members}
            unreadByChannel={unreadByChannel}
            nameOf={nameOf}
            onSelect={id => navigate(`/${workspaceSlug}/chat/${id}`)}
            canStartDirect={canDirect}
            onStartDirect={startDirect}
          />
        </div>
      </div>

      <div className={cn('flex min-w-0 flex-1 flex-col bg-white', channel.archived && 'opacity-95')}>
        <ChatHeader
          channel={channel}
          label={label}
          onlineUserIds={onlineUserIds}
          memberCount={members.length}
          transport={transport}
          onOpenSearch={() => setSearchOpen(value => !value)}
          onTogglePins={() => {
            setPinsOpen(value => !value);
            if (!pinsOpen) void loadPins();
          }}
          onOpenMembers={() => { /* the member list lives in the sidebar */ }}
        />

        {channel.archived && (
          <Alert tone="warning" title="This project was deleted">
            The conversation stays readable, but no new messages can be posted.
          </Alert>
        )}

        {others.length > 0 && (
          <p aria-live="polite" className="px-4 py-1 text-xs italic text-slate-500">
            {others.slice(0, 3).join(', ')} {others.length === 1 ? 'is' : 'are'} typing…
          </p>
        )}

        {searchOpen && (
          <SearchPanel
            term={searchTerm}
            results={visibleResults}
            loading={searching}
            onTermChange={setSearchTerm}
            onClose={() => { setSearchOpen(false); setSearchTerm(''); }}
          />
        )}

        {pinsOpen && (
          <PinnedPanel pinned={pinned} loading={pinsLoading} onClose={() => setPinsOpen(false)} />
        )}

        <div className="flex min-h-0 flex-1">
          <MessageList
            messages={messages}
            reactions={reactions}
            currentUserId={user?._id}
            canWrite={canWrite}
            canModerate={canModerate}
            loading={loading}
            loadingOlder={loadingOlder}
            hasMore={hasMore}
            error={error}
            emptyCopy={channel.kind === 'direct' ? 'Say hello to start the conversation.' : 'No messages yet. Start the conversation.'}
            attachmentHref={attachmentHref}
            onLoadOlder={loadOlder}
            onToggleReaction={(messageId, emoji) => {
              if (!workspaceSlug || !currentChannelId) return;
              chatApi.react(workspaceSlug, currentChannelId, messageId, emoji)
                .then(list => applyReaction({ messageId, reactions: list }))
                .catch(err => toast.error(getApiErrorMessage(err, 'Could not react to that message.')));
            }}
            onReply={openThread}
            onEdit={(message, body) => {
              if (!workspaceSlug || !currentChannelId) return;
              chatApi.edit(workspaceSlug, currentChannelId, message._id, body)
                .then(applyUpdated)
                .catch(err => toast.error(getApiErrorMessage(err, 'Could not edit the message.')));
            }}
            onDelete={deleteMessage}
            onPin={togglePin}
            announcement={announcement}
          />

          {threadParent && (
            <ThreadPanel
              parent={threadParent}
              replies={replies}
              reactions={reactions}
              members={members}
              currentUserId={user?._id}
              canWrite={canWrite && !channel.archived}
              loading={repliesLoading}
              onClose={() => { setThreadParent(null); setReplies([]); }}
              onSend={deliver}
            />
          )}
        </div>

        <Composer
          slug={workspaceSlug ?? ''}
          channelId={currentChannelId ?? ''}
          members={members}
          disabled={!canWrite || channel.archived}
          disabledReason={channel.archived ? 'This project was deleted' : 'You cannot post in this channel'}
          placeholder={`Message ${label}`}
          onSend={deliver}
          onTyping={notifyTyping}
        />
      </div>
    </div>
  );
};

export default ChatView;
