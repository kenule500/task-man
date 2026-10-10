import express, { Router } from 'express';
import { protect, rejectApiToken } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { createToken, listTokens, revokeToken, validateCreateToken } from '../controllers/tokenController.js';

// Mounted at /api/workspaces/:slug/tokens. Every member may manage their own tokens (tasks:read);
// a token can never manage tokens, so a leaked one cannot mint another.
const router: Router = express.Router({ mergeParams: true });

router.get('/', protect, rejectApiToken, requirePermission('tasks:read'), listTokens);
router.post('/', protect, rejectApiToken, requirePermission('tasks:read'), validateCreateToken, createToken);
router.delete('/:id', protect, rejectApiToken, requirePermission('tasks:read'), revokeToken);

export default router;
