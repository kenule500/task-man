import express, { Router } from 'express';
import {
  getChannelAvatar,
  listChannels,
  listChatMembers,
  listConversations,
  listTeamChannels,
  renameChannel,
  setChannelAvatar,
  startDirect,
  validateListChannels,
  validateRenameChannel,
  validateStartDirect,
} from '../controllers/chatChannelController.js';
import {
  deleteMessage,
  downloadAttachment,
  editMessage,
  listMessages,
  listPinned,
  listReplies,
  markRead,
  pinMessage,
  removeReaction,
  searchMessages,
  sendMessage,
  toggleReaction,
  unpinMessage,
  uploadAttachment,
  validateEditMessage,
  validateListMessages,
  validateMarkRead,
  validateReaction,
  validateSearch,
  validateSendMessage,
} from '../controllers/chatMessageController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { uploadAttachmentFile } from '../middleware/uploadMiddleware.js';

// Mounted under /api/workspaces/:slug — mergeParams exposes :slug.
// Every route is permission scoped and workspace scoped: queries filter by req.workspace._id (CON-106, CON-512).
const router: Router = express.Router({ mergeParams: true });

router.use(protect);

// Channels
router.get('/channels', requirePermission('chat:read'), validateListChannels, listChannels);
// Conversations: direct messages and team channels in one request, so the side panel loads in one round trip
router.get('/chat/conversations', requirePermission('chat:read'), listConversations);
// Team channels only, kept for callers that need just that half
router.get('/chat/teams', requirePermission('chat:read'), listTeamChannels);
// Avatar upload is declared before the generic :channelId routes so it is not captured as an id
router.post('/chat/:channelId/avatar', requirePermission('chat:moderate'), uploadAttachmentFile, setChannelAvatar);
router.get('/chat/:channelId/avatar', requirePermission('chat:read'), getChannelAvatar);
router.patch('/chat/:channelId', requirePermission('chat:moderate'), validateRenameChannel, renameChannel);
// The mention menu and the direct-message picker need names; users:read is not required for chat
router.get('/chat/members', requirePermission('chat:read'), listChatMembers);
router.post('/chat/direct', requirePermission('chat:dm'), validateStartDirect, startDirect);

// Attachments are served through a message the caller may read
router.get('/chat/attachments/:attachmentId', requirePermission('chat:read'), downloadAttachment);

// Messages
router.get('/chat/:channelId/messages', requirePermission('chat:read'), validateListMessages, listMessages);
router.post('/chat/:channelId/messages', requirePermission('chat:write'), validateSendMessage, sendMessage);
router.get('/chat/:channelId/messages/:messageId/replies', requirePermission('chat:read'), listReplies);
router.patch('/chat/:channelId/messages/:messageId', requirePermission('chat:write'), validateEditMessage, editMessage);
router.delete('/chat/:channelId/messages/:messageId', requirePermission('chat:read'), deleteMessage);

// Reactions, pinning, search and read state
router.post('/chat/:channelId/messages/:messageId/reactions', requirePermission('chat:write'), validateReaction, toggleReaction);
router.delete('/chat/:channelId/messages/:messageId/reactions/:emoji', requirePermission('chat:write'), validateReaction, removeReaction);
router.post('/chat/:channelId/messages/:messageId/pin', requirePermission('chat:write'), pinMessage);
router.delete('/chat/:channelId/messages/:messageId/pin', requirePermission('chat:write'), unpinMessage);
router.get('/chat/:channelId/pins', requirePermission('chat:read'), listPinned);
router.get('/chat/:channelId/search', requirePermission('chat:read'), validateSearch, searchMessages);
router.post('/chat/:channelId/read', requirePermission('chat:read'), validateMarkRead, markRead);

// Uploads: the stored id is attached to a message when it is sent
router.post('/chat/:channelId/attachments', requirePermission('chat:write'), uploadAttachmentFile, uploadAttachment);

export default router;
