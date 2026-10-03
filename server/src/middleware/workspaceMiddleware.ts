import { Request, Response, NextFunction } from 'express';
import Workspace, { IWorkspace } from '../models/workspaceModel.js';

/**
 * Resolves `:slug` to a workspace and verifies the logged-in user is a member.
 * Must run after `protect`. The workspace is exposed as `res.locals.workspace`.
 */
export const requireWorkspaceMember = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const workspace = await Workspace.findOne({ slug: req.params.slug });
    if (!workspace) {
      res.status(404).json({ message: 'Workspace not found' });
      return;
    }

    const isMember = workspace.members.some(m => m.user.toString() === userId);
    if (!isMember) {
      res.status(403).json({ message: 'You are not a member of this workspace' });
      return;
    }

    res.locals.workspace = workspace;
    next();
  } catch (error) {
    console.error('requireWorkspaceMember error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getRequestWorkspace = (res: Response): IWorkspace => res.locals.workspace as IWorkspace;
