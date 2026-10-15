import express, { Router } from 'express';
import { listProviders, ssoCallback, startSso } from '../controllers/ssoController.js';

// Mounted at /api/auth/sso (single sign-on with OpenID Connect providers), before /api/auth.
// Behind the auth rate limiter (app.ts: app.use('/api/auth', authLimiter)).
const router: Router = express.Router();

router.get('/providers', listProviders);
router.get('/:provider/start', startSso);
router.get('/:provider/callback', ssoCallback);

export default router;
