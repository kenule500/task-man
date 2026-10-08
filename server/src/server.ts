import 'dotenv/config';
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import { seedSystemRoles, repairMemberRoles } from './utils/seedRoles.js';
import invitationRoutes from './routes/invitationRoutes.js';
import roleRoutes from './routes/roleRoutes.js';

const app: Application = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limit — applied to all /api routes
// 500 requests per 15 min is generous enough for normal dev use,
// while still protecting against brute-force on auth endpoints.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/roles', roleRoutes);

const PORT = process.env.PORT || 5000;

// ===== Boot =====
const startServer = async () => {
  await connectDB();
  await seedSystemRoles();     // 1. ensure roles exist
  await repairMemberRoles();   // 2. fix any orphans

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

startServer();