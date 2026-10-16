import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('admin');
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
        <PageHeader title={t('fields.title')} />
        <Surface className="mt-6">
          <EmptyState
            headingLevel="h2"
            icon={<ShieldAlert />}
            title={t('fields.restrictedTitle')}
            description={t('fields.restrictedBody')}
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
      toast.success(t('fields.saved'));
    } else {
      await create({
        name: draft.name.trim(),
        type: draft.type,
        projects: draft.projects,
        required: draft.required,
        ...(options.length > 0 ? { options } : {}),
      });
      toast.success(t('fields.created'));
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const ids = moveItem(fields, index, index + direction).map(field => field._id);
    void run(() => reorder(ids), t('fields.orderError'));
  };

  const toggleArchive = (field: CustomField) =>
    run(
      () => update(field._id, { archived: !field.archived }),
      field.archived ? t('fields.restoreError') : t('fields.archiveError'),
      field.archived ? t('fields.restored', { name: field.name }) : t('fields.archived', { name: field.name }),
    );

  const confirmDelete = async () => {
    const field = deleting;
    if (!field) return;
    setDeleting(null);
    await run(() => remove(field._id), t('fields.deleteError'), t('fields.deleted', { name: field.name }));
  };

  return (
    <div className="max-w-4xl space-y-5 pb-6">
      <Link
        to={`/${workspaceSlug}/settings`}
        className="inline-flex min-h-11 items-center gap-1 rounded text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary sm:min-h-0"
      >
        <ChevronLeft aria-hidden className="size-4 rtl:-scale-x-100" />
        {t('fields.back')}
      </Link>

      <PageHeader
        title={t('fields.title')}
        description={t('fields.description')}
        actions={(
          <Button
            type="button"
            disabled={!loaded || activeCount >= MAX_FIELDS}
            onClick={() => setEditing({ field: null })}
            className="h-11 gap-2 px-4 text-sm sm:h-10"
          >
            <Plus aria-hidden />
            {t('fields.newField')}
          </Button>
        )}
      />

      {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}

      {!loaded && !checked ? (
        <SkeletonList label={t('fields.loading')} rows={3} avatar={false} />
      ) : !loaded ? (
        <Surface>
          <ErrorState
            title={t('fields.loadFailed')}
            reason={t('workflow.noAnswer')}
            nextStep={t('workflow.checkConnection')}
            action={<Button type="button" onClick={() => { setChecked(false); void reload().finally(() => setChecked(true)); }} className="h-10 px-4 md:h-9">{t('actions.retry')}</Button>}
          />
        </Surface>
      ) : fields.length === 0 ? (
        <Surface>
          <EmptyState
            headingLevel="h2"
            icon={<TextCursorInput />}
            title={t('fields.emptyTitle')}
            description={t('fields.emptyBody')}
            action={<Button type="button" onClick={() => setEditing({ field: null })} className="h-10 gap-2 px-4"><Plus aria-hidden />{t('fields.newField')}</Button>}
          />
        </Surface>
      ) : (
        <Surface padding="md" className="space-y-4">
          <SectionHeader title={t('fields.fieldsHeading')} count={fields.length} />
          <ol className="space-y-3" aria-label={t('fields.fieldsList')}>
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
            <p role="status" className="text-sm text-slate-600">{t('fields.maxFields', { max: MAX_FIELDS })}</p>
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
        title={t('fields.deleteTitle')}
        description={(
          <>
            <span className="font-medium text-slate-900">{deleting?.name}</span>{t('fields.deleteBody')}
          </>
        )}
        confirmLabel={t('fields.deleteConfirm')}
        busy={busy}
        onConfirm={() => { void confirmDelete(); }}
      />
    </div>
  );
};

export default CustomFieldsPage;
