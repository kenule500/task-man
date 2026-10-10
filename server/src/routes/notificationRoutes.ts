import express, { Router } from 'express';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router: Router = express.Router();

// A user's own notifications across workspaces: no workspace permission, every query filters by the caller
router.get('/', protect, listNotifications);
router.post('/read-all', protect, markAllNotificationsRead);
router.post('/:id/read', protect, markNotificationRead);

export default router;
