import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { makeProject } from '@/features/projects/__tests__/fixtures';
import { ProjectsContext, type ProjectDirectory } from '@/features/projects/context/ProjectsContext';
import TaskBreadcrumb from '../components/TaskBreadcrumb';
import { makeTask } from './fixtures';

const web = makeProject({ _id: 'p1', name: 'Web', key: 'WEB' });
const directory: ProjectDirectory = {
  slug: 'acme', projects: [web], loading: false, reload: async () => undefined,
  byName: name => (name?.trim().toLowerCase() === 'web' ? web : undefined),
};

const epic = makeTask({ _id: 'e1', title: 'Checkout revamp', type: 'epic', project: 'Web' });
const parent = makeTask({ _id: 'p-task', title: 'Build the payment form with every supported provider and currency', type: 'story', project: 'Web', epic: 'e1', number: 7 });
const child = makeTask({ _id: 'c1', title: 'Card field', parent: 'p-task', project: 'Web', number: 8 });
const tasks = [epic, parent, child];

const renderCrumb = (task = child, onOpenTask?: jest.Mock) => {
  render(
    <ProjectsContext.Provider value={directory}>
      <MemoryRouter>
        <TaskBreadcrumb task={task} tasks={tasks} onOpenTask={onOpenTask} />
      </MemoryRouter>
    </ProjectsContext.Provider>,
  );
  return within(screen.getByRole('navigation', { name: 'Task path' }));
};

describe('TaskBreadcrumb', () => {
  it('shows project, epic, parent and the task key in order', () => {
    const nav = renderCrumb();
    const items = nav.getAllByRole('listitem').map(item => item.textContent);
    expect(items).toEqual(['Web', 'Checkout revamp', expect.stringContaining('Build the payment form'), 'WEB-8']);
    expect(nav.getByText('WEB-8').closest('li')).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('button', { name: 'Copy key' })).toBeInTheDocument();
  });

  it('links the project to its page', () => {
    const nav = renderCrumb();
    expect(nav.getByRole('link', { name: 'Web' })).toHaveAttribute('href', '/acme/projects/p1');
  });

  it('opens the epic and the parent in the dialog', async () => {
    const onOpenTask = jest.fn();
    const nav = renderCrumb(child, onOpenTask);
    await userEvent.click(nav.getByRole('button', { name: 'Open epic Checkout revamp' }));
    expect(onOpenTask).toHaveBeenLastCalledWith(epic);
    await userEvent.click(nav.getByRole('button', { name: /Back to parent/ }));
    expect(onOpenTask).toHaveBeenLastCalledWith(parent);
  });

  it('truncates long titles but keeps the full text in a tooltip', () => {
    const nav = renderCrumb();
    const title = nav.getByTitle(parent.title);
    expect(title).toHaveClass('truncate');
  });

  it('hides the ancestors above the nearest one on phones, with an ellipsis', () => {
    const nav = renderCrumb(child, jest.fn());
    expect(screen.getByText('…').closest('li')).toHaveClass('sm:hidden');
    expect(nav.getByRole('link', { name: 'Web' }).closest('li')).toHaveClass('max-sm:hidden');
    expect(nav.getByRole('button', { name: 'Open epic Checkout revamp' }).closest('li')).toHaveClass('max-sm:hidden');
    expect(nav.getByRole('button', { name: /Back to parent/ }).closest('li')).not.toHaveClass('max-sm:hidden');
  });

  it('renders plain text for the ancestors without an open callback', () => {
    const nav = renderCrumb();
    expect(nav.queryByRole('button', { name: /parent|epic/i })).not.toBeInTheDocument();
    expect(nav.getByText('Checkout revamp')).toBeInTheDocument();
  });

  it('renders nothing for a loose task without a number', () => {
    render(<MemoryRouter><TaskBreadcrumb task={makeTask({ title: 'Loose end' })} tasks={tasks} /></MemoryRouter>);
    expect(screen.queryByRole('navigation', { name: 'Task path' })).not.toBeInTheDocument();
  });
});
