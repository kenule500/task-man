import { getStoredUser, getToken } from '../../utils/session';

/** Where the primary landing-page call to action should lead for the current visitor. */
export const getLandingAuth = (): { isLoggedIn: boolean; appUrl: string } => {
  const user = getStoredUser();
  if (getToken() && user) {
    if (user.activeWorkspaceSlug) return { isLoggedIn: true, appUrl: `/${user.activeWorkspaceSlug}/dashboard` };
    if (user.onboardingComplete === false) return { isLoggedIn: true, appUrl: '/onboarding' };
  }
  return { isLoggedIn: false, appUrl: '/signup' };
};
