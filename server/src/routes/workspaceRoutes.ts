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
  leaveWorkspace,
} from '../controllers/memberController.js';
import {
  listWorkspaceRoles,
  createCustomRole,
  updateCustomRole,
  deleteCustomRole,
} from '../controllers/roleController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { getWorkspaceActivity } from '../controllers/activityController.js';
import { getSprintReport } from '../controllers/reportController.js';
import { getFlowReport } from '../controllers/flowController.js';
import automationRoutes from './automationRoutes.js';
import {
  getBoardSettings,
  updateBoardSettings,
  validateBoardSettings,
} from '../controllers/boardSettingsController.js';
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
  updateSavedView,
  validateCreateSavedView,
  validateUpdateSavedView,
} from '../controllers/savedViewController.js';
import {
  disableGithubIntegration,
  enableGithubIntegration,
  getGithubIntegration,
  regenerateGithubSecret,
  updateGithubIntegration,
  validateGithubSettings,
} from '../controllers/integrationController.js';
import taskRoutes from './taskRoutes.js';
import projectRoutes from './projectRoutes.js';

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
// Board settings (WIP limits): read with tasks:read, change with settings:manage
// ============================================================
router.get('/:slug/board-settings', protect, requirePermission('tasks:read'), getBoardSettings);
router.put(
  '/:slug/board-settings',
  protect,
  requirePermission('settings:manage'),
  validateBoardSettings,
  updateBoardSettings
);

// ============================================================
// Integrations (GitHub): all of it, including the webhook secret, needs settings:manage
// The public webhook receiver itself is POST /api/integrations/github/:slug
// ============================================================
router.get('/:slug/integrations/github', protect, requirePermission('settings:manage'), getGithubIntegration);
router.post('/:slug/integrations/github/enable', protect, requirePermission('settings:manage'), enableGithubIntegration);
router.post('/:slug/integrations/github/regenerate-secret', protect, requirePermission('settings:manage'), regenerateGithubSecret);
router.post('/:slug/integrations/github/disable', protect, requirePermission('settings:manage'), disableGithubIntegration);
router.patch(
  '/:slug/integrations/github',
  protect,
  requirePermission('settings:manage'),
  validateGithubSettings,
  updateGithubIntegration
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
// Leaving needs no permission beyond membership (checked in the controller); must come before :userId
router.delete('/:slug/members/me', protect, leaveWorkspace);
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

// Audit log of the workspace (owners and admins)
router.get('/:slug/activity', protect, requirePermission('settings:manage'), getWorkspaceActivity);

// Saved task views (own + shared); everyone who can read tasks may save one, ownership is checked in the controller
router.get('/:slug/views', protect, requirePermission('tasks:read'), listSavedViews);
router.post('/:slug/views', protect, requirePermission('tasks:read'), validateCreateSavedView, createSavedView);
router.patch('/:slug/views/:id', protect, requirePermission('tasks:read'), validateUpdateSavedView, updateSavedView);
router.delete('/:slug/views/:id', protect, requirePermission('tasks:read'), deleteSavedView);

// Sprint report (committed / completed / added / removed); read-only, so projects:read is enough
router.get(
  '/:slug/projects/:projectId/sprints/:sprintId/report',
  protect,
  requirePermission('projects:read'),
  getSprintReport
);

// Flow analytics: cumulative flow, cycle and lead time, aging work in progress
router.get('/:slug/reports/flow', protect, requirePermission('projects:read'), getFlowReport);

// Automation rules (routes protect themselves; managing them needs settings:manage)
router.use('/:slug/automations', automationRoutes);

// Workspace-scoped projects and their sprints
router.use('/:slug/projects', projectRoutes);

export default router;