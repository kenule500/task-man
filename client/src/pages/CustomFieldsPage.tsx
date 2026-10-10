import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Plus, ShieldAlert, TextCursorInput } from 'lucide-react';
import {
  Alert, EmptyState, ErrorState, PageHeader, SectionHeader, SkeletonList, Surface, toast,
} from '@/components/ds';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/utils/api';
import { useProjectDirectory } from '@/features/projects/context/ProjectsContext';
import FieldDialog from '@/features/fields/components/FieldDialog';
import FieldListItem from '@/features/fields/components/FieldListItem';
import { useCustomFields } from '@/features/fields/hooks/useCustomFields';
import { MAX_FIELDS, moveItem, optionsPayload, type FieldDraft } from '@/features/fields/lib/fields';
import type { CustomField } from '@/features/fields/types';
import { usePermissions } from '../hooks/usePermissions';

type Editing = { field: CustomField | null } | null;

const CustomFieldsPage = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { can } = usePermissions();
  const allowed = can('settings:manage');
  const { projects } = useProjectDirectory();

  const { fields, loaded, reload, create, update, remove, reorder } = useCustomFields(allowed ? workspaceSlug : undefined);
  const [checked, setChecked] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<CustomField | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Always ask the API once: the shared cache may be older than the workspace
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void reload().finally(() => { if (!cancelled) setChecked(true); });
    return () => { cancelled = true; };
  }, [allowed, reload]);

  const activeCount = useMemo(() => fields.filter(field => !field.archived).length, [fields]);
  const projectNames = useMemo(
    () => projects.filter(project => !project.archived).map(project => project.name),
    [projects],
  );

  if (!allowed) {
    return (
      <div className="max-w-4xl">
        <PageHeader title="Custom fields" />
        <Surface className="mt-6">
          <EmptyState
            headingLevel="h2"
            icon={<ShieldAlert />}
            title="Only people who manage settings can edit custom fields"
            description="Ask an owner or admin of this workspace if you need a new field."
          />
        </Surface>
      </div>
    );
  }

  const run = async (action: () => Promise<unknown>, fallback: string, success?: string) => {
    setBusy(true);
    setError('');
    try {
      await action();
      if (success) toast.success(success);
    } catch (err) {
      setError(getApiErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const save = async (draft: FieldDraft) => {
    const options = optionsPayload(draft.options);
    if (editing?.field) {
      await update(editing.field._id, {
        name: draft.name.trim(),
        projects: draft.projects,
        required: draft.required,
        ...(editing.field.options.length > 0 || options.length > 0 ? { options } : {}),
      });
      toast.success('Field saved');
    } else {
      await create({
        name: draft.name.trim(),
        type: draft.type,
        projects: draft.projects,
        required: draft.required,
        ...(options.length > 0 ? { options } : {}),
      });
      toast.success('Field created');
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const ids = moveItem(fields, index, index + direction).map(field => field._id);
    void run(() => reorder(ids), 'We could not change the order. Try again.');
  };

  const toggleArchive = (field: CustomField) =>
    run(
      () => update(field._id, { archived: !field.archived }),
      field.archived ? 'We could not restore the field.' : 'We could not archive the field.',
      field.archived ? `${field.name} restored` : `${field.name} archived. Its values are kept.`,
    );

  const confirmDelete = async () => {
    const field = deleting;
    if (!field) return;
    setDeleting(null);
    await run(() => remove(field._id), 'We could not delete the field.', `${field.name} deleted`);
  };

  return (
    <div className="max-w-4xl space-y-5 pb-6">
      <Link
        to={`/${workspaceSlug}/settings`}
        className="inline-flex min-h-11 items-center gap-1 rounded text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary sm:min-h-0"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Workspace settings
      </Link>

      <PageHeader
        title="Custom fields"
        description="Extra information on tasks, such as a customer, a budget or a link. Fields can apply to every project or only to some."
        actions={(
          <Button
            type="button"
            disabled={!loaded || activeCount >= MAX_FIELDS}
            onClick={() => setEditing({ field: null })}
            className="h-11 gap-2 px-4 text-sm sm:h-10"
          >
            <Plus aria-hidden />
            New field
          </Button>
        )}
      />

      {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}

      {!loaded && !checked ? (
        <SkeletonList label="Loading custom fields" rows={3} avatar={false} />
      ) : !loaded ? (
        <Surface>
          <ErrorState
            title="Could not load the custom fields"
            reason="The server did not answer."
            nextStep="Check your connection and try again."
            action={<Button type="button" onClick={() => { setChecked(false); void reload().finally(() => setChecked(true)); }} className="h-10 px-4 md:h-9">Try again</Button>}
          />
        </Surface>
      ) : fields.length === 0 ? (
        <Surface>
          <EmptyState
            headingLevel="h2"
            icon={<TextCursorInput />}
            title="No custom fields yet"
            description="Add a field to track what your team needs beyond the built-in ones. It appears on the task form and the task details."
            action={<Button type="button" onClick={() => setEditing({ field: null })} className="h-10 gap-2 px-4"><Plus aria-hidden />New field</Button>}
          />
        </Surface>
      ) : (
        <Surface padding="md" className="space-y-4">
          <SectionHeader title="Fields" count={fields.length} />
          <ol className="space-y-3" aria-label="Custom fields">
            {fields.map((field, index) => (
              <FieldListItem
                key={field._id}
                field={field}
                index={index}
                total={fields.length}
                busy={busy}
                onMove={direction => move(index, direction)}
                onEdit={() => setEditing({ field })}
                onArchive={() => { void toggleArchive(field); }}
                onDelete={() => setDeleting(field)}
              />
            ))}
          </ol>
          {activeCount >= MAX_FIELDS && (
            <p role="status" className="text-sm text-slate-600">A workspace can have at most {MAX_FIELDS} active fields. Archive or delete one to add another.</p>
          )}
        </Surface>
      )}

      <FieldDialog
        open={editing !== null}
        field={editing?.field ?? null}
        projectNames={projectNames}
        onOpenChange={open => { if (!open) setEditing(null); }}
        onSave={save}
      />

      <ConfirmActionDialog
        open={deleting !== null}
        onOpenChange={open => { if (!open) setDeleting(null); }}
        title="Delete this field?"
        description={(
          <>
            <span className="font-medium text-slate-900">{deleting?.name}</span> and the values tasks hold for it will be removed
            for good. To keep the values and only hide the field, archive it instead.
          </>
        )}
        confirmLabel="Delete field"
        busy={busy}
        onConfirm={() => { void confirmDelete(); }}
      />
    </div>
  );
};

export default CustomFieldsPage;
