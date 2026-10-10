import { createPoller, IDLE_AFTER_MS, MAX_BACKOFF_MS, POLL_INTERVAL_MS } from '../lib/poller';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

/** Advances the clock and lets the promise chain of the poll settle. */
const advance = async (ms: number) => {
  await jest.advanceTimersByTimeAsync(ms);
  await flush();
};

/** Waits in 10 s steps with the user interacting, so the idle pause does not interfere. */
const stayActive = async (ms: number, poller: { activity: () => void }) => {
  let left = ms;
  while (left > 0) {
    const step = Math.min(left, 10_000);
    await advance(step);
    poller.activity();
    left -= step;
  }
};

const setup = (poll: jest.Mock = jest.fn().mockResolvedValue(undefined)) => {
  const states: string[] = [];
  const poller = createPoller({
    poll,
    onState: state => states.push(state),
    now: () => Date.now(),
  });
  return { poll, poller, states };
};

describe('createPoller', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T10:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('polls at once, then every 10 seconds', async () => {
    const { poll, poller, states } = setup();
    poller.start();
    await flush();
    expect(poll).toHaveBeenCalledTimes(1);
    expect(states).toEqual(['live']);

    await advance(POLL_INTERVAL_MS - 1);
    expect(poll).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(poll).toHaveBeenCalledTimes(2);
    await advance(POLL_INTERVAL_MS);
    expect(poll).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it('does not stack polls: a slow answer delays the next one', async () => {
    let finish: () => void = () => undefined;
    const poll = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const { poller } = setup(poll);
    poller.start();
    await advance(POLL_INTERVAL_MS * 3);
    expect(poll).toHaveBeenCalledTimes(1);
    finish();
    await flush();
    await advance(POLL_INTERVAL_MS);
    expect(poll).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('backs off exponentially after errors, caps the delay and recovers on success', async () => {
    const poll = jest.fn().mockRejectedValue(new Error('offline'));
    const { poller, states } = setup(poll);
    poller.start();
    await flush();
    expect(states).toEqual(['reconnecting']);

    // 1 failure -> 20 s, 2 -> 40 s, 3 -> 80 s, then capped at 120 s
    for (const wait of [20_000, 40_000, 80_000, MAX_BACKOFF_MS, MAX_BACKOFF_MS]) {
      const before = poll.mock.calls.length;
      await stayActive(wait - 1, poller);
      expect(poll).toHaveBeenCalledTimes(before);
      await advance(1);
      expect(poll).toHaveBeenCalledTimes(before + 1);
    }

    poll.mockResolvedValue(undefined);
    await stayActive(MAX_BACKOFF_MS, poller);
    expect(states.at(-1)).toBe('live');
    const calls = poll.mock.calls.length;
    await advance(POLL_INTERVAL_MS);
    expect(poll).toHaveBeenCalledTimes(calls + 1);
    poller.stop();
  });

  it('pauses after two idle minutes and resumes at once on interaction', async () => {
    const { poll, poller, states } = setup();
    poller.start();
    await flush();
    await advance(IDLE_AFTER_MS + POLL_INTERVAL_MS);
    const calls = poll.mock.calls.length;
    expect(states.at(-1)).toBe('paused');

    await advance(IDLE_AFTER_MS);
    expect(poll).toHaveBeenCalledTimes(calls);

    poller.activity();
    await flush();
    expect(poll).toHaveBeenCalledTimes(calls + 1);
    expect(states.at(-1)).toBe('live');
    poller.stop();
  });

  it('keeps polling while the user keeps interacting', async () => {
    const { poll, poller } = setup();
    poller.start();
    for (let i = 0; i < 20; i += 1) {
      await advance(POLL_INTERVAL_MS);
      poller.activity();
    }
    expect(poll).toHaveBeenCalledTimes(21);
    poller.stop();
  });

  it('stops polling while the tab is hidden and polls immediately when it is visible again', async () => {
    const { poll, poller, states } = setup();
    poller.start();
    await flush();
    poller.setVisible(false);
    expect(states.at(-1)).toBe('paused');
    await advance(POLL_INTERVAL_MS * 5);
    expect(poll).toHaveBeenCalledTimes(1);

    poller.setVisible(true);
    await flush();
    expect(poll).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('polls at once on focus or reconnect and forgets the backoff', async () => {
    const poll = jest.fn().mockRejectedValue(new Error('offline'));
    const { poller } = setup(poll);
    poller.start();
    await flush();
    await advance(20_000);
    expect(poll).toHaveBeenCalledTimes(2);

    poll.mockResolvedValue(undefined);
    poller.pollNow();
    await flush();
    expect(poll).toHaveBeenCalledTimes(3);
    // Back to the normal rhythm
    await advance(POLL_INTERVAL_MS);
    expect(poll).toHaveBeenCalledTimes(4);
    poller.stop();
  });

  it('ignores focus while hidden and does nothing after stop', async () => {
    const { poll, poller, states } = setup();
    poller.start();
    await flush();
    poller.setVisible(false);
    poller.pollNow();
    await flush();
    expect(poll).toHaveBeenCalledTimes(1);

    poller.stop();
    expect(states.at(-1)).toBe('off');
    poller.setVisible(true);
    poller.pollNow();
    await advance(POLL_INTERVAL_MS * 3);
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('drops the result of a poll that finishes after stop', async () => {
    let finish: () => void = () => undefined;
    const poll = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const { poller, states } = setup(poll);
    poller.start();
    poller.stop();
    finish();
    await flush();
    await advance(POLL_INTERVAL_MS * 2);
    expect(states).toEqual([]);
    expect(poll).toHaveBeenCalledTimes(1);
  });
});
