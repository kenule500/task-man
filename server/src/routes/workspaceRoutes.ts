import express, { Router } from 'express';
import {
  createWorkspace,
  getMyWorkspaces,
  getWorkspaceBySlug,
  switchWorkspace,
  joinWorkspace,
} from '../controllers/workspaceController.js';
import {
  createInvitation,
  listInvitations,
  cancelInvitation,
} from '../controllers/invitationController.js';
import {
  changeMemberRole,
  removeMember,
} from '../controllers/memberController.js';

import {
  listWorkspaceRoles,
  createCustomRole,
  updateCustomRole,
  deleteCustomRole,
} from '../controllers/roleController.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';

import { protect } from '../middleware/authMiddleware.js';

const router: Router = express.Router();

// Workspaces
router.post('/', protect, createWorkspace);
router.get('/', protect, getMyWorkspaces);
router.get('/:slug', protect, getWorkspaceBySlug);
router.put('/:slug/activate', protect, switchWorkspace);
router.post('/join', protect, joinWorkspace);

// Invitations (scoped to workspace)
router.post('/:slug/invitations', protect, requirePermission('users:write'), createInvitation);
router.get('/:slug/invitations', protect, requirePermission('users:read'), listInvitations);
router.delete('/:slug/invitations/:id', protect, requirePermission('users:write'), cancelInvitation);

// Members (new — Phase 6)
router.put('/:slug/members/:userId/role', protect, requirePermission('users:write'), changeMemberRole);
router.delete('/:slug/members/:userId', protect, requirePermission('users:write'), removeMember);


// Roles (scoped to workspace)
router.get(
  '/:slug/roles',
  protect,
  requirePermission('users:read'),
  listWorkspaceRoles
);
router.post(
  '/:slug/roles',
  protect,
  requirePermission('settings:manage'),
  createCustomRole
);
router.put(
  '/:slug/roles/:id',
  protect,
  requirePermission('settings:manage'),
  updateCustomRole
);
router.delete(
  '/:slug/roles/:id',
  protect,
  requirePermission('settings:manage'),
  deleteCustomRole
);
export default router;