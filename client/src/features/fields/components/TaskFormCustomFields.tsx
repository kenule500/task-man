import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Label } from '@/components/ui/label';
import { useCustomFields } from '../hooks/useCustomFields';
import { useFieldMembers } from '../hooks/useFieldMembers';
import { fieldsForProject } from '../lib/fields';
import type { CustomValue, CustomValues } from '../types';
import CustomFieldInput from './CustomFieldInput';

interface TaskFormCustomFieldsProps {
  /** Defaults to the workspace of the route. */
  workspaceSlug?: string;
  /** Project chosen in the form: only the fields that apply to it are shown. */
  project: string;
  values: CustomValues;
  onChange: (key: string, value: CustomValue | null) => void;
  /** Problem text by field key (a required field left empty). */
  errors?: Record<string, string>;
}

/** Custom fields inside the task form. Renders nothing when no field applies to the project. */
const TaskFormCustomFields = ({ workspaceSlug, project, values, onChange, errors = {} }: TaskFormCustomFieldsProps) => {
  const routeSlug = useParams().workspaceSlug;
  const slug = workspaceSlug ?? routeSlug;
  const { active } = useCustomFields(slug);
  const applicable = useMemo(() => fieldsForProject(active, project.trim()), [active, project]);
  const { members, loading } = useFieldMembers(slug, applicable.some(field => field.type === 'user'));

  if (applicable.length === 0) return null;

  return (
    <fieldset className="space-y-4 rounded-lg border border-slate-200 p-3 sm:p-4">
      <legend className="px-1 text-sm font-medium text-slate-700">Fields</legend>
      {applicable.map(field => {
        const inputId = `task-field-${field.key}`;
        const errorId = `${inputId}-error`;
        return (
          <div key={field._id} className="space-y-1.5">
            <Label htmlFor={inputId} className="text-sm font-medium text-slate-700">
              {field.name}
              {field.required && field.type !== 'checkbox' && <span className="text-danger-fg"> *</span>}
            </Label>
            <CustomFieldInput
              id={inputId}
              field={field}
              value={values[field.key]}
              onChange={next => onChange(field.key, next)}
              members={members}
              membersLoading={loading}
              invalid={Boolean(errors[field.key])}
              aria-describedby={errors[field.key] ? errorId : undefined}
            />
            {errors[field.key] && <p id={errorId} role="alert" className="text-xs text-danger-fg">{errors[field.key]}</p>}
          </div>
        );
      })}
    </fieldset>
  );
};

export default TaskFormCustomFields;
