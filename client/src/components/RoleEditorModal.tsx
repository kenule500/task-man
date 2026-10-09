import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertCircle, Shield } from 'lucide-react';

interface PermissionOption {
  key: string;
  label: string;
}

interface Role {
  _id?: string;
  name: string;
  description: string;
  permissions: string[];
}

interface RoleEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  role?: Role | null;   // if editing
  onSaved: () => void;
}

const RoleEditorModal = ({
  open,
  onOpenChange,
  workspaceSlug,
  role,
  onSaved,
}: RoleEditorModalProps) => {
  // Initial values come from the role; the parent remounts the modal per role (key)
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [permissions, setPermissions] = useState<string[]>(role?.permissions || []);
  const [permissionGroups, setPermissionGroups] = useState<Record<string, PermissionOption[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isEditing = !!role?._id;

  // Load permission catalog
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const response = await api.get('/roles/permissions');
        setPermissionGroups(response.data);
      } catch (err) {
        console.error('Failed to load permissions:', err);
      }
    })();
  }, [open]);

  const togglePermission = (key: string) => {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const toggleGroup = (group: string) => {
    const keys = permissionGroups[group].map((p) => p.key);
    const allSelected = keys.every((k) => permissions.includes(k));
    if (allSelected) {
      setPermissions((prev) => prev.filter((p) => !keys.includes(p)));
    } else {
      setPermissions((prev) => Array.from(new Set([...prev, ...keys])));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = { name: name.trim(), description: description.trim(), permissions };

      if (isEditing) {
        await api.put(`/workspaces/${workspaceSlug}/roles/${role!._id}`, payload);
      } else {
        await api.post(`/workspaces/${workspaceSlug}/roles`, payload);
      }

      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || 'Failed to save role');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden bg-white border border-gray-200 shadow-2xl rounded-2xl gap-0 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogHeader className="p-0 space-y-0">
                <DialogTitle className="text-lg font-bold text-slate-900">
                  {isEditing ? 'Edit Role' : 'Create Custom Role'}
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-500 mt-1">
                  {isEditing
                    ? 'Update this role\'s name and permissions.'
                    : 'Define a new role for your workspace.'}
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-6 py-5 space-y-5 overflow-y-auto">
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="role-name" className="text-sm font-medium text-slate-700">
                Role Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Marketing Lead, Contractor, Auditor"
                className="h-10 bg-white border border-gray-300 rounded-lg text-sm shadow-none"
                maxLength={60}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role-desc" className="text-sm font-medium text-slate-700">
                Description
              </Label>
              <Input
                id="role-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="h-10 bg-white border border-gray-300 rounded-lg text-sm shadow-none"
                maxLength={280}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Permissions</Label>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                {Object.entries(permissionGroups).map(([group, perms]) => {
                  const keys = perms.map((p) => p.key);
                  const allSelected = keys.every((k) => permissions.includes(k));
                  const someSelected = keys.some((k) => permissions.includes(k));

                  return (
                    <div key={group} className="bg-white">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group)}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50/50 hover:bg-slate-50"
                      >
                        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                          {group}
                        </span>
                        <span className="text-[10px] text-primary font-medium">
                          {allSelected ? 'Deselect all' : someSelected ? 'Select all' : 'Select all'}
                        </span>
                      </button>
                      <div className="px-4 py-2 space-y-1.5">
                        {perms.map((perm) => (
                          <label
                            key={perm.key}
                            className="flex items-center gap-2.5 cursor-pointer py-1 group"
                          >
                            <input
                              type="checkbox"
                              checked={permissions.includes(perm.key)}
                              onChange={() => togglePermission(perm.key)}
                              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/30"
                            />
                            <span className="text-sm text-slate-700 group-hover:text-slate-900 flex-1">
                              {perm.label}
                            </span>
                            <code className="text-[10px] text-slate-400 font-mono hidden group-hover:block">
                              {perm.key}
                            </code>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400">
                {permissions.length} permission{permissions.length !== 1 ? 's' : ''} selected
              </p>
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="!m-0 px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-row justify-end gap-2 sm:gap-2 flex-shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-lg h-10 border-gray-300 text-slate-700 hover:bg-gray-100 text-sm font-medium shadow-none"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="rounded-lg bg-primary hover:bg-primary-hover text-white h-10 text-sm font-medium shadow-sm px-5"
            >
              {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Role'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RoleEditorModal;