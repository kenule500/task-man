import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Alert, Field, fieldMessageId, PageHeader, SectionHeader, Surface } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getApiErrorMessage } from '@/utils/api';
import { canManageWorkspace, useWorkspaceData, workspaceApi } from '@/features/workspace';

const INPUT = 'h-11 bg-white border border-gray-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-gray-400 focus-visible:ring-0 shadow-none outline-none';

interface FeedbackMessage {
  type: 'success' | 'error';
  text: string;
}

const Feedback = ({ message }: { message: FeedbackMessage | null }) =>
  message ? <Alert tone={message.type}>{message.text}</Alert> : null;

const WorkspaceSettingsPage = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { workspace, setWorkspace, members, loading, error } = useWorkspaceData(workspaceSlug);

  // `null` means "not edited yet": show the saved name
  const [draftName, setDraftName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<FeedbackMessage | null>(null);

  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<FeedbackMessage | null>(null);

  const name = draftName ?? workspace?.name ?? '';
  const unchanged = name.trim() === (workspace?.name ?? '');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceSlug || !name.trim() || unchanged) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const updated = await workspaceApi.update(workspaceSlug, { name: name.trim() });
      setWorkspace(current => (current ? { ...current, name: updated.name } : updated));
      setDraftName(null);
      setSaveMessage({ type: 'success', text: 'Workspace name updated.' });
    } catch (err) {
      setSaveMessage({ type: 'error', text: getApiErrorMessage(err, 'Failed to update the workspace.') });
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!workspaceSlug) return;
    setRegenerating(true);
    setInviteMessage(null);
    try {
      const { inviteCode } = await workspaceApi.regenerateInvite(workspaceSlug);
      setWorkspace(current => (current ? { ...current, inviteCode } : current));
      setInviteMessage({ type: 'success', text: 'Invite code regenerated. The previous code no longer works.' });
    } catch (err) {
      setInviteMessage({ type: 'error', text: getApiErrorMessage(err, 'Failed to regenerate the invite code.') });
    } finally {
      setRegenerating(false);
      setConfirmingRegenerate(false);
    }
  };

  return (
    <AppShell>
      {user => {
        const canManage = canManageWorkspace(members, user._id);

        return (
          <div className="max-w-2xl space-y-6">
            <PageHeader title="Workspace Settings" description="Manage the name and invite code of this workspace" />

            {loading ? (
              <div className="space-y-6" aria-busy="true" aria-label="Loading settings">
                {[1, 2].map(i => (
                  <Surface key={i} className="space-y-4 sm:p-6">
                    <Skeleton className="h-4 w-40 bg-slate-200" />
                    <Skeleton className="h-11 w-full bg-slate-200" />
                  </Surface>
                ))}
              </div>
            ) : error || !workspace ? (
              <Alert tone="error">{error || 'Workspace not found.'}</Alert>
            ) : (
              <>
                {!canManage && <Alert tone="info">Only workspace owners and admins can change these settings.</Alert>}

                <Surface as="section" aria-labelledby="general-heading" className="sm:p-6">
                  <SectionHeader title={<span id="general-heading">General</span>} />
                  <form onSubmit={handleSave} className="space-y-4">
                    <Field
                      label="Workspace name"
                      htmlFor="workspace-name"
                      hint={<>The URL slug <code className="font-mono">{workspace.slug}</code> does not change when you rename.</>}
                    >
                      <Input
                        id="workspace-name"
                        value={name}
                        onChange={e => setDraftName(e.target.value)}
                        maxLength={60}
                        readOnly={!canManage}
                        required
                        aria-describedby={fieldMessageId('workspace-name')}
                        className={INPUT}
                      />
                    </Field>
                    <Feedback message={saveMessage} />
                    {canManage && (
                      <Button
                        type="submit"
                        disabled={saving || !name.trim() || unchanged}
                        className="h-10 w-full rounded-lg bg-primary px-5 text-sm font-medium text-white shadow-sm hover:bg-primary-hover sm:w-auto"
                      >
                        {saving ? 'Saving...' : 'Save changes'}
                      </Button>
                    )}
                  </form>
                </Surface>

                <Surface as="section" aria-labelledby="invite-heading" className="sm:p-6">
                  <SectionHeader className="mb-1" title={<span id="invite-heading">Invite code</span>} />
                  <p className="mb-4 text-xs text-slate-500">
                    Teammates join with this code. Regenerating it invalidates the old code and links.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <code className="break-all rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-center font-mono text-sm font-semibold tracking-wider text-slate-700 sm:text-left">
                      {workspace.inviteCode}
                    </code>
                    {canManage && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setConfirmingRegenerate(true)}
                        className="h-10 gap-2 rounded-lg border-gray-300 text-sm text-slate-700 shadow-none hover:bg-gray-100"
                      >
                        <KeyRound className="w-4 h-4" /> Regenerate invite code
                      </Button>
                    )}
                  </div>
                  {inviteMessage && <div className="mt-4"><Feedback message={inviteMessage} /></div>}
                </Surface>
              </>
            )}

            <AlertDialog open={confirmingRegenerate} onOpenChange={open => !open && setConfirmingRegenerate(false)}>
              <AlertDialogContent className="bg-white border border-gray-200 shadow-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-base font-bold text-slate-900">Regenerate the invite code?</AlertDialogTitle>
                  <AlertDialogDescription className="text-sm text-slate-500">
                    The current code and any shared invite links stop working immediately. Existing members keep their access.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="bg-gray-50 border-t border-gray-200">
                  <AlertDialogCancel className="border-gray-300 text-slate-700 hover:bg-gray-100">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    {regenerating ? 'Regenerating...' : 'Regenerate code'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      }}
    </AppShell>
  );
};

export default WorkspaceSettingsPage;
