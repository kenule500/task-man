import 'dotenv/config';   // ← replaces: import dotenv from 'dotenv'; dotenv.config();
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';
import profileRoutes from './routes/profileRoutes.js';

connectDB();

const app: Application = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Board/calendar/timeline drag interactions issue many small updates
  max: Number(process.env.RATE_LIMIT_MAX) || 500,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api', limiter);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/profile', profileRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});