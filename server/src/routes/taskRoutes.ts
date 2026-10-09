import express, { Router } from 'express';
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  validateCreateTask,
  validateUpdateTask,
} from '../controllers/taskController.js';
import {
  addComment,
  deleteAttachment,
  deleteComment,
  downloadAttachment,
  uploadAttachment,
  validateComment,
} from '../controllers/taskExtrasController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { uploadAttachmentFile } from '../middleware/uploadMiddleware.js';

// Mounted under /api/workspaces/:slug/tasks — mergeParams exposes :slug.
// Each route checks its own permission (which also verifies workspace membership).
const router: Router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/', requirePermission('tasks:read'), getTasks);
router.post('/', requirePermission('tasks:write'), validateCreateTask, createTask);
router.put('/:id', requirePermission('tasks:write'), validateUpdateTask, updateTask);
router.patch('/:id', requirePermission('tasks:write'), validateUpdateTask, updateTask);
router.delete('/:id', requirePermission('tasks:delete'), deleteTask);

// Comments (delete: author or settings:manage, checked in the controller)
router.post('/:id/comments', requirePermission('tasks:write'), validateComment, addComment);
router.delete('/:id/comments/:commentId', requirePermission('tasks:write'), deleteComment);

// Attachments stored in GridFS (delete: uploader or tasks:delete, checked in the controller)
router.post('/:id/attachments', requirePermission('tasks:write'), uploadAttachmentFile, uploadAttachment);
router.get('/:id/attachments/:attachmentId', requirePermission('tasks:read'), downloadAttachment);
router.delete('/:id/attachments/:attachmentId', requirePermission('tasks:write'), deleteAttachment);

export default router;
