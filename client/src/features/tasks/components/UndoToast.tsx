import { Trash2, Undo2 } from 'lucide-react';

interface UndoToastProps {
  items: { id: string; title: string }[];
  onUndo: (id: string) => void;
}

const UndoToast = ({ items, onUndo }: UndoToastProps) => {
  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[calc(100%-2.5rem)] max-w-sm">
      {items.map(item => (
        <div
          key={item.id}
          role="status"
          className="flex items-center justify-between gap-3 bg-slate-900 text-white rounded-xl shadow-lg px-4 py-3"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Trash2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <p className="text-sm truncate">
              Deleted <span className="font-medium">{item.title}</span>
            </p>
          </div>
          <button
            onClick={() => onUndo(item.id)}
            className="flex items-center gap-1 text-sm font-semibold text-blue-300 hover:text-blue-200 flex-shrink-0"
          >
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </button>
        </div>
      ))}
    </div>
  );
};

export default UndoToast;
