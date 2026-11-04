import express, { Router } from 'express';
import { exportTimesheet, getRunningTimer, getTimesheet } from '../controllers/timeController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';

// Mounted at /api/workspaces/:slug/time (routes protect themselves)
const router: Router = express.Router({ mergeParams: true });

router.use(protect);

// Fixed paths first; the timesheet itself is the root
router.get('/running', requirePermission('tasks:read'), getRunningTimer);
router.get('/export.csv', requirePermission('tasks:read'), exportTimesheet);
router.get('/', requirePermission('tasks:read'), getTimesheet);

export default router;
