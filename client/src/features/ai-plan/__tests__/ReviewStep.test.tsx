import { useMemo, useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster, toast } from '@/components/ds';
import { planActions } from '../components/actions';
import { ReviewStep } from '../components/ReviewStep';
import type { AiPlan, PlanApiError, PlanContent } from '../types';
import { makeAiPlan, makePlan } from './fixtures';

jest.setTimeout(30000);

interface HarnessProps {
  plan?: AiPlan;
  initial?: PlanContent;
  createError?: PlanApiError | null;
  canRegenerate?: boolean;
  creating?: boolean;
  onCreate?: () => void;
  onRegenerate?: () => void;
  onDiscard?: () => void;
  onDraft?: (draft: PlanContent) => void;
}

const Harness = ({
  plan = makeAiPlan(), initial = makePlan(), createError = null, canRegenerate = true, creating = false,
  onCreate = jest.fn(), onRegenerate = jest.fn(), onDiscard = jest.fn(), onDraft,
}: HarnessProps) => {
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const actions = useMemo(() => planActions(change => {
    setDraft(current => {
      const next = change(current);
      onDraft?.(next);
      return next;
    });
    setDirty(true);
  }), [onDraft]);
  return (
    <>
      <ReviewStep
        plan={plan}
        draft={draft}
        dirty={dirty}
        actions={actions}
        creating={creating}
        createError={createError}
        canRegenerate={canRegenerate}
        onCreate={onCreate}
        onRegenerate={onRegenerate}
        onDiscard={onDiscard}
        onDismissError={jest.fn()}
      />
      <Toaster />
    </>
  );
};

const sprint = (name: string) => screen.getByRole('region', { name });
const titleButton = (title: string) => screen.getByRole('button', { name: new RegExp(`^${title} \\(edit title of ${title}\\)$`) });

afterEach(() => { toast.clear(); });

describe('ReviewStep', () => {
  it('shows the generated project like the mock: header, tabs with counts, sprints with dates, goals and tasks', () => {
    render(<Harness />);
    const header = screen.getByRole('region', { name: 'Generated project' });
    expect(within(header).getByRole('heading', { name: /Online Bookshop/ })).toBeInTheDocument();
    expect(within(header).getByText('Ready')).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: /^BOOK/ })).toBeInTheDocument();
    expect(within(header).getByText('From bookshop.pdf (123 kB)')).toBeInTheDocument();
    expect(within(header).getByText('A shop that sells books online.')).toBeInTheDocument();
    const stats = within(header).getByText('Sprints').closest('dl') as HTMLElement;
    expect(within(stats).getByText('Points').nextSibling).toHaveTextContent('13');

    expect(screen.getByRole('tab', { name: 'Sprints 2' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Tasks 3' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Subtasks 2' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Acceptance criteria 4' })).toBeInTheDocument();

    const first = sprint('Sprint 1');
    expect(within(first).getByText('Mar 3 – Mar 14')).toBeInTheDocument();
    expect(within(first).getByText('Weeks 1–2')).toBeInTheDocument();
    expect(within(first).getByText('Browse and search')).toBeInTheDocument();
    expect(within(first).getByText('1 task')).toBeInTheDocument();
    expect(within(first).getAllByText('5 points').length).toBeGreaterThan(0);
    expect(within(first).getByText('Browse the catalogue')).toBeInTheDocument();
    expect(within(sprint('Sprint 2')).getByText('Weeks 3–4')).toBeInTheDocument();
    expect(within(sprint('Backlog')).getByText('Gift cards')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Assumptions and risks' })).toHaveTextContent('Payment provider approval takes weeks');
  });

  it('edits a title in place: Enter saves, Escape cancels, an empty title is refused', async () => {
    const user = userEvent.setup();
    const drafts: PlanContent[] = [];
    render(<Harness onDraft={draft => drafts.push(draft)} />);

    await user.click(titleButton('Pay by card'));
    const input = screen.getByRole('textbox', { name: 'title of Pay by card' });
    await user.clear(input);
    await user.type(input, 'Pay with a card{Enter}');
    expect(screen.getByRole('button', { name: /^Pay with a card/ })).toBeInTheDocument();
    expect(drafts.at(-1)?.items[1].title).toBe('Pay with a card');

    await user.click(titleButton('Gift cards'));
    await user.type(screen.getByRole('textbox', { name: 'title of Gift cards' }), ' extra{Escape}');
    expect(titleButton('Gift cards')).toBeInTheDocument();

    await user.click(titleButton('Gift cards'));
    await user.clear(screen.getByRole('textbox', { name: 'title of Gift cards' }));
    await user.keyboard('{Enter}');
    expect(titleButton('Gift cards')).toBeInTheDocument();
  });

  it('renames the project and edits its key, flagging an invalid one', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: /^Online Bookshop \(edit project name\)$/ }));
    const name = screen.getByRole('textbox', { name: 'project name' });
    await user.clear(name);
    await user.type(name, 'Book Hub{Enter}');
    expect(screen.getByRole('heading', { name: /Book Hub/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^BOOK/ }));
    const key = screen.getByRole('textbox', { name: 'project key' });
    await user.clear(key);
    await user.type(key, 'x{Enter}');
    expect(screen.getAllByText('The key must be 2 to 6 letters or digits.').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /^Create project/ })[0]).toBeDisabled();
  });

  it('deletes a task and puts it back with Undo', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(within(sprint('Sprint 2')).getByRole('button', { name: 'Delete Pay by card' }));
    expect(screen.queryByText('Pay by card')).not.toBeInTheDocument();
    expect(within(sprint('Sprint 2')).getByText('No tasks here. Add one, or move a task into this sprint.')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(within(sprint('Sprint 2')).getByText('Pay by card')).toBeInTheDocument();
  });

  it('adds a task to a sprint', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(within(sprint('Sprint 2')).getByRole('button', { name: 'Add a task to Sprint 2' }));
    expect(within(sprint('Sprint 2')).getByText('New task')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tasks 4' })).toBeInTheDocument();
  });

  it('moves a task to another sprint from the Tasks tab', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('tab', { name: 'Tasks 3' }));
    await user.click(screen.getByRole('combobox', { name: 'Sprint of Gift cards' }));
    await user.click(await screen.findByRole('option', { name: 'Sprint 1' }));
    await user.click(screen.getByRole('tab', { name: 'Sprints 2' }));
    expect(within(sprint('Sprint 1')).getByText('Gift cards')).toBeInTheDocument();
    expect(within(sprint('Backlog')).queryByText('Gift cards')).not.toBeInTheDocument();
  });

  it('changes the points and the priority of a task', async () => {
    const user = userEvent.setup();
    const drafts: PlanContent[] = [];
    render(<Harness onDraft={draft => drafts.push(draft)} />);
    await user.click(screen.getByRole('combobox', { name: 'Story points of Pay by card' }));
    await user.click(await screen.findByRole('option', { name: '13 points' }));
    expect(drafts.at(-1)?.items[1].storyPoints).toBe(13);
    await user.click(screen.getByRole('combobox', { name: 'Priority of Pay by card' }));
    await user.click(await screen.findByRole('option', { name: 'Low' }));
    expect(drafts.at(-1)?.items[1].priority).toBe('low');
  });

  it('unfolds a task to edit its criteria and subtasks', async () => {
    const user = userEvent.setup();
    const drafts: PlanContent[] = [];
    render(<Harness onDraft={draft => drafts.push(draft)} />);
    await user.click(screen.getByRole('button', { name: 'Show details of Browse the catalogue' }));
    const criterion = screen.getByRole('textbox', { name: 'Criterion 2 of Browse the catalogue' });
    expect(criterion).toHaveValue('Pagination keeps the filter');
    await user.type(criterion, '!');
    expect(drafts.at(-1)?.items[0].acceptanceCriteria[1]).toBe('Pagination keeps the filter!');

    await user.click(screen.getByRole('button', { name: 'Remove criterion 1 of Browse the catalogue' }));
    expect(drafts.at(-1)?.items[0].acceptanceCriteria).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Add a criterion' }));
    expect(drafts.at(-1)?.items[0].acceptanceCriteria).toHaveLength(2);

    expect(screen.getByRole('textbox', { name: 'Subtask 1 of Browse the catalogue' })).toHaveValue('Build the list page');
    await user.click(screen.getByRole('button', { name: 'Remove subtask 2 of Browse the catalogue' }));
    expect(drafts.at(-1)?.items[0].subtasks).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Add a subtask' }));
    expect(drafts.at(-1)?.items[0].subtasks.at(-1)?.title).toBe('New subtask');
  });

  it('lists subtasks and acceptance criteria by task, and warns about tasks without criteria', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('tab', { name: 'Subtasks 2' }));
    const subtasks = screen.getByRole('list', { name: 'Subtasks by task' });
    expect(within(subtasks).getByDisplayValue('Build the list page')).toBeInTheDocument();
    expect(within(subtasks).getByDisplayValue('Write the list tests')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Acceptance criteria 4' }));
    expect(screen.getByRole('status')).toHaveTextContent('1 task has no acceptance criteria yet');
    const criteria = screen.getByRole('list', { name: 'Acceptance criteria by task' });
    expect(within(criteria).getByDisplayValue('Given a basket, when the card is accepted, then an order is created')).toBeInTheDocument();
  });

  it('says when only part of the document was analysed', () => {
    render(<Harness plan={makeAiPlan({ source: { fileName: 'huge.pdf', mimeType: 'application/pdf', size: 4_000_000, chars: 250_000, truncated: true } })} />);
    const banner = screen.getByText('Only part of the document was analysed').closest('[role="status"]') as HTMLElement;
    expect(banner).toHaveTextContent('250,000 characters');
    expect(banner).toHaveTextContent('the middle was left out');
  });

  it('creates the project with the button, and not while it is already being created', async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn();
    const { rerender } = render(<Harness onCreate={onCreate} />);
    await user.click(screen.getAllByRole('button', { name: 'Create project (5 tasks)' })[0]);
    expect(onCreate).toHaveBeenCalledTimes(1);
    rerender(<Harness onCreate={onCreate} creating />);
    expect(screen.getAllByRole('button', { name: 'Creating the project…' })[0]).toBeDisabled();
  });

  it('offers the free name or key when the server says it is taken', async () => {
    const user = userEvent.setup();
    const drafts: PlanContent[] = [];
    render(<Harness
      onDraft={draft => drafts.push(draft)}
      createError={{ status: 409, code: 'PROJECT_NAME_TAKEN', message: 'A project with this name already exists. Choose another name.', suggestion: 'Online Bookshop (2)' }}
    />);
    expect(screen.getByRole('alert')).toHaveTextContent('A project with this name already exists');
    await user.click(screen.getByRole('button', { name: 'Use “Online Bookshop (2)”' }));
    expect(drafts.at(-1)?.project.name).toBe('Online Bookshop (2)');
  });

  it('shows other refusals with their message', () => {
    render(<Harness createError={{ status: 500, code: '', message: 'We could not create the project. Nothing was changed. Try again.', suggestion: '' }} />);
    expect(screen.getByText('The project was not created')).toBeInTheDocument();
    expect(screen.getByText(/Nothing was changed/)).toBeInTheDocument();
  });

  it('asks before regenerating or discarding edited work, and not when nothing changed', async () => {
    const user = userEvent.setup();
    const onRegenerate = jest.fn();
    const onDiscard = jest.fn();
    render(<Harness onRegenerate={onRegenerate} onDiscard={onDiscard} />);

    await user.click(screen.getAllByRole('button', { name: 'Regenerate' })[0]);
    expect(onRegenerate).toHaveBeenCalledTimes(1); // untouched plan: no confirmation

    await user.click(within(sprint('Sprint 2')).getByRole('button', { name: 'Delete Pay by card' }));
    await user.click(screen.getAllByRole('button', { name: 'Discard' })[0]);
    expect(onDiscard).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Your edits are lost. Nothing has been created.');
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('disables Regenerate when the document is no longer in this tab', () => {
    render(<Harness canRegenerate={false} />);
    expect(screen.getAllByRole('button', { name: 'Regenerate' })[0]).toBeDisabled();
  });

  it('blocks creation when a subtask has no title', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('tab', { name: 'Subtasks 2' }));
    await user.clear(screen.getByDisplayValue('Build the list page'));
    expect(screen.getByText('1 thing to fix before you can create the project')).toBeInTheDocument();
    expect(screen.getByText('Every subtask needs a title.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Create project/ })[0]).toBeDisabled();
  });
});
