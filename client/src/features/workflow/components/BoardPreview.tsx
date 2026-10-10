import { cn } from '@/lib/utils';
import { GROUP_LABEL, STAGE_COLOR_META } from '../lib/stages';
import type { WorkflowStage } from '../types';

/** The board as it will look: one column header per stage, in order, scrolling sideways when wide. */
export const BoardPreview = ({ stages, className }: { stages: readonly WorkflowStage[]; className?: string }) => (
  <div className={cn('overflow-x-auto pb-1', className)}>
    <ol
      aria-label="Board columns"
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(9rem, 1fr))` }}
    >
      {stages.map(stage => (
        <li key={stage.key} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
          <div className="flex items-center gap-2">
            <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', STAGE_COLOR_META[stage.color].dot)} />
            <span className="truncate text-sm font-semibold text-slate-700">{stage.name.trim() || 'Untitled'}</span>
            <span className="rounded-md border border-slate-200 bg-white px-1.5 text-xs font-medium tabular-nums text-slate-600">
              {stage.wipLimit > 0 ? `0 / ${stage.wipLimit}` : '0'}
              <span className="sr-only">{stage.wipLimit > 0 ? ` tasks, limit ${stage.wipLimit}` : ' tasks'}</span>
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-600">{GROUP_LABEL[stage.group]}</p>
          <div aria-hidden className="mt-2 h-10 rounded-lg border border-dashed border-slate-200" />
        </li>
      ))}
    </ol>
  </div>
);
