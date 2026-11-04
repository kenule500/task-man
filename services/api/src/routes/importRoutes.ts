import express, { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import {
  commitImport,
  previewImport,
  validateCommitImport,
  validatePreviewImport,
} from '../controllers/importController.js';

// Mounted at /api/workspaces/:slug/import. Anyone who can write tasks may import (API tokens too);
// creating a new project or sprints during the import additionally needs projects:write.
const router: Router = express.Router({ mergeParams: true });
const guard = [protect, requirePermission('tasks:write')];

router.post('/preview', ...guard, validatePreviewImport, previewImport);
router.post('/commit', ...guard, validateCommitImport, commitImport);

export default router;
