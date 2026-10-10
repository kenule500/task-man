import { useId, useState, type FormEvent } from 'react';
import { FilePlus } from 'lucide-react';
import FormDialog from '@/components/FormDialog';
import { Field, fieldMessageId } from '@/components/ds';
import { Input } from '@/components/ui/input';
import { MAX_PAGE_TITLE } from '../types';

interface NewPageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title of the page the new one goes under; undefined = top level. */
  parentTitle?: string;
  /** Creates the page; throws a readable Error to show it in the dialog. */
  onCreate: (title: string) => Promise<void>;
}

/** Asks for a title, then creates the page (the caller opens it in the editor). */
const NewPageDialog = ({ open, onOpenChange, parentTitle, onCreate }: NewPageDialogProps) => {
  const id = useId();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const changeOpen = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setTitle('');
      setError('');
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Give the page a title.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onCreate(trimmed);
      changeOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not create the page. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={changeOpen}
      icon={<FilePlus />}
      title={parentTitle ? 'New subpage' : 'New page'}
      description={parentTitle ? `It will sit under "${parentTitle}".` : 'Give it a title; you can write the content next.'}
      onSubmit={event => { void submit(event); }}
      submitLabel="Create page"
      submittingLabel="Creating"
      submitting={saving}
    >
      <Field label="Title" htmlFor={`${id}-title`} required error={error || undefined}>
        <Input
          id={`${id}-title`}
          autoFocus
          value={title}
          maxLength={MAX_PAGE_TITLE}
          onChange={event => { setTitle(event.target.value); setError(''); }}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={fieldMessageId(`${id}-title`)}
          className="h-11 text-base md:h-9 md:text-sm"
        />
      </Field>
    </FormDialog>
  );
};

export default NewPageDialog;
