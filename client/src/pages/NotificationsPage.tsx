import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Button } from '@/components/ui/button';
import { Save, AlertCircle, CheckCircle2 } from 'lucide-react';

const NotificationsPage = () => {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [notifications, setNotifications] = useState({
    email: true,
    taskAssigned: true,
    taskCompleted: false,
    weeklyDigest: true,
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get('/profile');
        setNotifications({
          email: response.data.notifications?.email ?? true,
          taskAssigned: response.data.notifications?.taskAssigned ?? true,
          taskCompleted: response.data.notifications?.taskCompleted ?? false,
          weeklyDigest: response.data.notifications?.weeklyDigest ?? true,
        });
      } catch (err) {
        console.error('Failed to load notifications:', err);
      }
    };
    fetchProfile();
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/profile/notifications', notifications);
      showMessage('success', 'Notification preferences saved');
    } catch {
      showMessage('error', 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const options = [
    { key: 'email', label: 'General Emails', desc: 'Account updates and important notices' },
    { key: 'taskAssigned', label: 'Task Assigned', desc: 'When someone assigns you a task' },
    { key: 'taskCompleted', label: 'Task Completed', desc: 'When a task in your workspace is completed' },
    { key: 'weeklyDigest', label: 'Weekly Digest', desc: 'A weekly summary of your workspace activity' },
  ];

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
        <div className="mb-6">
          <h3 className="font-semibold text-slate-900">Email Notifications</h3>
          <p className="text-sm text-slate-500 mt-1">Choose what updates you want to receive</p>
        </div>

        <div className="divide-y divide-slate-100">
          {options.map(({ key, label, desc }) => {
            const enabled = notifications[key as keyof typeof notifications];
            return (
              <div key={key} className="flex items-start justify-between py-4">
                <div className="flex-1 pr-4">
                  <p className="font-medium text-slate-900 text-sm">{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNotifications({ ...notifications, [key]: !enabled })}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                    enabled ? 'bg-primary' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                      enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saving}
          className="rounded-lg gap-2 bg-primary hover:bg-primary-hover text-white h-11 px-6"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </div>
    </form>
  );
};

export default NotificationsPage;