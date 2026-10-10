import type { StoredUser } from './session';

/**
 * Where to go right after a sign-in (password, second step or single sign-on): a pending invitation first,
 * then onboarding, then the active workspace. Consumes the pending invitation markers.
 */
export const resolvePostLoginPath = (user: Pick<StoredUser, 'onboardingComplete' | 'activeWorkspaceSlug'>): string => {
  // Pending invite from the /accept-invite flow
  const pendingInviteToken = sessionStorage.getItem('pendingInviteToken');
  if (pendingInviteToken) {
    sessionStorage.removeItem('pendingInviteToken');
    return `/accept-invite/${pendingInviteToken}`;
  }

  // Pending invite code from the /join/:code page
  const pendingInvite = sessionStorage.getItem('pendingInvite');
  if (pendingInvite) {
    sessionStorage.removeItem('pendingInvite');
    return `/join/${pendingInvite}`;
  }

  // Onboarding first; an account marked complete but without a workspace also goes there
  if (!user.onboardingComplete || !user.activeWorkspaceSlug) return '/onboarding';
  return `/${user.activeWorkspaceSlug}/dashboard`;
};
