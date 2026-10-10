import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface MapOption {
  value: string;
  label: string;
}

export interface MapOptionGroup {
  label?: string;
  options: MapOption[];
}

interface MapSelectProps {
  value: string;
  groups: MapOptionGroup[];
  onChange: (value: string) => void;
  'aria-label': string;
  id?: string;
}

/** Compact single choice for the mapping tables (Base UI select; keyboard: arrows, type-ahead, Enter). */
export const MapSelect = ({ value, groups, onChange, id, ...rest }: MapSelectProps) => {
  const flat = groups.flatMap(group => group.options);
  return (
    <Select value={value} onValueChange={next => next && onChange(next)} items={flat}>
      <SelectTrigger id={id} aria-label={rest['aria-label']} className="h-11 w-full border-slate-200 bg-white text-sm text-slate-700 shadow-none sm:h-9">
        <SelectValue>{() => flat.find(option => option.value === value)?.label ?? 'Choose'}</SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {groups.map((group, index) => (
          <SelectGroup key={group.label ?? index}>
            {group.label && <SelectLabel>{group.label}</SelectLabel>}
            {group.options.map(option => (
              <SelectItem key={option.value} value={option.value} className="text-slate-700">{option.label}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
};
