import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getAiSettings, removeAiProvider, saveAiProvider, testAiProvider, updateAiSettings,
  validateAiProvider, validateAiProviderTest, validateAiSettings,
} from '../controllers/aiReviewController.js';
import { protect, rejectApiToken } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';

// Mounted at /api/workspaces/:slug/ai (AI code review settings; the reviews themselves live under the task routes)
const router: Router = express.Router({ mergeParams: true });

// Connection tests are cheap for us but not for the provider: five per minute per member and workspace.
const providerTestLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: req => `${String(req.workspace?._id ?? 'none')}:${String(req.user?._id ?? 'anonymous')}`,
  message: { message: 'Too many connection tests. Wait a minute and try again.', code: 'AI_TEST_RATE_LIMIT' },
});

router.use(protect);

// Anyone who can read tasks sees whether the feature is on; changing the provider, key or switches needs
// settings:manage, never an API token.
router.get('/', requirePermission('tasks:read'), getAiSettings);
router.patch('/', rejectApiToken, requirePermission('settings:manage'), validateAiSettings, updateAiSettings);
router.put('/provider', rejectApiToken, requirePermission('settings:manage'), validateAiProvider, saveAiProvider);
router.delete('/provider', rejectApiToken, requirePermission('settings:manage'), removeAiProvider);
router.post('/provider/test', rejectApiToken, requirePermission('settings:manage'), providerTestLimiter, validateAiProviderTest, testAiProvider);

export default router;
