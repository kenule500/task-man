import api from '@/utils/api';
import { getToken, updateStoredUser } from '@/utils/session';
import { setLanguage, type AppLanguage } from '@/i18n';
import { toSupportedLanguage } from '@/i18n/language';

/**
 * Applies a language choice at once (no reload), remembers it in this browser and, when signed in, saves it on the
 * account (PUT /api/profile, field `language`) so it follows the person to other browsers.
 * Resolves to false when the save failed; the choice still applies on this device.
 */
export const saveLanguagePreference = async (language: AppLanguage): Promise<boolean> => {
  await setLanguage(language);
  if (!getToken()) return true;
  updateStoredUser({ language });
  try {
    await api.put('/profile', { language });
    return true;
  } catch {
    return false;
  }
};

/** After sign-in: the account's language wins over what this browser had picked. */
export const applyAccountLanguage = async (language: string | null | undefined): Promise<void> => {
  const supported = toSupportedLanguage(language);
  if (supported) await setLanguage(supported);
};
