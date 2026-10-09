import { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, Plus, Pencil, Trash2, Lock, KeyRound } from 'lucide-react';
import {
  Alert,
  Field,
  PageHeader,
  SectionHeader,
  Surface,
} from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import RoleEditorModal from '../components/RoleEditorModal';
import { usePermissions } from '../hooks/usePermissions';
import { getApiErrorMessage } from '@/utils/api';
import { useWorkspaceData, workspaceApi } from '@/features/workspace';
import api from '../utils/api';

const INPUT =
  'h-11 bg-white border border-gray-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-gray-400 focus-visible:ring-0 shadow-none outline-none';

interface FeedbackMessage {
  type: 'success' | 'error';
  text: string;
}

interface Role {
  _id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  workspaceId: string | null;
}

const Feedback = ({ message }: { message: FeedbackMessage | null }) =>
  message ? <Alert tone={message.type}>{message.text}</Alert> : null;

const WorkspaceSettingsPage = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { can } = usePermissions();

  // Workspace data — provided by the other dev's hook
  const { workspace, setWorkspace, loading, error } =
  useWorkspaceData(workspaceSlug);

  const canManage = can('settings:manage');

  // ==================== Rename workspace state ====================
  const [draftName, setDraftName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<FeedbackMessage | null>(null);

  // ==================== Regenerate invite code state ====================
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<FeedbackMessage | null>(null);

  // ==================== Roles state ====================
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  const name = draftName ?? workspace?.name ?? '';
  const unchanged = name.trim() === (workspace?.name ?? '');

  // Fetch roles
  const fetchRoles = useCallback(async () => {
    if (!workspaceSlug) return;
    try {
      setRolesLoading(true);
      const response = await api.get(`/workspaces/${workspaceSlug}/roles`);
      setRoles(response.data || []);
    } catch (err) {
      console.error('Failed to load roles:', err);
    } finally {
      setRolesLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    (async () => {
      await fetchRoles();
    })();
  }, [fetchRoles]);

  // ==================== Handlers ====================

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceSlug || !name.trim() || unchanged) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const updated = await workspaceApi.update(workspaceSlug, { name: name.trim() });
      setWorkspace((current) =>
        current ? { ...current, name: updated.name } : updated
      );
      setDraftName(null);
      setSaveMessage({ type: 'success', text: 'Workspace name updated.' });
    } catch (err) {
      setSaveMessage({
        type: 'error',
        text: getApiErrorMessage(err, 'Failed to update the workspace.'),
      });
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
      setWorkspace((current) =>
        current ? { ...current, inviteCode } : current
      );
      setInviteMessage({
        type: 'success',
        text: 'Invite code regenerated. The previous code no longer works.',
      });
    } catch (err) {
      setInviteMessage({
        type: 'error',
        text: getApiErrorMessage(err, 'Failed to regenerate the invite code.'),
      });
    } finally {
      setRegenerating(false);
      setConfirmingRegenerate(false);
    }
  };

  const handleCreateRole = () => {
    setEditingRole(null);
    setEditorOpen(true);
  };

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    setEditorOpen(true);
  };

  const handleDeleteRole = async (role: Role) => {
    if (!window.confirm(`Delete the role "${role.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/workspaces/${workspaceSlug}/roles/${role._id}`);
      setRoles(roles.filter((r) => r._id !== role._id));
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      alert(axiosError.response?.data?.message || 'Failed to delete role');
    }
  };

  const systemRoles = roles.filter((r) => r.isSystem);
  const customRoles = roles.filter((r) => !r.isSystem);

  // ==================== Render ====================

  return (
    <div className="max-w-4xl space-y-6">

      <PageHeader
        title="Workspace Settings"
        description="Manage the name, invite code, and roles for this workspace."
      />

      {loading ? (
        <div className="space-y-6" aria-busy="true" aria-label="Loading settings">
          {[1, 2].map((i) => (
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
          {!canManage && (
            <Alert tone="info">
              You don't have permission to change these settings. This view is read-only.
            </Alert>
          )}

          {/* ==================== 1. General ==================== */}
          <Surface as="section" aria-labelledby="general-heading" className="sm:p-6">
            <SectionHeader title={<span id="general-heading">General</span>} />
            <form onSubmit={handleSave} className="space-y-4">
              <Field
                label="Workspace name"
                htmlFor="workspace-name"
                hint={
                  <>
                    The URL slug <code className="font-mono">{workspace.slug}</code>{' '}
                    does not change when you rename.
                  </>
                }
              >
                <Input
                  id="workspace-name"
                  value={name}
                  onChange={(e) => setDraftName(e.target.value)}
                  maxLength={60}
                  readOnly={!canManage}
                  required
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

          {/* ==================== 2. Invite code ==================== */}
          <Surface as="section" aria-labelledby="invite-heading" className="sm:p-6">
            <SectionHeader
              className="mb-1"
              title={<span id="invite-heading">Invite code</span>}
            />
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
            {inviteMessage && (
              <div className="mt-4">
                <Feedback message={inviteMessage} />
              </div>
            )}
          </Surface>

          {/* ==================== 3. Roles & Permissions ==================== */}
          <Surface as="section" aria-labelledby="roles-heading" className="sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
              <div>
                <SectionHeader
                  className="mb-0"
                  title={<span id="roles-heading">Roles & Permissions</span>}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Define custom roles and their permissions for this workspace.
                </p>
              </div>
              {canManage && (
                <Button
                  onClick={handleCreateRole}
                  className="rounded-lg gap-2 bg-primary hover:bg-primary-hover text-white h-10 px-5 shrink-0"
                >
                  <Plus className="w-4 h-4" /> New Role
                </Button>
              )}
            </div>

            {/* System roles */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  System Roles
                </h3>
                <span className="text-xs text-slate-400">({systemRoles.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {systemRoles.map((role) => (
                  <div
                    key={role._id}
                    className="bg-slate-50/50 rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                        <Shield className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider bg-slate-100 px-1.5 py-0.5 rounded">
                        System
                      </span>
                    </div>
                    <h4 className="font-semibold text-slate-900 text-sm mb-0.5">
                      {role.name}
                    </h4>
                    <p className="text-xs text-slate-500 line-clamp-2 mb-2">
                      {role.description}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom roles */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-3.5 h-3.5 text-primary" />
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Custom Roles
                </h3>
                <span className="text-xs text-slate-400">({customRoles.length})</span>
              </div>

              {rolesLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse h-[150px]"
                    >
                      <div className="w-8 h-8 bg-slate-200 rounded-lg mb-2" />
                      <div className="h-3 w-20 bg-slate-200 rounded mb-2" />
                      <div className="h-2.5 w-full bg-slate-100 rounded mb-1" />
                      <div className="h-2.5 w-2/3 bg-slate-100 rounded" />
                    </div>
                  ))}
                </div>
              ) : customRoles.length === 0 ? (
                <div className="bg-slate-50/50 rounded-xl border border-dashed border-slate-300 p-8 text-center">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <Shield className="w-5 h-5 text-primary" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-1">
                    No custom roles yet
                  </h4>
                  <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
                    Create roles tailored to your team — like "Marketing Lead",
                    "Contractor", or "Auditor".
                  </p>
                  {canManage && (
                    <Button
                      onClick={handleCreateRole}
                      className="rounded-lg gap-2 bg-primary hover:bg-primary-hover text-white h-9 text-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> Create your first role
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {customRoles.map((role) => (
                    <div
                      key={role._id}
                      className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow group relative"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Shield className="w-3.5 h-3.5 text-primary" />
                        </div>
                        {canManage && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEditRole(role)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                              title="Edit role"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteRole(role)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Delete role"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      <h4 className="font-semibold text-slate-900 text-sm mb-0.5 truncate">
                        {role.name}
                      </h4>
                      <p className="text-xs text-slate-500 line-clamp-2 mb-2 h-8">
                        {role.description || 'No description'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Surface>
        </>
      )}

      {/* ==================== Modals ==================== */}

      <AlertDialog
        open={confirmingRegenerate}
        onOpenChange={(open) => !open && setConfirmingRegenerate(false)}
      >
        <AlertDialogContent className="bg-white border border-gray-200 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-slate-900">
              Regenerate the invite code?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-500">
              The current code and any shared invite links stop working immediately.
              Existing members keep their access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="bg-gray-50 border-t border-gray-200">
            <AlertDialogCancel className="border-gray-300 text-slate-700 hover:bg-gray-100">
              Cancel
            </AlertDialogCancel>
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

      <RoleEditorModal
        key={`${editingRole?._id ?? 'new'}-${editorOpen}`}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        workspaceSlug={workspaceSlug!}
        role={editingRole}
        onSaved={fetchRoles}
      />
    </div>
  );
};

export default WorkspaceSettingsPage;