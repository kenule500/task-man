import { chatApi } from '../api';
import { MAX_RECONNECT_ATTEMPTS, SLOW_RECONNECT_DELAY_MS } from '../lib/socketConfig';

// A reconnect that only followed the network can rely on the events to catch the channel list up, so it
// must not refetch the list and presence again. The fake socket lets a test connect, drop and reconnect.

interface FakeSocket {
  connected: boolean;
  handlers: Record<string, (...args: unknown[]) => void>;
  on: jest.Mock;
  onAny: jest.Mock;
  emit: jest.Mock;
  connect: jest.Mock;
  close: jest.Mock;
  removeAllListeners: jest.Mock;
  /** The manager: the client listens here for `reconnect_failed`. */
  io: { handlers: Record<string, (...args: unknown[]) => void>; on: jest.Mock; emitServer: (event: string) => void };
  emitServer: (event: string, payload?: unknown) => void;
}

const sockets: FakeSocket[] = [];
const io = jest.fn(() => {
  const socket: FakeSocket = {
    connected: false,
    handlers: {},
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      socket.handlers[event] = handler;
      return socket;
    }),
    onAny: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    close: jest.fn(),
    removeAllListeners: jest.fn(),
    io: { handlers: {}, on: jest.fn(), emitServer: () => undefined },
    emitServer: (event, payload) => socket.handlers[event]?.(payload),
  };
  socket.io = {
    handlers: {},
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      socket.io.handlers[event] = handler;
      return socket.io;
    }),
    emitServer: event => socket.io.handlers[event]?.(),
  };
  sockets.push(socket);
  return socket;
});

jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => (io as unknown as (...a: unknown[]) => FakeSocket)(...args) }));
jest.mock('../api', () => ({
  chatApi: {
    channels: jest.fn(),
    online: jest.fn(),
    markRead: jest.fn(),
  },
}));

const channels = chatApi.channels as jest.MockedFunction<typeof chatApi.channels>;
const online = chatApi.online as jest.MockedFunction<typeof chatApi.online>;

// Counted as the request is made, not through the mock's call list: the store reports to its
// subscribers synchronously, and those listeners can clear the mocks before the assertion runs
let channelReads = 0;
let presenceReads = 0;

// Lets the pending promises settle; the test owns the timers, so a timeout cannot be used here
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

// The client is a module-level singleton, so each test loads its own copy and the previous one is stopped
let client: typeof import('../lib/chatClient').chatClient;

beforeEach(async () => {
  await jest.isolateModulesAsync(async () => {
    client = (await import('../lib/chatClient')).chatClient;
  });
  sockets.length = 0;
  io.mockClear();
  channelReads = 0;
  presenceReads = 0;
  channels.mockReset().mockImplementation(async () => {
    channelReads += 1;
    return { channels: [], unreadTotal: 0 };
  });
  online.mockReset().mockImplementation(async () => {
    presenceReads += 1;
    return [];
  });
});

describe('chatClient connection', () => {
  // Closing the socket keeps the singleton from carrying a connection or a poll timer into the next test
  afterEach(() => {
    client.stop();
  });

  it('dials once with a bounded number of reconnects', () => {
    client.start('demo', 'u-ana');

    expect(io).toHaveBeenCalledTimes(1);
    const options = (io.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(options).toMatchObject({ path: '/api/socket', transports: ['websocket'], reconnectionAttempts: MAX_RECONNECT_ATTEMPTS });
  });

  it('does not read the lists again on the first successful connection', async () => {
    client.start('demo', 'u-ana');
    await flush();
    // start() reads both lists itself
    expect(channelReads).toBe(1);
    expect(presenceReads).toBe(1);

    // A dial that failed before it ever connected is still the first connection: nothing was missed,
    // so the lists that start() already read stay as they are
    const socket = sockets[0];
    socket.emitServer('connect_error');
    expect(client.getState().status).toBe('offline');
    await flush();
    socket.connected = true;
    socket.emitServer('connect');
    await flush();
    expect(client.getState()).toMatchObject({ status: 'connected', loaded: true });
    expect(channelReads).toBe(1);
    expect(presenceReads).toBe(1);
  });

  it('catches up once on a reconnect after a drop', async () => {
    client.start('demo', 'u-ana');
    await flush();
    const socket = sockets[0];
    socket.connected = true;
    socket.emitServer('connect');
    await flush();
    expect(channelReads).toBe(1);

    // A drop switches to the fallback polling, and coming back catches up once: the events that
    // happened while away are not sent again
    socket.connected = false;
    socket.emitServer('disconnect');
    expect(client.getState().status).toBe('offline');
    socket.connected = true;
    socket.emitServer('connect');
    await flush();
    expect(client.getState()).toMatchObject({ status: 'connected', loaded: true });
    expect(channelReads).toBe(2);
    expect(presenceReads).toBe(2);
  });

  it('tries again after the fast reconnect attempts are spent, instead of polling forever', async () => {
    // Singleton, not the fake: the client reaches its manager through `socket.io`
    jest.useFakeTimers();
    try {
      client.start('demo', 'u-ana');
      await flush();
      const socket = sockets[0] as FakeSocket & { io: { handlers: Record<string, (...a: unknown[]) => void>; emitServer: (event: string) => void } };
      socket.connected = false;
      socket.emitServer('disconnect');
      expect(client.getState().status).toBe('offline');

      // Without this the client dialled no more and the REST fallback (channels + presence every
      // 20 s) ran for the rest of the tab's life -- the repeated rows in the network log
      socket.io.emitServer('reconnect_failed');
      await jest.advanceTimersByTimeAsync(SLOW_RECONNECT_DELAY_MS);

      expect(socket.connect).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not dial again once the connection is back', async () => {
    jest.useFakeTimers();
    try {
      client.start('demo', 'u-ana');
      await flush();
      const socket = sockets[0] as FakeSocket & { io: { handlers: Record<string, (...a: unknown[]) => void>; emitServer: (event: string) => void } };
      socket.io.emitServer('reconnect_failed');
      // The dial succeeded before the slow retry came due
      socket.connected = true;
      socket.emitServer('connect');

      await jest.advanceTimersByTimeAsync(SLOW_RECONNECT_DELAY_MS);
      expect(socket.connect).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
