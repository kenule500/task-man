import { useState, useEffect } from 'react';
import { Mail, UserPlus } from 'lucide-react';
import api from '../utils/api';
import { Alert, Field, fieldMessageId } from '@/components/ds';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { validateEmail } from '@/components/auth/validation';
import FormDialog from './FormDialog';

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

const SELECT =
  'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm';

const InviteMemberModal = ({
  open,
  onOpenChange,
  workspaceSlug,
  onInvited,
}: InviteMemberModalProps) => {
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [roleId, setRoleId] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const emailError = emailTouched ? validateEmail(email) : '';

  // Fetch roles available to this workspace (system + custom)
  useEffect(() => {
    if (!open || !workspaceSlug) return;

    (async () => {
      try {
        setLoadingRoles(true);
        const response = await api.get(`/workspaces/${workspaceSlug}/roles`);
        setRoles(response.data || []);
        if (response.data?.length > 0) {
          // Default to Viewer if available, otherwise first role
          const viewer = response.data.find((r: Role) => r.name === 'Viewer');
          setRoleId(viewer?._id || response.data[0]._id);
        }
      } catch (err) {
        console.error('Failed to load roles:', err);
        setError('We could not load the roles. Close this dialog and try again.');
      } finally {
        setLoadingRoles(false);
      }
    })();
  }, [open, workspaceSlug]);

  // Close shortly after a successful invite (cleared if the dialog closes first)
  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => {
      setSuccess(false);
      onOpenChange(false);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [success, onOpenChange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setEmailTouched(true);
    if (validateEmail(email)) {
      document.getElementById('invite-email')?.focus();
      return;
    }
    setLoading(true);

    try {
      await api.post(`/workspaces/${workspaceSlug}/invitations`, {
        email: email.trim(),
        roleId,
      });

      setSuccess(true);
      setEmail('');
      setEmailTouched(false);
      if (onInvited) onInvited();
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || 'We could not send the invitation. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setEmail('');
      setEmailTouched(false);
      setError('');
      setSuccess(false);
    }
    onOpenChange(isOpen);
  };

  const selectedRole = roles.find((r) => r._id === roleId);

  return (
    <FormDialog
      open={open}
      onOpenChange={handleClose}
      icon={<UserPlus aria-hidden />}
      title="Invite a member"
      description="Send an invitation to join this workspace."
      onSubmit={handleSubmit}
      submitLabel="Send invitation"
      submittingLabel="Sending..."
      submitting={loading}
      submitDisabled={!roleId || loadingRoles}
      error={error}
    >
      {success && <Alert tone="success">Invitation sent.</Alert>}

      <Field label="Email address" htmlFor="invite-email" required error={emailError}>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <Input
            id="invite-email"
            type="email"
            required
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={!!emailError}
            aria-describedby={emailError ? fieldMessageId('invite-email') : undefined}
            placeholder="teammate@company.com"
            className="h-11 rounded-lg border-slate-300 bg-white pl-9 text-base shadow-none placeholder:text-slate-500 md:text-sm"
            autoFocus
          />
        </div>
      </Field>

      <Field
        label="Role"
        htmlFor="invite-role"
        required
        hint={selectedRole?.description || undefined}
      >
        {loadingRoles ? (
          <Skeleton className="h-11 w-full rounded-lg bg-slate-200" />
        ) : (
          <select
            id="invite-role"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            aria-describedby={selectedRole?.description ? fieldMessageId('invite-role') : undefined}
            className={SELECT}
            required
          >
            {roles.map((role) => (
              <option key={role._id} value={role._id}>
                {role.name}
              </option>
            ))}
          </select>
        )}
      </Field>
    </FormDialog>
  );
};

export default InviteMemberModal;
