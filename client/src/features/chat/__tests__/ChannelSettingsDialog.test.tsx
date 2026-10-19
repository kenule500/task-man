import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from '@/components/ds';
import { chatApi } from '../api';
import ChannelSettingsDialog from '../components/ChannelSettingsDialog';
import type { ConversationCard } from '../types';

jest.mock('../api', () => ({
  __esModule: true,
  chatApi: { renameChannel: jest.fn(), uploadAvatar: jest.fn() },
}));
jest.mock('@/components/ds', () => ({
  __esModule: true,
  toast: { error: jest.fn(), success: jest.fn() },
}));

const renameChannel = chatApi.renameChannel as unknown as jest.Mock;
const uploadAvatar = chatApi.uploadAvatar as unknown as jest.Mock;

const team: ConversationCard = {
  _id: 'team-1',
  name: 'Alpha Project',
  project: 'project-1',
  avatarUrl: '/chat/team-1/avatar',
  archived: false,
  lastMessage: null,
  unread: false,
  unreadCount: 0,
};

const renderDialog = () => {
  const onClose = jest.fn();
  const onSaved = jest.fn();
  const view = render(
    <ChannelSettingsDialog slug="acme" team={team} onClose={onClose} onSaved={onSaved} />,
  );
  return { ...view, onClose, onSaved };
};

beforeEach(() => {
  renameChannel.mockReset();
  uploadAvatar.mockReset();
});

describe('ChannelSettingsDialog', () => {
  it('AC-044: renaming saves through the API and updates the list in place', async () => {
    renameChannel.mockResolvedValue({ _id: 'team-1', name: 'Renamed', avatarUrl: null });
    const { onClose, onSaved } = renderDialog();

    const input = screen.getByLabelText('Channel name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({
      _id: 'team-1', name: 'Renamed', avatarUrl: null,
    }));
    expect(renameChannel).toHaveBeenCalledWith('acme', 'team-1', 'Renamed');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalled();
  });

  it('AC-044: changing the photo uploads it and shows the new avatar', async () => {
    uploadAvatar.mockResolvedValue({ _id: 'team-1', name: 'Alpha Project', avatarUrl: '/chat/team-1/avatar?v=2' });
    const { container, onSaved } = renderDialog();
    const file = new File(['image'], 'avatar.png', { type: 'image/png' });

    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      avatarUrl: '/chat/team-1/avatar?v=2',
    })));
    expect(uploadAvatar).toHaveBeenCalledWith('acme', 'team-1', file);
    await waitFor(() => {
      expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining('/chat/team-1/avatar?v=2'));
    });
  });

  it('AC-045: a refused rename changes nothing and keeps the dialog open', async () => {
    renameChannel.mockRejectedValue(new Error('Forbidden'));
    const { onClose, onSaved } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('AC-047: a rejected upload leaves the previous avatar intact', async () => {
    uploadAvatar.mockRejectedValue(new Error('Unsupported image'));
    const { container, onSaved } = renderDialog();

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['x'], 'x.gif', { type: 'image/gif' })] },
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
    // The previous picture is still what the dialog shows
    expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining('/chat/team-1/avatar'));
  });
});
