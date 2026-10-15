import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DevCopyMenu from '../components/DevCopyMenu';
import { makeTask } from './fixtures';

jest.setTimeout(30000);

const setClipboard = (writeText: jest.Mock) =>
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

describe('DevCopyMenu', () => {
  afterEach(() => Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }));

  const task = makeTask({ _id: 'abc123', title: 'Add dark mode', type: 'bug', number: 12 });

  it('copies the branch name with the fix/ prefix for a bug', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<DevCopyMenu task={task} workspaceSlug="acme" />);

    await userEvent.click(screen.getByRole('button', { name: 'Developer shortcuts' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Copy branch name' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('fix/TM-12-add-dark-mode'));
  });

  it('copies the commit message', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<DevCopyMenu task={task} workspaceSlug="acme" />);

    await userEvent.click(screen.getByRole('button', { name: 'Developer shortcuts' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Copy commit message' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('TM-12: Add dark mode'));
  });

  it('copies a markdown link to the task', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<DevCopyMenu task={task} workspaceSlug="acme" />);

    await userEvent.click(screen.getByRole('button', { name: 'Developer shortcuts' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Copy markdown link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      `[TM-12 Add dark mode](${window.location.origin}/acme/tasks?task=abc123)`,
    ));
  });

  it('hides the markdown link without a workspace slug', async () => {
    render(<DevCopyMenu task={task} />);
    await userEvent.click(screen.getByRole('button', { name: 'Developer shortcuts' }));
    expect(await screen.findByRole('menuitem', { name: 'Copy branch name' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Copy markdown link' })).not.toBeInTheDocument();
  });
});
