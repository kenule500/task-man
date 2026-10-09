import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { getStoredUser, getToken, updateStoredUser } from '../utils/session';
import { Button, buttonVariants } from '@/components/ui/button';
import { Alert, Tag } from '@/components/ds';
import { AuthPageShell, AuthStatusHeader } from '@/components/auth/AuthPageShell';
import { Loader2, XCircle, Users, ArrowRight } from 'lucide-react';

interface Invitation {
  workspace: { _id: string; name: string; slug: string };
  role: { _id: string; name: string; description: string };
  invitedBy: { _id: string; name: string; email: string };
  email: string;
  expiresAt: string;
}

const formatExpiry = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
};

const getErrorMessage = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

const AcceptInvitePage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchInvitation = async () => {
      try {
        const response = await api.get(`/invitations/${token}`);
        setInvitation(response.data);
      } catch (err: unknown) {
        setLoadError(getErrorMessage(err, 'Failed to load invitation.'));
      } finally {
        setLoading(false);
      }
    };
    fetchInvitation();
  }, [token]);

  const handleAccept = async () => {
    if (!getToken()) {
      // Save pending invite and redirect to login
      sessionStorage.setItem('pendingInviteToken', token || '');
      navigate('/login');
      return;
    }

    setSubmitting(true);
    setActionError('');
    try {
      const response = await api.post(`/invitations/${token}/accept`);
      const workspace = response.data.workspace;

      // Update stored user's active workspace
      if (getStoredUser()) {
        updateStoredUser({ activeWorkspace: workspace._id, activeWorkspaceSlug: workspace.slug });
      }

      navigate(`/${workspace.slug}/dashboard`);
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, 'Failed to accept the invitation. Try again.'));
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    setSubmitting(true);
    setActionError('');
    try {
      await api.post(`/invitations/${token}/decline`);
      navigate('/');
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, 'Failed to decline the invitation. Try again.'));
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AuthPageShell>
        <AuthStatusHeader icon={<Loader2 />} spin title="Loading invitation" description="Please wait..." />
      </AuthPageShell>
    );
  }

  if (loadError || !invitation) {
    return (
      <AuthPageShell>
        <AuthStatusHeader
          icon={<XCircle />}
          tone="danger"
          title="Invitation not valid"
          description={loadError || 'This invitation is no longer valid. Ask the person who invited you to send a new one.'}
        />
        <Link to="/" className={buttonVariants({ variant: 'outline', className: 'h-11 w-full rounded-xl' })}>
          Back to home
        </Link>
      </AuthPageShell>
    );
  }

  const expiry = formatExpiry(invitation.expiresAt);

  return (
    <AuthPageShell>
      <AuthStatusHeader
        icon={<Users />}
        title="You have been invited"
        description={
          <>
            <span className="font-semibold text-slate-800">{invitation.invitedBy.name}</span> invited you to join{' '}
            <span className="font-semibold text-slate-800">{invitation.workspace.name}</span>.
          </>
        }
      />

      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-600">Your role</span>
          <Tag tone="primary">{invitation.role.name}</Tag>
        </div>
        {invitation.role.description && <p className="text-sm text-slate-600">{invitation.role.description}</p>}
      </div>

      {actionError && <Alert tone="error" className="mb-4">{actionError}</Alert>}

      <div className="flex flex-col gap-3">
        <Button
          onClick={handleAccept}
          disabled={submitting}
          className="h-11 w-full gap-2 rounded-xl bg-primary text-white hover:bg-primary-hover"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> Joining...
            </>
          ) : (
            <>
              Accept invitation <ArrowRight className="size-4" aria-hidden />
            </>
          )}
        </Button>
        <Button onClick={handleDecline} disabled={submitting} variant="outline" className="h-11 w-full rounded-xl">
          Decline
        </Button>
      </div>

      {expiry && <p className="mt-6 text-center text-xs text-slate-600">This invitation expires on {expiry}.</p>}
    </AuthPageShell>
  );
};

export default AcceptInvitePage;
