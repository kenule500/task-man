import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import User from '../models/userModel.js';
import Session from '../models/sessionModel.js';
import { getConfig } from '../config/env.js';

const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;
import { getBearerToken, hashToken } from '../utils/tokens.js';

interface JwtPayload {
  id: string;
}

export const protect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token = getBearerToken(req.headers.authorization);

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
    return;
  }

  try {
    // 1. Verify the JWT
    const decoded = jwt.verify(token, getConfig().jwtSecret) as JwtPayload;

    // 2. Check if the session is still valid in the database (only the token hash is stored)
    const session = await Session.findOne({ token: hashToken(token), isValid: true });

    if (!session) {
      res.status(401).json({ message: 'Session expired or invalidated. Please log in again.' });
      return;
    }

    // 3. Record activity for "Signed-in devices", at most every 5 minutes (not a write per request)
    if (Date.now() - session.lastLoggedIn.getTime() > ACTIVITY_WRITE_INTERVAL_MS) {
      await Session.updateOne({ _id: session._id }, { $set: { lastLoggedIn: new Date() } });
    }

    // 4. Attach user to request
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      res.status(401).json({ message: 'Not authorized, account not found' });
      return;
    }
    req.user = user;

    next();
  } catch {
    res.status(401).json({ message: 'Not authorized, token failed' });
  }
};
