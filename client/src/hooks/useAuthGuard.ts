import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { clearSession, getStoredUser, getToken, type StoredUser } from '@/utils/session';

interface AuthGuardOptions {
  /** Redirect users who have not finished onboarding (default: true). */
  requireOnboarding?: boolean;
}

/**
 * Protects a page: redirects to /login without a session, and to /onboarding
 * until onboarding is complete. Returns the stored user and a logout action.
 */
export const useAuthGuard = ({ requireOnboarding = true }: AuthGuardOptions = {}) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<StoredUser | null>(getStoredUser);

  useEffect(() => {
    if (!getToken() || !user) {
      navigate('/login');
      return;
    }
    if (requireOnboarding && !user.onboardingComplete) navigate('/onboarding');
  }, [navigate, user, requireOnboarding]);

  const logout = useCallback(async () => {
    // Invalidate the session server-side too; ignore network errors
    await api.post('/auth/logout').catch(() => undefined);
    clearSession();
    navigate('/');
  }, [navigate]);

  return { user, setUser, logout };
};
