import express, { Router } from 'express';
import {
  createRelease,
  deleteRelease,
  getRelease,
  getReleaseNotes,
  listReleases,
  releaseRelease,
  updateRelease,
  validateCreateRelease,
  validateListReleases,
  validateReleaseAction,
  validateUpdateRelease,
} from '../controllers/releaseController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';

// Mounted at /api/workspaces/:slug/releases (routes protect themselves)
const router: Router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/', requirePermission('projects:read'), validateListReleases, listReleases);
router.post('/', requirePermission('projects:write'), validateCreateRelease, createRelease);
router.get('/:id', requirePermission('projects:read'), getRelease);
router.patch('/:id', requirePermission('projects:write'), validateUpdateRelease, updateRelease);
router.delete('/:id', requirePermission('projects:write'), deleteRelease);
router.post('/:id/release', requirePermission('projects:write'), validateReleaseAction, releaseRelease);
router.get('/:id/notes', requirePermission('projects:read'), getReleaseNotes);

export default router;
