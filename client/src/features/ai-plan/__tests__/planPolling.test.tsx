import { act, renderHook } from '@testing-library/react';
import { aiPlanApi } from '../api';
import { useAiProjectPlan } from '../hooks/useAiProjectPlan';
import type { PlanUploadOptions } from '../types';
import { makeAiPlan } from './fixtures';

// A background tab must stop asking the server for a plan's progress. The hook polls with setTimeout
// while the shared socket is down, so these tests own the clock and flip visibility by hand.

jest.mock('../api', () => ({
  aiPlanApi: {
    upload: jest.fn(),
    create: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    createProject: jest.fn(),
    remove: jest.fn(),
  },
}));

// No live channel, so the hook takes its polling path
jest.mock('../lib/planSocket', () => ({
  subscribePlanUpdates: () => ({ connected: false, unsubscribe: () => undefined }),
}));

const get = aiPlanApi.get as jest.MockedFunction<typeof aiPlanApi.get>;
const upload = aiPlanApi.upload as jest.MockedFunction<typeof aiPlanApi.upload>;

const options: PlanUploadOptions = {
  projectName: '',
  projectKey: '',
  sprintLengthWeeks: 2,
  startDate: '',
  teamSize: '',
  extraInstructions: '',
  language: 'en',
};
const file = new File([new Uint8Array(8)], 'bookshop.pdf', { type: 'application/pdf' });

let visibility: DocumentVisibilityState = 'visible';

const setVisibility = (next: DocumentVisibilityState) => {
  visibility = next;
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
};

// A running plan is never settled, so the only thing that can stop the poll is the tab being hidden
const running = () => makeAiPlan({ status: 'running' });

describe('useAiProjectPlan polling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    get.mockReset();
    get.mockResolvedValue(running());
    upload.mockReset();
    upload.mockResolvedValue(makeAiPlan({ status: 'queued' }));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    visibility = 'visible';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // The wait only exists once a plan has been started, so every test uploads first
  const start = async () => {
    const rendered = renderHook(() => useAiProjectPlan('demo', { pollMs: 2000, maxWaitMs: 8 * 60_000 }));
    await act(async () => {
      await rendered.result.current.start(file, options);
    });
    return rendered;
  };

  it('gives up once the visible wait passes the budget', async () => {
    // The mirror of the hidden test: a tab in view for the whole wait does run out of time
    const { result } = await start();
    await act(async () => {
      jest.advanceTimersByTime(9 * 60_000);
    });

    expect(result.current.timedOut).toBe(true);
  });

  it('polls a running plan while the tab is visible', async () => {
    await start();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(get).toHaveBeenCalledTimes(2);
  });

  it('stops asking while the tab is hidden and resumes when it is shown', async () => {
    await start();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(get).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(get).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('does not count hidden time as a failure or against the wait budget', async () => {
    const { result } = await start();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(get).toHaveBeenCalledTimes(1);

    // Hide midway to the next read, so the last stretch before returning is never counted
    setVisibility('hidden');
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(get).toHaveBeenCalledTimes(1);

    // Longer than maxWaitMs: a wait that counted it would end the poll for good
    await act(async () => {
      jest.advanceTimersByTime(9 * 60_000);
    });
    expect(get).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    // The wait carries on through the read and the next tick, although the wall clock passed the budget
    expect(result.current.timedOut).toBe(false);
    expect(get).toHaveBeenCalledTimes(2);
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(get).toHaveBeenCalledTimes(3);
    expect(result.current.timedOut).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
