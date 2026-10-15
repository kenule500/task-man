import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import api from '../utils/api';
import { clearSession, saveSession } from '../utils/session';
import { resolvePostLoginPath } from '../utils/postLogin';
import { AuthPageShell, AuthStatusHeader } from '@/components/auth/AuthPageShell';
import { clearFragment, consumeSsoPending, parseSsoFragment, storedUserFromProfile } from '@/features/sso';

/**
 * Landing page of a single sign-on: the server redirects here with the session token in the URL fragment
 * (`/sso/complete#token=...`), which never reaches a server log. The fragment is removed from the address bar
 * and history first, then the session is stored like a password sign-in and the person continues.
 */
const SsoCompletePage = () => {
  const navigate = useNavigate();
  // The fragment is read (and removed) once, even when React runs the effect twice in development
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const { token, redirect } = parseSsoFragment(window.location.hash);
    clearFragment();

    const fail = (code: string) => navigate(`/login?sso_error=${code}`, { replace: true });
    if (!token) {
      fail('invalid_state');
      return;
    }
    // Only a sign-in started in this tab is accepted
    if (!consumeSsoPending()) {
      fail('not_started');
      return;
    }

    void (async () => {
      try {
        // Store the token first: the request interceptor sends the stored token, and a previous account may still be there
        saveSession(token, { _id: '', name: '', email: '' });
        const { data } = await api.get('/profile');
        const user = storedUserFromProfile(data);
        saveSession(token, user);
        navigate(redirect ?? resolvePostLoginPath(user), { replace: true });
      } catch {
        clearSession();
        fail('server_error');
      }
    })();
  }, [navigate]);

  return (
    <AuthPageShell>
      <div role="status" aria-live="polite">
        <AuthStatusHeader icon={<Loader2 />} spin title="Signing you in" description="Please wait a moment..." />
      </div>
    </AuthPageShell>
  );
};

export default SsoCompletePage;
