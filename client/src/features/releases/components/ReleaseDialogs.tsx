import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { toast } from '@/components/ds';
import { suggestReleaseDates, suggestReleaseName } from '../lib/progress';
import type { MoveOpenTo, Release, ReleaseInput, ReleasePatch } from '../types';
import ReleaseFormDialog from './ReleaseFormDialog';
import ReleaseNowDialog from './ReleaseNowDialog';

export type ReleaseDialogState =
  | { kind: 'create' }
  | { kind: 'edit' | 'release' | 'delete'; release: Release }
  | null;

export interface ReleaseActions {
  create: (input: ReleaseInput) => Promise<unknown>;
  update: (id: string, patch: ReleasePatch) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  release: (id: string, moveOpenTo?: MoveOpenTo) => Promise<{ movedTasks: number }>;
}

interface ReleaseDialogsProps {
  dialog: ReleaseDialogState;
  onClose: () => void;
  projectId: string;
  /** Every release of the workspace; the project's unreleased ones are offered as move targets. */
  releases: Release[];
  actions: ReleaseActions;
  /** Called after a change was saved (the page reloads what depends on it). */
  onDone?: (kind: 'create' | 'edit' | 'release' | 'delete') => void;
}

/** Create / edit / release / delete dialogs of a release, shared by the project tab and the release page. */
const ReleaseDialogs = ({ dialog, onClose, projectId, releases, actions, onDone }: ReleaseDialogsProps) => {
  const { t } = useTranslation('projects');
  const [deleting, setDeleting] = useState(false);
  const closeIf = (open: boolean) => { if (!open) onClose(); };
  const ofProject = releases.filter(item => item.project === projectId);

  const confirmDelete = async (release: Release) => {
    setDeleting(true);
    try {
      await actions.remove(release._id);
      toast.success(t('releases.deleted', { name: release.name }));
      onClose();
      onDone?.('delete');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('releases.deleteError'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {dialog?.kind === 'create' && (
        <ReleaseFormDialog
          key="new"
          open
          onOpenChange={closeIf}
          defaults={{ name: suggestReleaseName(ofProject), ...suggestReleaseDates() }}
          onSubmit={async values => {
            await actions.create({ project: projectId, ...values });
            toast.success(t('releases.created'));
            onDone?.('create');
          }}
        />
      )}

      {dialog?.kind === 'edit' && (
        <ReleaseFormDialog
          key={dialog.release._id}
          open
          onOpenChange={closeIf}
          release={dialog.release}
          onSubmit={async values => {
            await actions.update(dialog.release._id, values);
            toast.success(t('releases.saved'));
            onDone?.('edit');
          }}
        />
      )}

      {dialog?.kind === 'release' && (
        <ReleaseNowDialog
          key={dialog.release._id}
          open
          onOpenChange={closeIf}
          release={dialog.release}
          targets={ofProject.filter(item => item.status === 'unreleased' && item._id !== dialog.release._id)}
          onConfirm={async moveOpenTo => {
            const { movedTasks } = await actions.release(dialog.release._id, moveOpenTo);
            toast.success(movedTasks > 0
              ? t('releases.releasedMoved', { name: dialog.release.name, count: movedTasks })
              : t('releases.released', { name: dialog.release.name }));
            onDone?.('release');
          }}
        />
      )}

      <ConfirmActionDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={open => !open && !deleting && onClose()}
        title={t('releases.deleteTitle', { name: dialog?.kind === 'delete' ? dialog.release.name : '' })}
        description={t('releases.deleteBody')}
        confirmLabel={t('releases.deleteConfirm')}
        busyLabel={t('releases.deleting')}
        busy={deleting}
        onConfirm={() => { if (dialog?.kind === 'delete') void confirmDelete(dialog.release); }}
      />
    </>
  );
};

export default ReleaseDialogs;
