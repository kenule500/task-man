import 'dotenv/config';
import crypto from 'crypto';
import express, { Application, NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';
import { getConfig } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';
import activeTaskRoutes from './routes/activeTaskRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import invitationRoutes from './routes/invitationRoutes.js';
import roleRoutes from './routes/roleRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import integrationRoutes from './routes/integrationRoutes.js';
import { seedSystemRoles, repairMemberRoles } from './utils/seedRoles.js';
import { registerFlowTracking } from './utils/flow/register.js';
import { registerAutomations } from './utils/automation/register.js';
import { registerWebhooks } from './utils/webhooks/register.js';

// ============================================================
// 1. Validate environment first
//    Exits with a clear message on missing or weak secrets
// ============================================================
const config = getConfig();

// Activity listeners: flow tracking first, so automation-made moves are measured too
registerFlowTracking();
registerAutomations();
registerWebhooks();

// ============================================================
// 2. Build the Express app
// ============================================================
const app: Application = express();

// ============================================================
// Readiness: connect to MongoDB, seed the 5 system roles (idempotent) and
// repair orphaned member entries once per process. Memoized so it also works
// on serverless platforms where there is no long-running boot step.
// ============================================================
let ready: Promise<void> | null = null;
export const ensureReady = (): Promise<void> => {
  ready ??= (async () => {
    await connectDB();
    await seedSystemRoles();
    await repairMemberRoles();
  })().catch(error => {
    ready = null; // allow a retry on the next request
    throw error;
  });
  return ready;
};

app.use((_req, _res, next) => {
  ensureReady().then(() => next(), next);
});

// Behind a reverse proxy (Render, Railway, Nginx) so rate limiting sees real client IPs
if (config.trustProxy > 0) {
  app.set('trust proxy', config.trustProxy);
}

// Security middleware
// Every response carries a request id so logs and bug reports can be matched; a well-formed incoming id is reused
app.use((req: Request, res: Response, next: NextFunction) => {
  const incoming = req.get('x-request-id');
  const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', id);
  next();
});

app.use(helmet());
// Exact origins only: the list comes from CORS_ORIGIN (or CLIENT_URL); a wildcard entry is never honoured
const allowedOrigins = new Set(config.corsOrigins.filter(origin => origin !== '*'));
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)) }));
// GitHub signs the exact bytes it sends, so its webhook gets the raw body (must come before express.json)
app.use('/api/integrations/github', express.raw({ type: 'application/json', limit: '1mb' }));
app.use(express.json({ limit: '100kb' }));

// ============================================================
// 3. Rate limiting
//    Strict on auth, roomier for the app API where board, calendar
//    and timeline drag interactions issue many small updates
// ============================================================
// JSON like every other API error, so the client can show it
const limitMessage = { message: 'Too many attempts. Please wait a few minutes and try again.' };

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: limitMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.rateLimitMax,
  message: limitMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

// Brute-force targets (passwords, invite codes, invitation tokens, email sending)
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: limitMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter);
app.use(
  ['/api/auth/login', '/api/auth/forgot-password', '/api/auth/resend-verification',
    '/api/workspaces/join', '/api/invitations', '/api/profile/password'],
  (req, res, next) => (req.method === 'GET' ? next() : sensitiveLimiter(req, res, next)),
);
app.use('/api', apiLimiter);

// ============================================================
// 4. HTTP caching
//    Responses are per-user: private, and the browser must revalidate every time.
//    Express's default weak ETag turns an unchanged list into a cheap 304.
// ============================================================
app.set('etag', 'weak');
app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'private, no-cache');
  next();
});

// ============================================================
// 5. Health check
// ============================================================
app.get('/api/health', (_req: Request, res: Response) => {
  // Liveness must never come from a cache
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    database: mongoose.connection.readyState === 1 ? 'up' : 'down',
    // Deployed commit on Vercel; "dev" locally
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
  });
});

// ============================================================
// 6. Mount routers
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/workspaces', workspaceRoutes);
// Alias for the active workspace's tasks (GET/POST /api/tasks, PUT/PATCH/DELETE /api/tasks/:id)
app.use('/api/tasks', activeTaskRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/integrations', integrationRoutes);

export default app;