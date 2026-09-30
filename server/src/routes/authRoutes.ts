import express, { Router } from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  validateSignup,
  validateForgotPassword,
  validateResetPassword,
  saveOnboarding,
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router: Router = express.Router();

// Registration & Login
router.post('/signup', validateSignup, registerUser);
router.post('/login', loginUser);
router.post('/logout', protect, logoutUser);

// Email verification
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerification);

//onboarding
router.post('/onboarding', protect, saveOnboarding);

// Password reset
router.post('/forgot-password', validateForgotPassword, forgotPassword);
router.post('/reset-password/:token', validateResetPassword, resetPassword);

export default router;