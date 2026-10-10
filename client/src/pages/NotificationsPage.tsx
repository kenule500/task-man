import { useEffect, useState } from 'react';
import api from '../utils/api';
import { Button } from '@/components/ui/button';
import { Alert, SwitchField, Surface } from '@/components/ds';
import { Bell, Save } from 'lucide-react';
import { PushDeviceSettings } from '@/features/notifications';

const SwitchRow = ({ id, label, desc, checked, onChange }: { id: string; label: string; desc: string; checked: boolean; onChange: (value: boolean) => void }) => (
  <SwitchField id={id} className="py-4" label={label} description={desc} checked={checked} onCheckedChange={onChange} />
);

const NotificationsPage = () => {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [notifications, setNotifications] = useState({
    email: true,
    taskAssigned: true,
    taskCompleted: false,
    weeklyDigest: true,
    push: true,
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
          push: response.data.notifications?.push ?? true,
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

  const options: { key: Exclude<keyof typeof notifications, 'push'>; label: string; desc: string }[] = [
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
          {options.map(({ key, label, desc }) => (
            <SwitchRow
              key={key}
              id={`notif-${key}`}
              label={label}
              desc={desc}
              checked={notifications[key]}
              onChange={value => setNotifications({ ...notifications, [key]: value })}
            />
          ))}
        </div>
      </Surface>

      <Surface padding="lg">
        <div className="mb-4">
          <h2 className="font-semibold text-slate-900">Push</h2>
          <p className="mt-1 text-sm text-slate-600">
            Pop-up notifications from your browser or phone, for the same events as the bell.
          </p>
        </div>

        <PushDeviceSettings />

        <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          <SwitchRow
            id="notif-push"
            label="Send me push notifications"
            desc="Applies to every device where push is on. Turn it off to pause push without removing your devices. Saved with the other preferences."
            checked={notifications.push}
            onChange={value => setNotifications({ ...notifications, push: value })}
          />
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
