import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { makeProject } from '@/features/projects/__tests__/fixtures';
import { ProjectsContext, type ProjectDirectory } from '@/features/projects/context/ProjectsContext';
import AssigneePicker from '../components/AssigneePicker';
import LabelInput from '../components/LabelInput';
import TaskBreadcrumb from '../components/TaskBreadcrumb';
import TaskKey from '../components/TaskKey';
import { AssigneeStack } from '../components/TaskChips';
import { makeTask } from './fixtures';

const web = makeProject({ _id: 'p1', name: 'Web', key: 'WEB' });
const directory: ProjectDirectory = {
  slug: 'acme', projects: [web], loading: false, reload: async () => undefined,
  byName: name => (name?.trim().toLowerCase() === 'web' ? web : undefined),
};

const wrap = (node: React.ReactNode) => (
  <ProjectsContext.Provider value={directory}>
    <MemoryRouter>{node}</MemoryRouter>
  </ProjectsContext.Provider>
);

describe('task hover cards', () => {
  it('opens a task preview from the key on keyboard focus', async () => {
    const task = makeTask({ _id: 't1', title: 'Ship the pricing page', project: 'Web', number: 12, priority: 'high', status: 'in-progress' });
    render(wrap(<TaskKey task={task} preview={task} />));

    await userEvent.tab();
    expect(screen.getByTestId('task-key').parentElement).toHaveFocus();
    expect(await screen.findByText('Ship the pricing page', undefined, { timeout: 2000 })).toBeInTheDocument();
  });

  it('previews the parent task from the breadcrumb without losing its button', async () => {
    const parent = makeTask({ _id: 'p-task', title: 'Payment form', type: 'story', project: 'Web', number: 7 });
    const child = makeTask({ _id: 'c1', title: 'Card field', parent: 'p-task', project: 'Web', number: 8 });
    const onOpenTask = jest.fn();
    render(wrap(<TaskBreadcrumb task={child} tasks={[parent, child]} onOpenTask={onOpenTask} />));

    const crumb = screen.getByRole('button', { name: 'Back to parent: Payment form' });
    await userEvent.click(crumb);
    expect(onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ _id: 'p-task' }));
  });

  it('shows who an avatar is when the assignee stack has previews', async () => {
    render(<AssigneeStack users={[{ _id: 'u1', name: 'Ada Lovelace' }]} preview />);
    expect(screen.getByText('Assigned to Ada Lovelace')).toHaveClass('sr-only');
    await userEvent.hover(screen.getByText('AL'));
    expect(await screen.findByText('Assignee', undefined, { timeout: 2000 })).toBeInTheDocument();
  });
});

describe('AssigneePicker (combobox)', () => {
  const members = [
    { _id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
    { _id: 'u2', name: 'Grace Hopper', email: 'grace@example.com' },
  ] as never[];

  const Harness = ({ onChange }: { onChange?: (ids: string[]) => void }) => {
    const [ids, setIds] = useState<string[]>(['u1']);
    return (
      <AssigneePicker
        value={ids}
        onChange={next => { setIds(next); onChange?.(next); }}
        members={members}
        canListMembers
        current={[]}
        currentUser={{ _id: 'u2', name: 'Grace Hopper' }}
      />
    );
  };

  it('lists members, adds one and offers “Assign to me” until assigned', async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Remove Ada Lovelace' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Assignees' }));
    await userEvent.click(await screen.findByRole('option', { name: /Grace Hopper/ }));
    expect(onChange).toHaveBeenLastCalledWith(['u1', 'u2']);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Assign to me' })).not.toBeInTheDocument();
  });

  it('assigns the current user with the shortcut', async () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Assign to me/ }));
    expect(onChange).toHaveBeenLastCalledWith(['u1', 'u2']);
  });
});

describe('LabelInput (TagInput)', () => {
  it('adds colored label chips and removes them', async () => {
    const Harness = () => {
      const [labels, setLabels] = useState<string[]>([]);
      return <LabelInput value={labels} onChange={setLabels} suggestions={['backend']} />;
    };
    render(<Harness />);
    await userEvent.type(screen.getByRole('textbox'), 'frontend{Enter}');
    expect(screen.getByText('frontend')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add label backend' }));
    expect(screen.getByRole('button', { name: 'Remove label backend' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove label frontend' }));
    expect(screen.queryByText('frontend')).not.toBeInTheDocument();
  });
});
