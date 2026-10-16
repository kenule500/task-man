import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import { clearSession, getToken, updateStoredUser } from '../utils/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, Field, SegmentedControl, Surface, UserAvatar } from '@/components/ds';
import { Save, AlertCircle, Monitor, Moon, Sun } from 'lucide-react';
import { isThemePreference, syncThemeFromUser, useThemePreference, type ThemePreference } from '@/lib/theme';
import { saveThemePreference } from '@/lib/themeApi';
import { saveLanguagePreference } from '@/lib/languageApi';
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, isSupportedLanguage, toSupportedLanguage } from '@/i18n/language';

const THEME_ICONS = { light: <Sun />, dark: <Moon />, system: <Monitor /> };
const THEME_VALUES = ['light', 'dark', 'system'] as const;

interface ProfileData {
  _id: string;
  name: string;
  email: string;
  bio?: string;
  jobTitle?: string;
  phone?: string;
  timezone?: string;
  language?: string;
}

const ProfilePage = () => {
  const { t, i18n } = useTranslation('settings');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [user, setUser] = useState<ProfileData | null>(null);
  const { preference: themePreference } = useThemePreference();

  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    jobTitle: '',
    phone: '',
    timezone: 'UTC',
  });
  // The interface language is chosen here and in the header; it applies at once and is saved on the account
  const language = toSupportedLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'en';

  // ============ Fetch profile on mount ============
  useEffect(() => {
    if (!getToken()) {
      navigate('/login');
      return;
    }

    const fetchProfile = async () => {
      try {
        const response = await api.get('/profile');
        // The account's saved theme wins over this browser's, so it follows the person between devices
        if (isThemePreference(response.data.theme)) syncThemeFromUser(response.data);

        setUser({
          _id: response.data._id,
          name: response.data.name,
          email: response.data.email,
        });

        setFormData({
          name: response.data.name || '',
          bio: response.data.bio || '',
          jobTitle: response.data.jobTitle || '',
          phone: response.data.phone || '',
          timezone: response.data.timezone || 'UTC',
        });
      } catch (err: unknown) {
        const axiosError = err as { response?: { status?: number; data?: { message?: string } } };
        console.error('Profile fetch failed:', axiosError.response?.data || err);

        if (axiosError.response?.status === 401) {
          clearSession();
          navigate('/login');
          return;
        }

        setMessage({
          type: 'error',
          text: axiosError.response?.data?.message || t('profile.loadFailed'),
        });
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await api.put('/profile', formData);

      // Update stored user
      updateStoredUser(response.data);

      // Update local state
      setUser({
        _id: response.data._id,
        name: response.data.name,
        email: response.data.email,
      });

      showMessage('success', t('profile.updated'));
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      showMessage('error', axiosError.response?.data?.message || t('profile.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = async (next: ThemePreference) => {
    const saved = await saveThemePreference(next);
    if (!saved) showMessage('error', t('profile.themeSaveFailed'));
  };

  const handleLanguageChange = async (next: string) => {
    if (!isSupportedLanguage(next)) return;
    const saved = await saveLanguagePreference(next);
    if (!saved) showMessage('error', t('common:languageSaveFailed'));
  };

  if (loading) {
    return (
      <Surface padding="lg" aria-busy="true" aria-label={t('profile.loading')}>
        <div className="mb-8 flex items-center gap-5 border-b border-slate-100 pb-8">
          <Skeleton className="size-16 rounded-full bg-slate-200 sm:size-20" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32 bg-slate-200" />
            <Skeleton className="h-4 w-48 max-w-full bg-slate-100" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24 bg-slate-200" />
              <Skeleton className="h-11 bg-slate-100" />
            </div>
          ))}
        </div>
      </Surface>
    );
  }

  if (!user) {
    return (
      <Surface padding="lg" className="text-center">
        <AlertCircle className="mx-auto mb-3 size-10 text-danger-fg" aria-hidden />
        <p className="font-medium text-slate-700">{t('profile.loadFailed')}</p>
        <p className="mt-1 text-sm text-slate-600">{t('profile.loadFailedHint')}</p>
      </Surface>
    );
  }

  const CONTROL = 'h-11 bg-slate-50 border-slate-200 rounded-lg';
  const NATIVE = 'w-full h-11 px-3 border border-slate-200 rounded-lg bg-slate-50 text-base dark:bg-input/30 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm';

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {message && <Alert tone={message.type}>{message.text}</Alert>}

      <Surface padding="lg">
        {/* Avatar header */}
        <div className="mb-8 flex items-center gap-4 border-b border-slate-100 pb-8 sm:gap-5">
          <UserAvatar name={user.name} size="lg" className="size-16 text-xl sm:size-20 sm:text-3xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-sm text-slate-600">{user.email}</p>
          </div>
        </div>

        {/* Form */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Field label={t('profile.fullName')} htmlFor="name" className="md:col-span-2">
            <Input
              id="name"
              autoComplete="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={CONTROL}
            />
          </Field>

          <Field label={t('profile.jobTitle')} htmlFor="jobTitle">
            <Input
              id="jobTitle"
              autoComplete="organization-title"
              value={formData.jobTitle}
              onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
              placeholder={t('profile.jobTitlePlaceholder')}
              className={CONTROL}
            />
          </Field>

          <Field label={t('profile.phone')} htmlFor="phone">
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1 (555) 000-0000"
              className={CONTROL}
            />
          </Field>

          <Field label={t('profile.timezone')} htmlFor="timezone">
            <select
              id="timezone"
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              className={NATIVE}
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">{t('profile.timezones.newYork')}</option>
              <option value="America/Los_Angeles">{t('profile.timezones.losAngeles')}</option>
              <option value="Europe/London">{t('profile.timezones.london')}</option>
              <option value="Europe/Paris">{t('profile.timezones.paris')}</option>
              <option value="Africa/Lagos">{t('profile.timezones.lagos')}</option>
              <option value="Asia/Tokyo">{t('profile.timezones.tokyo')}</option>
              <option value="Asia/Dubai">{t('profile.timezones.dubai')}</option>
            </select>
          </Field>

          <Field label={t('common:language')} htmlFor="language">
            <select
              id="language"
              value={language}
              onChange={(e) => { void handleLanguageChange(e.target.value); }}
              className={NATIVE}
            >
              {SUPPORTED_LANGUAGES.map((code) => (
                <option key={code} value={code} lang={code}>{LANGUAGE_NAMES[code]}</option>
              ))}
            </select>
          </Field>

          <div className="space-y-1.5 md:col-span-2">
            <Field label={t('profile.bio')} htmlFor="bio">
              <textarea
                id="bio"
                rows={4}
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder={t('profile.bioPlaceholder')}
                className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-base dark:bg-input/30 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                maxLength={280}
              />
            </Field>
            <p className="text-end text-xs text-slate-600">{formData.bio.length}/280</p>
          </div>
        </div>
      </Surface>

      <Surface as="section" padding="lg" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className="text-base font-semibold text-slate-900">{t('profile.appearance')}</h2>
        <p className="mt-1 mb-4 text-sm text-slate-600">
          {t('profile.appearanceHint')}
        </p>
        <SegmentedControl
          aria-label={t('profile.theme')}
          options={THEME_VALUES.map((value) => ({ value, label: t(`profile.themes.${value}`), icon: THEME_ICONS[value] }))}
          value={themePreference}
          onValueChange={(next) => { void handleThemeChange(next); }}
        />
      </Surface>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saving}
          className="h-11 w-full gap-2 rounded-lg bg-primary px-6 text-white hover:bg-primary-hover sm:w-auto"
        >
          <Save className="size-4" aria-hidden />
          {saving ? t('profile.saving') : t('profile.save')}
        </Button>
      </div>
    </form>
  );
};

export default ProfilePage;
