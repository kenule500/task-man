import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Button } from '@/components/ui/button';
import {
  Loader2, XCircle, Users, ArrowRight,
} from 'lucide-react';

interface Invitation {
  workspace: { _id: string; name: string; slug: string };
  role: { _id: string; name: string; description: string };
  invitedBy: { _id: string; name: string; email: string };
  email: string;
  expiresAt: string;
}

const AcceptInvitePage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchInvitation = async () => {
      try {
        const response = await api.get(`/invitations/${token}`);
        setInvitation(response.data);
      } catch (err: unknown) {
        const axiosError = err as { response?: { data?: { message?: string } } };
        setError(axiosError.response?.data?.message || 'Failed to load invitation');
      } finally {
        setLoading(false);
      }
    };
    fetchInvitation();
  }, [token]);

  const handleAccept = async () => {
    const authToken = localStorage.getItem('token');
    if (!authToken) {
      // Save pending invite and redirect to login
      sessionStorage.setItem('pendingInviteToken', token || '');
      navigate('/login');
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.post(`/invitations/${token}/accept`);
      const workspace = response.data.workspace;

      // Update stored user's active workspace
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        userData.activeWorkspace = workspace._id;
        userData.activeWorkspaceSlug = workspace.slug;
        localStorage.setItem('user', JSON.stringify(userData));
      }

      navigate(`/${workspace.slug}/dashboard`);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || 'Failed to accept invitation');
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    setSubmitting(true);
    try {
      await api.post(`/invitations/${token}/decline`);
      navigate('/');
    } catch {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Invitation Invalid</h1>
          <p className="text-slate-500 mb-6">{error || 'This invitation is no longer valid.'}</p>
          <Button onClick={() => navigate('/')} variant="outline" className="w-full h-11 rounded-xl">
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            You've been invited!
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            <span className="font-semibold text-slate-700">{invitation.invitedBy.name}</span>
            {' '}invited you to join{' '}
            <span className="font-semibold text-slate-700">{invitation.workspace.name}</span>
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Your Role
            </span>
            <span className="text-sm font-semibold text-primary">
              {invitation.role.name}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {invitation.role.description}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            onClick={handleAccept}
            disabled={submitting}
            className="w-full h-11 rounded-xl bg-primary hover:bg-primary-hover text-white gap-2"
          >
            {submitting ? 'Joining...' : (
              <>
                Accept Invitation <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
          <Button
            onClick={handleDecline}
            disabled={submitting}
            variant="outline"
            className="w-full h-11 rounded-xl"
          >
            Decline
          </Button>
        </div>

        <p className="text-xs text-slate-400 text-center mt-6">
          This invitation expires in 3 days.
        </p>
      </div>
    </div>
  );
};

export default AcceptInvitePage;