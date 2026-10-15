import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useCustomFields } from '../hooks/useCustomFields';
import { fieldsForProject, isEmptyValue, valueText } from '../lib/fields';
import type { CustomValues } from '../types';

interface TaskCustomChipsProps {
  task: { project?: string; custom?: CustomValues; assignees?: { _id: string; name: string }[] };
  /** Most chips shown; the rest are summed up as "+N". */
  max?: number;
  /** Field keys left out (a table column already shows them). */
  exclude?: readonly string[];
  className?: string;
}

/** Small "Field: value" chips of a task for lists and cards. Renders nothing when no field has a value. */
const TaskCustomChips = ({ task, max = 3, exclude, className }: TaskCustomChipsProps) => {
  const { active } = useCustomFields();
  const excluded = exclude?.join('|') ?? '';
  const custom = task.custom;

  const chips = useMemo(() => {
    if (!custom) return [];
    const known = new Map((task.assignees ?? []).map(user => [user._id, user.name]));
    const hidden = new Set(excluded ? excluded.split('|') : []);
    return fieldsForProject(active, task.project)
      .filter(field => !hidden.has(field.key))
      .filter(field => !isEmptyValue(custom[field.key]) && !(field.type === 'checkbox' && custom[field.key] !== true))
      // A person we cannot name is not worth a chip
      .filter(field => field.type !== 'user' || known.has(String(custom[field.key])))
      .map(field => ({
        key: field.key,
        name: field.name,
        text: field.type === 'checkbox' ? '' : valueText(field, custom[field.key], { userName: id => known.get(id) }),
      }));
  }, [active, custom, task.project, task.assignees, excluded]);

  if (chips.length === 0) return null;
  const shown = chips.slice(0, max);

  return (
    <ul aria-label="Custom fields" className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
      {shown.map(chip => (
        <li
          key={chip.key}
          title={chip.text ? `${chip.name}: ${chip.text}` : chip.name}
          className="inline-flex max-w-48 min-w-0 items-center gap-1 rounded bg-slate-100 px-1.5 text-xs text-slate-600"
        >
          <span className="shrink-0 font-medium">{chip.name}{chip.text && ':'}</span>
          {chip.text && <span className="truncate">{chip.text}</span>}
        </li>
      ))}
      {chips.length > shown.length && <li className="text-xs text-slate-600">+{chips.length - shown.length}</li>}
    </ul>
  );
};

export default TaskCustomChips;
