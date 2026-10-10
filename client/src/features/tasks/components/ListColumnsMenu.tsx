import { Columns3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ListColumn } from '../lib/listColumns';

interface ListColumnsMenuProps {
  /** Built-in optional columns. */
  builtIn: ListColumn[];
  /** One column per active custom field. */
  custom: ListColumn[];
  /** Ids of the columns on screen. */
  visible: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Back to the default columns. */
  onReset: () => void;
}

/** "Columns" menu of the list table header: switch optional and custom field columns on or off. */
const ListColumnsMenu = ({ builtIn, custom, visible, onToggle, onReset }: ListColumnsMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Columns"
          title="Choose columns"
          className="size-7 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
        />
      }
    >
      <Columns3 aria-hidden />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="max-h-[min(24rem,var(--available-height))] w-56 overflow-y-auto">
      <DropdownMenuGroup>
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        {builtIn.map(column => (
          <DropdownMenuCheckboxItem key={column.id} checked={visible.has(column.id)} onCheckedChange={() => onToggle(column.id)}>
            {column.menuLabel}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuGroup>
      {custom.length > 0 && (
        <>
          <DropdownMenuSeparator className="bg-slate-100" />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Custom fields</DropdownMenuLabel>
            {custom.map(column => (
              <DropdownMenuCheckboxItem key={column.id} checked={visible.has(column.id)} onCheckedChange={() => onToggle(column.id)}>
                <span className="truncate">{column.menuLabel}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        </>
      )}
      <DropdownMenuSeparator className="bg-slate-100" />
      <DropdownMenuItem onClick={onReset}>Reset to default</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default ListColumnsMenu;
