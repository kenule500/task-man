import { Request, Response } from 'express';

/**
 * Extracts the authenticated user's ID from the request.
 *
 * If the user is not authenticated, this function sends a 401 response
 * AND returns null. Callers should check for null and return immediately.
 *
 * Usage:
 *   const userId = requireUserId(req, res);
 *   if (!userId) return;
 */
export const requireUserId = (req: Request, res: Response): string | null => {
  const userId = (req as { user?: { _id?: string } }).user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Not authorized' });
    return null;
  }
  // req.user._id is an ObjectId at runtime: normalise so `===` comparisons work
  return String(userId);
};

/**
 * Standard 500 response — logs the error and returns a generic message.
 * Keeps error responses consistent across all controllers.
 *
 * Usage:
 *   } catch (error) {
 *     sendServerError(res, 'updateProfile', error);
 *   }
 */
export const sendServerError = (
  res: Response,
  context: string,
  error: unknown
): void => {
  console.error(`${context} error:`, error);
  res.status(500).json({ message: 'Server error' });
};

/**
 * Fields that should never be sent to the client from a User document.
 * Use with `.select()` to strip them.
 *
 * Usage:
 *   User.findById(id).select(USER_PRIVATE_FIELDS);
 */
export const USER_PRIVATE_FIELDS =
  '-password -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires';