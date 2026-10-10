import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import User from '../models/userModel.js';
import Session from '../models/sessionModel.js';
import ApiToken from '../models/apiTokenModel.js';
import { getConfig } from '../config/env.js';
import { API_TOKEN_PREFIX, LAST_USED_WRITE_INTERVAL_MS, hashApiToken, isApiTokenFormat, isTokenUsable } from '../utils/apiTokens.js';

const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;
import { getBearerToken, hashToken } from '../utils/tokens.js';

interface JwtPayload {
  id: string;
}

/** The workspace a request is about (path parameter or the `workspaceSlug` query used by some routes). */
const requestedSlug = (req: Request): string | undefined => {
  const fromQuery = typeof req.query.workspaceSlug === 'string' ? req.query.workspaceSlug : undefined;
  const fromParams = [req.params.slug, req.params.workspaceSlug].find(value => typeof value === 'string' && value);
  return (fromParams as string | undefined) || fromQuery;
};

/**
 * Personal API token (`Bearer tm_...`). Only the SHA-256 hash is stored, so the lookup is by hash
 * (no secret comparison happens in application code). Tokens are only accepted on workspace-scoped
 * routes; account routes (profile, sessions, password, workspace list/create/join...) are refused.
 */
const authenticateApiToken = async (token: string, req: Request, res: Response, next: NextFunction): Promise<void> => {
  const record = isApiTokenFormat(token)
    ? await ApiToken.findOne({ tokenHash: { $eq: hashApiToken(token) } })
    : null;
  if (!record || !isTokenUsable(record)) {
    res.status(401).json({ message: 'Not authorized, invalid or expired API token' });
    return;
  }

  if (!requestedSlug(req)) {
    res.status(403).json({ message: 'API tokens can only be used on workspace endpoints' });
    return;
  }

  const user = await User.findById(record.user).select('-password');
  if (!user) {
    res.status(401).json({ message: 'Not authorized, account not found' });
    return;
  }

  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > LAST_USED_WRITE_INTERVAL_MS) {
    await ApiToken.updateOne({ _id: record._id }, { $set: { lastUsedAt: new Date() } });
  }

  req.user = user;
  req.apiToken = { _id: String(record._id), workspace: String(record.workspace), scopes: [...record.scopes] };
  next();
};

export const protect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token = getBearerToken(req.headers.authorization);

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
    return;
  }

  if (token.startsWith(API_TOKEN_PREFIX)) {
    try {
      await authenticateApiToken(token, req, res, next);
    } catch {
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
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

/** Place after `protect` on routes a personal API token must never reach (tokens, webhooks, account changes). */
export const rejectApiToken = (req: Request, res: Response, next: NextFunction): void => {
  if (req.apiToken) {
    res.status(403).json({ message: 'API tokens cannot be used for this endpoint' });
    return;
  }
  next();
};
