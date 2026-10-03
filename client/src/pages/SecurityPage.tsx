import { useState } from 'react';
import api from '../utils/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

const SecurityPage = () => {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showMessage('error', 'New passwords do not match');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      showMessage('error', 'Password must be at least 8 characters');
      return;
    }

    setSaving(true);
    try {
      await api.put('/profile/password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showMessage('success', 'Password changed successfully');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      showMessage('error', axiosError.response?.data?.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
        <div className="mb-6">
          <h3 className="font-semibold text-slate-900">Change Password</h3>
          <p className="text-sm text-slate-500 mt-1">Update your password to keep your account secure</p>
        </div>

        <div className="space-y-5 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="currentPassword" className="text-sm font-medium text-slate-700">Current Password</Label>
            <Input
              id="currentPassword"
              type="password"
              required
              value={passwordData.currentPassword}
              onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
              className="h-11 bg-slate-50 border-slate-200 rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword" className="text-sm font-medium text-slate-700">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              required
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
              className="h-11 bg-slate-50 border-slate-200 rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              required
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
              className="h-11 bg-slate-50 border-slate-200 rounded-lg"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saving}
          className="rounded-lg gap-2 bg-primary hover:bg-primary-hover text-white h-11 px-6"
        >
          <Lock className="w-4 h-4" />
          {saving ? 'Updating...' : 'Update Password'}
        </Button>
      </div>
    </form>
  );
};

export default SecurityPage;