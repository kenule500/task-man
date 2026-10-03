import 'dotenv/config';   // ← replaces: import dotenv from 'dotenv'; dotenv.config();
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';
import { getConfig } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';
import profileRoutes from './routes/profileRoutes.js';

// Validate the environment first: exits with a clear message on missing or weak secrets
const config = getConfig();

connectDB();

const app: Application = express();

// Behind a reverse proxy (Render, Railway, Nginx) so rate limiting sees real client IPs
if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

// Security middleware
app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '100kb' }));

// Rate limiting: strict on auth, roomier for the app API where board,
// calendar and timeline drag interactions issue many small updates
const limitMessage = 'Too many requests from this IP, please try again later.';
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: limitMessage });
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.rateLimitMax,
  message: limitMessage,
});
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/profile', profileRoutes);

app.listen(config.port, () => {
  console.log(`🚀 Server running on port ${config.port} (${config.nodeEnv})`);
});