import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import RoleEditorModal from '../components/RoleEditorModal';
import { usePermissions } from '../hooks/usePermissions';
import { Button } from '@/components/ui/button';
import api from '../utils/api';
import {
  Shield, Plus, Pencil, Trash2, Lock, Settings,
  AlertCircle,
} from 'lucide-react';

interface Role {
  _id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  workspaceId: string | null;
}

const WorkspaceSettingsPage = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { can } = usePermissions();

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  const canManageRoles = can('settings:manage');

  const fetchRoles = useCallback(async () => {
    if (!workspaceSlug) return;
    try {
      setLoading(true);
      const response = await api.get(`/workspaces/${workspaceSlug}/roles`);
      setRoles(response.data || []);
    } catch (err) {
      console.error('Failed to load roles:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    (async () => {
      await fetchRoles();
    })();
  }, [fetchRoles]);

  const handleCreate = () => {
    setEditingRole(null);
    setEditorOpen(true);
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setEditorOpen(true);
  };

  const handleDelete = async (role: Role) => {
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

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-semibold uppercase tracking-wider mb-3">
            <Settings className="w-3 h-3" />
            Workspace Settings
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Roles & Permissions
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Define custom roles and their permissions for this workspace.
          </p>
        </div>
        {canManageRoles && (
          <Button
            onClick={handleCreate}
            className="rounded-lg gap-2 bg-primary hover:bg-primary-hover text-white h-10 px-5"
          >
            <Plus className="w-4 h-4" /> New Role
          </Button>
        )}
      </header>

      {!canManageRoles && (
        <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>You don't have permission to manage roles. This view is read-only.</span>
        </div>
      )}

      {/* System roles */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
            System Roles
          </h2>
          <span className="text-xs text-slate-400">({systemRoles.length})</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {systemRoles.map((role) => (
            <div
              key={role._id}
              className="bg-white rounded-xl border border-slate-200 p-5 relative"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-slate-500" />
                </div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded">
                  System
                </span>
              </div>
              <h3 className="font-semibold text-slate-900 text-sm mb-1">
                {role.name}
              </h3>
              <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                {role.description}
              </p>
              <p className="text-[11px] text-slate-400">
                {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Custom roles */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Custom Roles
          </h2>
          <span className="text-xs text-slate-400">({customRoles.length})</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse h-[180px]"
              >
                <div className="w-9 h-9 bg-slate-200 rounded-lg mb-3" />
                <div className="h-4 w-24 bg-slate-200 rounded mb-2" />
                <div className="h-3 w-full bg-slate-100 rounded mb-1" />
                <div className="h-3 w-2/3 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : customRoles.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 mb-1">
              No custom roles yet
            </h3>
            <p className="text-sm text-slate-500 mb-5 max-w-sm mx-auto">
              Create roles tailored to your team — like "Marketing Lead",
              "Contractor", or "Auditor".
            </p>
            {canManageRoles && (
              <Button
                onClick={handleCreate}
                className="rounded-lg gap-2 bg-primary hover:bg-primary-hover text-white"
              >
                <Plus className="w-4 h-4" /> Create your first role
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {customRoles.map((role) => (
              <div
                key={role._id}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow group relative"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-primary" />
                  </div>
                  {canManageRoles && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEdit(role)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Edit role"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(role)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete role"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <h3 className="font-semibold text-slate-900 text-sm mb-1 truncate">
                  {role.name}
                </h3>
                <p className="text-xs text-slate-500 line-clamp-2 mb-3 h-8">
                  {role.description || 'No description'}
                </p>
                <p className="text-[11px] text-slate-400">
                  {role.permissions.length} permision{role.permissions.length !== 1 ? 's' : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <RoleEditorModal
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