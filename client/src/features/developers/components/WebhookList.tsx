import { History, Pencil, RefreshCw, Send, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Surface, Tag } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { RuleSwitch } from '@/features/automations';
import { formatRelativeTime } from '@/features/tasks/lib/date';
import { describeEvents } from '../lib/catalog';
import type { Webhook } from '../types';

interface WebhookListProps {
  hooks: Webhook[];
  now?: Date;
  /** Id of the webhook with a request in flight */
  busyId?: string | null;
  onToggle: (hook: Webhook, active: boolean) => void;
  onEdit: (hook: Webhook) => void;
  onTest: (hook: Webhook) => void;
  onRotate: (hook: Webhook) => void;
  onDeliveries: (hook: Webhook) => void;
  onDelete: (hook: Webhook) => void;
}

const ACTION = 'h-10 gap-1.5 px-3 text-sm md:h-9';

/** Webhooks as cards: on/off switch, URL, events, health and the row of actions. */
export const WebhookList = ({ hooks, now, busyId, onToggle, onEdit, onTest, onRotate, onDeliveries, onDelete }: WebhookListProps) => {
  const { t } = useTranslation('admin');
  return (
  <ul aria-label={t('developers.webhookList')} className="space-y-3">
    {hooks.map(hook => {
      const busy = busyId === hook._id;
      return (
        <li key={hook._id}>
          <Surface as="article" radius="xl" padding="sm" className="space-y-3 sm:p-5" aria-label={hook.name}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="break-words text-base font-semibold text-slate-900">{hook.name}</h3>
                <p className="mt-0.5 break-all font-mono text-xs text-slate-600">{hook.url}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {!hook.active && <Tag tone="neutral">{t('developers.off')}</Tag>}
                  <Tag tone="primary">{describeEvents(hook.events)}</Tag>
                  {hook.failureCount > 0 && (
                    <Tag tone="danger">{t('developers.failedInARow', { n: hook.failureCount })}</Tag>
                  )}
                </div>
              </div>
              <RuleSwitch
                checked={hook.active}
                label={t('developers.hookSwitch', { name: hook.name, state: hook.active ? t('developers.stateOn') : t('developers.stateOff') })}
                disabled={busy}
                onChange={value => onToggle(hook, value)}
              />
            </div>

            <p className="text-xs text-slate-600">
              {hook.lastDeliveryAt ? t('developers.lastDelivery', { when: formatRelativeTime(hook.lastDeliveryAt, now) }) : t('developers.noDeliveries')}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => onTest(hook)} className={ACTION}>
                <Send aria-hidden />{t('developers.sendTest')}<span className="sr-only">{t('developers.toSr', { name: hook.name })}</span>
              </Button>
              <Button type="button" variant="outline" onClick={() => onDeliveries(hook)} className={ACTION}>
                <History aria-hidden />{t('developers.deliveries')}<span className="sr-only">{t('developers.ofSr', { name: hook.name })}</span>
              </Button>
              <Button type="button" variant="outline" onClick={() => onEdit(hook)} className={ACTION}>
                <Pencil aria-hidden />{t('actions.edit')}<span className="sr-only">{t('developers.revokeSr', { name: hook.name })}</span>
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => onRotate(hook)} className={ACTION}>
                <RefreshCw aria-hidden />{t('developers.rotateSecret')}<span className="sr-only">{t('developers.ofSr', { name: hook.name })}</span>
              </Button>
              <Button type="button" variant="ghost" onClick={() => onDelete(hook)} className={`${ACTION} text-danger-fg hover:bg-danger-bg`}>
                <Trash2 aria-hidden />{t('actions.delete')}<span className="sr-only">{t('developers.revokeSr', { name: hook.name })}</span>
              </Button>
            </div>
          </Surface>
        </li>
      );
    })}
  </ul>
  );
};
