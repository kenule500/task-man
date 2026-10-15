import { useId } from 'react';
import { cn } from '@/lib/utils';

interface SelectFieldProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}

/** Labelled native select (the platform picker is best on phones); 44px tall on touch, compact from `md`. */
const SelectField = ({ label, value, onValueChange, options, className }: SelectFieldProps) => {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-slate-600">{label}</label>
      <select
        id={id}
        value={value}
        onChange={event => onValueChange(event.target.value)}
        className="h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-900 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:text-sm"
      >
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
};

export default SelectField;
