import { act, renderHook, waitFor } from '@testing-library/react';
import { chatApi } from '../api';
import { chatClient } from '../lib/chatClient';
import { useChannelMessages } from '../hooks/useChannelMessages';
import { cursorOf } from '../lib/messages';
import type { ChatMessage, MessagePage } from '../types';
import { ANA, BEN, makeMessage } from './fixtures';

jest.mock('../api', () => ({
  chatApi: { messages: jest.fn(), send: jest.fn(), edit: jest.fn(), remove: jest.fn(), markRead: jest.fn() },
}));

// A stand-in for the shared connection: tests flip its status and emit server events by hand
jest.mock('../lib/chatClient', () => {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const subscribers = new Set<() => void>();
  let state = { slug: 's', selfId: 'u-ana', channels: [], unreadTotal: 0, loaded: true, error: '', online: [], status: 'connected' };
  const chatClient = {
    getState: () => state,
    subscribe: (listener: () => void) => { subscribers.add(listener); return () => { subscribers.delete(listener); }; },
    on: (event: string, handler: (payload: unknown) => void) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
      return () => { set.delete(handler); };
    },
    join: jest.fn(),
    leave: jest.fn(),
    setActive: jest.fn(),
    markRead: jest.fn(),
    noteOwnMessage: jest.fn(),
    emit: (event: string, payload: unknown) => handlers.get(event)?.forEach(handler => handler(payload)),
    setStatus: (status: string) => { state = { ...state, status }; subscribers.forEach(listener => listener()); },
  };
  return { chatClient };
});

const api = chatApi as jest.Mocked<typeof chatApi>;
const client = chatClient as unknown as typeof chatClient & { emit: (event: string, payload: unknown) => void; setStatus: (status: string) => void };

const page = (messages: ChatMessage[], extra: Partial<MessagePage> = {}): MessagePage => ({
  messages,
  hasMore: false,
  cursor: messages.length > 0 ? cursorOf(messages[messages.length - 1]) : '0_000000000000000000000000',
  serverTime: '2026-03-01T12:00:00.000Z',
  ...extra,
});

const open = () => renderHook(() => useChannelMessages('demo', 'c-general', ANA._id));
const texts = (messages: ChatMessage[]) => messages.map(message => message.text);

beforeEach(() => {
  jest.clearAllMocks();
  client.setStatus('connected');
  api.markRead.mockResolvedValue(undefined);
});

describe('loading', () => {
  it('loads the latest page, joins the channel and marks it as the open one', async () => {
    const history = [makeMessage({ text: 'one' }), makeMessage({ text: 'two' })];
    api.messages.mockResolvedValue(page(history, { hasMore: true }));
    const { result, unmount } = open();

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(texts(result.current.messages)).toEqual(['one', 'two']);
    expect(result.current.hasMore).toBe(true);
    expect(api.messages).toHaveBeenCalledWith('demo', 'c-general', { limit: 50 });
    expect(client.join).toHaveBeenCalledWith('c-general');
    expect(client.setActive).toHaveBeenCalledWith('c-general');

    unmount();
    expect(client.leave).toHaveBeenCalledWith('c-general');
    expect(client.setActive).toHaveBeenLastCalledWith(null);
  });

  it('reports a failed load and retries on request', async () => {
    api.messages.mockRejectedValueOnce(new Error('boom'));
    const { result } = open();
    await waitFor(() => expect(result.current.status).toBe('error'));

    api.messages.mockResolvedValue(page([makeMessage({ text: 'back' })]));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(texts(result.current.messages)).toEqual(['back']);
  });

  it('pages back with the oldest message as the cursor', async () => {
    const recent = [makeMessage({ text: 'recent' })];
    api.messages.mockResolvedValueOnce(page(recent, { hasMore: true }));
    const { result } = open();
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const older = [makeMessage({ text: 'older', createdAt: '2026-02-01T10:00:00.000Z' })];
    api.messages.mockResolvedValueOnce(page(older, { hasMore: false }));
    await act(async () => { await result.current.loadOlder(); });
    expect(api.messages).toHaveBeenLastCalledWith('demo', 'c-general', { before: cursorOf(recent[0]), limit: 50 });
    expect(texts(result.current.messages)).toEqual(['older', 'recent']);
    expect(result.current.hasMore).toBe(false);
  });
});

describe('live messages', () => {
  it('shows a socket message once even when it is delivered again', async () => {
    api.messages.mockResolvedValue(page([makeMessage({ text: 'history' })]));
    const { result } = open();
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const live = makeMessage({ text: 'live', author: BEN });
    act(() => { client.emit('chat:message', live); client.emit('chat:message', live); });
    expect(texts(result.current.messages)).toEqual(['history', 'live']);
    expect(result.current.announcement).toContain('Ben Carter: live');

    act(() => client.emit('chat:message_updated', { ...live, text: 'live (edited)', editedAt: '2026-03-01T11:00:00.000Z' }));
    expect(texts(result.current.messages)).toEqual(['history', 'live (edited)']);
    act(() => client.emit('chat:message_deleted', { _id: live._id, channel: 'c-general' }));
    expect(texts(result.current.messages)).toEqual(['history']);
  });

  it('ignores events of other channels', async () => {
    api.messages.mockResolvedValue(page([]));
    const { result } = open();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => client.emit('chat:message', makeMessage({ channel: 'c-other', text: 'elsewhere' })));
    expect(result.current.messages).toEqual([]);
  });

  it('adds your own message from the response and does not duplicate the socket echo', async () => {
    api.messages.mockResolvedValue(page([]));
    const { result } = open();
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const mine = makeMessage({ text: 'sent', author: ANA });
    api.send.mockResolvedValue(mine);
    await act(async () => { await result.current.send('sent'); });
    act(() => client.emit('chat:message', mine));
    expect(texts(result.current.messages)).toEqual(['sent']);
    expect(client.noteOwnMessage).toHaveBeenCalledWith('c-general', mine);
  });
});

describe('polling fallback', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('polls the history every 4 seconds while the socket is down, with the newest cursor and no duplicates', async () => {
    const first = makeMessage({ text: 'first' });
    api.messages.mockResolvedValueOnce(page([first]));
    client.setStatus('offline');
    const { result } = open();
    await act(async () => { await jest.advanceTimersByTimeAsync(0); });
    expect(result.current.status).toBe('ready');

    const second = makeMessage({ text: 'second', author: BEN });
    api.messages.mockResolvedValueOnce(page([second, first]));
    await act(async () => { await jest.advanceTimersByTimeAsync(4000); });
    expect(api.messages).toHaveBeenLastCalledWith('demo', 'c-general', {
      after: cursorOf(first), changedSince: '2026-03-01T12:00:00.000Z', limit: 100,
    });
    expect(texts(result.current.messages)).toEqual(['first', 'second']);

    // The next poll continues from the newest cursor, and edits/deletions come through `changes`
    const edited = { ...first, text: 'first (edited)', editedAt: '2026-03-01T12:05:00.000Z' };
    api.messages.mockResolvedValueOnce(page([], { cursor: cursorOf(second), changes: [edited, { ...second, deleted: true, text: '' }] }));
    await act(async () => { await jest.advanceTimersByTimeAsync(4000); });
    expect(api.messages).toHaveBeenLastCalledWith('demo', 'c-general', expect.objectContaining({ after: cursorOf(second) }));
    expect(texts(result.current.messages)).toEqual(['first (edited)']);
  });

  it('does not poll while the socket is connected, and catches up once when it comes back', async () => {
    api.messages.mockResolvedValueOnce(page([makeMessage({ text: 'first' })]));
    const { result } = open();
    await act(async () => { await jest.advanceTimersByTimeAsync(0); });
    expect(result.current.status).toBe('ready');

    await act(async () => { await jest.advanceTimersByTimeAsync(12000); });
    expect(api.messages).toHaveBeenCalledTimes(1);

    const missed = makeMessage({ text: 'while away', author: BEN });
    api.messages.mockResolvedValueOnce(page([missed]));
    await act(async () => { client.emit('chat:reconnected', undefined); await jest.advanceTimersByTimeAsync(0); });
    expect(texts(result.current.messages)).toEqual(['first', 'while away']);
  });
});
