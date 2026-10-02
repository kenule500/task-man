import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Check, Info, KeyRound } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { getApiErrorMessage } from '@/utils/api';
import { canManageWorkspace, useWorkspaceData, workspaceApi } from '@/features/workspace';

const CARD = 'bg-white rounded-2xl border border-slate-100 shadow-sm p-6';
const INPUT = 'h-11 bg-white border border-gray-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-gray-400 focus-visible:ring-0 shadow-none outline-none';

interface FeedbackMessage {
  type: 'success' | 'error';
  text: string;
}

const Feedback = ({ message }: { message: FeedbackMessage | null }) => {
  if (!message) return null;
  const isError = message.type === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={isError
        ? 'flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3'
        : 'flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-3'}
    >
      {isError ? <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />}
      <span>{message.text}</span>
    </div>
  );
};

const WorkspaceSettingsPage = () => {
  const { user, logout } = useAuthGuard();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { workspace, setWorkspace, members, loading, error } = useWorkspaceData(workspaceSlug);

  // `null` means "not edited yet": show the saved name
  const [draftName, setDraftName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<FeedbackMessage | null>(null);

  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<FeedbackMessage | null>(null);

  if (!user) return null;

  const canManage = canManageWorkspace(members, user._id);
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
    <Sidebar user={user} onLogout={logout}>
      <div className="space-y-6 max-w-2xl">
        <header>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Workspace Settings</h1>
          <p className="text-slate-500 text-sm mt-1">Manage the name and invite code of this workspace</p>
        </header>

        {loading ? (
          <div className="space-y-6" aria-busy="true" aria-label="Loading settings">
            {[1, 2].map(i => (
              <div key={i} className={`${CARD} animate-pulse`}>
                <div className="h-4 w-40 bg-slate-200 rounded mb-4"></div>
                <div className="h-11 w-full bg-slate-200 rounded"></div>
              </div>
            ))}
          </div>
        ) : error || !workspace ? (
          <div role="alert" className="flex items-start gap-2 p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {error || 'Workspace not found.'}
          </div>
        ) : (
          <>
            {!canManage && (
              <div className="flex items-start gap-2 text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg p-3">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Only workspace owners and admins can change these settings.</span>
              </div>
            )}

            <section aria-labelledby="general-heading" className={CARD}>
              <h2 id="general-heading" className="font-semibold text-slate-900 text-sm mb-4">General</h2>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="workspace-name" className="text-sm font-medium text-slate-700">Workspace name</Label>
                  <Input
                    id="workspace-name"
                    value={name}
                    onChange={e => setDraftName(e.target.value)}
                    maxLength={60}
                    readOnly={!canManage}
                    required
                    className={INPUT}
                  />
                  <p className="text-xs text-slate-400">
                    The URL slug <code className="font-mono">{workspace.slug}</code> does not change when you rename.
                  </p>
                </div>
                <Feedback message={saveMessage} />
                {canManage && (
                  <Button
                    type="submit"
                    disabled={saving || !name.trim() || unchanged}
                    className="rounded-lg bg-primary hover:bg-primary-hover text-white h-10 text-sm font-medium shadow-sm px-5"
                  >
                    {saving ? 'Saving...' : 'Save changes'}
                  </Button>
                )}
              </form>
            </section>

            <section aria-labelledby="invite-heading" className={CARD}>
              <h2 id="invite-heading" className="font-semibold text-slate-900 text-sm mb-1">Invite code</h2>
              <p className="text-xs text-slate-500 mb-4">
                Teammates join with this code. Regenerating it invalidates the old code and links.
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <code className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-mono font-semibold tracking-wider text-slate-700">
                  {workspace.inviteCode}
                </code>
                {canManage && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmingRegenerate(true)}
                    className="h-10 rounded-lg gap-2 border-gray-300 text-slate-700 hover:bg-gray-100 text-sm shadow-none"
                  >
                    <KeyRound className="w-4 h-4" /> Regenerate invite code
                  </Button>
                )}
              </div>
              {inviteMessage && <div className="mt-4"><Feedback message={inviteMessage} /></div>}
            </section>
          </>
        )}
      </div>

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
    </Sidebar>
  );
};

export default WorkspaceSettingsPage;
