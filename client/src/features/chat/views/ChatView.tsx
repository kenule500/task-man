import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, EmptyState, PageLoader, toast } from '@/components/ds';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/utils/api';
import { chatApi } from '../api';
import NewDirectMessage from '../components/NewDirectMessage';
import ChannelSettingsDialog from '../components/ChannelSettingsDialog';
import ConversationList from '../components/ConversationList';
import ChatHeader from '../components/ChatHeader';
import Composer from '../components/Composer';
import MembersPanel from '../components/MembersPanel';
import MessageList from '../components/MessageList';
import { PinnedPanel } from '../components/Panels';
import SearchBar from '../components/SearchBar';
import SearchResults from '../components/SearchResults';
import ThreadPanel from '../components/ThreadPanel';
import { useChatChannels } from '../hooks/useChatChannels';
import { useChatMessages } from '../hooks/useChatMessages';
import { useChatSocket } from '../hooks/useChatSocket';
import { notifyConversations } from '../lib/conversationEvents';
import {
  applyIncomingMessage, applySentMessage, grantChannel, markConversationRead, mergeConversations, renameChannel,
} from '../lib/conversations';
import { formatCounter, nextIndex } from '../lib/search';
import type { ChatMessage, ChatThreadUpdate, ConversationCard, PresenceMap } from '../types';

/** How long a typing indicator stays visible without a new event. */
const TYPING_TTL_MS = 4000;

/** Pages the jump will load before reporting that a message cannot be reached. */
const MAX_JUMP_PAGES = 8;

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
    active, members, loading: channelsLoading, error: channelsError,
    markRead, addChannel, ensureChannel, nameOf,
  } = useChatChannels({ slug: workspaceSlug, enabled: canRead });

  // The route names the conversation, or nothing does: the chat root shows the list with nothing
  // selected instead of redirecting to a channel the member never asked for (AC-101)
  const currentChannelId = channelId;
  const channel = currentChannelId ? active.find(item => item._id === currentChannelId) ?? null : null;

  // A conversation named by the route that the list does not hold yet (fresh grant, deep link) is
  // resolved once before the empty pane is shown, so a member with access never sees it (AC-112)
  const resolveAttempts = useRef<Set<string>>(new Set());
  const [unresolved, setUnresolved] = useState<string | null>(null);
  useEffect(() => {
    if (!currentChannelId || channel || channelsLoading) return;
    if (resolveAttempts.current.has(currentChannelId)) return;
    resolveAttempts.current.add(currentChannelId);
    void ensureChannel(currentChannelId).then(found => {
      if (!found) setUnresolved(currentChannelId);
    });
  }, [currentChannelId, channel, channelsLoading, ensureChannel]);

  const {
    messages, reactions, loading, loadingOlder, error, hasMore,
    applyMessage, applyUpdated, applyReaction, applyThread, loadOlder,
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
  const [searchCursor, setSearchCursor] = useState<string | null>(null);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const [searchNotice, setSearchNotice] = useState('');
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<{ id: string; nonce: number } | null>(null);
  // Below lg the two panes cannot fit side by side, so one of them is shown at a time
  const [listOpen, setListOpen] = useState(false);
  // The jump, the paging and the stale-response guard all need to read the latest values without
  // re-subscribing, so they live in refs beside the state they mirror
  const jumpAttempts = useRef(0);
  const searchPageToken = useRef(0);
  const searchTermRef = useRef('');
  const channelRef = useRef<string | undefined>(currentChannelId);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [pinned, setPinned] = useState<ChatMessage[]>([]);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  // The members control, so closing the panel hands focus back to it (NFR-033)
  const membersTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [teams, setTeams] = useState<ConversationCard[]>([]);
  const [directs, setDirects] = useState<ConversationCard[]>([]);
  const [teamsLoadedFor, setTeamsLoadedFor] = useState<string | null>(null);
  const [settingsTeam, setSettingsTeam] = useState<ConversationCard | null>(null);
  const teamsLoading = Boolean(workspaceSlug) && canRead && teamsLoadedFor !== workspaceSlug;

  // The socket subscribes to every conversation, so this list must change only when membership does
  const conversationIds = useMemo(
    () => [...directs, ...teams].map(card => card._id),
    [directs, teams],
  );

  // Direct messages and team channels arrive together, so the side panel loads in one round trip
  useEffect(() => {
    if (!workspaceSlug || !canRead) return undefined;
    let cancelled = false;
    chatApi.conversations(workspaceSlug)
      .then(payload => {
        if (cancelled) return;
        // A conversation opened by its route is already read by the time the list arrives (a deep link
        // or a first paint after the read marker), so the payload must not re-light its badge (EC-051)
        const openId = channelRef.current;
        setTeams(openId ? markConversationRead(payload.teams, openId) : payload.teams);
        setDirects(openId ? markConversationRead(payload.directs, openId) : payload.directs);
      })
      .catch(() => {
        if (cancelled) return;
        setTeams([]);
        setDirects([]);
      })
      .finally(() => { if (!cancelled) setTeamsLoadedFor(workspaceSlug); });
    return () => { cancelled = true; };
  }, [workspaceSlug, canRead]);

  const { state: transport, send, notifyTyping, joinChannel } = useChatSocket({
    slug: workspaceSlug,
    channelId: currentChannelId,
    // Subscribed to every conversation so a row can refresh while another channel is open (AC-063)
    channelIds: conversationIds,
    enabled: Boolean(canRead && workspaceSlug),
    onMessage: incoming => {
      if (incoming.channel !== currentChannelId) {
        // Another conversation received it: patch that row rather than adding it to this channel
        setDirects(current => applyIncomingMessage(current, incoming, user?._id));
        setTeams(current => applyIncomingMessage(current, incoming, user?._id));
        return;
      }
      applyMessage(incoming);
      if (incoming.author && typeof incoming.author !== 'string' && incoming.author._id !== user?._id) {
        setAnnouncement(`${incoming.author.name} said: ${incoming.body}`);
      }
      if (incoming.parent && threadParent?._id === incoming.parent) {
        setReplies(current => [...current, incoming]);
      }
    },
    onUpdated: message => {
      if (message.channel === currentChannelId) applyUpdated(message);
    },
    onReaction: payload => {
      if (payload.channelId === currentChannelId) applyReaction(payload);
    },
    onTyping: userId => setTyping(current => ({ ...current, [userId]: Date.now() })),
    onPresence: (userId, online) => setPresence(current => ({ ...current, [userId]: online })),
    // A project channel arrived because a task assignment made this member part of the project:
    // append it, then join its room so the next message arrives live (FR-077, AC-080, AC-081)
    onChannelGranted: card => {
      setTeams(current => grantChannel(current, card));
      joinChannel(card._id);
      // The sidebar keeps its own list; one notice keeps both panes in step (AC-113)
      notifyConversations('channels');
    },
    // A project rename updates the open row in place (FR-079, EC-042)
    onChannelUpdated: summary => {
      setTeams(current => renameChannel(current, summary));
      notifyConversations('channels');
    },
    // A reply elsewhere in this channel updates its parent's count, with or without an open thread
    onThread: update => {
      if (update.channelId === currentChannelId) applyThread(update);
    },
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

  // Opening a channel marks it read: locally, in the sidebar and on the server
  useEffect(() => {
    if (!currentChannelId) return;
    markRead(currentChannelId);
    // The list badge clears from the click alone: no refetch and no waiting for the next load (AC-121).
    // The route is the external event this effect responds to, so the patch belongs here
    /* eslint-disable react-hooks/set-state-in-effect -- a route change is the external event */
    setDirects(current => markConversationRead(current, currentChannelId));
    setTeams(current => markConversationRead(current, currentChannelId));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [currentChannelId, markRead]);

  // Highlighting @mentions needs the member names available in this channel
  const memberNames = useMemo(() => members.map(member => member.name), [members]);

  /** Sends over the socket when possible, otherwise REST; both paths settle through `settle`. */
  const deliver = async (
    body: string,
    options: { parentId?: string | null; mentionIds: string[]; attachmentIds: string[] },
  ): Promise<void> => {
    if (!workspaceSlug || !currentChannelId) return;
    const input = { channelId: currentChannelId, body, ...options };

    /**
     * The sender's own socket never receives their message or its thread event, so the result of the
     * send is applied here: the conversation rises to the top with the new preview (AC-122) and a
     * reply's parent takes the authoritative count the server returned (AC-123).
     */
    const settle = (sent: ChatMessage, thread: ChatThreadUpdate | null) => {
      setDirects(current => applySentMessage(current, sent, user?._id));
      setTeams(current => applySentMessage(current, sent, user?._id));
      if (!thread) return;
      applyThread(thread);
      setThreadParent(current => (
        current?._id === thread.messageId
          ? { ...current, replyCount: thread.replyCount, lastReplyAuthor: thread.lastReplyAuthor ?? current.lastReplyAuthor ?? null }
          : current
      ));
    };

    const overSocket = await send(input);
    if (overSocket) {
      const { message, thread } = overSocket;
      settle(message, thread);
      if (message.parent && threadParent?._id === message.parent) {
        setReplies(current => [...current, message]);
      } else if (!message.parent) {
        applyMessage(message);
      }
      return;
    }

    const created = await chatApi.send(workspaceSlug, input);
    settle(created.message, created.thread);
    if (created.message.parent && threadParent?._id === created.message.parent) {
      setReplies(current => [...current, created.message]);
    } else {
      applyMessage(created.message);
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

  // The term and channel are mirrored so a late response can be recognised as stale (NFR-028)
  useEffect(() => { searchTermRef.current = searchTerm.trim(); }, [searchTerm]);
  useEffect(() => { channelRef.current = currentChannelId; }, [currentChannelId]);

  // A new channel starts a new search: the old rows belong to a conversation the member left
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting per channel is the point
    setSearchOpen(false);
    setSearchResults([]);
    setSearchCursor(null);
    setSearchHasMore(false);
    setSearchLoading(false);
    setSearchLoadingMore(false);
    setActiveResult(0);
    setSearchNotice('');
    setJumpTarget(null);
    setHighlightedId(null);
    searchPageToken.current += 1;
  }, [currentChannelId]);

  // Search runs as the term changes, debounced so typing does not flood the API (spec §17)
  useEffect(() => {
    if (!searchOpen || !workspaceSlug || !currentChannelId) return undefined;

    const term = searchTerm.trim();
    // Any page fetch still in flight belongs to the previous term
    searchPageToken.current += 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new term starts at the first match
    setActiveResult(0);
    setSearchNotice('');

    if (!term) {
      setSearchResults([]);
      setSearchCursor(null);
      setSearchHasMore(false);
      setSearchLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setSearchLoading(true);
      chatApi.search(workspaceSlug, currentChannelId, term)
        .then(page => {
          if (cancelled) return;
          setSearchResults(page.results);
          setSearchCursor(page.nextCursor);
          setSearchHasMore(Boolean(page.nextCursor));
        })
        .catch(() => {
          if (cancelled) return;
          setSearchResults([]);
          setSearchCursor(null);
          setSearchHasMore(false);
        })
        .finally(() => { if (!cancelled) setSearchLoading(false); });
    }, 250);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchOpen, searchTerm, workspaceSlug, currentChannelId]);

  // Reaching the last loaded row pulls the next page, so the arrows are not capped at page one
  useEffect(() => {
    if (!searchOpen || !searchHasMore || !searchCursor) return undefined;
    if (searchLoading || searchLoadingMore) return undefined;
    if (!workspaceSlug || !currentChannelId) return undefined;
    if (searchResults.length === 0 || activeResult < searchResults.length - 1) return undefined;

    const token = ++searchPageToken.current;
    const term = searchTerm.trim();
    const channel = currentChannelId;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fetch starts in this effect
    setSearchLoadingMore(true);

    chatApi.search(workspaceSlug, channel, term, searchCursor)
      .then(page => {
        if (searchPageToken.current !== token) return;
        if (searchTermRef.current !== term || channelRef.current !== channel) return;
        setSearchResults(current => {
          const seen = new Set(current.map(item => item._id));
          return [...current, ...page.results.filter(item => !seen.has(item._id))];
        });
        setSearchCursor(page.nextCursor);
        setSearchHasMore(Boolean(page.nextCursor));
      })
      .catch(() => {
        if (searchPageToken.current === token) setSearchHasMore(false);
      })
      .finally(() => setSearchLoadingMore(false));

    return undefined;
  }, [
    searchOpen, searchHasMore, searchCursor, searchLoading, searchLoadingMore,
    searchResults.length, activeResult, searchTerm, workspaceSlug, currentChannelId,
  ]);

  // Opening a result lands on the message: fetch older pages until it exists, then scroll to it
  useEffect(() => {
    if (!jumpTarget) return undefined;

    if (messages.some(message => message._id === jumpTarget)) {
      const id = jumpTarget;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the jump is resolved against the loaded pages
      setScrollTarget({ id, nonce: Date.now() });
      setHighlightedId(id);
      setJumpTarget(null);
      jumpAttempts.current = 0;
      const timer = setTimeout(() => setHighlightedId(null), 2500);
      return () => clearTimeout(timer);
    }

    if (hasMore && !loadingOlder && jumpAttempts.current < MAX_JUMP_PAGES) {
      jumpAttempts.current += 1;
      void loadOlder();
      return undefined;
    }

    // Bounded search of the history: the row stays selectable, the member is told it is gone
    setJumpTarget(null);
    jumpAttempts.current = 0;
    setSearchNotice('That message is no longer available.');
    setSearchOpen(true);
    return undefined;
  }, [jumpTarget, messages, hasMore, loadingOlder, loadOlder]);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchNotice('');
    // Esc hands the keyboard back to the composer, the way an editor returns to the document
    document.querySelector<HTMLTextAreaElement>('[data-chat-composer]')?.focus();
  };

  // Ctrl/Cmd+F opens the find bar from anywhere on the chat screen
  useEffect(() => {
    if (!canRead) return undefined;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        // The find bar lives in the conversation pane, so that pane has to be visible
        setListOpen(false);
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canRead]);

  const openResult = (message: ChatMessage) => {
    setSearchOpen(false);
    setSearchNotice('');
    jumpAttempts.current = 0;
    setJumpTarget(message._id);
  };

  const moveResult = (delta: number) => {
    setActiveResult(current => (
      searchResults.length === 0 ? 0 : nextIndex(current, searchResults.length, delta)
    ));
  };

  const openActiveResult = () => {
    const message = searchResults[activeResult];
    if (message) openResult(message);
  };

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

  const others = Object.entries(typing).filter(([userId]) => userId !== user?._id).map(([userId]) => nameOf(userId));
  const onlineUserIds = Object.entries(presence).filter(([, online]) => online).map(([id]) => id);
  const peerId = channel?.kind === 'direct'
    ? channel.participants.find(id => id !== user?._id)
    : undefined;
  const peer = peerId ? members.find(member => member._id === peerId) ?? null : null;
  const label = channel ? (channel.kind === 'direct' ? nameOf(peerId ?? '') : channel.name) : '';
  // One merged list: a conversation that just received a message rises above the others (AC-114)
  const conversations = mergeConversations(directs, teams);
  const hasConversations = conversations.length > 0;
  const searchCounter = formatCounter(activeResult, searchResults.length, searchHasMore);
  const activeOptionId = searchResults[activeResult]
    ? `chat-search-option-${searchResults[activeResult]._id}`
    : undefined;

  const startDirect = async (userId: string) => {
    if (!workspaceSlug) return;
    try {
      const created = await chatApi.startDirect(workspaceSlug, userId);
      addChannel(created);
      // The new conversation belongs in the direct-message segment, so refresh it with its card
      const payload = await chatApi.conversations(workspaceSlug);
      setDirects(payload.directs);
      setListOpen(false);
      navigate(`/${workspaceSlug}/chat/${created._id}`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not open that conversation.'));
    }
  };

  /** Opening a conversation leaves the mobile list behind; on desktop both panes stay visible. */
  const openChannel = (id: string) => {
    setListOpen(false);
    navigate(`/${workspaceSlug}/chat/${id}`);
  };

  return (
    // The shell gives this screen the space below its header; the panel owns that space and never
    // scrolls the page itself (spec §17 responsiveness)
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Every conversation the member can read, plus the direct-message picker */}
      <div
        className={cn(
          'min-h-0 w-full shrink-0 flex-col border-r border-slate-200 bg-sidebar lg:flex lg:w-72',
          listOpen ? 'flex' : 'hidden',
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {/* The picker stays the first item, then one merged list ordered by latest activity (AC-114) */}
          <NewDirectMessage
            members={members}
            currentUserId={user?._id}
            canStartDirect={canDirect}
            onStartDirect={startDirect}
          />
          <div className="min-h-0 flex-1 border-t border-slate-200">
            <ConversationList
              items={conversations}
              currentChannelId={currentChannelId}
              loading={teamsLoading}
              canManage={canModerate}
              onSelect={openChannel}
              onOpenSettings={setSettingsTeam}
            />
          </div>
        </div>
      </div>

      {settingsTeam && workspaceSlug && (
        <ChannelSettingsDialog
          slug={workspaceSlug}
          team={settingsTeam}
          onClose={() => setSettingsTeam(null)}
          onSaved={summary => {
            setTeams(current => current.map(team => (
              team._id === summary._id ? { ...team, name: summary.name, avatarUrl: summary.avatarUrl } : team
            )));
          }}
        />
      )}

      {channel ? (
        <div
          className={cn(
            'relative min-h-0 min-w-0 flex-1 flex-col bg-white',
            listOpen ? 'hidden lg:flex' : 'flex',
            channel.archived && 'opacity-95',
          )}
        >
        <ChatHeader
          channel={channel}
          label={label}
          peer={peer}
          peerOnline={Boolean(peerId && presence[peerId])}
          onlineUserIds={onlineUserIds}
          // A direct conversation is always its two participants; other kinds come from the server
          memberCount={channel.memberCount ?? (channel.kind === 'direct' ? 2 : members.length)}
          transport={transport}
          membersButtonRef={membersTriggerRef}
          onBack={() => setListOpen(true)}
          onOpenSearch={() => {
            setSearchNotice('');
            setSearchOpen(value => !value);
          }}
          onTogglePins={() => {
            setPinsOpen(value => !value);
            if (!pinsOpen) void loadPins();
          }}
          onOpenMembers={() => setMembersOpen(true)}
        />

        {workspaceSlug && currentChannelId && (
          <MembersPanel
            slug={workspaceSlug}
            channelId={currentChannelId}
            channelLabel={label}
            currentUserId={user?._id}
            memberCount={channel.memberCount ?? (channel.kind === 'direct' ? 2 : members.length)}
            open={membersOpen}
            onOpenChange={setMembersOpen}
            returnFocusTo={membersTriggerRef}
          />
        )}

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
          <SearchBar
            term={searchTerm}
            counter={searchCounter}
            hasResults={searchResults.length > 0}
            activeOptionId={activeOptionId}
            onChange={setSearchTerm}
            onPrevious={() => moveResult(-1)}
            onNext={() => moveResult(1)}
            onOpen={openActiveResult}
            onClose={closeSearch}
          />
        )}

        {pinsOpen && (
          <PinnedPanel pinned={pinned} loading={pinsLoading} onClose={() => setPinsOpen(false)} />
        )}

        <div className="flex min-h-0 flex-1">
          {searchOpen ? (
            <SearchResults
              results={searchResults}
              term={searchTerm}
              activeIndex={activeResult}
              loading={searchLoading}
              loadingMore={searchLoadingMore}
              notice={searchNotice}
              onSelect={setActiveResult}
              onOpen={openResult}
            />
          ) : (
            <>
              <MessageList
                messages={messages}
                reactions={reactions}
                currentUserId={user?._id}
                memberNames={memberNames}
                directory={members}
                canWrite={canWrite}
                canModerate={canModerate}
                loading={loading}
                loadingOlder={loadingOlder}
                hasMore={hasMore}
                error={error}
                emptyCopy={channel.kind === 'direct' ? 'Say hello to start the conversation.' : 'No messages yet. Start the conversation.'}
                slug={workspaceSlug ?? ''}
                scrollTo={scrollTarget}
                highlightedMessageId={highlightedId}
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
            </>
          )}
        </div>

        <Composer
          slug={workspaceSlug ?? ''}
          channelId={currentChannelId ?? ''}
          members={members}
          currentUserId={user?._id}
          disabled={!canWrite || channel.archived}
          disabledReason={channel.archived ? 'This project was deleted' : 'You cannot post in this channel'}
          placeholder={`Message ${label}`}
          onSend={deliver}
          onTyping={notifyTyping}
        />
        </div>
      ) : (
        <div
          className={cn(
            'min-h-0 min-w-0 flex-1 items-center justify-center bg-white p-6',
            listOpen ? 'hidden lg:flex' : 'flex',
          )}
        >
          <EmptyState
            // Centred as one block with a narrowed description, so it never reads as a single line
            // spanning the pane (AC-119); EmptyState keeps its own text-centre and icon treatment
            className="py-0 [&>p]:max-w-sm [&>p]:text-balance"
            title={unresolved ? 'Conversation not available' : 'No conversation selected'}
            description={
              unresolved
                ? 'This conversation is not available to you. Ask a workspace administrator for access.'
                : hasConversations
                  ? 'Pick a channel or a direct message from the list to start reading.'
                  : 'No conversation is available to you yet. Assign yourself a task in a project to join its channel, or ask a workspace administrator for access.'
            }
          />
        </div>
      )}
    </div>
  );
};

export default ChatView;
