import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Spinner } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface QuickAddProps {
  /** Accessible name and placeholder, e.g. "Add a story to the backlog…" */
  label: string;
  /** Creates the item; may reject (the caller shows the error). The title is kept when it rejects. */
  onAdd: (title: string) => Promise<unknown>;
}

/** One-line input that creates an item on Enter, keeping focus for fast entry. */
const QuickAdd = ({ label, onAdd }: QuickAddProps) => {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onAdd(trimmed);
      setTitle('');
    } catch {
      // The caller reports the failure; keep the text so nothing is lost
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2 border-b border-slate-100 p-2 sm:px-4">
      <Input
        value={title}
        onChange={event => setTitle(event.target.value)}
        placeholder={label}
        aria-label={label}
        maxLength={140}
        className="h-11 flex-1 rounded-lg border-slate-200 bg-white text-base shadow-none sm:h-9 sm:text-sm"
      />
      <Button
        type="submit"
        disabled={busy || !title.trim()}
        aria-label="Add"
        className="h-11 shrink-0 gap-1.5 rounded-lg bg-primary px-3 text-sm text-white hover:bg-primary-hover sm:h-9"
      >
        {busy ? <Spinner decorative /> : <Plus className="size-4" aria-hidden />}
        <span className="hidden sm:inline">Add</span>
      </Button>
    </form>
  );
};

export default QuickAdd;
