import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import api from '../utils/api';
import { Button } from '@/components/ui/button';
import { Alert, SwitchField, Surface } from '@/components/ds';
import { Bell, Save } from 'lucide-react';
import { PushDeviceSettings } from '@/features/notifications';

const SwitchRow = ({ id, label, desc, checked, onChange }: { id: string; label: string; desc: string; checked: boolean; onChange: (value: boolean) => void }) => (
  <SwitchField id={id} className="py-4" label={label} description={desc} checked={checked} onCheckedChange={onChange} />
);

const NotificationsPage = () => {
  const { t } = useTranslation('settings');
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
      showMessage('success', t('notifications.saved'));
    } catch {
      showMessage('error', t('notifications.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const options: { key: Exclude<keyof typeof notifications, 'push'>; label: string; desc: string }[] = (
    ['email', 'taskAssigned', 'taskCompleted', 'weeklyDigest'] as const
  ).map((key) => ({ key, label: t(`notifications.options.${key}.label`), desc: t(`notifications.options.${key}.desc`) }));

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {message && <Alert tone={message.type}>{message.text}</Alert>}

      <Surface padding="lg">
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
            <Bell className="size-4" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">{t('notifications.inApp.title')}</h2>
            <p className="mt-1 text-sm text-slate-600">
              <Trans t={t} i18nKey="notifications.inApp.description" components={{ b: <span className="font-medium" /> }} />
            </p>
          </div>
        </div>
      </Surface>

      <Surface padding="lg">
        <div className="mb-6">
          <h2 className="font-semibold text-slate-900">{t('notifications.email.title')}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {t('notifications.email.description')}
            {!notifications.email && ` ${t('notifications.email.off')}`}
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
          <h2 className="font-semibold text-slate-900">{t('notifications.push.title')}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {t('notifications.push.description')}
          </p>
        </div>

        <PushDeviceSettings />

        <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          <SwitchRow
            id="notif-push"
            label={t('notifications.push.label')}
            desc={t('notifications.push.desc')}
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
          {saving ? t('profile.saving') : t('notifications.save')}
        </Button>
      </div>
    </form>
  );
};

export default NotificationsPage;
