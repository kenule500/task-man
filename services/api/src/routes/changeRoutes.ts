import express, { Router } from 'express';
import {
  getChanges,
  getPresence,
  heartbeatPresence,
  leavePresence,
  validateChanges,
  validatePresence,
  validatePresenceQuery,
} from '../controllers/changeController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';

// Mounted at /api/workspaces/:slug/changes (routes protect themselves)
const router: Router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/', requirePermission('tasks:read'), validateChanges, getChanges);
router.post('/presence', requirePermission('tasks:read'), validatePresence, heartbeatPresence);
router.get('/presence', requirePermission('tasks:read'), validatePresenceQuery, getPresence);
router.delete('/presence', requirePermission('tasks:read'), validatePresenceQuery, leavePresence);

export default router;
