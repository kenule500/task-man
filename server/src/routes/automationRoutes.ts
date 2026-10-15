import express, { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import {
  createAutomation,
  deleteAutomation,
  listAutomations,
  listAutomationTemplates,
  updateAutomation,
  validateCreateAutomation,
  validateUpdateAutomation,
} from '../controllers/automationController.js';

// Mounted at /api/workspaces/:slug/automations; managing rules needs settings:manage
const router: Router = express.Router({ mergeParams: true });

router.get('/templates', protect, requirePermission('settings:manage'), listAutomationTemplates);
router.get('/', protect, requirePermission('settings:manage'), listAutomations);
router.post('/', protect, requirePermission('settings:manage'), validateCreateAutomation, createAutomation);
router.patch('/:id', protect, requirePermission('settings:manage'), validateUpdateAutomation, updateAutomation);
router.delete('/:id', protect, requirePermission('settings:manage'), deleteAutomation);

export default router;
