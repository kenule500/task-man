import express, { Router } from 'express';
import {
  getPushPublicKey,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribePush,
  unsubscribePush,
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router: Router = express.Router();

// A user's own notifications across workspaces: no workspace permission, every query filters by the caller
router.get('/', protect, listNotifications);
// Declared before '/:id/read' so 'push' is never taken for an id
router.get('/push/public-key', protect, getPushPublicKey);
router.post('/push/subscribe', protect, subscribePush);
router.post('/push/unsubscribe', protect, unsubscribePush);
router.post('/read-all', protect, markAllNotificationsRead);
router.post('/:id/read', protect, markNotificationRead);

export default router;
