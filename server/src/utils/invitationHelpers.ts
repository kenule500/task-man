import mongoose from 'mongoose';
import Invitation, { IInvitation } from '../models/invitationModel.js';
import Workspace from '../models/workspaceModel.js';
import { hashToken } from './tokens.js';

interface InvitationError {
  status: number;
  message: string;
}

type InvitationResult =
  | { invitation: IInvitation; error: null }
  | { invitation: null; error: InvitationError };

/**
 * Loads an invitation by token and validates it's still usable.
 *
 * Returns either { invitation, error: null } on success,
 * or { invitation: null, error: { status, message } } on failure.
 *
 * Side effect: marks the invitation as 'expired' if it's past its expiry date.
 */
export const loadPendingInvitation = async (token: string): Promise<InvitationResult> => {
  // Only the SHA-256 hash of the token is stored
  const invitation = /^[a-f0-9]{64}$/.test(token) ? await Invitation.findOne({ token: hashToken(token) }) : null;

  if (!invitation) {
    return {
      invitation: null,
      error: { status: 404, message: 'Invitation not found' },
    };
  }

  if (invitation.status !== 'pending') {
    return {
      invitation: null,
      error: { status: 400, message: `Invitation already ${invitation.status}` },
    };
  }

  if (invitation.expiresAt < new Date()) {
    invitation.status = 'expired';
    await invitation.save();
    return {
      invitation: null,
      error: { status: 400, message: 'Invitation expired' },
    };
  }

  return { invitation, error: null };
};

/**
 * Checks whether a user is already a member of a workspace.
 * Accepts either a workspace document or a raw ObjectId.
 */
export const isMemberOfWorkspace = async (
  workspaceId: mongoose.Types.ObjectId | string,
  userId: string
): Promise<boolean> => {
  const workspace = await Workspace.findById(workspaceId).select('members.user');
  if (!workspace) return false;

  return workspace.members.some(
    (m) => m.user.toString() === userId.toString()
  );
};