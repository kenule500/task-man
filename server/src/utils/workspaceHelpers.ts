import mongoose from 'mongoose';
import { IWorkspace } from '../models/workspaceModel.js';

/**
 * Finds a member entry in a workspace's members array by user ID.
 * Returns undefined if the user isn't a member.
 */
export const findMember = (
  workspace: IWorkspace,
  userId: string
): IWorkspace['members'][number] | undefined => {
  return workspace.members.find(
    (m) => m.user.toString() === userId.toString()
  );
};

/**
 * Returns true if the given user is the workspace's owner.
 */
export const isWorkspaceOwner = (
  workspace: IWorkspace,
  userId: string
): boolean => {
  return workspace.owner.toString() === userId.toString();
};