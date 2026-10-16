import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskDetailDialog, { type TaskDetailActions } from '@/features/tasks/components/TaskDetailDialog';
import { makeTask } from '@/features/tasks/__tests__/fixtures';
import type { Task } from '@/features/tasks/types';

jest.setTimeout(60000);

const buildActions = (): jest.Mocked<TaskDetailActions> => ({
  addComment: jest.fn().mockResolvedValue(undefined),
  removeComment: jest.fn().mockResolvedValue(undefined),
  uploadAttachment: jest.fn().mockResolvedValue(undefined),
  removeAttachment: jest.fn().mockResolvedValue(undefined),
  downloadAttachment: jest.fn().mockResolvedValue(new Blob(['data'])),
  updateTask: jest.fn().mockResolvedValue(undefined),
});

const renderDialog = (task: Task, canWrite = true) => {
  const actions = buildActions();
  render(
    <TaskDetailDialog
      task={task}
      tasks={[task]}
      canWrite={canWrite}
      canDelete={false}
      actions={actions}
      onOpenChange={jest.fn()}
      onEdit={jest.fn()}
      onDelete={jest.fn()}
    />,
  );
  return actions;
};

describe('acceptance criteria in the task dialog', () => {
  it('lets a writer add a criterion, which is saved with the whole list', async () => {
    const task = makeTask({ _id: 't1', acceptanceCriteria: [{ _id: 'a'.repeat(24), text: 'Sign in works' }] });
    const actions = renderDialog(task);
    const section = within(screen.getByRole('region', { name: 'Acceptance criteria' }));
    await userEvent.click(section.getByRole('textbox', { name: 'Add an acceptance criterion' }));
    await userEvent.paste('Wrong password shows an error');
    await userEvent.keyboard('{Enter}');
    expect(actions.updateTask).toHaveBeenCalledWith('t1', {
      acceptanceCriteria: [
        { _id: 'a'.repeat(24), text: 'Sign in works' },
        { _id: expect.stringMatching(/^[a-f0-9]{24}$/), text: 'Wrong password shows an error' },
      ],
    });
  });

  it('shows existing criteria read-only to people who cannot edit', () => {
    renderDialog(makeTask({ acceptanceCriteria: [{ _id: 'a'.repeat(24), text: 'Sign in works' }] }), false);
    const section = within(screen.getByRole('region', { name: 'Acceptance criteria' }));
    expect(section.getByText('Sign in works')).toBeInTheDocument();
    expect(section.queryByRole('textbox')).toBeNull();
  });

  it('is absent for a read-only viewer when the task has none', () => {
    renderDialog(makeTask({ acceptanceCriteria: [] }), false);
    expect(screen.queryByRole('region', { name: 'Acceptance criteria' })).toBeNull();
  });
});
