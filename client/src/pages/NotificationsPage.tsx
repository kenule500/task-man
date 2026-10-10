import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Button } from '@/components/ui/button';
import { Alert, Surface } from '@/components/ds';
import { Bell, Save } from 'lucide-react';

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

  const options: { key: keyof typeof notifications; label: string; desc: string }[] = [
    {
      key: 'email',
      label: 'Send me emails',
      desc: 'The main switch for email. When it is off you get no emails, only notifications in the app.',
    },
    {
      key: 'taskAssigned',
      label: 'Assignments, mentions and comments',
      desc: 'Email me when someone assigns me a task, mentions me in a comment, or comments on a task I own or am assigned to.',
    },
    {
      key: 'taskCompleted',
      label: 'Completed tasks',
      desc: 'Email me when a task I own or am assigned to is marked completed by someone else.',
    },
    {
      key: 'weeklyDigest',
      label: 'Weekly digest',
      desc: 'Not sent yet. Your choice is saved for when the weekly summary launches.',
    },
  ];

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {message && <Alert tone={message.type}>{message.text}</Alert>}

      <Surface padding="lg">
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
            <Bell className="size-4" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">In the app</h2>
            <p className="mt-1 text-sm text-slate-600">
              Always on. The bell in the top bar and your <span className="font-medium">Inbox</span> show assignments,
              completed tasks, mentions and comments on your tasks. They are kept for 90 days, and you are never
              notified about your own actions.
            </p>
          </div>
        </div>
      </Surface>

      <Surface padding="lg">
        <div className="mb-6">
          <h2 className="font-semibold text-slate-900">Email</h2>
          <p className="mt-1 text-sm text-slate-600">
            Choose which of those notifications also reach your inbox.
            {!notifications.email && ' Email is off, so nothing below is sent.'}
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {options.map(({ key, label, desc }) => {
            const enabled = notifications[key];
            return (
              <div key={key} className="flex items-start justify-between py-4">
                <div className="flex-1 pr-4">
                  <p id={`notif-${key}`} className="text-sm font-medium text-slate-900">{label}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-labelledby={`notif-${key}`}
                  onClick={() => setNotifications({ ...notifications, [key]: !enabled })}
                  className={`relative h-6 w-11 shrink-0 rounded-full motion-safe:transition-colors before:absolute before:-inset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    enabled ? 'bg-primary' : 'bg-slate-500'
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm motion-safe:transition-transform ${
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
          <Save className="size-4" aria-hidden />
          {saving ? 'Saving...' : 'Save preferences'}
        </Button>
      </div>
    </form>
  );
};

export default NotificationsPage;
