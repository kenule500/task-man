import { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import api from '../utils/api';
import { Field, fieldMessageId, Spinner } from '@/components/ds';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import FormDialog from './FormDialog';

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

const CONTROL =
  'h-11 rounded-lg border-slate-300 bg-white text-base shadow-none placeholder:text-slate-500 md:text-sm';

const RoleEditorModal = ({
  open,
  onOpenChange,
  workspaceSlug,
  role,
  onSaved,
}: RoleEditorModalProps) => {
  // Initial values come from the role; the parent remounts the modal per role (key)
  const [name, setName] = useState(role?.name || '');
  const [nameTouched, setNameTouched] = useState(false);
  const [description, setDescription] = useState(role?.description || '');
  const [permissions, setPermissions] = useState<string[]>(role?.permissions || []);
  const [permissionGroups, setPermissionGroups] = useState<Record<string, PermissionOption[]>>({});
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isEditing = !!role?._id;
  const nameError = nameTouched && !name.trim() ? 'Give the role a name.' : '';

  // Load permission catalog
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const response = await api.get('/roles/permissions');
        setPermissionGroups(response.data);
      } catch (err) {
        console.error('Failed to load permissions:', err);
        setError('We could not load the permission list. Close this dialog and try again.');
      } finally {
        setPermissionsLoaded(true);
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
    setNameTouched(true);
    if (!name.trim()) {
      document.getElementById('role-name')?.focus();
      return;
    }
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
      setError(axiosError.response?.data?.message || 'We could not save the role. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      icon={<Shield aria-hidden />}
      title={isEditing ? 'Edit role' : 'Create custom role'}
      description={isEditing ? "Update this role's name and permissions." : 'Define a new role for your workspace.'}
      onSubmit={handleSubmit}
      submitLabel={isEditing ? 'Save changes' : 'Create role'}
      submittingLabel="Saving..."
      submitting={loading}
      error={error}
    >
      <Field label="Role name" htmlFor="role-name" required error={nameError}>
        <Input
          id="role-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setNameTouched(true)}
          aria-invalid={!!nameError}
          aria-describedby={nameError ? fieldMessageId('role-name') : undefined}
          placeholder="e.g. Marketing Lead, Contractor, Auditor"
          className={CONTROL}
          maxLength={60}
          required
          autoComplete="off"
        />
      </Field>

      <Field label="Description" htmlFor="role-desc" hint="Optional. Shown when inviting people.">
        <Input
          id="role-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-describedby={fieldMessageId('role-desc')}
          className={CONTROL}
          maxLength={280}
          autoComplete="off"
        />
      </Field>

      <div className="space-y-2">
        <p id="role-permissions-label" className="text-sm font-medium text-slate-700">Permissions</p>
        <div role="group" aria-labelledby="role-permissions-label" className="divide-y divide-slate-100 rounded-lg border border-slate-200 sm:max-h-[50dvh] sm:overflow-y-auto sm:overscroll-contain [scrollbar-width:thin]">
          {!permissionsLoaded && <p className="flex items-center gap-2 p-4 text-sm text-slate-600"><Spinner decorative />Loading permissions...</p>}
          {Object.entries(permissionGroups).map(([group, perms]) => {
            const keys = perms.map((p) => p.key);
            const allSelected = keys.every((k) => permissions.includes(k));
            const selectedCount = keys.filter((k) => permissions.includes(k)).length;

            return (
              <fieldset key={group} className="bg-white">
                <legend className="sr-only">{group}</legend>
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-1.5">
                  <span aria-hidden className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    {group}
                    <span className="ml-2 font-normal normal-case tracking-normal text-slate-600 tabular-nums">
                      {selectedCount}/{keys.length}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className="min-h-10 rounded-md px-2 text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary md:min-h-8"
                  >
                    {allSelected ? 'Deselect all' : 'Select all'}
                    <span className="sr-only"> {group} permissions</span>
                  </button>
                </div>
                <div className="px-4 py-1">
                  {perms.map((perm) => (
                    <label key={perm.key} className="flex min-h-10 cursor-pointer items-center gap-3 py-1">
                      <Checkbox
                        checked={permissions.includes(perm.key)}
                        onCheckedChange={() => togglePermission(perm.key)}
                      />
                      <span className="flex-1 text-sm text-slate-700">{perm.label}</span>
                      <code className="hidden font-mono text-[11px] text-slate-600 sm:block">{perm.key}</code>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
        <p className="text-xs text-slate-600" aria-live="polite">
          {permissions.length} permission{permissions.length !== 1 ? 's' : ''} selected
        </p>
      </div>
    </FormDialog>
  );
};

export default RoleEditorModal;
