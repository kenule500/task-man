import { io, type Socket } from 'socket.io-client';
import { API_URL } from '@/config';
import { getToken } from '@/utils/session';
import { chatApi } from '../api';
import type { ChannelEvent, ChatActivity, ChatChannel, ConnectionStatus, PresenceUpdate } from '../types';
import { applyActivity, clearUnread, removeChannel, sumUnread, upsertChannel } from './channels';
import { CHANNEL_POLL_INTERVAL_MS, SOCKET_PATH, socketOrigin } from './socketConfig';

/**
 * One chat connection per signed-in session: the Socket.IO socket, the channel list with unread counts and
 * who is online. It lives outside React so the sidebar badge, the chat page and the project button share it.
 * `useChatSocket` (mounted in the workspace layout) starts and stops it.
 *
 * Sockets are only a speed-up. While one is not connected the list is refreshed on a timer and the open
 * channel polls the REST history (see useChannelMessages), so chat keeps working.
 */
export interface ChatState {
  slug: string;
  selfId: string;
  channels: ChatChannel[];
  unreadTotal: number;
  /** The first channel list has arrived */
  loaded: boolean;
  error: string;
  online: string[];
  status: ConnectionStatus;
}

const IDLE: ChatState = {
  slug: '', selfId: '', channels: [], unreadTotal: 0, loaded: false, error: '', online: [], status: 'idle',
};

type Handler = (payload: never) => void;

class ChatClient {
  private state: ChatState = IDLE;
  private readonly subscribers = new Set<() => void>();
  private readonly handlers = new Map<string, Set<Handler>>();
  private readonly joined = new Set<string>();
  private socket: Socket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private active: string | null = null;
  private generation = 0;

  // ---- store -------------------------------------------------------
  getState = (): ChatState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.subscribers.add(listener);
    return () => { this.subscribers.delete(listener); };
  };

  private set(patch: Partial<ChatState>): void {
    this.state = { ...this.state, ...patch };
    this.subscribers.forEach(listener => listener());
  }

  private setChannels(channels: ChatChannel[]): void {
    this.set({ channels, unreadTotal: sumUnread(channels) });
  }

  // ---- lifecycle ---------------------------------------------------
  /** Opens the connection for a workspace (a no-op when it is already open for it). */
  start(slug: string, selfId: string): void {
    if (this.state.slug === slug && this.state.selfId === selfId && this.state.status !== 'idle') return;
    this.stop();
    this.generation += 1;
    this.set({ ...IDLE, slug, selfId, status: 'connecting' });
    this.connect();
    void this.refreshChannels();
    void this.refreshOnline();
  }

  stop(): void {
    this.generation += 1;
    this.socket?.removeAllListeners();
    this.socket?.close();
    this.socket = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.joined.clear();
    this.active = null;
    if (this.state.status !== 'idle') this.set({ ...IDLE });
  }

  private connect(): void {
    const socket = io(socketOrigin(API_URL, window.location.origin), {
      path: SOCKET_PATH,
      // Vercel Functions accept WebSocket upgrades but not long polling
      transports: ['websocket'],
      // Read on every attempt, so a reconnect after sign-in again uses the current token
      auth: callback => callback({ token: getToken() ?? '' }),
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
    });
    this.socket = socket;

    socket.on('connect', () => {
      this.set({ status: 'connected' });
      this.stopPolling();
      // Rooms are per connection: join again, then catch up on what was missed while away
      this.joined.forEach(id => socket.emit('chat:join', { channelId: id }));
      void this.refreshChannels();
      void this.refreshOnline();
      this.emitLocal('chat:reconnected', undefined as never);
    });
    const lost = () => {
      if (this.socket !== socket) return;
      this.set({ status: 'offline' });
      this.startPolling();
    };
    socket.on('disconnect', lost);
    socket.on('connect_error', lost);

    socket.onAny((event: string, ...args: unknown[]) => this.emitLocal(event, args[0] as never));

    // A person can belong to several workspaces and the socket hears all of them: keep only this one
    const here = (workspace: string) => {
      const current = this.state.channels[0]?.workspace;
      return !current || !workspace || current === workspace;
    };
    socket.on('chat:activity', (activity: ChatActivity) => {
      if (!here(activity.workspace)) return;
      const result = applyActivity(this.state.channels, activity, { selfId: this.state.selfId, activeId: this.active });
      if (!result.known) void this.refreshChannels();
      else this.setChannels(result.channels);
    });
    socket.on('chat:channel', (event: ChannelEvent) => {
      if (event.action === 'archived') {
        this.setChannels(removeChannel(this.state.channels, event.channel._id));
      } else if (here(event.channel.workspace)) {
        this.setChannels(upsertChannel(this.state.channels, event.channel));
      }
    });
    socket.on('presence:update', (update: PresenceUpdate) => {
      if (!here(update.workspace)) return;
      const others = this.state.online.filter(id => id !== update.userId);
      this.set({ online: update.online ? [...others, update.userId] : others });
    });
  }

  // ---- fallback polling ---------------------------------------------
  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void this.refreshChannels();
      void this.refreshOnline();
    }, CHANNEL_POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  // ---- data ----------------------------------------------------------
  async refreshChannels(): Promise<void> {
    const { slug } = this.state;
    const generation = this.generation;
    if (!slug) return;
    try {
      const list = await chatApi.channels(slug);
      if (generation !== this.generation) return;
      // The open channel counts as read even if the server list was fetched a moment earlier
      const channels = this.active ? clearUnread(list.channels, this.active) : list.channels;
      this.set({ channels, unreadTotal: sumUnread(channels), loaded: true, error: '' });
    } catch (error) {
      if (generation !== this.generation) return;
      const message = error instanceof Error ? error.message : 'error';
      this.set({ loaded: true, error: this.state.channels.length > 0 ? '' : message });
    }
  }

  async refreshOnline(): Promise<void> {
    const { slug } = this.state;
    const generation = this.generation;
    if (!slug) return;
    try {
      const online = await chatApi.online(slug);
      if (generation === this.generation) this.set({ online });
    } catch {
      // Presence is a nicety; the list keeps what it had
    }
  }

  upsertChannel(channel: ChatChannel): void {
    this.setChannels(upsertChannel(this.state.channels, channel));
  }

  removeChannel(id: string): void {
    this.setChannels(removeChannel(this.state.channels, id));
  }

  /** The channel being looked at: its new messages are not counted as unread. */
  setActive(id: string | null): void {
    this.active = id;
    if (id) this.setChannels(clearUnread(this.state.channels, id));
  }

  /** Remembers locally and tells the server that everything in the channel has been seen. */
  async markRead(id: string): Promise<void> {
    this.setChannels(clearUnread(this.state.channels, id));
    try {
      await chatApi.markRead(this.state.slug, id);
    } catch {
      // The next list refresh brings the true count
    }
  }

  /** Updates the channel's preview after this person posts, without waiting for the echo. */
  noteOwnMessage(channelId: string, message: { _id: string; text: string; createdAt: string; author: { _id: string; name: string } }): void {
    const result = applyActivity(
      this.state.channels,
      {
        workspace: '', channelId, messageId: message._id, authorId: message.author._id, authorName: message.author.name,
        preview: message.text.slice(0, 100), createdAt: message.createdAt, mentions: [],
      },
      { selfId: this.state.selfId, activeId: this.active },
    );
    if (result.known) this.setChannels(result.channels);
  }

  // ---- rooms and events ------------------------------------------------
  /** Starts hearing a channel live; remembered across reconnects. */
  join(channelId: string): void {
    this.joined.add(channelId);
    if (this.socket?.connected) this.socket.emit('chat:join', { channelId });
  }

  leave(channelId: string): void {
    this.joined.delete(channelId);
    if (this.socket?.connected) this.socket.emit('chat:leave', { channelId });
  }

  /** Tells the channel the person is typing (the server throttles it too). */
  typing(channelId: string): void {
    if (this.socket?.connected) this.socket.emit('chat:typing', { channelId });
  }

  /** Subscribes to a server event (or 'chat:reconnected'); returns the unsubscribe function. */
  on<T>(event: string, handler: (payload: T) => void): () => void {
    const set = this.handlers.get(event) ?? new Set<Handler>();
    set.add(handler as Handler);
    this.handlers.set(event, set);
    return () => { set.delete(handler as Handler); };
  }

  private emitLocal(event: string, payload: never): void {
    this.handlers.get(event)?.forEach(handler => handler(payload));
  }
}

export const chatClient = new ChatClient();
