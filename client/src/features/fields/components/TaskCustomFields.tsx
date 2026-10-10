import { useId, useMemo, useState } from 'react';
import { toast } from '@/components/ds';
import { getApiErrorMessage } from '@/utils/api';
import { useCustomFields } from '../hooks/useCustomFields';
import { useFieldMembers, type FieldMember } from '../hooks/useFieldMembers';
import { fieldsForProject } from '../lib/fields';
import type { CustomField, CustomValue, CustomValues, CustomValuesInput } from '../types';
import CustomFieldInput from './CustomFieldInput';
import CustomFieldValue from './CustomFieldValue';

interface TaskCustomFieldsProps {
  /** The task's project and current values. */
  task: { project?: string; custom?: CustomValues };
  workspaceSlug: string | undefined;
  /** Holds `tasks:write`: fields are editable. Read-only values otherwise. */
  canWrite: boolean;
  /** Saves a change; resolves to null (or rejects) when it failed. */
  onChange: (custom: CustomValuesInput) => Promise<unknown> | void;
}

interface RowProps {
  field: CustomField;
  value: CustomValue | undefined;
  canWrite: boolean;
  members: FieldMember[];
  membersLoading: boolean;
  nameOf: (id: string) => string | undefined;
  onSave: (field: CustomField, value: CustomValue | null) => Promise<boolean>;
}

const FieldRow = ({ field, value, canWrite, members, membersLoading, nameOf, onSave }: RowProps) => {
  const id = useId();
  // What the person just chose, until the saved task comes back
  const [pending, setPending] = useState<{ value: CustomValue | null } | null>(null);
  const shown = pending ? pending.value : value;

  const commit = async (next: CustomValue | null) => {
    setPending({ value: next });
    const ok = await onSave(field, next);
    // Saved: the task now carries the value. Failed: fall back to the task's value.
    setPending(null);
    return ok;
  };

  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium uppercase tracking-wide text-slate-500">
        {field.name}
        {field.required && <span aria-hidden className="text-danger-fg"> *</span>}
      </label>
      {canWrite ? (
        <CustomFieldInput
          id={id}
          field={field}
          value={shown}
          onChange={() => undefined}
          onCommit={next => { void commit(next); }}
          members={members}
          membersLoading={membersLoading}
        />
      ) : (
        <div id={id}><CustomFieldValue field={field} value={shown} userName={nameOf} /></div>
      )}
    </div>
  );
};

/**
 * "Fields" section of the task dialog: the custom fields that apply to the task's project, edited in place.
 * Renders nothing when the workspace has none.
 */
const TaskCustomFields = ({ task, workspaceSlug, canWrite, onChange }: TaskCustomFieldsProps) => {
  const { active } = useCustomFields(workspaceSlug);
  const applicable = useMemo(() => fieldsForProject(active, task.project), [active, task.project]);
  const { members, loading, nameOf } = useFieldMembers(workspaceSlug, applicable.some(field => field.type === 'user'));

  if (applicable.length === 0) return null;

  const save = async (field: CustomField, value: CustomValue | null): Promise<boolean> => {
    try {
      const result = await onChange({ [field.key]: value });
      if (result === null) {
        toast.error(`Could not save ${field.name}. Try again.`);
        return false;
      }
      return true;
    } catch (err) {
      toast.error(getApiErrorMessage(err, `Could not save ${field.name}.`));
      return false;
    }
  };

  return (
    <section aria-label="Fields">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Fields</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {applicable.map(field => (
          <FieldRow
            key={field._id}
            field={field}
            value={task.custom?.[field.key]}
            canWrite={canWrite}
            members={members}
            membersLoading={loading}
            nameOf={nameOf}
            onSave={save}
          />
        ))}
      </div>
    </section>
  );
};

export default TaskCustomFields;
