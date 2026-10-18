import { render, screen } from '@testing-library/react';
import PinnedPanel from '../components/Panels';
import type { ChatMessage } from '../types';

const message = (id: string, body: string, author = 'Ada'): ChatMessage => ({
  _id: id,
  channel: 'c1',
  author: { _id: 'u1', name: author },
  body,
  mentions: [],
  attachments: [],
  replyCount: 0,
  createdAt: '2026-10-02T10:00:00.000Z',
});

describe('PinnedPanel', () => {
  it('AC-025: lists the pinned messages with their author and body', () => {
    render(<PinnedPanel pinned={[message('m1', 'Deploy on Friday'), message('m2', 'Retro notes', 'Grace')]} loading={false} onClose={jest.fn()} />);

    expect(screen.getByRole('heading', { name: 'Pinned' })).toBeInTheDocument();
    expect(screen.getByText('Deploy on Friday')).toBeInTheDocument();
    expect(screen.getByText('Grace')).toBeInTheDocument();
  });

  it('AC-025: says so when nothing is pinned and while loading', () => {
    const { unmount } = render(<PinnedPanel pinned={[]} loading={false} onClose={jest.fn()} />);
    expect(screen.getByText('Nothing is pinned in this channel.')).toBeInTheDocument();
    unmount();

    render(<PinnedPanel pinned={[]} loading onClose={jest.fn()} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('Nothing is pinned in this channel.')).not.toBeInTheDocument();
  });
});
