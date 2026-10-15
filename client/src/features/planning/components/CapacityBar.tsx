import { describeLoad, type WorkloadRow } from '../lib/workload';

interface CapacityBarProps {
  row: WorkloadRow;
  capacity: number;
  /** Rows without a capacity (unassigned work) draw the bar but never flag it. */
  showCapacity?: boolean;
}

/**
 * Stacked bar of a person's points by status. The track covers the larger of capacity and load, so work above
 * capacity visibly runs past the capacity marker. One image for assistive technology, with its numbers in the label.
 */
const CapacityBar = ({ row, capacity, showCapacity = true }: CapacityBarProps) => {
  const scale = Math.max(capacity, row.points.total, 1);
  const width = (points: number) => `${(points / scale) * 100}%`;

  return (
    <div
      role="img"
      aria-label={showCapacity ? describeLoad(row, capacity) : `${row.points.total} points, ${row.items.total} ${row.items.total === 1 ? 'item' : 'items'}`}
      className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100"
    >
      <div className="flex h-full">
        <span className="h-full bg-success-dot" style={{ width: width(row.points.completed) }} />
        <span className="h-full bg-primary" style={{ width: width(row.points['in-progress']) }} />
        <span className="h-full bg-slate-400" style={{ width: width(row.points.pending) }} />
      </div>
      {showCapacity && row.points.total > capacity && (
        <span
          aria-hidden
          className="absolute inset-y-0 w-0.5 bg-slate-900"
          style={{ left: `${(capacity / scale) * 100}%` }}
        />
      )}
    </div>
  );
};

export default CapacityBar;
