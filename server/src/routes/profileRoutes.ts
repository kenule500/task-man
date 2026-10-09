import express, { Router } from 'express';
import {
  getProfile,
  updateProfile,
  updateNotifications,
  changePassword,
  listSessions,
  revokeOtherSessions,
  revokeSession,
} from '../controllers/profileController.js';
import { protect } from '../middleware/authMiddleware.js';

const router: Router = express.Router();

router.get('/', protect, getProfile);
router.put('/', protect, updateProfile);
router.put('/notifications', protect, updateNotifications);
router.put('/password', protect, changePassword);

// Signed-in devices
router.get('/sessions', protect, listSessions);
router.post('/sessions/revoke-others', protect, revokeOtherSessions);
router.delete('/sessions/:id', protect, revokeSession);

export default router;