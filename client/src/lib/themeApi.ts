import api from '@/utils/api';
import { getToken } from '@/utils/session';
import { setThemePreference, syncThemeFromUser, type ThemePreference } from './theme';

/**
 * Applies a theme choice at once and, when signed in, saves it on the account (PUT /api/profile) so it follows
 * the person to other browsers. Resolves to false when the save failed; the choice still applies on this device.
 */
export const saveThemePreference = async (next: ThemePreference): Promise<boolean> => {
  setThemePreference(next);
  if (!getToken()) return true;
  try {
    await api.put('/profile', { theme: next });
    return true;
  } catch {
    return false;
  }
};

let loadedThisPage = false;

/** Fetches the account's saved theme once per page load. Failures are ignored (local choice stays). */
export const loadThemeFromAccount = async (): Promise<void> => {
  if (!getToken() || loadedThisPage) return;
  loadedThisPage = true;
  try {
    const { data } = await api.get('/profile');
    syncThemeFromUser(data);
  } catch {
    // Offline or expired session: keep the local preference
  }
};
