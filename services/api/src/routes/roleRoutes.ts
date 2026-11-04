import express, { Router } from 'express';
import { listPermissions } from '../controllers/roleController.js';
import { protect } from '../middleware/authMiddleware.js';

const router: Router = express.Router();

// Public to any logged-in user — no workspace context
router.get('/permissions', protect, listPermissions);

export default router;