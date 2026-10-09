import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { clearSession, getToken, updateStoredUser } from '../utils/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, Field, Surface, UserAvatar } from '@/components/ds';
import { Save, AlertCircle } from 'lucide-react';

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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [user, setUser] = useState<ProfileData | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    jobTitle: '',
    phone: '',
    timezone: 'UTC',
    language: 'en',
  });

  // ============ Fetch profile on mount ============
  useEffect(() => {
    if (!getToken()) {
      navigate('/login');
      return;
    }

    const fetchProfile = async () => {
      try {
        const response = await api.get('/profile');

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
          language: response.data.language || 'en',
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
          text: axiosError.response?.data?.message || 'Failed to load profile',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

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

      showMessage('success', 'Profile updated successfully');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      showMessage('error', axiosError.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Surface padding="lg" aria-busy="true" aria-label="Loading profile">
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
        <AlertCircle className="mx-auto mb-3 size-10 text-red-500" aria-hidden />
        <p className="font-medium text-slate-700">Failed to load profile</p>
        <p className="mt-1 text-sm text-slate-600">Please refresh the page or log in again.</p>
      </Surface>
    );
  }

  const CONTROL = 'h-11 bg-slate-50 border-slate-200 rounded-lg';
  const NATIVE = 'w-full h-11 px-3 border border-slate-200 rounded-lg bg-slate-50 text-base focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm';

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
          <Field label="Full name" htmlFor="name" className="md:col-span-2">
            <Input
              id="name"
              autoComplete="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={CONTROL}
            />
          </Field>

          <Field label="Job title" htmlFor="jobTitle">
            <Input
              id="jobTitle"
              autoComplete="organization-title"
              value={formData.jobTitle}
              onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
              placeholder="e.g., Product Designer"
              className={CONTROL}
            />
          </Field>

          <Field label="Phone" htmlFor="phone">
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

          <Field label="Timezone" htmlFor="timezone">
            <select
              id="timezone"
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              className={NATIVE}
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern Time</option>
              <option value="America/Los_Angeles">Pacific Time</option>
              <option value="Europe/London">London</option>
              <option value="Europe/Paris">Paris</option>
              <option value="Africa/Lagos">Lagos</option>
              <option value="Asia/Tokyo">Tokyo</option>
              <option value="Asia/Dubai">Dubai</option>
            </select>
          </Field>

          <Field label="Language" htmlFor="language">
            <select
              id="language"
              value={formData.language}
              onChange={(e) => setFormData({ ...formData, language: e.target.value })}
              className={NATIVE}
            >
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
              <option value="de">German</option>
            </select>
          </Field>

          <div className="space-y-1.5 md:col-span-2">
            <Field label="Bio" htmlFor="bio">
              <textarea
                id="bio"
                rows={4}
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder="Tell us a little about yourself..."
                className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-base focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                maxLength={280}
              />
            </Field>
            <p className="text-right text-xs text-slate-600">{formData.bio.length}/280</p>
          </div>
        </div>
      </Surface>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saving}
          className="h-11 w-full gap-2 rounded-lg bg-primary px-6 text-white hover:bg-primary-hover sm:w-auto"
        >
          <Save className="size-4" aria-hidden />
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
};

export default ProfilePage;
