import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  archiveChannel,
  createChannel,
  createMessage,
  getOnline,
  listChannels,
  listChatMembers,
  listMessages,
  markRead,
  openDirectMessage,
  removeMessage,
  updateChannel,
  updateMessage,
  validateChannelId,
  validateCreateChannel,
  validateDm,
  validateEditMessage,
  validateListMessages,
  validateMessageId,
  validatePostMessage,
  validateUpdateChannel,
} from '../controllers/chatController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';

// Mounted at /api/workspaces/:slug/chat (routes protect themselves)
const router: Router = express.Router({ mergeParams: true });

// A person can send a few messages a second, not hundreds (the socket path has the same budget)
const sendLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 30,
  keyGenerator: req => String(req.user?._id ?? 'anonymous'),
  validate: { keyGeneratorIpFallback: false },
  message: { message: 'You are sending messages too fast. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(protect);

router.get('/channels', requirePermission('tasks:read'), listChannels);
router.post('/channels', requirePermission('tasks:write'), validateCreateChannel, createChannel);
router.patch('/channels/:id', requirePermission('tasks:write'), validateUpdateChannel, updateChannel);
router.delete('/channels/:id', requirePermission('tasks:write'), validateChannelId, archiveChannel);
router.post('/dm', requirePermission('tasks:read'), validateDm, openDirectMessage);

router.get('/channels/:id/messages', requirePermission('tasks:read'), validateListMessages, listMessages);
router.post('/channels/:id/messages', requirePermission('tasks:read'), sendLimiter, validatePostMessage, createMessage);
router.post('/channels/:id/read', requirePermission('tasks:read'), validateChannelId, markRead);
router.patch('/messages/:id', requirePermission('tasks:read'), validateEditMessage, updateMessage);
router.delete('/messages/:id', requirePermission('tasks:read'), validateMessageId, removeMessage);

router.get('/members', requirePermission('tasks:read'), listChatMembers);
router.get('/presence', requirePermission('tasks:read'), getOnline);

export default router;
