import { useEffect, useState } from 'react';
import { History, RotateCw } from 'lucide-react';
import { EmptyState, ErrorState, SkeletonList, Tag, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/features/tasks/lib/date';
import { eventLabel } from '../lib/catalog';
import type { Webhook, WebhookDelivery } from '../types';
import { DialogActions, DialogBody, DialogShell } from './DialogShell';

interface DeliveriesDialogProps {
  webhook: Webhook;
  load: (id: string) => Promise<WebhookDelivery[]>;
  redeliver: (id: string, deliveryId: string) => Promise<WebhookDelivery>;
  now?: Date;
  onClose: () => void;
}

const outcome = (delivery: WebhookDelivery): string =>
  delivery.responseStatus ? String(delivery.responseStatus) : delivery.error || 'No response';

/** The latest 50 deliveries of a webhook, with a button to send one again. Mount only while open. */
export const DeliveriesDialog = ({ webhook, load, redeliver, now, onClose }: DeliveriesDialogProps) => {
  const [rows, setRows] = useState<WebhookDelivery[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load(webhook._id)
      .then(list => { if (!cancelled) { setRows(list); setError(''); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'We could not load the deliveries.'); });
    return () => { cancelled = true; };
  }, [load, webhook._id, attempt]);

  const reload = () => setAttempt(current => current + 1);

  const resend = async (delivery: WebhookDelivery) => {
    setBusyId(delivery._id);
    try {
      const result = await redeliver(webhook._id, delivery.deliveryId);
      if (result.status === 'success') toast.success('Delivered again');
      else toast.error(`The receiver did not accept it (${outcome(result)}).`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'We could not send the delivery again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DialogShell
      title={`Deliveries: ${webhook.name}`}
      description="The latest 50 attempts, kept for 14 days. Request bodies never include your secret."
      icon={<History />}
      onClose={onClose}
      wide
    >
      <DialogBody>
        {rows === null && !error ? (
          <SkeletonList label="Loading deliveries" rows={3} avatar={false} bare />
        ) : error ? (
          <ErrorState
            title="Could not load the deliveries"
            reason={error}
            nextStep="Check your connection and try again."
            action={<Button type="button" onClick={() => { setError(''); reload(); }} className="h-10 px-4 md:h-9">Try again</Button>}
          />
        ) : rows!.length === 0 ? (
          <EmptyState
            headingLevel="h3"
            icon={<History />}
            title="No deliveries yet"
            description="Send a test event, or wait for one of the selected events to happen."
          />
        ) : (
          <ul aria-label="Deliveries" className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {rows!.map(delivery => (
              <li key={delivery._id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:px-4">
                <Tag tone={delivery.status === 'success' ? 'success' : 'danger'}>
                  {delivery.status === 'success' ? 'Delivered' : 'Failed'}
                </Tag>
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-sm font-medium text-slate-900">{eventLabel(delivery.event)}</p>
                  <p className="text-xs text-slate-600">
                    <span className="tabular-nums">{outcome(delivery)}</span>
                    <span aria-hidden> · </span>
                    <span className="tabular-nums">{delivery.durationMs} ms</span>
                    <span aria-hidden> · </span>
                    <span>attempt {delivery.attempt}</span>
                    <span aria-hidden> · </span>
                    <time dateTime={delivery.createdAt}>{formatRelativeTime(delivery.createdAt, now)}</time>
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busyId === delivery._id}
                  onClick={() => { void resend(delivery); }}
                  className="h-10 gap-1.5 px-3 text-sm md:h-9"
                >
                  <RotateCw aria-hidden />
                  Redeliver<span className="sr-only"> {eventLabel(delivery.event)}, attempt {delivery.attempt}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogBody>
      <DialogActions>
        <Button type="button" variant="outline" onClick={onClose} className="h-11 sm:h-9">Close</Button>
      </DialogActions>
    </DialogShell>
  );
};
