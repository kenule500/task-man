import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ChannelList from '../components/ChannelList';
import MessageItem from '../components/MessageItem';
import TypingIndicator from '../components/TypingIndicator';
import type { ChatChannel } from '../types';
import { ANA, BEN, makeChannel, makeMessage } from './fixtures';

const design = makeChannel({ _id: 'c-design', name: 'design', slug: 'design', isDefault: false, unread: 3 });
const secret = makeChannel({ _id: 'c-secret', name: 'secret', slug: 'secret', isDefault: false, private: true });
const project = makeChannel({ _id: 'c-web', name: 'Website', slug: 'project-website', type: 'project', project: 'Website', isDefault: false });
const dm = makeChannel({ _id: 'c-dm', name: 'Direct message', type: 'dm', private: true, isDefault: false, members: [ANA, BEN], unread: 120 });

const renderList = (channels: ChatChannel[], overrides: Partial<React.ComponentProps<typeof ChannelList>> = {}) =>
  render(
    <MemoryRouter>
      <ChannelList
        channels={channels}
        loaded
        error=""
        onRetry={jest.fn()}
        selfId={ANA._id}
        activeId="c-design"
        online={[BEN._id]}
        labelOf={channel => (channel.type === 'dm' ? BEN.name : channel.isDefault ? 'general' : channel.name)}
        hrefFor={channel => `/demo/chat/${channel._id}`}
        canCreate
        onNewChannel={jest.fn()}
        onNewDm={jest.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );

describe('ChannelList', () => {
  it('groups channels into Channels, Projects and Direct messages with unread counts and presence', () => {
    renderList([makeChannel(), design, secret, project, dm]);
    const nav = screen.getByRole('navigation', { name: 'Conversations' });
    expect(within(nav).getByRole('heading', { name: 'Channels' })).toBeInTheDocument();
    expect(within(nav).getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(within(nav).getByRole('heading', { name: 'Direct messages' })).toBeInTheDocument();

    const designLink = screen.getByRole('link', { name: /design/ });
    expect(designLink).toHaveAttribute('aria-current', 'page');
    expect(designLink).toHaveAttribute('href', '/demo/chat/c-design');
    expect(within(designLink).getByText('3 unread')).toBeInTheDocument();

    const dmLink = screen.getByRole('link', { name: /Ben Carter/ });
    expect(within(dmLink).getByText('99+')).toBeInTheDocument();
    expect(within(dmLink).getByText('Online')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /secret/ })).toHaveTextContent('Private');
  });

  it('offers new channel and new message actions, hiding channel creation without permission', async () => {
    const onNewChannel = jest.fn();
    const onNewDm = jest.fn();
    const user = userEvent.setup();
    const { unmount } = renderList([makeChannel()], { onNewChannel, onNewDm });
    await user.click(screen.getByRole('button', { name: 'New channel' }));
    await user.click(screen.getByRole('button', { name: 'New message' }));
    expect(onNewChannel).toHaveBeenCalledTimes(1);
    expect(onNewDm).toHaveBeenCalledTimes(1);
    unmount();

    renderList([makeChannel()], { canCreate: false });
    expect(screen.queryByRole('button', { name: 'New channel' })).toBeNull();
  });

  it('shows an error with a retry when the list cannot load, and a skeleton while loading', async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    const { unmount } = renderList([], { error: 'Network down', onRetry });
    expect(screen.getByRole('alert')).toHaveTextContent('We could not load your conversations');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
    unmount();

    renderList([], { loaded: false });
    expect(screen.getByRole('status', { name: 'Loading conversations' })).toBeInTheDocument();
  });
});

describe('MessageItem', () => {
  const members = [ANA, BEN];
  const renderItem = (own: boolean, text = 'plain text') => {
    const message = makeMessage({ text, author: own ? ANA : BEN, editedAt: own ? '2026-03-01T11:00:00.000Z' : null });
    const onEdit = jest.fn().mockResolvedValue(undefined);
    const onRemove = jest.fn().mockResolvedValue(undefined);
    const view = render(<ul><MessageItem message={message} members={members} own={own} showHeader onEdit={onEdit} onRemove={onRemove} /></ul>);
    return { message, onEdit, onRemove, user: userEvent.setup(), unmount: view.unmount };
  };

  it('renders message text as text, never as HTML, and highlights mentions', () => {
    const { message } = renderItem(false, '<img src=x onerror=alert(1)> hi @Ana Lopez');
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
    expect(screen.getByText('@Ana Lopez')).toHaveClass('text-info-fg');
    expect(screen.getByText(message.author.name)).toBeInTheDocument();
  });

  it('offers edit and delete only on your own messages, and marks edits', () => {
    const { unmount } = renderItem(true);
    expect(screen.getByRole('button', { name: /Edit message from/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete message from/ })).toBeInTheDocument();
    expect(screen.getByText('(edited)')).toBeInTheDocument();
    unmount();

    renderItem(false);
    expect(screen.queryByRole('button', { name: /Edit message from/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete message from/ })).toBeNull();
    expect(screen.queryByText('(edited)')).toBeNull();
  });

  it('edits inline with Enter and cancels with Escape', async () => {
    const { message, onEdit, user } = renderItem(true, 'before');
    await user.click(screen.getByRole('button', { name: /Edit message from/ }));
    const box = screen.getByRole('textbox', { name: 'Edit your message' });
    await user.clear(box);
    await user.type(box, 'after{Enter}');
    expect(onEdit).toHaveBeenCalledWith(message._id, 'after');

    await user.click(screen.getByRole('button', { name: /Edit message from/ }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('asks before deleting', async () => {
    const { message, onRemove, user } = renderItem(true);
    await user.click(screen.getByRole('button', { name: /Delete message from/ }));
    expect(onRemove).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(onRemove).toHaveBeenCalledWith(message._id);
  });
});

describe('TypingIndicator', () => {
  it('names one or two people and summarises a crowd', () => {
    const { rerender } = render(<TypingIndicator names={['Ben']} />);
    expect(screen.getByText('Ben is typing...')).toBeInTheDocument();
    rerender(<TypingIndicator names={['Ben', 'Sam']} />);
    expect(screen.getByText('Ben and Sam are typing...')).toBeInTheDocument();
    rerender(<TypingIndicator names={['Ben', 'Sam', 'Zed']} />);
    expect(screen.getByText('Several people are typing...')).toBeInTheDocument();
    rerender(<TypingIndicator names={[]} />);
    expect(screen.queryByText(/typing/)).toBeNull();
  });
});
