import express, { Router } from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  saveOnboarding,
  validateSignup,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateResendVerification,
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router: Router = express.Router();

// Registration & Login
router.post('/signup', validateSignup, registerUser);
router.post('/login', validateLogin, loginUser);
router.post('/logout', protect, logoutUser);

// Current user (RBAC)
router.get('/currentuser', protect, getCurrentUser);

// Email verification
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', validateResendVerification, resendVerification);

// Password reset
router.post('/forgot-password', validateForgotPassword, forgotPassword);
router.post('/reset-password/:token', validateResetPassword, resetPassword);

// Onboarding
router.post('/onboarding', protect, saveOnboarding);

export default router;