import { useState } from 'react';
import { Plus, Webhook as WebhookIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, SectionHeader, SkeletonList, Surface, toast } from '@/components/ds';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { Button } from '@/components/ui/button';
import { verifySnippet } from '../lib/snippets';
import { MAX_WEBHOOKS, type Webhook, type WebhookDelivery, type WebhookInput, type WebhookWithSecret } from '../types';
import { CodeBlock } from './CodeBlock';
import { DeliveriesDialog } from './DeliveriesDialog';
import { SecretReveal } from './SecretReveal';
import { WebhookDialog } from './WebhookDialog';
import { WebhookList } from './WebhookList';

interface WebhooksSectionProps {
  hooks: Webhook[];
  loading: boolean;
  error: string;
  onReload: () => void;
  onCreate: (input: WebhookInput) => Promise<WebhookWithSecret>;
  onUpdate: (id: string, patch: Partial<WebhookInput> & { active?: boolean }) => Promise<Webhook>;
  onDelete: (id: string) => Promise<void>;
  onRotate: (id: string) => Promise<WebhookWithSecret>;
  onTest: (id: string) => Promise<WebhookDelivery>;
  loadDeliveries: (id: string) => Promise<WebhookDelivery[]>;
  onRedeliver: (id: string, deliveryId: string) => Promise<WebhookDelivery>;
}

type Editor = { hook?: Webhook } | null;

/** Outbound webhooks (settings:manage): list, add/edit, secret reveal and rotation, test events, delivery log. */
export const WebhooksSection = ({
  hooks, loading, error, onReload, onCreate, onUpdate, onDelete, onRotate, onTest, loadDeliveries, onRedeliver,
}: WebhooksSectionProps) => {
  const { t } = useTranslation('admin');
  const [editor, setEditor] = useState<Editor>(null);
  const [secret, setSecret] = useState<{ title: string; value: string } | null>(null);
  const [viewing, setViewing] = useState<Webhook | null>(null);
  const [deleting, setDeleting] = useState<Webhook | null>(null);
  const [rotating, setRotating] = useState<Webhook | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const atLimit = hooks.length >= MAX_WEBHOOKS;

  const save = async (input: WebhookInput): Promise<string | null> => {
    try {
      if (editor?.hook) {
        await onUpdate(editor.hook._id, input);
        toast.success(t('developers.webhookSaved'));
      } else {
        const created = await onCreate(input);
        setSecret({ title: t('developers.webhookSecretTitle'), value: created.secret });
      }
      setEditor(null);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : t('developers.webhookSaveError');
    }
  };

  const toggle = async (hook: Webhook, active: boolean) => {
    setBusyId(hook._id);
    try {
      await onUpdate(hook._id, { active });
      toast.success(active ? t('developers.hookOn', { name: hook.name }) : t('developers.hookOff', { name: hook.name }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('developers.hookChangeError'));
    } finally {
      setBusyId(null);
    }
  };

  const test = async (hook: Webhook) => {
    setBusyId(hook._id);
    try {
      const delivery = await onTest(hook._id);
      if (delivery.status === 'success') toast.success(t('developers.testDelivered', { status: delivery.responseStatus }));
      else toast.error(t('developers.testRejected', { status: delivery.responseStatus ?? delivery.error }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('developers.testError'));
    } finally {
      setBusyId(null);
    }
  };

  const confirmRotate = async () => {
    if (!rotating) return;
    setConfirmBusy(true);
    try {
      const result = await onRotate(rotating._id);
      setRotating(null);
      setSecret({ title: t('developers.newSecretTitle'), value: result.secret });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('developers.rotateError'));
    } finally {
      setConfirmBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setConfirmBusy(true);
    try {
      await onDelete(deleting._id);
      toast.success(t('developers.hookDeleted', { name: deleting.name }));
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('developers.hookDeleteError'));
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <Surface radius="xl" className="space-y-4 sm:p-6">
      <SectionHeader
        title={t('developers.webhooksTitle')}
        icon={<WebhookIcon aria-hidden className="size-4 text-slate-500" />}
        count={loading || error ? undefined : hooks.length}
        className="mb-0"
        action={(
          <Button
            type="button"
            disabled={loading || Boolean(error) || atLimit}
            onClick={() => setEditor({})}
            className="h-11 gap-2 px-4 text-sm sm:h-10"
          >
            <Plus aria-hidden />
            {t('developers.newWebhook')}
          </Button>
        )}
      />
      <p className="text-sm text-slate-600">
        {t('developers.webhooksIntro')}
      </p>

      {loading ? (
        <SkeletonList label={t('developers.webhooksLoading')} rows={2} avatar={false} />
      ) : error ? (
        <ErrorState
          title={t('developers.webhooksLoadFailed')}
          reason={error}
          nextStep={t('developers.checkConnection')}
          action={<Button type="button" onClick={onReload} className="h-10 px-4 md:h-9">{t('actions.retry')}</Button>}
        />
      ) : hooks.length === 0 ? (
        <EmptyState
          headingLevel="h3"
          icon={<WebhookIcon />}
          title={t('developers.noWebhooks')}
          description={t('developers.noWebhooksBody')}
        />
      ) : (
        <WebhookList
          hooks={hooks}
          busyId={busyId}
          onToggle={(hook, active) => { void toggle(hook, active); }}
          onEdit={hook => setEditor({ hook })}
          onTest={hook => { void test(hook); }}
          onRotate={setRotating}
          onDeliveries={setViewing}
          onDelete={setDeleting}
        />
      )}
      {atLimit && (
        <p role="status" className="text-sm text-slate-600">
          {t('developers.webhookLimit', { max: MAX_WEBHOOKS })}
        </p>
      )}

      <CodeBlock label={t('developers.verifySignature')} code={verifySnippet()} />
      <p className="text-xs text-slate-600">
        {t('developers.headersBefore')} <code className="font-mono">X-TaskMan-Event</code>, <code className="font-mono">X-TaskMan-Delivery</code> {t('developers.headersAnd')}{' '}
        <code className="font-mono">X-TaskMan-Signature</code>. {t('developers.headersAfter')}
      </p>

      {editor && <WebhookDialog webhook={editor.hook} onSave={save} onClose={() => setEditor(null)} />}
      {secret && <SecretReveal title={secret.title} noun={t('developers.nounSecret')} secret={secret.value} onClose={() => setSecret(null)} />}
      {viewing && <DeliveriesDialog webhook={viewing} load={loadDeliveries} redeliver={onRedeliver} onClose={() => setViewing(null)} />}

      <ConfirmActionDialog
        open={Boolean(rotating)}
        onOpenChange={open => { if (!open && !confirmBusy) setRotating(null); }}
        title={t('developers.rotateTitle')}
        description={rotating ? t('developers.rotateBody', { name: rotating.name }) : ''}
        confirmLabel={t('developers.rotateConfirm')}
        busyLabel={t('developers.rotating')}
        busy={confirmBusy}
        onConfirm={() => { void confirmRotate(); }}
      />
      <ConfirmActionDialog
        open={Boolean(deleting)}
        onOpenChange={open => { if (!open && !confirmBusy) setDeleting(null); }}
        title={t('developers.hookDeleteTitle')}
        description={deleting ? t('developers.hookDeleteBody', { name: deleting.name }) : ''}
        confirmLabel={t('developers.hookDeleteConfirm')}
        busyLabel={t('developers.deleting')}
        busy={confirmBusy}
        onConfirm={() => { void confirmDelete(); }}
      />
    </Surface>
  );
};
