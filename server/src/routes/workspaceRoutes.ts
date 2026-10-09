import express, { Router } from 'express';
import {
  createWorkspace,
  getMyWorkspaces,
  getWorkspaceBySlug,
  getWorkspaceMembers,
  regenerateInviteCode,
  switchWorkspace,
  joinWorkspace,
  updateWorkspace,
  validateUpdateWorkspace,
} from '../controllers/workspaceController.js';
import {
  createInvitation,
  validateCreateInvitation,
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
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import taskRoutes from './taskRoutes.js';

const router: Router = express.Router();

// ============================================================
// Workspaces
// ============================================================

// Create + list + join don't need workspace context yet
router.post('/', protect, createWorkspace);
router.get('/', protect, getMyWorkspaces);
router.post('/join', protect, joinWorkspace);

// These need a workspace in the URL
router.get('/:slug', protect, getWorkspaceBySlug);
router.put('/:slug/activate', protect, switchWorkspace);

// ============================================================
// Workspace members (read requires users:read)
// ============================================================
router.get(
  '/:slug/members',
  protect,
  requirePermission('users:read'),
  getWorkspaceMembers
);

// ============================================================
// Workspace settings (rename + regenerate invite code)
// Both require settings:manage
// ============================================================
router.put(
  '/:slug',
  protect,
  requirePermission('settings:manage'),
  validateUpdateWorkspace,
  updateWorkspace
);
router.post(
  '/:slug/invite-code',
  protect,
  requirePermission('settings:manage'),
  regenerateInviteCode
);

// ============================================================
// Invitations (scoped to workspace)
// ============================================================
router.post(
  '/:slug/invitations',
  protect,
  requirePermission('users:write'),
  validateCreateInvitation,
  createInvitation
);
router.get(
  '/:slug/invitations',
  protect,
  requirePermission('users:read'),
  listInvitations
);
router.delete(
  '/:slug/invitations/:id',
  protect,
  requirePermission('users:write'),
  cancelInvitation
);

// ============================================================
// Member management (role change + removal)
// ============================================================
router.put(
  '/:slug/members/:userId/role',
  protect,
  requirePermission('users:write'),
  changeMemberRole
);
router.delete(
  '/:slug/members/:userId',
  protect,
  requirePermission('users:write'),
  removeMember
);

// ============================================================
// Roles (custom role CRUD)
// ============================================================
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

// ============================================================
// Workspace-scoped tasks
// Mounts taskRoutes at /:slug/tasks
// Task routes protect themselves internally
// ============================================================
router.use('/:slug/tasks', taskRoutes);

export default router;