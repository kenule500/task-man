import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Webhook as WebhookIcon } from 'lucide-react';
import { Field } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { EVENT_GROUPS } from '../lib/catalog';
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
    () => EVENT_GROUPS.map(group => ({ id: group.area, label: group.area, items: group.events })),
    [],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Give the webhook a name.';
    if (!/^https?:\/\/\S+$/i.test(url.trim())) next.url = 'Enter a full URL, like https://example.com/hooks/taskman.';
    if (!all && events.length === 0) next.events = 'Choose at least one event, or send all events.';
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
      title={webhook ? 'Edit webhook' : 'New webhook'}
      description="TaskMan sends a signed JSON request to this URL when the events you pick happen in this workspace."
      icon={<WebhookIcon />}
      onClose={onClose}
      initialFocus={nameRef}
    >
      <form onSubmit={event => { void submit(event); }} noValidate className="flex min-h-0 flex-1 flex-col">
        <DialogBody>
          {failure && <p role="alert" className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg">{failure}</p>}
          <div className="grid gap-4">
            <Field label="Name" htmlFor={`${uid}-name`} required error={errors.name}>
              <Input
                ref={nameRef}
                id={`${uid}-name`}
                value={name}
                maxLength={MAX_WEBHOOK_NAME}
                onChange={event => setName(event.target.value)}
                placeholder="e.g. Deploy bot"
                aria-invalid={Boolean(errors.name)}
                className="h-11 text-base sm:h-9 sm:text-sm"
              />
            </Field>
            <Field
              label="Payload URL"
              htmlFor={`${uid}-url`}
              required
              error={errors.url}
              hint="Must be a public HTTPS address. Redirects are not followed."
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
            <p className="mb-2 text-sm font-medium text-slate-900">Events</p>
            <label className="mb-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-2 sm:min-h-10">
              <Checkbox checked={all} onCheckedChange={value => setAll(value === true)} />
              <span className="text-sm font-medium text-slate-800">All events</span>
              <span className="text-xs text-slate-600">including ones added later</span>
            </label>
            <CheckGroups groups={groups} selected={events} disabled={all} onChange={setEvents} />
            {errors.events && <p role="alert" className="mt-2 text-xs text-danger-fg">{errors.events}</p>}
          </div>
        </DialogBody>
        <DialogActions>
          <Button type="button" variant="outline" onClick={onClose} className="h-11 sm:h-9">Cancel</Button>
          <Button type="submit" disabled={saving} className="h-11 sm:h-9">
            {saving ? 'Saving…' : webhook ? 'Save changes' : 'Create webhook'}
          </Button>
        </DialogActions>
      </form>
    </DialogShell>
  );
};
