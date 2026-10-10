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
import {
  disableTwoFactor,
  enableTwoFactor,
  getTwoFactorStatus,
  regenerateRecoveryCodes,
  setupTwoFactor,
} from '../controllers/twoFactorController.js';
import { protect, rejectApiToken } from '../middleware/authMiddleware.js';

const router: Router = express.Router();

router.get('/', protect, getProfile);
router.put('/', protect, updateProfile);
router.put('/notifications', protect, updateNotifications);
router.put('/password', protect, changePassword);

// Two-factor authentication (authenticator app); never reachable with an API token
router.get('/2fa', protect, rejectApiToken, getTwoFactorStatus);
router.post('/2fa/setup', protect, rejectApiToken, setupTwoFactor);
router.post('/2fa/enable', protect, rejectApiToken, enableTwoFactor);
router.post('/2fa/disable', protect, rejectApiToken, disableTwoFactor);
router.post('/2fa/recovery-codes', protect, rejectApiToken, regenerateRecoveryCodes);

// Signed-in devices
router.get('/sessions', protect, listSessions);
router.post('/sessions/revoke-others', protect, revokeOtherSessions);
router.delete('/sessions/:id', protect, revokeSession);

export default router;