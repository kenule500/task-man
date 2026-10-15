import express, { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import {
  createField,
  deleteField,
  listFields,
  reorderFields,
  updateField,
  validateCreateField,
  validateFieldOrder,
  validateUpdateField,
} from '../controllers/customFieldController.js';

// Mounted at /api/workspaces/:slug/fields (routes protect themselves)
const router: Router = express.Router({ mergeParams: true });

router.get('/', protect, requirePermission('tasks:read'), listFields);
router.post('/', protect, requirePermission('settings:manage'), validateCreateField, createField);
router.put('/order', protect, requirePermission('settings:manage'), validateFieldOrder, reorderFields);
router.patch('/:id', protect, requirePermission('settings:manage'), validateUpdateField, updateField);
router.delete('/:id', protect, requirePermission('settings:manage'), deleteField);

export default router;
