import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { visibleRows } from '../lib/tree';
import type { WikiPageSummary } from '../types';

interface WikiTreeProps {
  pages: readonly WikiPageSummary[];
  selectedId?: string;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}

/**
 * The page tree as an ARIA tree: one tab stop, arrows move (Right opens or enters, Left closes or goes to the parent),
 * Home/End jump, Enter or Space opens the page.
 */
const WikiTree = ({ pages, selectedId, expanded, onToggle, onSelect }: WikiTreeProps) => {
  const rows = useMemo(() => visibleRows(pages, expanded), [pages, expanded]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLLIElement>());
  // Focus follows the arrows; it is applied after the row exists
  const pendingFocus = useRef<string | null>(null);

  const tabbableId = rows.some(row => row.page._id === focusId)
    ? focusId
    : rows.some(row => row.page._id === selectedId) ? selectedId : rows[0]?.page._id;

  useEffect(() => {
    if (pendingFocus.current) {
      refs.current.get(pendingFocus.current)?.focus();
      pendingFocus.current = null;
    }
  });

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    pendingFocus.current = id;
    setFocusId(id);
    refs.current.get(id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>, index: number) => {
    const row = rows[index];
    switch (event.key) {
      case 'ArrowDown': focusRow(rows[index + 1]?.page._id); break;
      case 'ArrowUp': focusRow(rows[index - 1]?.page._id); break;
      case 'Home': focusRow(rows[0]?.page._id); break;
      case 'End': focusRow(rows[rows.length - 1]?.page._id); break;
      case 'ArrowRight':
        if (row.hasChildren && !row.expanded) onToggle(row.page._id);
        else if (row.expanded) focusRow(rows[index + 1]?.page._id);
        break;
      case 'ArrowLeft':
        if (row.expanded) onToggle(row.page._id);
        else if (row.page.parent) focusRow(row.page.parent);
        break;
      case 'Enter':
      case ' ':
        onSelect(row.page._id);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <ul role="tree" aria-label="Wiki pages" className="space-y-0.5">
      {rows.map((row, index) => {
        const selected = row.page._id === selectedId;
        return (
          <li
            key={row.page._id}
            role="treeitem"
            aria-level={row.depth + 1}
            aria-posinset={row.posInSet}
            aria-setsize={row.setSize}
            aria-expanded={row.hasChildren ? row.expanded : undefined}
            aria-selected={selected}
            aria-current={selected ? 'page' : undefined}
            tabIndex={row.page._id === tabbableId ? 0 : -1}
            ref={node => {
              if (node) refs.current.set(row.page._id, node);
              else refs.current.delete(row.page._id);
            }}
            onFocus={event => { if (event.target === event.currentTarget) setFocusId(row.page._id); }}
            onKeyDown={event => { if (event.target === event.currentTarget) onKeyDown(event, index); }}
            onClick={() => onSelect(row.page._id)}
            style={{ paddingLeft: `${row.depth * 16 + 4}px` }}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-1 rounded-lg pr-2 text-sm outline-none md:min-h-9',
              'focus-visible:outline-2 focus-visible:outline-focus',
              selected ? 'bg-info-bg font-semibold text-info-fg' : 'text-text-body hover:bg-surface-sunken',
            )}
          >
            <span
              aria-hidden
              onClick={event => {
                if (!row.hasChildren) return;
                event.stopPropagation();
                onToggle(row.page._id);
              }}
              className={cn('flex size-8 shrink-0 items-center justify-center rounded-md text-text-subtle md:size-6', row.hasChildren && 'hover:bg-slate-200')}
            >
              {row.hasChildren && (
                <ChevronRight className={cn('size-4 transition-transform duration-150', row.expanded && 'rotate-90')} />
              )}
            </span>
            <FileText aria-hidden className="size-4 shrink-0 text-text-subtle" />
            <span className="min-w-0 flex-1 truncate">{row.page.title}</span>
            {row.page.archived && <span className="shrink-0 text-xs text-text-subtle">Archived</span>}
          </li>
        );
      })}
    </ul>
  );
};

export default WikiTree;
