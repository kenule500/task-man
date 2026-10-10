import { useState } from 'react';
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
  const [deleting, setDeleting] = useState(false);
  const closeIf = (open: boolean) => { if (!open) onClose(); };
  const ofProject = releases.filter(item => item.project === projectId);

  const confirmDelete = async (release: Release) => {
    setDeleting(true);
    try {
      await actions.remove(release._id);
      toast.success(`${release.name} deleted`);
      onClose();
      onDone?.('delete');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the release.');
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
            toast.success('Release created');
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
            toast.success('Release saved');
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
              ? `${dialog.release.name} released. ${movedTasks} unfinished ${movedTasks === 1 ? 'task' : 'tasks'} moved.`
              : `${dialog.release.name} released.`);
            onDone?.('release');
          }}
        />
      )}

      <ConfirmActionDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={open => !open && !deleting && onClose()}
        title={`Delete "${dialog?.kind === 'delete' ? dialog.release.name : ''}"?`}
        description="The release is deleted. Its tasks stay in the project without a release."
        confirmLabel="Delete release"
        busyLabel="Deleting..."
        busy={deleting}
        onConfirm={() => { if (dialog?.kind === 'delete') void confirmDelete(dialog.release); }}
      />
    </>
  );
};

export default ReleaseDialogs;
