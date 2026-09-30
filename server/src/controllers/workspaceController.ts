import { Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Workspace from '../models/workspaceModel.js';
import User from '../models/userModel.js';

const generateInviteCode = () => crypto.randomBytes(6).toString('hex').toUpperCase();

const generateSlug = async (name: string): Promise<string> => {
  const base = name
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

    const slug = await generateSlug(name.trim());

    const workspace = await Workspace.create({
      name: name.trim(),
      slug,
      owner: userId,
      members: [{ user: userId, role: 'owner', joinedAt: new Date() }],
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
      .select('name slug inviteCode owner members createdAt');

    res.status(200).json(workspaces);
  } catch (error) {
    console.error('getMyWorkspaces error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Get a single workspace by slug (verifies membership)
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

    const workspace = await Workspace.findOne({ slug });
    if (!workspace) {
      res.status(404).json({ message: 'Workspace not found' });
      return;
    }

    // Compare as strings to avoid ObjectId casting issues
    const isMember = workspace.members.some(
      m => m.user.toString() === userId.toString()
    );
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
// @desc    Switch active workspace (by slug)
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

    const { inviteCode } = req.body;
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
      m => m.user.toString() === userId.toString()
    );
    if (alreadyMember) {
      res.status(400).json({ message: 'You are already a member of this workspace' });
      return;
    }

    workspace.members.push({ user: userId as any, role: 'member', joinedAt: new Date() });
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