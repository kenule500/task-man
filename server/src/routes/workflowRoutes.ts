import express, { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { getWorkflow, updateWorkflow, validateWorkflowUpdate } from '../controllers/workflowController.js';

// Mounted at /api/workspaces/:slug/workflow (routes protect themselves)
const router: Router = express.Router({ mergeParams: true });

router.get('/', protect, requirePermission('tasks:read'), getWorkflow);
router.put('/', protect, requirePermission('settings:manage'), validateWorkflowUpdate, updateWorkflow);

export default router;
