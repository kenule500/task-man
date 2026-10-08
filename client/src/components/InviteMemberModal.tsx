import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertCircle, Mail, UserPlus } from 'lucide-react';

interface Role {
  _id: string;
  name: string;
  description: string;
}

interface InviteMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  onInvited?: () => void;
}

const InviteMemberModal = ({
  open,
  onOpenChange,
  workspaceSlug,
  onInvited,
}: InviteMemberModalProps) => {
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Fetch roles available to this workspace
  useEffect(() => {
    if (!open || !workspaceSlug) return;

    (async () => {
      try {
        setLoadingRoles(true);
        // ✅ Workspace-scoped endpoint (system + custom roles)
        const response = await api.get(`/workspaces/${workspaceSlug}/roles`);
        setRoles(response.data || []);
        if (response.data?.length > 0) {
          // Default to Viewer if available, otherwise first role
          const viewer = response.data.find((r: Role) => r.name === 'Viewer');
          setRoleId(viewer?._id || response.data[0]._id);
        }
      } catch (err) {
        console.error('Failed to load roles:', err);
      } finally {
        setLoadingRoles(false);
      }
    })();
  }, [open, workspaceSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      await api.post(`/workspaces/${workspaceSlug}/invitations`, {
        email: email.trim(),
        roleId,
      });

      setSuccess(true);
      setEmail('');
      if (onInvited) onInvited();
      setTimeout(() => {
        setSuccess(false);
        onOpenChange(false);
      }, 1500);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setEmail('');
      setError('');
      setSuccess(false);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[460px] p-0 overflow-hidden bg-white border border-gray-200 shadow-2xl rounded-2xl gap-0">

        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-gray-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <UserPlus className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <DialogHeader className="p-0 space-y-0">
                <DialogTitle className="text-lg font-bold text-slate-900 leading-tight">
                  Invite a member
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-500 mt-1 leading-relaxed">
                  Send an invitation to join this workspace.
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                ✓ Invitation sent successfully
              </div>
            )}

            <div className="space-y-1.5">
              <Label
                htmlFor="invite-email"
                className="text-sm font-medium text-slate-700"
              >
                Email Address <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@company.com"
                  className="h-11 pl-9 bg-white border border-gray-300 rounded-lg text-sm shadow-none"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="invite-role"
                className="text-sm font-medium text-slate-700"
              >
                Role <span className="text-red-500">*</span>
              </Label>
              {loadingRoles ? (
                <div className="h-11 bg-slate-100 rounded-lg animate-pulse" />
              ) : (
                <select
                  id="invite-role"
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="w-full h-11 px-3 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:border-gray-400"
                  required
                >
                  {roles.map((role) => (
                    <option key={role._id} value={role._id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              )}
              {roles.length > 0 && roleId && (
                <p className="text-xs text-slate-400">
                  {roles.find((r) => r._id === roleId)?.description}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="!m-0 px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-row justify-end gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              className="rounded-lg h-10 border-gray-300 text-slate-700 hover:bg-gray-100 text-sm font-medium shadow-none"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !email.trim() || !roleId}
              className="rounded-lg bg-primary hover:bg-primary-hover text-white h-10 text-sm font-medium shadow-sm px-5"
            >
              {loading ? 'Sending...' : 'Send Invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default InviteMemberModal;