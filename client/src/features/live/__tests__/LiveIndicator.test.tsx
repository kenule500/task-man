import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LiveIndicator from '../components/LiveIndicator';
import NewChangesPill from '../components/NewChangesPill';
import { formatAgo } from '../lib/describe';
import { holdLive, isLiveHeld, publishBatch, resetLiveStore, setLiveState, subscribeApply } from '../lib/liveStore';

afterEach(() => {
  jest.useRealTimers();
  resetLiveStore();
});

describe('LiveIndicator', () => {
  it('renders nothing until polling has started', () => {
    const { container } = render(<LiveIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says it is up to date and how long ago, and keeps the time moving', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T10:00:05Z'));
    render(<LiveIndicator />);
    act(() => setLiveState('live', new Date('2026-01-01T10:00:00Z').getTime()));
    expect(screen.getByLabelText('Up to date · updated 5 s ago')).toHaveAttribute('data-state', 'live');

    act(() => { jest.advanceTimersByTime(10_000); });
    expect(screen.getByLabelText('Up to date · updated 15 s ago')).toBeInTheDocument();
  });

  it('says Reconnecting… after an error and Paused when the tab is hidden or idle', () => {
    render(<LiveIndicator />);
    act(() => setLiveState('reconnecting', null));
    expect(screen.getByLabelText('Reconnecting…')).toHaveAttribute('data-state', 'reconnecting');
    act(() => setLiveState('paused', 1));
    expect(screen.getByLabelText(/^Paused/)).toHaveAttribute('data-state', 'paused');
    act(() => setLiveState('off', null));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('formatAgo', () => {
  it('uses seconds, minutes and hours', () => {
    expect(formatAgo(0)).toBe('0 s ago');
    expect(formatAgo(5400)).toBe('5 s ago');
    expect(formatAgo(125_000)).toBe('2 min ago');
    expect(formatAgo(2 * 3_600_000)).toBe('2 h ago');
    expect(formatAgo(-5)).toBe('0 s ago');
  });
});

describe('NewChangesPill', () => {
  const dana = { _id: 'u2', name: 'Dana' };
  const change = (id: string) => ({ id, action: 'task.updated', task: 't1', actor: dana, summary: 'x', fields: [], at: '' });

  it('appears only while a refresh is held and applies the changes when pressed', async () => {
    const applied: unknown[] = [];
    const stop = subscribeApply(batch => applied.push(batch));
    render(<NewChangesPill />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    const release = holdLive();
    act(() => publishBatch({ slug: 'demo', changes: [change('1')], reset: false }));
    expect(screen.getByRole('button', { name: /1 new change/ })).toBeInTheDocument();
    act(() => publishBatch({ slug: 'demo', changes: [change('2')], reset: false }));
    const pill = screen.getByRole('button', { name: /2 new changes/ });

    await userEvent.click(pill);
    expect(applied).toHaveLength(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    release();
    expect(isLiveHeld()).toBe(false);
    expect(applied).toHaveLength(1);
    stop();
  });
});
