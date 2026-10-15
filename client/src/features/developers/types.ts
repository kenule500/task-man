// Developer platform: personal API tokens and outbound webhooks (server: models/apiTokenModel.ts, webhookModel.ts)

export const MAX_TOKEN_NAME = 60;
export const MAX_ACTIVE_TOKENS = 10;
export const MAX_WEBHOOK_NAME = 60;
export const MAX_WEBHOOKS = 10;
export const ALL_EVENTS = '*';

export interface ApiToken {
  _id: string;
  name: string;
  /** First characters after "tm_", shown so tokens can be told apart */
  prefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

/** The create response is the only time the plain token is known. */
export interface CreatedApiToken extends ApiToken {
  token: string;
}

export interface ApiTokenInput {
  name: string;
  scopes: string[];
  /** null = never expires */
  expiresInDays: number | null;
}

export interface Webhook {
  _id: string;
  name: string;
  url: string;
  /** Activity actions, or ['*'] for all */
  events: string[];
  active: boolean;
  lastDeliveryAt: string | null;
  /** Consecutive failures (switched off after 20) */
  failureCount: number;
  createdAt: string;
}

/** Create and rotate responses carry the signing secret once. */
export interface WebhookWithSecret extends Webhook {
  secret: string;
}

export interface WebhookInput {
  name: string;
  url: string;
  events: string[];
}

export interface WebhookDelivery {
  _id: string;
  deliveryId: string;
  event: string;
  status: 'success' | 'failed';
  attempt: number;
  responseStatus: number | null;
  durationMs: number;
  error: string;
  createdAt: string;
}
