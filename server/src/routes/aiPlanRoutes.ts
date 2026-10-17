import express, { Router } from 'express';
import {
  createFromPlan, deletePlan, ensurePlansEnabled, getPlan, listPlans, requireTaskWrite, updatePlan, uploadPlan, uploadPlanFile, validateUploadPlan,
} from '../controllers/aiPlanController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';

// Mounted at /api/workspaces/:slug/ai/plans (create a project from an uploaded document with AI)
const router: Router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/', requirePermission('projects:read'), listPlans);
// Uploading and creating need both project and task rights; the owner of the plan is checked in the controller
router.post('/', requirePermission('projects:write'), requireTaskWrite, ensurePlansEnabled, uploadPlanFile, validateUploadPlan, uploadPlan);
router.get('/:id', requirePermission('projects:read'), getPlan);
router.patch('/:id', requirePermission('projects:write'), requireTaskWrite, updatePlan);
router.post('/:id/create', requirePermission('projects:write'), requireTaskWrite, createFromPlan);
router.delete('/:id', requirePermission('projects:write'), requireTaskWrite, deletePlan);

export default router;
