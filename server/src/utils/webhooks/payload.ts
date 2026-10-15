import crypto from 'crypto';
import { ALL_EVENTS } from '../../models/webhookModel.js';
import { MAX_DELIVERY_BODY } from '../../models/webhookDeliveryModel.js';

export const SIGNATURE_PREFIX = 'sha256=';
export const USER_AGENT = 'TaskMan-Webhooks/1';
const MAX_CHANGES = 20;
// Leaves headroom under MAX_DELIVERY_BODY (multi-byte characters), so the stored body is never cut and can be re-sent
const MAX_PAYLOAD_BYTES = MAX_DELIVERY_BODY - 512;

export interface WebhookChange { field: string; from?: string; to?: string }

export interface WebhookPayload {
  id: string;
  event: string;
  createdAt: string;
  workspace: { slug: string };
  actor: { id: string; name: string } | null;
  summary: string;
  task?: { id: string; key: string; title: string; status: string; url: string };
  changes: WebhookChange[];
}

export interface PayloadInput {
  deliveryId: string;
  event: string;
  createdAt: Date;
  workspaceSlug: string;
  actor?: { id: string; name: string } | null;
  summary: string;
  task?: { id: string; key: string; title: string; status: string; url: string };
  changes?: WebhookChange[];
}

/** "webhook subscribes to this event" — `*` matches everything. */
export const matchesEvent = (events: readonly string[], event: string): boolean =>
  events.includes(ALL_EVENTS) || events.includes(event);

/** Secret for signing: "whsec_" plus 32 random URL-safe characters. */
export const generateWebhookSecret = (): string => `whsec_${crypto.randomBytes(24).toString('base64url').slice(0, 32)}`;

/** `sha256=<hex HMAC of the raw body>`, the value of the X-TaskMan-Signature header. */
export const signBody = (secret: string, rawBody: string): string =>
  `${SIGNATURE_PREFIX}${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

/** Constant-time check of a received signature header (what a receiver should do). */
export const verifySignature = (secret: string, rawBody: string, header: string | undefined): boolean => {
  if (!header) return false;
  const expected = Buffer.from(signBody(secret, rawBody));
  const received = Buffer.from(header);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
};

/** The JSON document sent to the receiver. Changes are trimmed so the whole body stays storable. */
export const buildPayload = (input: PayloadInput): WebhookPayload => {
  const payload: WebhookPayload = {
    id: input.deliveryId,
    event: input.event,
    createdAt: input.createdAt.toISOString(),
    workspace: { slug: input.workspaceSlug },
    actor: input.actor ?? null,
    summary: input.summary,
    ...(input.task ? { task: input.task } : {}),
    changes: (input.changes ?? []).slice(0, MAX_CHANGES).map(({ field, from, to }) => ({ field, from, to })),
  };
  while (payload.changes.length > 0 && Buffer.byteLength(JSON.stringify(payload)) > MAX_PAYLOAD_BYTES) {
    payload.changes.pop();
  }
  return payload;
};
