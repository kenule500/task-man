import express, { Router } from 'express';
import {
  getInvitationByToken,
  acceptInvitation,
  declineInvitation,
} from '../controllers/invitationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router: Router = express.Router();

// Public — token authenticates
router.get('/:token', getInvitationByToken);

// Requires login
router.post('/:token/accept', protect, acceptInvitation);
router.post('/:token/decline', protect, declineInvitation);

export default router;