import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskDetailDialog, { type TaskDetailActions } from '../components/TaskDetailDialog';
import { MAX_ATTACHMENT_BYTES } from '../lib/files';
import type { Task } from '../types';
import { makeTask } from './fixtures';

// Dialogs and portals are slow on constrained machines.
jest.setTimeout(30000);

const ada = { _id: 'u1', name: 'Ada Lovelace' };
const grace = { _id: 'u2', name: 'Grace Hopper' };

const buildTask = (overrides: Partial<Task> = {}): Task =>
  makeTask({
    _id: 'task-detail',
    title: 'Ship the release',
    description: 'Cut the tag and publish.',
    labels: ['release', 'backend'],
    assignees: [ada],
    dependencies: ['dep-1'],
    comments: [
      { _id: 'c-ada', author: ada, text: 'I will start today', createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() },
      { _id: 'c-grace', author: grace, text: 'Needs a changelog', createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString() },
    ],
    attachments: [
      { _id: 'f-pdf', originalName: 'plan.pdf', mimetype: 'application/pdf', size: 2048, uploadedBy: grace, uploadedAt: new Date().toISOString() },
      { _id: 'f-img', originalName: 'mock.png', mimetype: 'image/png', size: 1536 * 1024, uploadedBy: 'u1', uploadedAt: new Date().toISOString() },
    ],
    ...overrides,
  });

const dependency = makeTask({ _id: 'dep-1', title: 'Write the changelog' });

const buildActions = (): jest.Mocked<TaskDetailActions> => ({
  addComment: jest.fn().mockResolvedValue(undefined),
  removeComment: jest.fn().mockResolvedValue(undefined),
  uploadAttachment: jest.fn().mockResolvedValue(undefined),
  removeAttachment: jest.fn().mockResolvedValue(undefined),
  downloadAttachment: jest.fn().mockResolvedValue(new Blob(['data'])),
});

interface RenderOptions {
  task?: Task;
  canWrite?: boolean;
  canDelete?: boolean;
  actions?: jest.Mocked<TaskDetailActions>;
}

const renderDialog = ({ task = buildTask(), canWrite = true, canDelete = true, actions = buildActions() }: RenderOptions = {}) => {
  const handlers = { onOpenChange: jest.fn(), onEdit: jest.fn(), onDelete: jest.fn() };
  const view = render(
    <TaskDetailDialog
      task={task}
      tasks={[task, dependency]}
      currentUser={ada}
      canWrite={canWrite}
      canDelete={canDelete}
      actions={actions}
      {...handlers}
    />,
  );
  return { ...view, ...handlers, actions, task };
};

describe('TaskDetailDialog', () => {
  const createObjectURL = jest.fn(() => 'blob:preview');
  const revokeObjectURL = jest.fn();
  let click: jest.SpyInstance;

  beforeEach(() => {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    click.mockRestore();
  });

  it('shows the task details, labels, assignees and dependencies', () => {
    renderDialog();
    const dialog = within(screen.getByRole('dialog'));

    expect(dialog.getByRole('heading', { name: 'Ship the release' })).toBeInTheDocument();
    expect(dialog.getByText('Cut the tag and publish.')).toBeInTheDocument();
    expect(dialog.getByText('release')).toBeInTheDocument();
    expect(dialog.getByText('backend')).toBeInTheDocument();
    expect(dialog.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
    // Named under "Depends on" and again in "Linked work > Is blocked by"
    expect(dialog.getAllByText('Write the changelog')).toHaveLength(2);
  });

  describe('attachments', () => {
    it('lists files with their size and uploader', () => {
      renderDialog();
      const section = within(screen.getByRole('region', { name: 'Attachments' }));

      expect(section.getByText('plan.pdf')).toBeInTheDocument();
      expect(section.getByText(/2 KB/)).toHaveTextContent('Grace Hopper');
      expect(section.getByText(/1\.5 MB/)).toHaveTextContent('Ada Lovelace');
    });

    it('previews images through an authenticated blob and revokes the URL on unmount', async () => {
      const { unmount, actions } = renderDialog();

      expect(await screen.findByRole('img', { name: 'Preview of mock.png' })).toHaveAttribute('src', 'blob:preview');
      expect(actions.downloadAttachment).toHaveBeenCalledWith('task-detail', 'f-img');

      unmount();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    });

    it('downloads a file as a blob', async () => {
      const { actions } = renderDialog();
      await userEvent.click(screen.getByRole('button', { name: 'Download plan.pdf' }));

      await waitFor(() => expect(click).toHaveBeenCalled());
      expect(actions.downloadAttachment).toHaveBeenCalledWith('task-detail', 'f-pdf');
    });

    it('uploads chosen files and rejects the ones over the limit', async () => {
      const { actions } = renderDialog();
      const input = screen.getByLabelText('Choose files to upload');

      const small = new File(['hello'], 'notes.txt', { type: 'text/plain' });
      await userEvent.upload(input, small);
      await waitFor(() => expect(actions.uploadAttachment).toHaveBeenCalledTimes(1));
      expect(actions.uploadAttachment).toHaveBeenCalledWith('task-detail', small, expect.objectContaining({ onProgress: expect.any(Function) }));

      const huge = new File(['x'], 'huge.zip', { type: 'application/zip' });
      Object.defineProperty(huge, 'size', { value: MAX_ATTACHMENT_BYTES + 1 });
      await userEvent.upload(input, huge);
      expect(actions.uploadAttachment).toHaveBeenCalledTimes(1);
    });

    it('accepts files dropped on the drop zone', async () => {
      const { actions } = renderDialog();
      const dropped = new File(['a,b'], 'data.csv', { type: 'text/csv' });
      const zone = screen.getByTestId('attachment-dropzone');

      const drop = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', { value: { files: [dropped] } });
      zone.dispatchEvent(drop);

      await waitFor(() => expect(actions.uploadAttachment).toHaveBeenCalledWith('task-detail', dropped, expect.anything()));
    });

    it('deletes an attachment', async () => {
      const { actions } = renderDialog();
      await userEvent.click(screen.getByRole('button', { name: 'Delete plan.pdf' }));
      await waitFor(() => expect(actions.removeAttachment).toHaveBeenCalledWith('task-detail', 'f-pdf'));
    });
  });

  describe('comments', () => {
    it('shows author, relative time and text', () => {
      renderDialog();
      const section = within(screen.getByRole('region', { name: 'Comments' }));

      expect(section.getByText('I will start today')).toBeInTheDocument();
      expect(section.getByText('5 minutes ago')).toBeInTheDocument();
      expect(section.getByText('3 hours ago')).toBeInTheDocument();
    });

    it('adds a comment with the button and clears the field', async () => {
      const { actions } = renderDialog();
      const box = screen.getByRole('textbox', { name: 'Add a comment' });
      const submit = screen.getByRole('button', { name: /^Comment$/ });
      expect(submit).toBeDisabled();

      await userEvent.type(box, '  Looks good  ');
      await userEvent.click(submit);

      await waitFor(() => expect(actions.addComment).toHaveBeenCalledWith('task-detail', 'Looks good'));
      await waitFor(() => expect(box).toHaveValue(''));
    });

    it('sends with Ctrl+Enter and keeps Enter for new lines', async () => {
      const { actions } = renderDialog();
      const box = screen.getByRole('textbox', { name: 'Add a comment' });

      await userEvent.type(box, 'line one{Enter}line two');
      expect(actions.addComment).not.toHaveBeenCalled();

      await userEvent.keyboard('{Control>}{Enter}{/Control}');
      await waitFor(() => expect(actions.addComment).toHaveBeenCalledWith('task-detail', 'line one\nline two'));
    });

    it('keeps the text when posting fails', async () => {
      const actions = buildActions();
      actions.addComment.mockRejectedValue({ response: { data: { message: 'Too many comments' } } });
      renderDialog({ actions });
      const box = screen.getByRole('textbox', { name: 'Add a comment' });

      await userEvent.type(box, 'Hello');
      await userEvent.keyboard('{Control>}{Enter}{/Control}');
      await waitFor(() => expect(actions.addComment).toHaveBeenCalled());
      expect(box).toHaveValue('Hello');
    });

    it('lets you delete only your own comments', async () => {
      const { actions } = renderDialog();
      const section = within(screen.getByRole('region', { name: 'Comments' }));

      const buttons = section.getAllByRole('button', { name: 'Delete comment' });
      expect(buttons).toHaveLength(1);
      expect(within(buttons[0].closest('li') as HTMLElement).getByText('I will start today')).toBeInTheDocument();

      await userEvent.click(buttons[0]);
      await waitFor(() => expect(actions.removeComment).toHaveBeenCalledWith('task-detail', 'c-ada'));
    });
  });

  describe('permissions', () => {
    it('hides every write control without tasks:write', () => {
      renderDialog({ canWrite: false, canDelete: false });

      expect(screen.queryByRole('textbox', { name: 'Add a comment' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete comment' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Choose files to upload')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Delete plan\.pdf$/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Edit$/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /delete task/i })).not.toBeInTheDocument();

      // Reading and downloading stay available
      expect(screen.getByText('Needs a changelog')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Download plan.pdf' })).toBeInTheDocument();
    });

    it('shows Delete task only with tasks:delete and Edit only with tasks:write', async () => {
      const writer = renderDialog({ canWrite: true, canDelete: false });
      expect(screen.getByRole('button', { name: /^Edit$/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /delete task/i })).not.toBeInTheDocument();
      writer.unmount();

      const admin = renderDialog({ canWrite: true, canDelete: true });
      await userEvent.click(screen.getByRole('button', { name: /delete task/i }));
      expect(admin.onDelete).toHaveBeenCalledWith(admin.task);
      await userEvent.click(screen.getByRole('button', { name: /^Edit$/ }));
      expect(admin.onEdit).toHaveBeenCalledWith(admin.task);
    });
  });

  it('renders nothing without a task', () => {
    const { container } = render(
      <TaskDetailDialog
        task={null}
        tasks={[]}
        canWrite
        canDelete
        actions={buildActions()}
        onOpenChange={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
