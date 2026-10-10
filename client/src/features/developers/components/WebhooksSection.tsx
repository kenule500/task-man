import { useState } from 'react';
import { Plus, Webhook as WebhookIcon } from 'lucide-react';
import { EmptyState, ErrorState, SectionHeader, SkeletonCards, Surface, toast } from '@/components/ds';
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
        toast.success('Webhook saved');
      } else {
        const created = await onCreate(input);
        setSecret({ title: 'Your webhook secret', value: created.secret });
      }
      setEditor(null);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'We could not save the webhook.';
    }
  };

  const toggle = async (hook: Webhook, active: boolean) => {
    setBusyId(hook._id);
    try {
      await onUpdate(hook._id, { active });
      toast.success(active ? `"${hook.name}" is on` : `"${hook.name}" is off`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'We could not change the webhook.');
    } finally {
      setBusyId(null);
    }
  };

  const test = async (hook: Webhook) => {
    setBusyId(hook._id);
    try {
      const delivery = await onTest(hook._id);
      if (delivery.status === 'success') toast.success(`Test event delivered (${delivery.responseStatus})`);
      else toast.error(`The receiver did not accept the test event (${delivery.responseStatus ?? delivery.error}).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'We could not send the test event.');
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
      setSecret({ title: 'Your new webhook secret', value: result.secret });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'We could not rotate the secret.');
    } finally {
      setConfirmBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setConfirmBusy(true);
    try {
      await onDelete(deleting._id);
      toast.success(`"${deleting.name}" deleted`);
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'We could not delete the webhook.');
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <Surface radius="xl" className="space-y-4 sm:p-6">
      <SectionHeader
        title="Webhooks"
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
            New webhook
          </Button>
        )}
      />
      <p className="text-sm text-slate-600">
        Webhooks tell other systems when something happens here. Each request is signed with the webhook secret so the receiver can check it came from TaskMan.
      </p>

      {loading ? (
        <SkeletonCards count={2} columns="grid-cols-1" />
      ) : error ? (
        <ErrorState
          title="Could not load the webhooks"
          reason={error}
          nextStep="Check your connection and try again."
          action={<Button type="button" onClick={onReload} className="h-10 px-4 md:h-9">Try again</Button>}
        />
      ) : hooks.length === 0 ? (
        <EmptyState
          headingLevel="h3"
          icon={<WebhookIcon />}
          title="No webhooks yet"
          description="Add a webhook to post task and sprint events to your own service, a chat bot or an automation tool."
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
          This workspace has {MAX_WEBHOOKS} webhooks, the most it can have. Delete one to add another.
        </p>
      )}

      <CodeBlock label="Verify the signature (Node)" code={verifySnippet()} />
      <p className="text-xs text-slate-600">
        Requests carry <code className="font-mono">X-TaskMan-Event</code>, <code className="font-mono">X-TaskMan-Delivery</code> and{' '}
        <code className="font-mono">X-TaskMan-Signature</code>. Answer with any 2xx status within 5 seconds. After 20 failures in a row the webhook turns itself off.
      </p>

      {editor && <WebhookDialog webhook={editor.hook} onSave={save} onClose={() => setEditor(null)} />}
      {secret && <SecretReveal title={secret.title} noun="signing secret" secret={secret.value} onClose={() => setSecret(null)} />}
      {viewing && <DeliveriesDialog webhook={viewing} load={loadDeliveries} redeliver={onRedeliver} onClose={() => setViewing(null)} />}

      <ConfirmActionDialog
        open={Boolean(rotating)}
        onOpenChange={open => { if (!open && !confirmBusy) setRotating(null); }}
        title="Rotate the signing secret?"
        description={rotating ? `The current secret of "${rotating.name}" stops working at once. Update your receiver with the new one.` : ''}
        confirmLabel="Rotate secret"
        busyLabel="Rotating…"
        busy={confirmBusy}
        onConfirm={() => { void confirmRotate(); }}
      />
      <ConfirmActionDialog
        open={Boolean(deleting)}
        onOpenChange={open => { if (!open && !confirmBusy) setDeleting(null); }}
        title="Delete this webhook?"
        description={deleting ? `"${deleting.name}" stops receiving events and its delivery log is removed.` : ''}
        confirmLabel="Delete webhook"
        busyLabel="Deleting…"
        busy={confirmBusy}
        onConfirm={() => { void confirmDelete(); }}
      />
    </Surface>
  );
};
