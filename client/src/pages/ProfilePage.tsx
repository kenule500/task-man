import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, AlertCircle, CheckCircle2 } from 'lucide-react';

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
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    const fetchProfile = async () => {
      try {
        console.log('Fetching profile...');
        const response = await api.get('/profile');
        console.log('Profile response:', response.data);

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
          localStorage.removeItem('token');
          localStorage.removeItem('user');
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
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      const updated = { ...storedUser, ...response.data };
      localStorage.setItem('user', JSON.stringify(updated));

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
      <div className="bg-white rounded-2xl border border-slate-200 p-8 animate-pulse">
        <div className="flex items-center gap-5 pb-8 border-b border-slate-100 mb-8">
          <div className="w-20 h-20 rounded-2xl bg-slate-200"></div>
          <div className="flex-1 space-y-2">
            <div className="h-5 w-32 bg-slate-200 rounded"></div>
            <div className="h-4 w-48 bg-slate-100 rounded"></div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-24 bg-slate-200 rounded"></div>
              <div className="h-11 bg-slate-100 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <p className="text-slate-700 font-medium">Failed to load profile</p>
        <p className="text-slate-500 text-sm mt-1">Please refresh the page or log in again.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {message && (
        <div className={`p-3 rounded-xl flex items-center gap-2 text-sm ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
            : 'bg-red-50 text-red-600 border border-red-100'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-8">
        {/* Avatar header */}
        <div className="flex items-center gap-5 pb-8 border-b border-slate-100 mb-8">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-3xl font-bold">
            {user.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-900 text-lg">{user.name}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
        </div>

        {/* Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="name" className="text-sm font-medium text-slate-700">Full Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="h-11 bg-slate-50 border-slate-200 rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="jobTitle" className="text-sm font-medium text-slate-700">Job Title</Label>
            <Input
              id="jobTitle"
              value={formData.jobTitle}
              onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
              placeholder="e.g., Product Designer"
              className="h-11 bg-slate-50 border-slate-200 rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm font-medium text-slate-700">Phone</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1 (555) 000-0000"
              className="h-11 bg-slate-50 border-slate-200 rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone" className="text-sm font-medium text-slate-700">Timezone</Label>
            <select
              id="timezone"
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              className="w-full h-11 px-3 border border-slate-200 rounded-lg bg-slate-50 text-sm"
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="language" className="text-sm font-medium text-slate-700">Language</Label>
            <select
              id="language"
              value={formData.language}
              onChange={(e) => setFormData({ ...formData, language: e.target.value })}
              className="w-full h-11 px-3 border border-slate-200 rounded-lg bg-slate-50 text-sm"
            >
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
              <option value="de">German</option>
            </select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="bio" className="text-sm font-medium text-slate-700">Bio</Label>
            <textarea
              id="bio"
              rows={4}
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="Tell us a little about yourself..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-sm resize-none"
              maxLength={280}
            />
            <p className="text-xs text-slate-400 text-right">{formData.bio.length}/280</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saving}
          className="rounded-lg gap-2 bg-primary hover:bg-primary-hover text-white h-11 px-6"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
};

export default ProfilePage;