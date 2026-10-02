import { Request, Response, NextFunction } from 'express';
import Workspace from '../models/workspaceModel.js';

// Loads the workspace from :workspaceSlug and verifies the authenticated
// user is a member. Must run after `protect`. Attaches req.workspace / req.workspaceRole.
export const requireWorkspaceMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const { workspaceSlug } = req.params;
    const workspace = await Workspace.findOne({ slug: workspaceSlug });
    if (!workspace) {
      res.status(404).json({ message: 'Workspace not found' });
      return;
    }

    const membership = workspace.members.find(m => m.user.toString() === userId.toString());
    if (!membership) {
      res.status(403).json({ message: 'You are not a member of this workspace' });
      return;
    }

    req.workspace = workspace;
    req.workspaceRole = membership.role;
    next();
  } catch (error) {
    console.error('requireWorkspaceMember error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
