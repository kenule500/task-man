import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeTask } from '@/features/tasks/__tests__/fixtures';
import EpicsPanel from '../components/EpicsPanel';

jest.setTimeout(30000);

const epic = makeTask({ _id: 'e1', title: 'Checkout revamp', type: 'epic', project: 'Web' });
const other = makeTask({ _id: 'e2', title: 'Search', type: 'epic', project: 'Web' });
const cart = makeTask({ _id: 'i1', title: 'Cart page', type: 'story', epic: 'e1', project: 'Web', storyPoints: 3, position: 1 });
const pay = makeTask({ _id: 'i2', title: 'Payment form', type: 'bug', epic: 'e1', project: 'Web', position: 2 });
const sub1 = makeTask({ _id: 's1', title: 'Totals row', parent: 'i1', epic: 'e1', project: 'Web', status: 'completed', position: 1 });
const sub2 = makeTask({ _id: 's2', title: 'Empty state', parent: 'i1', epic: 'e1', project: 'Web', position: 2 });
const loose = makeTask({ _id: 'l1', title: 'Loose chore', type: 'task', project: 'Web', position: 3 });
const looseTwo = makeTask({ _id: 'l2', title: 'Another chore', type: 'task', project: 'Web', position: 4 });
const inSearch = makeTask({ _id: 'i3', title: 'Autocomplete', epic: 'e2', project: 'Web', position: 5 });

const all = [epic, other, cart, pay, sub1, sub2, loose, looseTwo, inSearch];

interface Handlers {
  onOpen: jest.Mock;
  onToggleDone: jest.Mock;
  onAddToEpic: jest.Mock;
  onAddSubtask: jest.Mock;
  onLinkTasks: jest.Mock;
  onRemoveFromEpic: jest.Mock;
  onMoveToEpic: jest.Mock;
}

const makeHandlers = (): Handlers => ({
  onOpen: jest.fn(),
  onToggleDone: jest.fn(),
  onAddToEpic: jest.fn().mockResolvedValue(undefined),
  onAddSubtask: jest.fn().mockResolvedValue(undefined),
  onLinkTasks: jest.fn().mockResolvedValue(undefined),
  onRemoveFromEpic: jest.fn(),
  onMoveToEpic: jest.fn(),
});

const setup = (canWrite = true, handlers = makeHandlers(), storageKey?: string) => {
  const view = render(<EpicsPanel epics={[epic, other]} tasks={all} canWrite={canWrite} storageKey={storageKey} {...handlers} />);
  return { ...view, handlers };
};

beforeEach(() => window.sessionStorage.clear());

describe('epic hierarchy', () => {
  it('shows epics collapsed, then items and subtasks as each level expands', async () => {
    setup();
    expect(screen.queryByText('Cart page')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Expand items of Checkout revamp' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Collapse items of Checkout revamp' })).toHaveAttribute('aria-expanded', 'true');
    const items = screen.getByRole('list', { name: 'Items of Checkout revamp' });
    expect(within(items).getByRole('button', { name: 'Cart page' })).toBeInTheDocument();
    expect(within(items).getByRole('button', { name: 'Payment form' })).toBeInTheDocument();
    expect(within(items).queryByText('Autocomplete')).not.toBeInTheDocument();
    expect(within(items).getByText('1/2')).toBeInTheDocument();

    await userEvent.click(within(items).getByRole('button', { name: 'Expand subtasks of Cart page' }));
    const subtasks = screen.getByRole('list', { name: 'Subtasks of Cart page' });
    expect(within(subtasks).getAllByRole('listitem')).toHaveLength(2);
    expect(within(subtasks).getByRole('button', { name: 'Mark "Totals row" as not done' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(subtasks).getByRole('button', { name: 'Mark "Empty state" as done' })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByRole('button', { name: 'Collapse items of Checkout revamp' }));
    expect(screen.queryByText('Cart page')).not.toBeInTheDocument();
  });

  it('toggles with the keyboard: Enter, ArrowRight and ArrowLeft', async () => {
    setup();
    const toggle = screen.getByRole('button', { name: 'Expand items of Checkout revamp' });
    toggle.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Collapse items of Checkout revamp' })).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('button', { name: 'Expand items of Checkout revamp' })).toHaveAttribute('aria-expanded', 'false');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Collapse items of Checkout revamp' })).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Expand items of Checkout revamp' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands and collapses everything, and remembers the state per project', async () => {
    const first = setup(true, makeHandlers(), 'p1');
    await userEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByRole('list', { name: 'Items of Search' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Subtasks of Cart page' })).toBeInTheDocument();
    first.unmount();

    setup(true, makeHandlers(), 'p1');
    expect(screen.getByRole('list', { name: 'Items of Checkout revamp' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByRole('list', { name: 'Items of Checkout revamp' })).not.toBeInTheDocument();
    expect(JSON.parse(window.sessionStorage.getItem('taskman.epics.expanded.p1') ?? 'null')).toEqual([]);
  });

  it('adds a task to an epic', async () => {
    const { handlers } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Expand items of Checkout revamp' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Add a task to Checkout revamp…' }), 'Gift cards{Enter}');
    await waitFor(() => expect(handlers.onAddToEpic).toHaveBeenCalledWith(epic, 'Gift cards'));
  });

  it('adds a subtask to an item', async () => {
    const { handlers } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Expand items of Checkout revamp' }));
    await userEvent.click(screen.getByRole('button', { name: 'Expand subtasks of Payment form' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Add a subtask to Payment form…' }), 'Validate card{Enter}');
    await waitFor(() => expect(handlers.onAddSubtask).toHaveBeenCalledWith(pay, 'Validate card'));
  });

  it('marks a subtask done and opens rows', async () => {
    const { handlers } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Expand items of Checkout revamp' }));
    await userEvent.click(screen.getByRole('button', { name: 'Expand subtasks of Cart page' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark "Empty state" as done' }));
    expect(handlers.onToggleDone).toHaveBeenCalledWith(sub2, true);

    await userEvent.click(screen.getByRole('button', { name: 'Empty state' }));
    expect(handlers.onOpen).toHaveBeenCalledWith(sub2);
    await userEvent.click(screen.getByRole('button', { name: 'Cart page' }));
    expect(handlers.onOpen).toHaveBeenCalledWith(cart);
  });

  it('opens an item and removes it from its epic from the actions menu', async () => {
    const { handlers } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Expand items of Checkout revamp' }));

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Payment form' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Open' }));
    expect(handlers.onOpen).toHaveBeenCalledWith(pay);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Payment form' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove from epic' }));
    expect(handlers.onRemoveFromEpic).toHaveBeenCalledWith(pay);
  });

  it('links existing tasks to an epic through the dialog', async () => {
    const { handlers } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Expand items of Checkout revamp' }));
    await userEvent.click(screen.getByRole('button', { name: /Link existing task/ }));

    const dialog = await screen.findByRole('dialog');
    const list = within(dialog).getByRole('list', { name: 'Tasks to link' });
    // Tasks already in this epic and subtasks are not offered; a task in another epic is, with a hint
    expect(within(list).queryByText('Cart page')).not.toBeInTheDocument();
    expect(within(list).queryByText('Totals row')).not.toBeInTheDocument();
    expect(within(list).getByText('Now in Search')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Link tasks' })).toBeDisabled();

    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Search tasks' }), 'chore');
    expect(within(list).queryByText('Autocomplete')).not.toBeInTheDocument();
    await userEvent.click(within(list).getByRole('checkbox', { name: /Loose chore/ }));
    await userEvent.click(within(list).getByRole('checkbox', { name: /Another chore/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Link 2 tasks' }));

    await waitFor(() => expect(handlers.onLinkTasks).toHaveBeenCalledWith(epic, ['l1', 'l2']));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the link dialog open and shows the error when linking fails', async () => {
    const handlers = makeHandlers();
    handlers.onLinkTasks.mockRejectedValue(new Error('This epic belongs to another project'));
    setup(true, handlers);
    await userEvent.click(screen.getByRole('button', { name: 'Expand items of Checkout revamp' }));
    await userEvent.click(screen.getByRole('button', { name: /Link existing task/ }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Loose chore/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Link 1 task' }));
    expect(await within(dialog).findByText(/Could not link the tasks|belongs to another project/)).toBeInTheDocument();
  });

  it('moves a task from "Not in an epic" into an epic', async () => {
    const { handlers } = setup();
    const toggle = screen.getByRole('button', { name: /Not in an epic/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('2');
    await userEvent.click(toggle);

    const list = screen.getByRole('list', { name: 'Tasks not in an epic' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(within(list).getByRole('combobox', { name: 'Move "Loose chore" to an epic' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Search' }));
    expect(handlers.onMoveToEpic).toHaveBeenCalledWith(loose, 'e2');
  });

  it('is read-only without write access: no editing controls, still browsable', async () => {
    setup(false);
    expect(screen.queryByRole('textbox', { name: 'Add an epic…' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Expand items of Checkout revamp' }));

    expect(screen.queryByRole('textbox', { name: /Add a task to/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Link existing task/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand subtasks of Cart page' })).toBeInTheDocument();
    // An item without subtasks has nothing to expand
    expect(screen.queryByRole('button', { name: 'Expand subtasks of Payment form' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Expand subtasks of Cart page' }));
    expect(screen.queryByRole('textbox', { name: /Add a subtask to/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark "Empty state" as done' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Cart page' }));
    expect(await screen.findByRole('menuitem', { name: 'Open' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Remove from epic' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByRole('button', { name: /Not in an epic/ }));
    expect(screen.queryByRole('combobox', { name: /to an epic/ })).not.toBeInTheDocument();
  });
});
