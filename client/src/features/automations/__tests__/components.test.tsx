import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RuleBuilder } from '../components/RuleBuilder';
import { RuleList } from '../components/RuleList';
import { TemplateGallery } from '../components/TemplateGallery';
import { draftFromRule, emptyDraft } from '../lib/draft';
import type { Automation, AutomationTemplate } from '../types';

jest.setTimeout(30000);

const rule = (overrides: Partial<Automation> = {}): Automation => ({
  _id: 'r1', name: 'Assign whoever starts it', enabled: true, project: '',
  trigger: { type: 'task.status_changed', to: 'in-progress' },
  conditions: [{ field: 'assignee', op: 'is_empty', value: '' }],
  actions: [{ type: 'assign_to_actor', value: '' }],
  runCount: 0, lastRunAt: null, createdBy: null, createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z',
  ...overrides,
});

describe('RuleList', () => {
  it('shows the sentence, run statistics and the switch state', () => {
    render(<RuleList rules={[rule({ runCount: 1 }), rule({ _id: 'r2', name: 'Quiet rule', enabled: false, project: 'Web' })]} onToggle={jest.fn()} onEdit={jest.fn()} onDelete={jest.fn()} />);

    expect(screen.getAllByText('When a task moves to In progress, if it has no assignee, assign it to the person who moved it')).toHaveLength(2);
    expect(screen.getByText(/Ran 1 time/)).toBeInTheDocument();
    expect(screen.getByText('Has not run yet')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Assign whoever starts it is on' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Quiet rule is off' })).not.toBeChecked();
    expect(screen.getByText('Project: Web')).toBeInTheDocument();
  });

  it('reports toggle, edit and delete for the right rule', async () => {
    const onToggle = jest.fn();
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const first = rule();
    render(<RuleList rules={[first]} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith(first, false);
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
    expect(onEdit).toHaveBeenCalledWith(first);
    await userEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(onDelete).toHaveBeenCalledWith(first);
  });
});

describe('TemplateGallery', () => {
  const template: AutomationTemplate = {
    id: 'bugs', name: 'Bugs start as high priority', description: '', trigger: { type: 'task.created' },
    conditions: [{ field: 'type', op: 'is', value: 'bug' }], actions: [{ type: 'set_priority', value: 'high' }],
  };

  it('describes each template and hands the chosen one back', async () => {
    const onUse = jest.fn();
    render(<TemplateGallery templates={[template]} defaultOpen onUse={onUse} />);
    expect(screen.getByText('When a task is created, if it is a bug, set its priority to high')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Use template/ }));
    expect(onUse).toHaveBeenCalledWith(template);
  });

  it('renders nothing without templates', () => {
    const { container } = render(<TemplateGallery templates={[]} onUse={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('RuleBuilder', () => {
  const members = [{ _id: 'u1', name: 'Dana', email: 'd@example.com', avatarUrl: '', jobTitle: '', role: 'member' as const, joinedAt: '' }];

  it('asks for a name before saving', async () => {
    const onSave = jest.fn().mockResolvedValue(null);
    render(<RuleBuilder title="New rule" initial={emptyDraft()} members={members} projects={[]} onSave={onSave} onClose={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Save rule' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Give the rule a name')).toBeInTheDocument();
  });

  it('saves the draft, closes, and writes the rule as a sentence while editing', async () => {
    const onSave = jest.fn().mockResolvedValue(null);
    const onClose = jest.fn();
    render(<RuleBuilder title="New rule" initial={emptyDraft()} members={members} projects={['Web']} onSave={onSave} onClose={onClose} />);

    expect(screen.getByText('When a task is created, set its status to Pending')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Name/), 'Start pending');
    await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    const condition = screen.getByRole('group', { name: 'Condition 1' });
    expect(within(condition).getByLabelText('Condition 1 field')).toBeInTheDocument();
    expect(screen.getByText('When a task is created, if it is a story, set its status to Pending')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove condition 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save rule' }));

    expect(onSave).toHaveBeenCalledWith({
      name: 'Start pending', enabled: true, project: '',
      trigger: { type: 'task.created', to: '' },
      conditions: [],
      actions: [{ type: 'set_status', value: 'pending' }],
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the dialog open and shows the server message when saving fails', async () => {
    const onSave = jest.fn().mockResolvedValue('We could not save the rule.');
    const onClose = jest.fn();
    render(<RuleBuilder title="Edit rule" initial={draftFromRule(rule())} members={members} projects={[]} onSave={onSave} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Save rule' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not save the rule.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('limits actions to five and can remove one', async () => {
    render(<RuleBuilder title="New rule" initial={emptyDraft()} members={members} projects={[]} onSave={jest.fn()} onClose={jest.fn()} />);
    const add = screen.getByRole('button', { name: 'Add action' });
    for (let index = 0; index < 4; index += 1) await userEvent.click(add);
    expect(screen.getAllByRole('group', { name: /^Action \d$/ })).toHaveLength(5);
    expect(add).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove action 5' }));
    expect(add).toBeEnabled();
  });
});
