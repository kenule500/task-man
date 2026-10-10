import { useState, useCallback, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Shield, Plus, Pencil, Trash2, Lock, KeyRound, Copy, Check, LayoutGrid, Table2, ScrollText, ChevronRight } from 'lucide-react';
import {
  Alert,
  Field,
  IconTile,
  PageHeader,
  SearchInput,
  SectionHeader,
  SegmentedControl,
  SkeletonCards,
  Surface,
  Tag,
  fieldMessageId,
  surfaceVariants,
} from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import RoleEditorModal from '../components/RoleEditorModal';
import RolePermissionMatrix from '../components/RolePermissionMatrix';
import {
  countMembersByRole,
  filterRoles,
  sortRoles,
  type PermissionCatalog,
  type RbacRole,
} from '../components/settings/rbac';
import ConfirmActionDialog from '../components/ConfirmActionDialog';
import { usePermissions } from '../hooks/usePermissions';
import { getApiErrorMessage } from '@/utils/api';
import { useWorkspaceData, workspaceApi } from '@/features/workspace';
import { GitHubIntegrationCard } from '@/features/integrations';
import api from '../utils/api';

const INPUT =
  'h-11 rounded-lg border-slate-300 bg-white text-base text-slate-900 shadow-none placeholder:text-slate-500 md:text-sm';

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

type RolesView = 'cards' | 'matrix';

/** Roles above this count get a search field. */
const ROLE_SEARCH_THRESHOLD = 6;

const SCROLL_REGION =
  'max-h-[60dvh] overflow-y-auto overscroll-contain rounded-lg pr-1 [scrollbar-width:thin] [scrollbar-gutter:stable] outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

const NO_MATCH =
  'rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600';

const Feedback = ({ message }: { message: FeedbackMessage | null }) =>
  message ? <Alert tone={message.type}>{message.text}</Alert> : null;

const permissionCount = (role: Role) =>
  `${role.permissions.length} permission${role.permissions.length !== 1 ? 's' : ''}`;

interface RoleCardProps {
  role: Role;
  canManage?: boolean;
  onEdit?: (role: Role) => void;
  onDelete?: (role: Role) => void;
}

const RoleCard = ({ role, canManage = false, onEdit, onDelete }: RoleCardProps) => (
  <li
    className={cn(
      surfaceVariants({ radius: 'lg', padding: 'sm' }),
      'flex flex-col shadow-none',
      role.isSystem ? 'bg-slate-50/60' : 'border-slate-200',
    )}
  >
    <div className="mb-2 flex items-start justify-between gap-2">
      <IconTile size="sm" tone={role.isSystem ? 'neutral' : 'primary'}>
        <Shield />
      </IconTile>
      {role.isSystem ? (
        <Tag size="sm" className="uppercase tracking-wider">System</Tag>
      ) : (
        canManage && (
          <div className="-mr-2 -mt-2 flex items-center">
            <Button
              variant="ghost"
              onClick={() => onEdit?.(role)}
              aria-label={`Edit role ${role.name}`}
              className="size-10 rounded-lg text-slate-500 hover:bg-primary/10 hover:text-primary md:size-8"
            >
              <Pencil aria-hidden />
            </Button>
            <Button
              variant="ghost"
              onClick={() => onDelete?.(role)}
              aria-label={`Delete role ${role.name}`}
              className="size-10 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 md:size-8"
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        )
      )}
    </div>
    <h4 className="mb-0.5 truncate text-sm font-semibold text-slate-900">{role.name}</h4>
    <p className="mb-2 line-clamp-2 min-h-8 text-xs text-slate-600">{role.description || 'No description'}</p>
    <p className="mt-auto text-xs tabular-nums text-slate-600">{permissionCount(role)}</p>
  </li>
);

const WorkspaceSettingsPage = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { can } = usePermissions();

  const { workspace, setWorkspace, loading, error } = useWorkspaceData(workspaceSlug);

  const canManage = can('settings:manage');

  // ==================== Rename workspace state ====================
  const [draftName, setDraftName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<FeedbackMessage | null>(null);

  // ==================== Regenerate invite code state ====================
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<FeedbackMessage | null>(null);
  const [copied, setCopied] = useState(false);

  // ==================== Roles state ====================
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesMessage, setRolesMessage] = useState<FeedbackMessage | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RbacRole | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [catalog, setCatalog] = useState<PermissionCatalog>({});
  const [memberCounts, setMemberCounts] = useState<Record<string, number> | undefined>(undefined);
  const [roleQuery, setRoleQuery] = useState('');
  // null follows the screen size: matrix from md, cards on phones
  const [chosenView, setChosenView] = useState<RolesView | null>(null);
  const [wideScreen] = useState(
    () => typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 768px)').matches,
  );
  const rolesView: RolesView = chosenView ?? (wideScreen ? 'matrix' : 'cards');

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
      setRolesMessage({ type: 'error', text: getApiErrorMessage(err, 'We could not load the roles.') });
    } finally {
      setRolesLoading(false);
    }
  }, [workspaceSlug]);

  // Permission catalog and member counts feed the matrix; both degrade quietly when unavailable
  const fetchMatrixData = useCallback(async () => {
    if (!workspaceSlug) return;
    const [catalogRes, workspaceRes] = await Promise.allSettled([
      api.get('/roles/permissions'),
      api.get(`/workspaces/${workspaceSlug}`),
    ]);
    if (catalogRes.status === 'fulfilled') setCatalog(catalogRes.value.data || {});
    if (workspaceRes.status === 'fulfilled') {
      setMemberCounts(countMembersByRole(workspaceRes.value.data?.members || []));
    }
  }, [workspaceSlug]);

  useEffect(() => {
    (async () => {
      await Promise.all([fetchRoles(), fetchMatrixData()]);
    })();
  }, [fetchRoles, fetchMatrixData]);

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
    setConfirmingRegenerate(false);
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
    }
  };

  const handleCopyCode = async () => {
    if (!workspace?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(workspace.inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setInviteMessage({ type: 'error', text: 'Could not copy automatically. Select the code and copy it manually.' });
    }
  };

  const handleCreateRole = () => {
    setEditingRole(null);
    setEditorOpen(true);
  };

  const handleEditRole = (role: RbacRole) => {
    setEditingRole(role);
    setEditorOpen(true);
  };

  const handleDeleteRole = async () => {
    const role = roleToDelete;
    if (!role) return;
    setRoleToDelete(null);
    setRolesMessage(null);
    try {
      await api.delete(`/workspaces/${workspaceSlug}/roles/${role._id}`);
      setRoles((current) => current.filter((r) => r._id !== role._id));
      setRolesMessage({ type: 'success', text: `Role "${role.name}" deleted.` });
    } catch (err) {
      setRolesMessage({ type: 'error', text: getApiErrorMessage(err, 'We could not delete the role.') });
    }
  };

  const visibleRoles = sortRoles(filterRoles(roles, roleQuery));
  const systemRoles = visibleRoles.filter((r) => r.isSystem);
  const customRoles = visibleRoles.filter((r) => !r.isSystem);
  const searching = roleQuery.trim().length > 0;
  const showRoleSearch = roles.length > ROLE_SEARCH_THRESHOLD;

  // ==================== Render ====================

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Workspace settings"
        description="Manage the name, invite code and roles for this workspace."
      />

      {canManage && (
        <Link
          to={`/${workspaceSlug}/settings/audit`}
          className={cn(
            surfaceVariants({ radius: 'lg', padding: 'sm' }),
            'flex items-center gap-3 shadow-none outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          )}
        >
          <IconTile size="sm" tone="neutral"><ScrollText /></IconTile>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900">Audit log</span>
            <span className="block text-xs text-slate-600">See who changed what, when and from where. Export it as CSV.</span>
          </span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-500" />
        </Link>
      )}

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
              You do not have permission to change these settings. This view is read-only.
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
                  aria-describedby={fieldMessageId('workspace-name')}
                  value={name}
                  onChange={(e) => setDraftName(e.target.value)}
                  maxLength={60}
                  readOnly={!canManage}
                  required
                  autoComplete="off"
                  className={INPUT}
                />
              </Field>
              <Feedback message={saveMessage} />
              {canManage && (
                <Button
                  type="submit"
                  disabled={saving || !name.trim() || unchanged}
                  className="h-11 w-full rounded-lg bg-primary px-5 text-sm font-medium text-white shadow-sm hover:bg-primary-hover sm:h-10 sm:w-auto"
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
            <p className="mb-4 text-xs text-slate-600">
              Teammates join with this code. Regenerating it invalidates the old code and links.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <code className="break-all rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-center font-mono text-sm font-semibold tracking-wider text-slate-700 sm:text-left">
                {workspace.inviteCode}
              </code>
              <Button
                type="button"
                variant="outline"
                onClick={handleCopyCode}
                className="h-11 gap-2 rounded-lg border-slate-300 text-sm text-slate-700 shadow-none hover:bg-slate-100 sm:h-10"
              >
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied ? 'Copied' : 'Copy code'}
              </Button>
              {canManage && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={regenerating}
                  onClick={() => setConfirmingRegenerate(true)}
                  className="h-11 gap-2 rounded-lg border-slate-300 text-sm text-slate-700 shadow-none hover:bg-slate-100 sm:h-10"
                >
                  <KeyRound aria-hidden /> {regenerating ? 'Regenerating...' : 'Regenerate code'}
                </Button>
              )}
            </div>
            <p role="status" className="sr-only">{copied ? 'Invite code copied to clipboard' : ''}</p>
            {inviteMessage && (
              <div className="mt-4">
                <Feedback message={inviteMessage} />
              </div>
            )}
          </Surface>

          {/* ==================== 3. Integrations ==================== */}
          {canManage && workspaceSlug && <GitHubIntegrationCard workspaceSlug={workspaceSlug} />}

          {/* ==================== 4. Roles & Permissions ==================== */}
          <Surface as="section" aria-labelledby="roles-heading" className="sm:p-6">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <SectionHeader
                  className="mb-0"
                  title={<span id="roles-heading">Roles and permissions</span>}
                />
                <p className="mt-1 text-xs text-slate-600">
                  Define custom roles and their permissions for this workspace.
                </p>
              </div>
              {canManage && (
                <Button
                  onClick={handleCreateRole}
                  className="h-11 shrink-0 gap-2 rounded-lg bg-primary px-5 text-white hover:bg-primary-hover sm:h-10"
                >
                  <Plus aria-hidden /> New role
                </Button>
              )}
            </div>

            {rolesMessage && (
              <div className="mb-5">
                <Alert tone={rolesMessage.type} onDismiss={() => setRolesMessage(null)}>{rolesMessage.text}</Alert>
              </div>
            )}

            {!rolesLoading && roles.length > 0 && (
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {showRoleSearch ? (
                  <SearchInput
                    label="Search roles"
                    value={roleQuery}
                    onValueChange={setRoleQuery}
                    className="w-full sm:max-w-xs"
                  />
                ) : (
                  <span />
                )}
                <SegmentedControl
                  aria-label="Roles view"
                  value={rolesView}
                  onValueChange={setChosenView}
                  options={[
                    { value: 'cards', label: 'Cards', icon: <LayoutGrid /> },
                    { value: 'matrix', label: 'Matrix', icon: <Table2 /> },
                  ]}
                  className="self-start"
                />
              </div>
            )}

            {rolesLoading ? (
              <SkeletonCards count={3} columns="md:grid-cols-2 lg:grid-cols-3" className="gap-3" />
            ) : rolesView === 'matrix' ? (
              visibleRoles.length === 0 ? (
                <p role="status" className={NO_MATCH}>
                  {searching ? <>No roles match &quot;{roleQuery.trim()}&quot;.</> : 'There are no roles yet.'}
                </p>
              ) : Object.keys(catalog).length === 0 ? (
                <Alert tone="info">
                  The permission list is not available right now, so the matrix cannot be shown. Switch to Cards or reload the page.
                </Alert>
              ) : (
                <RolePermissionMatrix
                  roles={visibleRoles}
                  catalog={catalog}
                  memberCounts={memberCounts}
                  canManage={canManage}
                  onEditRole={handleEditRole}
                />
              )
            ) : (
              <div role="region" aria-label="Role cards" tabIndex={0} className={SCROLL_REGION}>
                {/* System roles */}
                {(systemRoles.length > 0 || !searching) && (
                  <div className="mb-6">
                    <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700">
                      <Lock className="size-3.5 text-slate-500" aria-hidden />
                      System roles
                      <span className="font-normal normal-case tracking-normal text-slate-600">({systemRoles.length})</span>
                    </h3>
                    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {systemRoles.map((role) => (
                        <RoleCard key={role._id} role={role} />
                      ))}
                    </ul>
                  </div>
                )}

                {/* Custom roles */}
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700">
                    <Shield className="size-3.5 text-primary" aria-hidden />
                    Custom roles
                    <span className="font-normal normal-case tracking-normal text-slate-600">({customRoles.length})</span>
                  </h3>

                  {customRoles.length === 0 && searching ? (
                    <p role="status" className={NO_MATCH}>
                      No custom roles match &quot;{roleQuery.trim()}&quot;.
                    </p>
                  ) : customRoles.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center">
                      <IconTile className="mx-auto mb-3">
                        <Shield />
                      </IconTile>
                      <p className="mb-1 text-sm font-semibold text-slate-800">No custom roles yet</p>
                      <p className="mx-auto mb-4 max-w-sm text-xs text-slate-600">
                        Create roles tailored to your team, like &quot;Marketing Lead&quot;, &quot;Contractor&quot; or &quot;Auditor&quot;.
                      </p>
                      {canManage && (
                        <Button
                          onClick={handleCreateRole}
                          className="h-10 gap-2 rounded-lg bg-primary text-sm text-white hover:bg-primary-hover"
                        >
                          <Plus aria-hidden /> Create your first role
                        </Button>
                      )}
                    </div>
                  ) : (
                    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {customRoles.map((role) => (
                        <RoleCard
                          key={role._id}
                          role={role}
                          canManage={canManage}
                          onEdit={handleEditRole}
                          onDelete={setRoleToDelete}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </Surface>
        </>
      )}

      {/* ==================== Modals ==================== */}

      <ConfirmActionDialog
        open={confirmingRegenerate}
        onOpenChange={setConfirmingRegenerate}
        title="Regenerate the invite code?"
        description="The current code and any shared invite links stop working immediately. Existing members keep their access."
        confirmLabel="Regenerate code"
        onConfirm={handleRegenerate}
      />

      <ConfirmActionDialog
        open={roleToDelete !== null}
        onOpenChange={(open) => !open && setRoleToDelete(null)}
        title={`Delete the role "${roleToDelete?.name ?? ''}"?`}
        description="Members who have this role may lose access. This cannot be undone."
        confirmLabel="Delete role"
        onConfirm={handleDeleteRole}
      />

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
