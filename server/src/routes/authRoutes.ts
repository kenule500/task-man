import express, { Router } from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,          // ← add
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  saveOnboarding,
  validateSignup,
  validateForgotPassword,
  validateResetPassword,
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router: Router = express.Router();

// Registration & Login
router.post('/signup', validateSignup, registerUser);
router.post('/login', loginUser);
router.post('/logout', protect, logoutUser);

// Current user (RBAC)  ← add
router.get('/currentuser', protect, getCurrentUser);

// Email verification
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerification);

// Password reset
router.post('/forgot-password', validateForgotPassword, forgotPassword);
router.post('/reset-password/:token', validateResetPassword, resetPassword);

// Onboarding
router.post('/onboarding', protect, saveOnboarding);

export default router;