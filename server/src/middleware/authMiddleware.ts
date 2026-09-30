import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import User from '../models/userModel.js';
import Session from '../models/sessionModel.js';

interface JwtPayload {
  id: string;
}

export const protect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // 1. Verify the JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
      
      // 2. Check if the session is still valid in the database
      const session = await Session.findOne({ token, isValid: true });
      
      if (!session) {
        res.status(401).json({ message: 'Session expired or invalidated. Please log in again.' });
        return;
      }

      // 3. Update the lastLoggedIn timestamp (optional, but good for tracking)
      session.lastLoggedIn = new Date();
      await session.save();

      // 4. Attach user to request
      req.user = await User.findById(decoded.id).select('-password');
      
      next();
    } catch (error) {
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};