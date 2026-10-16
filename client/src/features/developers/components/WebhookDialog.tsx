import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Webhook as WebhookIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { EVENT_GROUPS, areaLabel } from '../lib/catalog';
import { ALL_EVENTS, MAX_WEBHOOK_NAME, type Webhook, type WebhookInput } from '../types';
import { CheckGroups } from './CheckGroups';
import { DialogActions, DialogBody, DialogShell } from './DialogShell';

interface WebhookDialogProps {
  /** Webhook being edited; undefined = a new one */
  webhook?: Webhook;
  /** Resolves to an error message, or `null` once saved. */
  onSave: (input: WebhookInput) => Promise<string | null>;
  onClose: () => void;
}

/** Name, URL and events of a webhook. Mount only while open. */
export const WebhookDialog = ({ webhook, onSave, onClose }: WebhookDialogProps) => {
  const { t } = useTranslation('admin');
  const uid = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(webhook?.name ?? '');
  const [url, setUrl] = useState(webhook?.url ?? '');
  const [all, setAll] = useState(webhook ? webhook.events.includes(ALL_EVENTS) : true);
  const [events, setEvents] = useState<string[]>(webhook && !webhook.events.includes(ALL_EVENTS) ? webhook.events : []);
  const [errors, setErrors] = useState<{ name?: string; url?: string; events?: string }>({});
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);
  const groups = useMemo(
    () => EVENT_GROUPS.map(group => ({ id: group.area, label: areaLabel(group.area), items: group.events })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labels follow the language
    [t],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const next: typeof errors = {};
    if (!name.trim()) next.name = t('developers.webhookNameRequired');
    if (!/^https?:\/\/\S+$/i.test(url.trim())) next.url = t('developers.urlInvalid');
    if (!all && events.length === 0) next.events = t('developers.eventsRequired');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setFailure('');
    const message = await onSave({ name: name.trim(), url: url.trim(), events: all ? [ALL_EVENTS] : events });
    setSaving(false);
    if (message) setFailure(message);
  };

  return (
    <DialogShell
      title={webhook ? t('developers.editWebhook') : t('developers.newWebhook')}
      description={t('developers.webhookDialogDescription')}
      icon={<WebhookIcon />}
      onClose={onClose}
      initialFocus={nameRef}
    >
      <form onSubmit={event => { void submit(event); }} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody>
          {failure && <p role="alert" className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg">{failure}</p>}
          <div className="grid gap-4">
            <Field label={t('developers.name')} htmlFor={`${uid}-name`} required error={errors.name}>
              <Input
                ref={nameRef}
                id={`${uid}-name`}
                value={name}
                maxLength={MAX_WEBHOOK_NAME}
                onChange={event => setName(event.target.value)}
                placeholder={t('developers.hookNamePlaceholder')}
                aria-invalid={Boolean(errors.name)}
                className="h-11 text-base sm:h-9 sm:text-sm"
              />
            </Field>
            <Field
              label={t('developers.payloadUrl')}
              htmlFor={`${uid}-url`}
              required
              error={errors.url}
              hint={t('developers.payloadUrlHint')}
            >
              <Input
                id={`${uid}-url`}
                type="url"
                inputMode="url"
                value={url}
                maxLength={2000}
                onChange={event => setUrl(event.target.value)}
                placeholder="https://example.com/hooks/taskman"
                aria-invalid={Boolean(errors.url)}
                className="h-11 text-base sm:h-9 sm:text-sm"
              />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-900">{t('developers.eventsHeading')}</p>
            <label className="mb-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-2 sm:min-h-10">
              <Checkbox checked={all} onCheckedChange={value => setAll(value === true)} />
              <span className="text-sm font-medium text-slate-800">{t('developers.allEventsLabel')}</span>
              <span className="text-xs text-slate-600">{t('developers.includingLater')}</span>
            </label>
            <CheckGroups groups={groups} selected={events} disabled={all} onChange={setEvents} />
            {errors.events && <p role="alert" className="mt-2 text-xs text-danger-fg">{errors.events}</p>}
          </div>
        </DialogBody>
        <DialogActions>
          <Button type="button" variant="outline" onClick={onClose} className="h-11 sm:h-9">{t('actions.cancel')}</Button>
          <Button type="submit" disabled={saving} className="h-11 sm:h-9">
            {saving ? t('actions.saving') : webhook ? t('developers.saveChanges') : t('developers.createWebhook')}
          </Button>
        </DialogActions>
      </form>
    </DialogShell>
  );
};
