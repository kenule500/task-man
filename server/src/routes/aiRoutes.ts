import express, { Router } from 'express';
import { getAiSettings, updateAiSettings, validateAiSettings } from '../controllers/aiReviewController.js';
import { protect, rejectApiToken } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';

// Mounted at /api/workspaces/:slug/ai (AI code review settings; the reviews themselves live under the task routes)
const router: Router = express.Router({ mergeParams: true });

router.use(protect);

// Anyone who can read tasks sees whether the feature is on; changing it (and the GitHub token) needs settings:manage, never an API token
router.get('/', requirePermission('tasks:read'), getAiSettings);
router.patch('/', rejectApiToken, requirePermission('settings:manage'), validateAiSettings, updateAiSettings);

export default router;
