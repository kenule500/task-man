import express, { Router } from 'express';
import { protect, rejectApiToken } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import {
  createWebhook,
  deleteWebhook,
  listDeliveries,
  listWebhooks,
  redeliver,
  rotateWebhookSecret,
  testWebhook,
  updateWebhook,
  validateCreateWebhook,
  validateUpdateWebhook,
} from '../controllers/webhookController.js';

// Mounted at /api/workspaces/:slug/webhooks. Settings managers only, and never through a personal API token.
const router: Router = express.Router({ mergeParams: true });
const guard = [protect, rejectApiToken, requirePermission('settings:manage')];

router.get('/', ...guard, listWebhooks);
router.post('/', ...guard, validateCreateWebhook, createWebhook);
router.patch('/:id', ...guard, validateUpdateWebhook, updateWebhook);
router.delete('/:id', ...guard, deleteWebhook);
router.post('/:id/rotate-secret', ...guard, rotateWebhookSecret);
router.post('/:id/test', ...guard, testWebhook);
router.get('/:id/deliveries', ...guard, listDeliveries);
router.post('/:id/deliveries/:deliveryId/redeliver', ...guard, redeliver);

export default router;
