import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Button } from '@/components/ui/button';
import { Alert, Surface } from '@/components/ds';
import { Save } from 'lucide-react';

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
      {message && <Alert tone={message.type}>{message.text}</Alert>}

      <Surface padding="lg">
        <div className="mb-6">
          <h2 className="font-semibold text-slate-900">Email Notifications</h2>
          <p className="mt-1 text-sm text-slate-500">Choose what updates you want to receive</p>
        </div>

        <div className="divide-y divide-slate-100">
          {options.map(({ key, label, desc }) => {
            const enabled = notifications[key as keyof typeof notifications];
            return (
              <div key={key} className="flex items-start justify-between py-4">
                <div className="flex-1 pr-4">
                  <p id={`notif-${key}`} className="text-sm font-medium text-slate-900">{label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-labelledby={`notif-${key}`}
                  onClick={() => setNotifications({ ...notifications, [key]: !enabled })}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors before:absolute before:-inset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    enabled ? 'bg-primary' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${
                      enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </Surface>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saving}
          className="h-11 w-full gap-2 rounded-lg bg-primary px-6 text-white hover:bg-primary-hover sm:w-auto"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </div>
    </form>
  );
};

export default NotificationsPage;
