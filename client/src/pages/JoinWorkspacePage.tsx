import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

const JoinWorkspacePage = () => {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const join = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        // Not logged in — save code and redirect to login
        sessionStorage.setItem('pendingInvite', inviteCode || '');
        navigate('/login');
        return;
      }

      try {
        const response = await api.post('/workspaces/join', { inviteCode });
        setStatus('success');
        setMessage(`You joined ${response.data.name}!`);

        // Update stored user's active workspace
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const userData = JSON.parse(storedUser);
          userData.activeWorkspace = response.data._id;
          userData.activeWorkspaceSlug = response.data.slug;
          if (!userData.workspaces?.includes(response.data._id)) {
            userData.workspaces = [...(userData.workspaces || []), response.data._id];
          }
          localStorage.setItem('user', JSON.stringify(userData));
        }

        setTimeout(() => navigate(`/${response.data.slug}/dashboard`), 1500);
      } catch (error: unknown) {
        const axiosError = error as { response?: { data?: { message?: string } } };
        setStatus('error');
        setMessage(axiosError.response?.data?.message || 'Failed to join workspace');
      }
    };
    join();
  }, [inviteCode, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Joining workspace</h1>
            <p className="text-slate-500">Please wait...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome!</h1>
            <p className="text-slate-500">{message}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Couldn't join</h1>
            <p className="text-slate-500">{message}</p>
          </>
        )}
      </div>
    </div>
  );
};

export default JoinWorkspacePage;