import express, { Router } from 'express';
import {
  getProfile,
  updateProfile,
  updateNotifications,
  changePassword,
} from '../controllers/profileController.js';
import { protect } from '../middleware/authMiddleware.js';

const router: Router = express.Router();

router.get('/', protect, getProfile);
router.put('/', protect, updateProfile);
router.put('/notifications', protect, updateNotifications);
router.put('/password', protect, changePassword);

export default router;