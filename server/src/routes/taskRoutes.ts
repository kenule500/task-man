import express, { Router } from 'express';
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  duplicateTask,
  unwatchTask,
  validateCreateTask,
  validateDuplicateTask,
  validateUpdateTask,
  watchTask,
} from '../controllers/taskController.js';
import {
  bulkDeleteTasks,
  bulkUpdateTasks,
  validateBulkDelete,
  validateBulkUpdate,
} from '../controllers/bulkTaskController.js';
import {
  addComment,
  deleteAttachment,
  deleteComment,
  downloadAttachment,
  uploadAttachment,
  validateComment,
} from '../controllers/taskExtrasController.js';
import {
  addRelation,
  moveTask,
  removeRelation,
  validateAddRelation,
  validateMoveTask,
} from '../controllers/taskRelationController.js';
import { getTaskActivity } from '../controllers/activityController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { uploadAttachmentFile } from '../middleware/uploadMiddleware.js';

// Mounted under /api/workspaces/:slug/tasks — mergeParams exposes :slug.
// Each route checks its own permission (which also verifies workspace membership).
const router: Router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/', requirePermission('tasks:read'), getTasks);
router.post('/', requirePermission('tasks:write'), validateCreateTask, createTask);
// Bulk routes come before the /:id routes so "bulk" is not read as a task id
router.patch('/bulk', requirePermission('tasks:write'), validateBulkUpdate, bulkUpdateTasks);
router.post('/bulk-delete', requirePermission('tasks:delete'), validateBulkDelete, bulkDeleteTasks);

router.put('/:id', requirePermission('tasks:write'), validateUpdateTask, updateTask);
router.patch('/:id', requirePermission('tasks:write'), validateUpdateTask, updateTask);
router.delete('/:id', requirePermission('tasks:delete'), deleteTask);

// Copy a task (and optionally its subtasks); follow / unfollow it (self only)
router.post('/:id/duplicate', requirePermission('tasks:write'), validateDuplicateTask, duplicateTask);
router.post('/:id/watch', requirePermission('tasks:read'), watchTask);
router.delete('/:id/watch', requirePermission('tasks:read'), unwatchTask);

// Issue links (relates, duplicates, clones, blocks) and subtask conversion
router.post('/:id/relations', requirePermission('tasks:write'), validateAddRelation, addRelation);
router.delete('/:id/relations/:relatedId', requirePermission('tasks:write'), removeRelation);
router.post('/:id/move', requirePermission('tasks:write'), validateMoveTask, moveTask);

// History of field changes, comments and files
router.get('/:id/activity', requirePermission('tasks:read'), getTaskActivity);

// Comments (delete: author or settings:manage, checked in the controller)
router.post('/:id/comments', requirePermission('tasks:write'), validateComment, addComment);
router.delete('/:id/comments/:commentId', requirePermission('tasks:write'), deleteComment);

// Attachments stored in GridFS (delete: uploader or tasks:delete, checked in the controller)
router.post('/:id/attachments', requirePermission('tasks:write'), uploadAttachmentFile, uploadAttachment);
router.get('/:id/attachments/:attachmentId', requirePermission('tasks:read'), downloadAttachment);
router.delete('/:id/attachments/:attachmentId', requirePermission('tasks:write'), deleteAttachment);

export default router;
