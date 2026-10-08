import 'dotenv/config';
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';
import { getConfig } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import invitationRoutes from './routes/invitationRoutes.js';
import roleRoutes from './routes/roleRoutes.js';
import { seedSystemRoles, repairMemberRoles } from './utils/seedRoles.js';

// ============================================================
// 1. Validate environment first
//    Exits with a clear message on missing or weak secrets
// ============================================================
const config = getConfig();

// ============================================================
// 2. Build the Express app
// ============================================================
const app: Application = express();

// Behind a reverse proxy (Render, Railway, Nginx) so rate limiting sees real client IPs
if (config.trustProxy > 0) {
  app.set('trust proxy', config.trustProxy);
}

// Security middleware
app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '100kb' }));

// ============================================================
// 3. Rate limiting
//    Strict on auth, roomier for the app API where board, calendar
//    and timeline drag interactions issue many small updates
// ============================================================
const limitMessage = 'Too many requests from this IP, please try again later.';

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

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// ============================================================
// 4. Health check
// ============================================================
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// ============================================================
// 5. Mount routers
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/roles', roleRoutes);

// ============================================================
// 6. Boot sequence
//    - connect to MongoDB
//    - seed the 5 system roles (idempotent)
//    - repair any orphaned member entries (RBAC self-healing)
// ============================================================
const startServer = async () => {
  await connectDB();
  await seedSystemRoles();
  await repairMemberRoles();

  app.listen(config.port, () => {
    console.log(`🚀 Server running on port ${config.port} (${config.nodeEnv})`);
  });
};

startServer();