import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import api from '../utils/api';
import { getStoredUser, getToken, updateStoredUser } from '../utils/session';
import { Button, buttonVariants } from '@/components/ui/button';
import { Alert, Tag, Spinner } from '@/components/ds';
import { AuthPageShell, AuthStatusHeader } from '@/components/auth/AuthPageShell';
import { Loader2, XCircle, Users, ArrowRight } from 'lucide-react';
import { currentLocale } from '@/i18n/format';
import { roleDisplayDescription, roleDisplayName } from '../components/settings/rbac';

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
    : date.toLocaleDateString(currentLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
};

const getErrorMessage = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

const AcceptInvitePage = () => {
  const { t } = useTranslation('auth');
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
        setLoadError(getErrorMessage(err, t('invite.loadFailed')));
      } finally {
        setLoading(false);
      }
    };
    fetchInvitation();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setActionError(getErrorMessage(err, t('invite.acceptFailed')));
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
      setActionError(getErrorMessage(err, t('invite.declineFailed')));
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AuthPageShell>
        <AuthStatusHeader icon={<Loader2 />} spin title={t('invite.loadingTitle')} description={t('invite.wait')} />
      </AuthPageShell>
    );
  }

  if (loadError || !invitation) {
    return (
      <AuthPageShell>
        <AuthStatusHeader
          icon={<XCircle />}
          tone="danger"
          title={t('invite.invalidTitle')}
          description={loadError || t('invite.invalidDescription')}
        />
        <Link to="/" className={buttonVariants({ variant: 'outline', className: 'h-11 w-full rounded-xl' })}>
          {t('invite.backHome')}
        </Link>
      </AuthPageShell>
    );
  }

  const expiry = formatExpiry(invitation.expiresAt);

  return (
    <AuthPageShell>
      <AuthStatusHeader
        icon={<Users />}
        title={t('invite.title')}
        description={<Trans t={t} i18nKey="invite.description" values={{ inviter: invitation.invitedBy.name, workspace: invitation.workspace.name }} components={{ b: <span className="font-semibold text-slate-800" /> }} />}
      />

      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-600">{t('invite.yourRole')}</span>
          <Tag tone="primary">{roleDisplayName(invitation.role)}</Tag>
        </div>
        {invitation.role.description && <p className="text-sm text-slate-600">{roleDisplayDescription(invitation.role)}</p>}
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
              <Spinner decorative /> {t('invite.joining')}
            </>
          ) : (
            <>
              {t('invite.accept')} <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
            </>
          )}
        </Button>
        <Button onClick={handleDecline} disabled={submitting} variant="outline" className="h-11 w-full rounded-xl">
          {t('invite.decline')}
        </Button>
      </div>

      {expiry && <p className="mt-6 text-center text-xs text-slate-600">{t('invite.expires', { date: expiry })}</p>}
    </AuthPageShell>
  );
};

export default AcceptInvitePage;
