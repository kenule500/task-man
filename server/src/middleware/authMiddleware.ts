import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import User from '../models/userModel.js';
import Session from '../models/sessionModel.js';
import { getConfig } from '../config/env.js';
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

    // 3. Update the lastLoggedIn timestamp (optional, but good for tracking)
    session.lastLoggedIn = new Date();
    await session.save();

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
