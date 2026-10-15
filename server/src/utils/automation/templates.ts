import type { IAutomationAction, IAutomationCondition, IAutomationTrigger } from '../../models/automationModel.js';

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  trigger: IAutomationTrigger;
  conditions: IAutomationCondition[];
  actions: IAutomationAction[];
}

// Ready-made recipes; the client copies one into the rule builder
export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'bugs-high-priority',
    name: 'Bugs start as high priority',
    description: 'A new bug is marked high priority so it is triaged first.',
    trigger: { type: 'task.created' },
    conditions: [{ field: 'type', op: 'is', value: 'bug' }],
    actions: [{ type: 'set_priority', value: 'high' }],
  },
  {
    id: 'assign-whoever-starts',
    name: 'Assign to whoever starts it',
    description: 'When an unassigned task moves to In progress, the person who moved it becomes the assignee.',
    trigger: { type: 'task.status_changed', to: 'in-progress' },
    conditions: [{ field: 'assignee', op: 'is_empty', value: '' }],
    actions: [{ type: 'assign_to_actor', value: '' }],
  },
  {
    id: 'completed-clears-blocked',
    name: 'Completed work leaves the blocked label',
    description: 'Finishing a task removes its "blocked" label.',
    trigger: { type: 'task.status_changed', to: 'completed' },
    conditions: [{ field: 'label', op: 'has', value: 'blocked' }],
    actions: [{ type: 'remove_label', value: 'blocked' }],
  },
  {
    id: 'high-priority-label',
    name: 'High priority tasks get a label',
    description: 'Raising a task to high priority adds the "high-priority" label so it stands out in filters.',
    trigger: { type: 'task.priority_changed', to: 'high' },
    conditions: [],
    actions: [{ type: 'add_label', value: 'high-priority' }],
  },
  {
    id: 'comment-reopens',
    name: 'New comments reopen completed tasks',
    description: 'A comment on a completed task moves it back to In progress.',
    trigger: { type: 'task.commented' },
    conditions: [{ field: 'status', op: 'is', value: 'completed' }],
    actions: [{ type: 'set_status', value: 'in-progress' }],
  },
  {
    id: 'reviewed-completes',
    name: 'Reviewed label moves to completed',
    description: 'Adding the "reviewed" label completes the task.',
    trigger: { type: 'task.labeled', to: 'reviewed' },
    conditions: [],
    actions: [{ type: 'set_status', value: 'completed' }],
  },
  {
    id: 'assigned-starts',
    name: 'Assigned tasks start moving',
    description: 'When someone is assigned to a pending task, it moves to In progress.',
    trigger: { type: 'task.assigned' },
    conditions: [{ field: 'status', op: 'is', value: 'pending' }],
    actions: [{ type: 'set_status', value: 'in-progress' }],
  },
];
