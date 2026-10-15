import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import Webhook, {
  ALL_EVENTS,
  IWebhook,
  MAX_WEBHOOKS_PER_WORKSPACE,
  MAX_WEBHOOK_NAME,
  WEBHOOK_EVENTS,
} from '../models/webhookModel.js';
import WebhookDelivery, { IWebhookDelivery } from '../models/webhookDeliveryModel.js';
import { requireUserId } from '../utils/controllerHelpers.js';
import { recordActivity } from '../utils/activity.js';
import { deliverToWebhook, newDeliveryId } from '../utils/webhooks/deliver.js';
import { PayloadInput, buildPayload, generateWebhookSecret } from '../utils/webhooks/payload.js';
import { validateWebhookTarget } from '../utils/webhooks/ssrf.js';
import { handleError, hasValidationErrors, workspaceOf } from './taskController.js';

const DELIVERY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELIVERY_LIST_LIMIT = 50;

// ================================================================
// Validation
// ================================================================
const eventRules = () => [
  body('events').optional().isArray({ min: 1, max: WEBHOOK_EVENTS.length + 1 }).withMessage('Choose at least one event'),
  body('events.*').isString().custom(value => value === ALL_EVENTS || WEBHOOK_EVENTS.includes(value)).withMessage('Unknown event'),
];
const nameRule = () => body('name').isString().trim().isLength({ min: 1, max: MAX_WEBHOOK_NAME })
  .withMessage(`Name is required (up to ${MAX_WEBHOOK_NAME} characters)`);
const urlRule = () => body('url').isString().trim().isLength({ min: 1, max: 2000 }).withMessage('Enter a valid URL');

export const validateCreateWebhook = [nameRule(), urlRule(), ...eventRules()];
export const validateUpdateWebhook = [
  nameRule().optional(),
  urlRule().optional(),
  ...eventRules(),
  body('active').optional().isBoolean({ strict: true }).withMessage('active must be true or false'),
];

// ================================================================
// Helpers
// ================================================================
/** "*" wins over a list; duplicates are dropped. */
const normaliseEvents = (events: unknown[] | undefined): string[] => {
  const list = [...new Set((events ?? [ALL_EVENTS]).map(String))];
  return list.includes(ALL_EVENTS) ? [ALL_EVENTS] : list;
};

const present = (hook: IWebhook) => ({
  _id: String(hook._id),
  name: hook.name,
  url: hook.url,
  events: hook.events,
  active: hook.active,
  lastDeliveryAt: hook.lastDeliveryAt,
  failureCount: hook.failureCount,
  createdAt: hook.createdAt,
});

const presentDelivery = (delivery: IWebhookDelivery) => ({
  _id: String(delivery._id),
  deliveryId: delivery.deliveryId,
  event: delivery.event,
  status: delivery.status,
  attempt: delivery.attempt,
  responseStatus: delivery.responseStatus,
  durationMs: delivery.durationMs,
  error: delivery.error,
  createdAt: delivery.createdAt,
});

const validId = (value: unknown): string | null => {
  const id = String(value);
  return mongoose.isValidObjectId(id) ? id : null;
};

/** The webhook of this workspace named in the path (with its secret), or a 404 response. */
const findHook = async (req: Request, res: Response): Promise<IWebhook | null> => {
  const id = validId(req.params.id);
  const hook = id ? await Webhook.findOne({ _id: { $eq: id }, workspace: workspaceOf(req)._id }).select('+secret') : null;
  if (!hook) res.status(404).json({ message: 'Webhook not found' });
  return hook;
};

const rejectTarget = async (res: Response, url: unknown): Promise<boolean> => {
  const problem = await validateWebhookTarget(url);
  if (!problem) return false;
  res.status(400).json({ message: problem });
  return true;
};

/** A ping body for the "send test" button. */
const pingPayload = (req: Request, deliveryId: string): PayloadInput => ({
  deliveryId,
  event: 'ping',
  createdAt: new Date(),
  workspaceSlug: workspaceOf(req).slug,
  actor: { id: String(req.user?._id), name: req.user?.name ?? '' },
  summary: 'Test event from TaskMan',
  changes: [],
});

// ================================================================
// @route   GET /api/workspaces/:slug/webhooks
// ================================================================
export const listWebhooks = async (req: Request, res: Response): Promise<void> => {
  try {
    const hooks = await Webhook.find({ workspace: workspaceOf(req)._id }).sort({ createdAt: 1 });
    res.status(200).json(hooks.map(present));
  } catch (error) {
    handleError(res, error, 'listWebhooks');
  }
};

// ================================================================
// @desc    Create a webhook; the signing secret is in this response only
// @route   POST /api/workspaces/:slug/webhooks
// ================================================================
export const createWebhook = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const workspaceId = workspaceOf(req)._id;
    if (await Webhook.countDocuments({ workspace: workspaceId }) >= MAX_WEBHOOKS_PER_WORKSPACE) {
      res.status(400).json({ message: `A workspace can have up to ${MAX_WEBHOOKS_PER_WORKSPACE} webhooks. Delete one first.` });
      return;
    }
    if (await rejectTarget(res, req.body.url)) return;

    const secret = generateWebhookSecret();
    const created = await Webhook.create({
      workspace: workspaceId,
      name: String(req.body.name).trim(),
      url: String(req.body.url).trim(),
      secret,
      events: normaliseEvents(req.body.events),
      createdBy: userId,
    });
    await recordActivity(req, { action: 'webhook.created', summary: created.name, changes: [{ field: 'url', to: created.url }] });
    res.status(201).json({ ...present(created), secret });
  } catch (error) {
    handleError(res, error, 'createWebhook');
  }
};

// ================================================================
// @route   PATCH /api/workspaces/:slug/webhooks/:id
// ================================================================
export const updateWebhook = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const hook = await findHook(req, res);
    if (!hook) return;

    const changes: { field: string; from?: string; to?: string }[] = [];
    if (req.body.name !== undefined) hook.name = String(req.body.name).trim();
    if (req.body.url !== undefined) {
      const url = String(req.body.url).trim();
      if (url !== hook.url) {
        if (await rejectTarget(res, url)) return;
        changes.push({ field: 'url', from: hook.url, to: url });
        hook.url = url;
        hook.failureCount = 0;
      }
    }
    if (req.body.events !== undefined) hook.events = normaliseEvents(req.body.events);
    if (req.body.active !== undefined) {
      const active = req.body.active === true;
      if (active !== hook.active) changes.push({ field: 'active', from: String(hook.active), to: String(active) });
      hook.active = active;
      if (active) hook.failureCount = 0;
    }
    await hook.save();
    await recordActivity(req, { action: 'webhook.updated', summary: hook.name, changes });
    res.status(200).json(present(hook));
  } catch (error) {
    handleError(res, error, 'updateWebhook');
  }
};

// ================================================================
// @route   DELETE /api/workspaces/:slug/webhooks/:id
// ================================================================
export const deleteWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const hook = await findHook(req, res);
    if (!hook) return;
    await WebhookDelivery.deleteMany({ webhook: hook._id });
    await hook.deleteOne();
    await recordActivity(req, { action: 'webhook.deleted', summary: hook.name });
    res.status(200).json({ message: 'Webhook deleted' });
  } catch (error) {
    handleError(res, error, 'deleteWebhook');
  }
};

// ================================================================
// @desc    New signing secret (the old one stops working at once); shown once
// @route   POST /api/workspaces/:slug/webhooks/:id/rotate-secret
// ================================================================
export const rotateWebhookSecret = async (req: Request, res: Response): Promise<void> => {
  try {
    const hook = await findHook(req, res);
    if (!hook) return;
    const secret = generateWebhookSecret();
    hook.secret = secret;
    await hook.save();
    await recordActivity(req, { action: 'webhook.updated', summary: hook.name, changes: [{ field: 'secret', to: 'rotated' }] });
    res.status(200).json({ ...present(hook), secret });
  } catch (error) {
    handleError(res, error, 'rotateWebhookSecret');
  }
};

// ================================================================
// @desc    Send a `ping` event now and report the outcome
// @route   POST /api/workspaces/:slug/webhooks/:id/test
// ================================================================
export const testWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const hook = await findHook(req, res);
    if (!hook) return;
    const deliveryId = newDeliveryId();
    const bodyText = JSON.stringify(buildPayload(pingPayload(req, deliveryId)));
    const delivery = await deliverToWebhook(hook, { event: 'ping', deliveryId, body: bodyText });
    if (!delivery) {
      res.status(500).json({ message: 'Server error' });
      return;
    }
    res.status(200).json(presentDelivery(delivery));
  } catch (error) {
    handleError(res, error, 'testWebhook');
  }
};

// ================================================================
// @route   GET /api/workspaces/:slug/webhooks/:id/deliveries
// ================================================================
export const listDeliveries = async (req: Request, res: Response): Promise<void> => {
  try {
    const hook = await findHook(req, res);
    if (!hook) return;
    const deliveries = await WebhookDelivery.find({ webhook: hook._id, workspace: workspaceOf(req)._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(DELIVERY_LIST_LIMIT);
    res.status(200).json(deliveries.map(presentDelivery));
  } catch (error) {
    handleError(res, error, 'listDeliveries');
  }
};

// ================================================================
// @desc    Send a logged delivery again (same body and delivery id, next attempt number)
// @route   POST /api/workspaces/:slug/webhooks/:id/deliveries/:deliveryId/redeliver
// ================================================================
export const redeliver = async (req: Request, res: Response): Promise<void> => {
  try {
    const hook = await findHook(req, res);
    if (!hook) return;
    const deliveryId = String(req.params.deliveryId);
    const previous = DELIVERY_ID.test(deliveryId)
      ? await WebhookDelivery.findOne({ webhook: hook._id, deliveryId: { $eq: deliveryId } }).sort({ createdAt: -1, _id: -1 })
      : null;
    if (!previous) {
      res.status(404).json({ message: 'Delivery not found' });
      return;
    }
    const delivery = await deliverToWebhook(hook, {
      event: previous.event,
      deliveryId: previous.deliveryId,
      body: previous.requestBody,
      attempt: previous.attempt + 1,
    });
    if (!delivery) {
      res.status(500).json({ message: 'Server error' });
      return;
    }
    res.status(200).json(presentDelivery(delivery));
  } catch (error) {
    handleError(res, error, 'redeliver');
  }
};
