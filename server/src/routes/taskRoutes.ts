import express, { Router } from 'express';
import {
  getTasks,
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  setCoverImage,
  removeCoverImage,
  addAttachment,
  removeAttachment,
  addComment,
  removeComment,
} from '../controllers/taskController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requireWorkspaceMember } from '../middleware/workspaceMiddleware.js';
import { uploadCoverImage, uploadAttachmentFile } from '../middleware/uploadMiddleware.js';

const router: Router = express.Router({ mergeParams: true });

router.use(protect, requireWorkspaceMember);

router.get('/', getTasks);
router.post('/', createTask);
router.put('/:taskId', updateTask);
router.patch('/:taskId/move', moveTask);
router.delete('/:taskId', deleteTask);

router.post('/:taskId/cover', uploadCoverImage, setCoverImage);
router.delete('/:taskId/cover', removeCoverImage);
router.post('/:taskId/attachments', uploadAttachmentFile, addAttachment);
router.delete('/:taskId/attachments/:attachmentId', removeAttachment);

router.post('/:taskId/comments', addComment);
router.delete('/:taskId/comments/:commentId', removeComment);

export default router;
