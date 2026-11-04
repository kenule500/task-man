import express, { Router } from 'express';
import { githubWebhook } from '../controllers/githubWebhookController.js';

const router: Router = express.Router();

// Public on purpose: GitHub cannot log in. The controller authenticates the delivery by its HMAC signature.
// The raw body parser for this path is mounted in app.ts, before express.json.
router.post('/github/:slug', githubWebhook);

export default router;
