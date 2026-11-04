import http from 'http';
import https from 'https';
import crypto from 'crypto';
import type { LookupFunction } from 'net';
import Webhook, { AUTO_DISABLE_AFTER_FAILURES, IWebhook } from '../../models/webhookModel.js';
import WebhookDelivery, { IWebhookDelivery, MAX_DELIVERY_BODY, MAX_DELIVERY_ERROR } from '../../models/webhookDeliveryModel.js';
import { USER_AGENT, signBody } from './payload.js';
import { GuardOptions, checkWebhookUrl, resolvePublicAddresses } from './ssrf.js';

export const DELIVERY_TIMEOUT_MS = 5000;

export interface SendResult {
  ok: boolean;
  responseStatus: number | null;
  durationMs: number;
  error: string;
}

export interface SendInput {
  url: string;
  secret: string;
  event: string;
  deliveryId: string;
  body: string;
}

/**
 * One POST. Redirects are never followed, the response body is discarded and the connection uses the address
 * that passed the SSRF check (the guard is the socket `lookup`). Never throws: problems come back in the result.
 */
export const sendWebhookRequest = async (input: SendInput, options?: GuardOptions & { timeoutMs?: number }): Promise<SendResult> => {
  const started = Date.now();
  const fail = (error: string, responseStatus: number | null = null): SendResult => ({
    ok: false, responseStatus, durationMs: Date.now() - started, error: error.slice(0, MAX_DELIVERY_ERROR),
  });

  const checked = checkWebhookUrl(input.url, options);
  if (!checked.ok) return fail(checked.reason);
  const url = checked.url;

  const lookup: LookupFunction = (hostname, lookupOptions, callback) => {
    resolvePublicAddresses(hostname, options).then(
      addresses => {
        const first = addresses[0];
        if ((lookupOptions as { all?: boolean }).all) {
          (callback as unknown as (err: null, list: typeof addresses) => void)(null, addresses);
        } else {
          callback(null, first.address, first.family);
        }
      },
      error => callback(error as NodeJS.ErrnoException, '', 4),
    );
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? DELIVERY_TIMEOUT_MS);
  const transport = url.protocol === 'https:' ? https : http;

  try {
    return await new Promise<SendResult>(resolve => {
      const request = transport.request(url, {
        method: 'POST',
        lookup,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(input.body),
          'User-Agent': USER_AGENT,
          'X-TaskMan-Event': input.event,
          'X-TaskMan-Delivery': input.deliveryId,
          'X-TaskMan-Signature': signBody(input.secret, input.body),
        },
      }, response => {
        const status = response.statusCode ?? 0;
        response.resume(); // body is not stored
        response.on('end', () => resolve({
          ok: status >= 200 && status < 300,
          responseStatus: status,
          durationMs: Date.now() - started,
          error: status >= 200 && status < 300 ? '' : status >= 300 && status < 400 ? `Redirect (${status}) not followed` : `HTTP ${status}`,
        }));
        response.on('error', () => resolve(fail('Connection closed', status)));
      });
      request.on('error', error => resolve(fail(controller.signal.aborted ? 'Timed out after 5 seconds' : error.message || 'Request failed')));
      request.end(input.body);
    });
  } finally {
    clearTimeout(timer);
  }
};

/** Sends a body to a webhook, logs the attempt and updates the failure counter. Never throws. */
export const deliverToWebhook = async (
  webhook: Pick<IWebhook, '_id' | 'workspace' | 'url' | 'secret'>,
  delivery: { event: string; deliveryId: string; body: string; attempt?: number },
  options?: GuardOptions & { timeoutMs?: number },
): Promise<IWebhookDelivery | null> => {
  const result = await sendWebhookRequest({
    url: webhook.url, secret: webhook.secret, event: delivery.event, deliveryId: delivery.deliveryId, body: delivery.body,
  }, options);

  try {
    const record = await WebhookDelivery.create({
      webhook: webhook._id,
      workspace: webhook.workspace,
      event: delivery.event,
      deliveryId: delivery.deliveryId,
      status: result.ok ? 'success' : 'failed',
      attempt: delivery.attempt ?? 1,
      responseStatus: result.responseStatus,
      durationMs: result.durationMs,
      error: result.error,
      requestBody: delivery.body.slice(0, MAX_DELIVERY_BODY),
    });

    if (result.ok) {
      await Webhook.updateOne({ _id: webhook._id }, { $set: { failureCount: 0, lastDeliveryAt: new Date() } });
    } else {
      const updated = await Webhook.findOneAndUpdate(
        { _id: webhook._id },
        { $inc: { failureCount: 1 }, $set: { lastDeliveryAt: new Date() } },
        { returnDocument: 'after', projection: { failureCount: 1 } },
      );
      if (updated && updated.failureCount >= AUTO_DISABLE_AFTER_FAILURES) {
        await Webhook.updateOne({ _id: webhook._id }, { $set: { active: false } });
      }
    }
    return record;
  } catch (error) {
    console.error('webhook delivery log error:', (error as Error).message);
    return null;
  }
};

export const newDeliveryId = (): string => crypto.randomUUID();

