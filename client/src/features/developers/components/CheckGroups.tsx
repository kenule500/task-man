import { Checkbox } from '@/components/ui/checkbox';

export interface CheckItem { key: string; label: string }
export interface CheckGroup { id: string; label: string; items: CheckItem[] }

interface CheckGroupsProps {
  groups: CheckGroup[];
  selected: string[];
  disabled?: boolean;
  /** Shows the key beside the label (scopes) */
  showKeys?: boolean;
  onChange: (selected: string[]) => void;
}

/** Checklist split into labelled fieldsets, each with a "Select all / Deselect all" shortcut. */
export const CheckGroups = ({ groups, selected, disabled, showKeys, onChange }: CheckGroupsProps) => {
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter(item => item !== key) : [...selected, key]);

  const toggleGroup = (group: CheckGroup) => {
    const keys = group.items.map(item => item.key);
    const all = keys.every(key => selected.includes(key));
    onChange(all ? selected.filter(key => !keys.includes(key)) : [...new Set([...selected, ...keys])]);
  };

  return (
    <div className="space-y-3">
      {groups.map(group => {
        const allSelected = group.items.every(item => selected.includes(item.key));
        return (
          <fieldset key={group.id} disabled={disabled} className="min-w-0 rounded-xl border border-slate-200 disabled:opacity-60">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-1.5">
              <legend className="float-left text-xs font-semibold uppercase tracking-wide text-slate-600">{group.label}</legend>
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggleGroup(group)}
                className="min-h-10 rounded-md px-2 text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary md:min-h-8"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
                <span className="sr-only"> {group.label}</span>
              </button>
            </div>
            <div className="px-4 py-1">
              {group.items.map(item => (
                <label key={item.key} className="flex min-h-10 cursor-pointer items-center gap-3 py-1">
                  <Checkbox checked={selected.includes(item.key)} onCheckedChange={() => toggle(item.key)} />
                  <span className="min-w-0 flex-1 text-sm text-slate-700">{item.label}</span>
                  {showKeys && <code className="hidden font-mono text-[11px] text-slate-600 sm:block">{item.key}</code>}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
};
