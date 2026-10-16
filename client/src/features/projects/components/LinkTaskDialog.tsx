import { useMemo, useState, type FormEvent } from 'react';
import { Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FormDialog from '@/components/FormDialog';
import { SearchInput } from '@/components/ds';
import { Checkbox } from '@/components/ui/checkbox';
import { TaskKey, getApiErrorMessage, type Task } from '@/features/tasks';

interface LinkTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  epic: Task;
  /** Top-level, non-epic tasks of the project that are not in this epic yet. */
  candidates: Task[];
  /** Title of each epic by id, to hint where a task is today. */
  epicTitles: ReadonlyMap<string, string>;
  /** Resolves when the tasks were linked; rejects with a message shown in the dialog. */
  onConfirm: (taskIds: string[]) => Promise<unknown>;
}

/** Searchable multi-select of the project's tasks to link to an epic. */
const LinkTaskDialog = ({ open, onOpenChange, epic, candidates, epicTitles, onConfirm }: LinkTaskDialogProps) => {
  const { t } = useTranslation('projects');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? candidates.filter(task => task.title.toLowerCase().includes(needle)) : candidates;
  }, [candidates, query]);

  const toggle = (id: string, checked: boolean) =>
    setSelected(current => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selected.size === 0) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(candidates.filter(task => selected.has(task._id)).map(task => task._id));
      onOpenChange(false);
    } catch (err) {
      setError(getApiErrorMessage(err, t('link.error')));
    } finally {
      setSubmitting(false);
    }
  };

  const count = selected.size;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Link2 />}
      title={t('link.title')}
      description={t('link.description', { title: epic.title })}
      onSubmit={handleSubmit}
      submitLabel={count > 0 ? t('link.submit', { count }) : t('link.submitNone')}
      submittingLabel={t('link.linking')}
      submitting={submitting}
      submitDisabled={count === 0}
      error={error}
      size="md"
    >
      {candidates.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-600">
          {t('link.allLinked')}
        </p>
      ) : (
        <>
          <SearchInput label={t('link.searchLabel')} placeholder={t('link.searchPlaceholder')} value={query} onValueChange={setQuery} />
          {visible.length === 0 ? (
            <p className="px-1 py-4 text-center text-sm text-slate-600">{t('link.noMatch', { query: query.trim() })}</p>
          ) : (
            <ul aria-label={t('link.listLabel')} className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              {visible.map(task => {
                const elsewhere = task.epic ? epicTitles.get(task.epic) : undefined;
                return (
                  <li key={task._id} className="border-b border-slate-100 last:border-b-0">
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5 text-sm text-slate-800 hover:bg-slate-50 md:min-h-10">
                      <Checkbox
                        checked={selected.has(task._id)}
                        onCheckedChange={checked => toggle(task._id, Boolean(checked))}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <TaskKey task={task} />
                          <span className="font-medium [overflow-wrap:anywhere]">{task.title}</span>
                        </span>
                        {elsewhere && <span className="block text-xs text-slate-600">{t('link.nowIn', { epic: elsewhere })}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </FormDialog>
  );
};

export default LinkTaskDialog;
