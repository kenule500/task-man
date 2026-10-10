import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2, Zap } from 'lucide-react';
import { Field } from '@/components/ds';
import { fieldMessageId } from '@/components/ds/variants';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { OptionSelect } from '@/features/tasks';
import type { WorkspaceMember } from '@/features/workspace';
import {
  ANY_VALUE, ACTION_OPTIONS, CONDITION_OPTIONS, TRIGGER_OPTIONS, actionValueKind, choicesFor, triggerValueKind,
  type Option, type ValueKind,
} from '../lib/options';
import {
  defaultValueFor, hasErrors, newActionRow, newConditionRow, toInput, validateDraft,
  type ActionRow, type ConditionRow, type DraftErrors, type RuleDraft,
} from '../lib/draft';
import { describeRule } from '../lib/describe';
import {
  MAX_ACTIONS, MAX_COMMENT, MAX_CONDITIONS, MAX_RULE_NAME, MAX_VALUE,
  type ActionType, type AutomationInput, type ConditionField, type TriggerType,
} from '../types';

const ALL_PROJECTS = 'all';
const CHOOSE_MEMBER = 'choose';
const CONTROL = 'h-11 text-base sm:h-9 sm:text-sm';
const SELECT = 'h-11 text-base sm:h-9 sm:text-sm';

interface RuleBuilderProps {
  title: string;
  initial: RuleDraft;
  members: WorkspaceMember[];
  /** Project names a rule can be limited to */
  projects: string[];
  /** Resolves to an error message, or `null` once saved. */
  onSave: (input: AutomationInput) => Promise<string | null>;
  onClose: () => void;
}

interface ValueFieldProps {
  id: string;
  label: string;
  kind: ValueKind;
  value: string;
  members: WorkspaceMember[];
  /** Offer "any" for status/priority/label (triggers) */
  allowAny?: boolean;
  error?: string;
  onChange: (value: string) => void;
}

/** The value editor of a trigger, condition or action: a select, a text field or a comment box. */
const ValueField = ({ id, label, kind, value, members, allowAny, error, onChange }: ValueFieldProps) => {
  const describedBy = error ? fieldMessageId(id) : undefined;
  if (kind === 'status' || kind === 'priority' || kind === 'type') {
    const choices: Option[] = allowAny ? [{ value: ANY_VALUE, label: 'Any' }, ...choicesFor(kind)] : choicesFor(kind);
    return (
      <div className="min-w-0 flex-1">
        <OptionSelect
          id={id}
          aria-label={label}
          value={value || (allowAny ? ANY_VALUE : choices[0].value)}
          options={choices}
          onChange={next => onChange(next === ANY_VALUE ? '' : next)}
          className={SELECT}
        />
      </div>
    );
  }
  if (kind === 'member') {
    const options: Option[] = [
      { value: CHOOSE_MEMBER, label: 'Choose a member' },
      ...members.map(member => ({ value: member._id, label: member.name })),
    ];
    // A member who has since left stays visible so the rule can be fixed
    if (value && !options.some(option => option.value === value)) options.push({ value, label: 'Former member' });
    return (
      <div className="min-w-0 flex-1">
        <OptionSelect
          id={id}
          aria-label={label}
          value={value || CHOOSE_MEMBER}
          options={options}
          onChange={next => onChange(next === CHOOSE_MEMBER ? '' : next)}
          className={SELECT}
        />
        {error && <p id={fieldMessageId(id)} className="mt-1 text-xs text-danger-fg">{error}</p>}
      </div>
    );
  }
  if (kind === 'comment') {
    return (
      <div className="min-w-0 flex-1">
        <Textarea
          id={id}
          aria-label={label}
          value={value}
          maxLength={MAX_COMMENT}
          onChange={event => onChange(event.target.value)}
          placeholder="What should the comment say?"
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className="min-h-20 bg-white text-base sm:text-sm"
        />
        {error && <p id={fieldMessageId(id)} className="mt-1 text-xs text-danger-fg">{error}</p>}
      </div>
    );
  }
  if (kind === 'label') {
    return (
      <div className="min-w-0 flex-1">
        <Input
          id={id}
          aria-label={label}
          value={value}
          maxLength={MAX_VALUE}
          onChange={event => onChange(event.target.value)}
          placeholder={allowAny ? 'Any label' : 'Label'}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={CONTROL}
        />
        {error && <p id={fieldMessageId(id)} className="mt-1 text-xs text-danger-fg">{error}</p>}
      </div>
    );
  }
  return null;
};

const RemoveButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <Button type="button" variant="ghost" onClick={onClick} aria-label={label} className="h-11 w-11 shrink-0 p-0 text-slate-600 sm:h-9 sm:w-9">
    <Trash2 aria-hidden />
  </Button>
);

/**
 * Create or edit a rule: When (trigger), If (conditions), Then (actions), with a live sentence.
 * Mount it only while it is open; it keeps its own draft.
 */
export const RuleBuilder = ({ title, initial, members, projects, onSave, onClose }: RuleBuilderProps) => {
  const [draft, setDraft] = useState<RuleDraft>(initial);
  const [errors, setErrors] = useState<DraftErrors | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  const memberNames = useMemo(() => new Map(members.map(member => [member._id, member.name])), [members]);
  const sentence = describeRule(
    {
      trigger: draft.trigger,
      conditions: draft.conditions.filter(condition => condition.value || !CONDITION_OPTIONS[condition.field].valueKind),
      actions: draft.actions.filter(action => action.value || !actionValueKind(action.type)),
    },
    { memberName: id => memberNames.get(id) },
  );

  const change = (next: RuleDraft) => {
    setDraft(next);
    // Once the user has tried to save, keep the messages in step with what they type
    if (errors) setErrors(validateDraft(next));
  };

  const setCondition = (key: string, update: (row: ConditionRow) => ConditionRow) =>
    change({ ...draft, conditions: draft.conditions.map(row => (row.key === key ? update(row) : row)) });
  const setAction = (key: string, update: (row: ActionRow) => ActionRow) =>
    change({ ...draft, actions: draft.actions.map(row => (row.key === key ? update(row) : row)) });

  const projectOptions: Option[] = [
    { value: ALL_PROJECTS, label: 'All projects' },
    ...projects.map(name => ({ value: name, label: name })),
  ];
  if (draft.project && !projects.includes(draft.project)) projectOptions.push({ value: draft.project, label: draft.project });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateDraft(draft);
    setErrors(found);
    if (hasErrors(found)) return;
    setSaving(true);
    setFailure(null);
    const message = await onSave(toInput(draft));
    setSaving(false);
    if (message) setFailure(message);
    else onClose();
  };

  const triggerKind = triggerValueKind(draft.trigger.type);

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent
        initialFocus={nameRef}
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border border-slate-200 bg-white p-0 shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:max-w-[640px] sm:rounded-xl"
      >
        <div className="shrink-0 border-b border-slate-200 px-4 pb-4 pr-12 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-start gap-3">
            <div aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Zap className="size-5" />
            </div>
            <DialogHeader className="min-w-0 gap-1 p-0">
              <DialogTitle className="text-lg font-bold leading-tight text-slate-900">{title}</DialogTitle>
              <DialogDescription className="text-sm text-slate-600">
                When something happens to a task, check a few conditions and let TaskMan make the changes.
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:max-h-[60vh] sm:flex-none sm:px-6 sm:py-5">
            {failure && <p role="alert" className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg">{failure}</p>}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor={`${uid}-name`} required error={errors?.name}>
                <Input
                  ref={nameRef}
                  id={`${uid}-name`}
                  value={draft.name}
                  maxLength={MAX_RULE_NAME}
                  onChange={event => change({ ...draft, name: event.target.value })}
                  placeholder="e.g. Bugs start as high priority"
                  aria-invalid={Boolean(errors?.name)}
                  aria-describedby={errors?.name ? fieldMessageId(`${uid}-name`) : undefined}
                  className={CONTROL}
                />
              </Field>
              <Field label="Applies to" htmlFor={`${uid}-project`}>
                <OptionSelect
                  id={`${uid}-project`}
                  aria-label="Applies to"
                  value={draft.project || ALL_PROJECTS}
                  options={projectOptions}
                  onChange={next => change({ ...draft, project: next === ALL_PROJECTS ? '' : next })}
                  className={SELECT}
                />
              </Field>
            </div>

            <section aria-labelledby={`${uid}-when`} className="space-y-3">
              <h3 id={`${uid}-when`} className="text-xs font-semibold uppercase tracking-wide text-slate-600">When</h3>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="sm:w-1/2">
                  <OptionSelect
                    id={`${uid}-trigger`}
                    aria-label="Trigger"
                    value={draft.trigger.type}
                    options={TRIGGER_OPTIONS}
                    onChange={(type: TriggerType) => change({ ...draft, trigger: { type, to: '' } })}
                    className={SELECT}
                  />
                </div>
                {triggerKind && (
                  <ValueField
                    id={`${uid}-trigger-to`}
                    label={triggerKind === 'label' ? 'Label added' : triggerKind === 'status' ? 'New status' : 'New priority'}
                    kind={triggerKind}
                    value={draft.trigger.to}
                    members={members}
                    allowAny
                    error={errors?.trigger}
                    onChange={to => change({ ...draft, trigger: { ...draft.trigger, to } })}
                  />
                )}
              </div>
            </section>

            <section aria-labelledby={`${uid}-if`} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 id={`${uid}-if`} className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  If <span className="font-normal normal-case tracking-normal">(all must match, optional)</span>
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  disabled={draft.conditions.length >= MAX_CONDITIONS}
                  onClick={() => change({ ...draft, conditions: [...draft.conditions, newConditionRow()] })}
                  className="h-10 gap-1.5 px-3 text-sm md:h-8"
                >
                  <Plus aria-hidden />Add condition
                </Button>
              </div>
              {draft.conditions.length === 0 && <p className="text-sm text-slate-600">No conditions: the rule runs every time.</p>}
              <ul className="space-y-3">
                {draft.conditions.map((row, index) => {
                  const config = CONDITION_OPTIONS[row.field];
                  const rowId = `${uid}-cond-${row.key}`;
                  return (
                    <li key={row.key}>
                      <div role="group" aria-label={`Condition ${index + 1}`} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                        <div className="sm:w-32">
                          <OptionSelect
                            aria-label={`Condition ${index + 1} field`}
                            value={row.field}
                            options={Object.entries(CONDITION_OPTIONS).map(([value, item]) => ({ value: value as ConditionField, label: item.label }))}
                            onChange={(field: ConditionField) => setCondition(row.key, () => ({ ...newConditionRow(field), key: row.key }))}
                            className={SELECT}
                          />
                        </div>
                        <div className="sm:w-36">
                          <OptionSelect
                            aria-label={`Condition ${index + 1} operator`}
                            value={row.op}
                            options={config.ops}
                            onChange={op => setCondition(row.key, current => ({ ...current, op }))}
                            className={SELECT}
                          />
                        </div>
                        {config.valueKind && (
                          <ValueField
                            id={rowId}
                            label={`Condition ${index + 1} value`}
                            kind={config.valueKind}
                            value={row.value}
                            members={members}
                            error={errors?.conditions[index]}
                            onChange={value => setCondition(row.key, current => ({ ...current, value }))}
                          />
                        )}
                        <RemoveButton
                          label={`Remove condition ${index + 1}`}
                          onClick={() => change({ ...draft, conditions: draft.conditions.filter(item => item.key !== row.key) })}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-labelledby={`${uid}-then`} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 id={`${uid}-then`} className="text-xs font-semibold uppercase tracking-wide text-slate-600">Then</h3>
                <Button
                  type="button"
                  variant="outline"
                  disabled={draft.actions.length >= MAX_ACTIONS}
                  onClick={() => change({ ...draft, actions: [...draft.actions, newActionRow()] })}
                  className="h-10 gap-1.5 px-3 text-sm md:h-8"
                >
                  <Plus aria-hidden />Add action
                </Button>
              </div>
              {errors?.form && <p role="alert" className="text-sm text-danger-fg">{errors.form}</p>}
              <ul className="space-y-3">
                {draft.actions.map((row, index) => {
                  const kind = actionValueKind(row.type);
                  const rowId = `${uid}-act-${row.key}`;
                  return (
                    <li key={row.key}>
                      <div role="group" aria-label={`Action ${index + 1}`} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                        <div className="sm:w-64">
                          <OptionSelect
                            aria-label={`Action ${index + 1} type`}
                            value={row.type}
                            options={ACTION_OPTIONS}
                            onChange={(type: ActionType) => setAction(row.key, () => ({ key: row.key, type, value: defaultValueFor(actionValueKind(type)) }))}
                            className={SELECT}
                          />
                        </div>
                        {kind && (
                          <ValueField
                            id={rowId}
                            label={`Action ${index + 1} value`}
                            kind={kind}
                            value={row.value}
                            members={members}
                            error={errors?.actions[index]}
                            onChange={value => setAction(row.key, current => ({ ...current, value }))}
                          />
                        )}
                        <RemoveButton
                          label={`Remove action ${index + 1}`}
                          onClick={() => change({ ...draft, actions: draft.actions.filter(item => item.key !== row.key) })}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">In words</p>
              <p aria-live="polite" className="mt-1 text-sm text-slate-800">{sentence}</p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
            <Button type="button" variant="outline" onClick={onClose} className="h-11 sm:h-9">Cancel</Button>
            <Button type="submit" disabled={saving} className="h-11 sm:h-9">{saving ? 'Saving…' : 'Save rule'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
