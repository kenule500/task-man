import { Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import { SYSTEM_ROLES } from '../config/permissions.js';
import Workspace from '../models/workspaceModel.js';
import User from '../models/userModel.js';
import Role from '../models/roleModel.js';

const generateInviteCode = (): string =>
  crypto.randomBytes(6).toString('hex').toUpperCase();

const generateSlug = async (name: string): Promise<string> => {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 40) || 'workspace';

  let slug = base;
  let counter = 1;
  while (await Workspace.exists({ slug })) {
    slug = `${base}-${counter}`;
    counter++;
  }
  return slug;
};

// ================================================================
// @desc    Create a workspace
// @route   POST /api/workspaces
// ================================================================
export const createWorkspace = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as { user?: { _id?: string } }).user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const { name } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ message: 'Workspace name is required' });
      return;
    }

    // Find the Product Owner role for the creator
    const ownerRole = await Role.findOne({ name: 'Product Owner', isSystem: true });
    if (!ownerRole) {
      res.status(500).json({ message: 'System roles not seeded. Restart the server.' });
      return;
    }

    const slug = await generateSlug(name.trim());

    const workspace = await Workspace.create({
      name: name.trim(),
      slug,
      owner: userId,
      members: [
        {
          user: userId,
          roleId: ownerRole._id,
          joinedAt: new Date(),
        },
      ],
      inviteCode: generateInviteCode(),
    });

    await User.findByIdAndUpdate(userId, {
      $push: { workspaces: workspace._id },
      $set: { activeWorkspace: workspace._id },
    });

    res.status(201).json(workspace);
  } catch (error) {
    console.error('createWorkspace error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Get all workspaces for current user
// @route   GET /api/workspaces
// ================================================================
export const getMyWorkspaces = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as { user?: { _id?: string } }).user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const objectId = new mongoose.Types.ObjectId(userId);
    const workspaces = await Workspace.find({ 'members.user': objectId })
      .select('name slug inviteCode owner members createdAt')
      .populate('members.user', 'name email')
      .populate('members.roleId', 'name description');

    res.status(200).json(workspaces);
  } catch (error) {
    console.error('getMyWorkspaces error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Get a single workspace by slug (with populated members)
// @route   GET /api/workspaces/:slug
// ================================================================
export const getWorkspaceBySlug = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as { user?: { _id?: string } }).user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const { slug } = req.params;

    const workspace = await Workspace.findOne({ slug })
      .populate('members.user', 'name email')
      .populate('members.roleId', 'name description');

    if (!workspace) {
      res.status(404).json({ message: 'Workspace not found' });
      return;
    }

    // Membership check — handle both populated and unpopulated user refs
    const isMember = workspace.members.some((m: any) => {
      const memberId = m.user?._id ? m.user._id.toString() : m.user.toString();
      return memberId === userId.toString();
    });

    if (!isMember) {
      res.status(403).json({ message: 'You are not a member of this workspace' });
      return;
    }

    res.status(200).json(workspace);
  } catch (error) {
    console.error('getWorkspaceBySlug error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Switch active workspace
// @route   PUT /api/workspaces/:slug/activate
// ================================================================
export const switchWorkspace = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as { user?: { _id?: string } }).user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const { slug } = req.params;
    const objectId = new mongoose.Types.ObjectId(userId);

    const workspace = await Workspace.findOne({ slug, 'members.user': objectId });
    if (!workspace) {
      res.status(404).json({ message: 'Workspace not found or you are not a member' });
      return;
    }

    await User.findByIdAndUpdate(userId, { activeWorkspace: workspace._id });

    res.status(200).json(workspace);
  } catch (error) {
    console.error('switchWorkspace error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Join workspace via invite code
// @route   POST /api/workspaces/join
// ================================================================
export const joinWorkspace = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as { user?: { _id?: string } }).user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const { inviteCode, roleId } = req.body;
    if (!inviteCode) {
      res.status(400).json({ message: 'Invite code is required' });
      return;
    }

    const workspace = await Workspace.findOne({ inviteCode: inviteCode.toUpperCase() });
    if (!workspace) {
      res.status(404).json({ message: 'Invalid invite code' });
      return;
    }

    const alreadyMember = workspace.members.some(
      (m) => m.user.toString() === userId.toString()
    );
    if (alreadyMember) {
      res.status(400).json({ message: 'You are already a member of this workspace' });
      return;
    }

    // Resolve role (defaults to Viewer if none provided)
    let targetRole = null;
    if (roleId) {
      targetRole = await Role.findById(roleId);
    }
    if (!targetRole) {
      targetRole = await Role.findOne({ name: 'Viewer', isSystem: true });
    }
    if (!targetRole) {
      res.status(500).json({ message: 'System roles not seeded. Restart the server.' });
      return;
    }

    workspace.members.push({
      user: userId as any,
      roleId: targetRole._id as any,
      joinedAt: new Date(),
    });
    await workspace.save();

    await User.findByIdAndUpdate(userId, {
      $addToSet: { workspaces: workspace._id },
      $set: { activeWorkspace: workspace._id },
    });

    res.status(200).json(workspace);
  } catch (error) {
    console.error('joinWorkspace error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// Validation
// ================================================================
export const validateUpdateWorkspace = [
  body('name')
    .isString()
    .withMessage('Workspace name is required')
    .trim()
    .notEmpty()
    .withMessage('Workspace name is required')
    .isLength({ max: 60 })
    .withMessage('Workspace name must be 60 characters or fewer'),
];

// Seniority of the system roles (Product Owner first); custom roles come after them.
const SYSTEM_ROLE_ORDER = SYSTEM_ROLES.map(role => role.name);
const roleRank = (role: { name: string; isSystem?: boolean }): number => {
  const index = role.isSystem ? SYSTEM_ROLE_ORDER.indexOf(role.name) : -1;
  return index === -1 ? SYSTEM_ROLE_ORDER.length : index;
};

// ================================================================
// @desc    List workspace members
// @route   GET /api/workspaces/:slug/members
// @desc    Requires users:read (enforced by route middleware)
//
// Returns members sorted by role seniority, then by name.
// ================================================================
export const getWorkspaceMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;

    // Populate the member users + roles
    const populated = await Workspace.findById(workspace._id)
      .populate('members.user', 'name email avatarUrl jobTitle')
      .populate('members.roleId', 'name description isSystem');

    if (!populated) {
      res.status(404).json({ message: 'Workspace not found' });
      return;
    }

    const members = populated.members
      .map((m: any) => {
        const user = m.user;
        const role = m.roleId;
        if (!user || !role) return null;

        return {
          _id: user._id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl ?? '',
          jobTitle: user.jobTitle ?? '',
          role: {
            _id: role._id,
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
          },
          joinedAt: m.joinedAt,
        };
      })
      .filter((m: unknown): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name));

    res.status(200).json(members);
  } catch (error) {
    console.error('getWorkspaceMembers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Rename a workspace (slug unchanged)
// @route   PUT /api/workspaces/:slug
// @desc    Requires settings:manage (enforced by route middleware)
// ================================================================
export const updateWorkspace = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const workspace = req.workspace!;
    workspace.name = req.body.name;
    await workspace.save();
    res.status(200).json(workspace);
  } catch (error) {
    console.error('updateWorkspace error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Regenerate the invite code
// @route   POST /api/workspaces/:slug/invite-code
// @desc    Requires settings:manage (enforced by route middleware)
// ================================================================
export const regenerateInviteCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    workspace.inviteCode = generateInviteCode();
    await workspace.save();
    res.status(200).json({ inviteCode: workspace.inviteCode });
  } catch (error) {
    console.error('regenerateInviteCode error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};