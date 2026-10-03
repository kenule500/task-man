import express, { Router } from 'express';
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  validateCreateTask,
  validateUpdateTask,
} from '../controllers/taskController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requireWorkspaceMember } from '../middleware/workspaceMiddleware.js';

// Mounted under /api/workspaces/:slug/tasks — mergeParams exposes :slug
const router: Router = express.Router({ mergeParams: true });

router.use(protect, requireWorkspaceMember);

router.get('/', getTasks);
router.post('/', validateCreateTask, createTask);
router.put('/:id', validateUpdateTask, updateTask);
router.patch('/:id', validateUpdateTask, updateTask);
router.delete('/:id', deleteTask);

export default router;
