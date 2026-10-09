import express, { Router } from 'express';
import {
  completeSprint,
  createProject,
  createSprint,
  deleteProject,
  deleteSprint,
  listProjects,
  startSprint,
  updateProject,
  updateSprint,
  validateCompleteSprint,
  validateCreateProject,
  validateCreateSprint,
  validateUpdateProject,
  validateUpdateSprint,
} from '../controllers/projectController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';

// Mounted under /api/workspaces/:slug/projects — mergeParams exposes :slug.
// Sprint planning is project work: Scrum Masters (projects:write) run sprints; deleting a project needs projects:delete.
const router: Router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/', requirePermission('projects:read'), listProjects);
router.post('/', requirePermission('projects:write'), validateCreateProject, createProject);
router.patch('/:id', requirePermission('projects:write'), validateUpdateProject, updateProject);
router.delete('/:id', requirePermission('projects:delete'), deleteProject);

router.post('/:id/sprints', requirePermission('projects:write'), validateCreateSprint, createSprint);
router.patch('/:id/sprints/:sprintId', requirePermission('projects:write'), validateUpdateSprint, updateSprint);
router.post('/:id/sprints/:sprintId/start', requirePermission('projects:write'), startSprint);
router.post('/:id/sprints/:sprintId/complete', requirePermission('projects:write'), validateCompleteSprint, completeSprint);
router.delete('/:id/sprints/:sprintId', requirePermission('projects:write'), deleteSprint);

export default router;
