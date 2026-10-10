import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { auditLookup, recordActivity } from '../utils/activity.js';
import { body } from 'express-validator';
import Task, { MAX_ATTACHMENTS, MAX_COMMENT_LENGTH } from '../models/taskModel.js';
import { ALLOWED_ATTACHMENT_TYPES, sanitizeFilename } from '../middleware/uploadMiddleware.js';
import { deleteFiles, openFileStream, saveFile } from '../utils/gridfs.js';
import { loadMentionCandidates, notifyComment, resolveMentions, type NotifiableTask } from '../utils/notify.js';
import { handleError, hasValidationErrors, workspaceOf } from './taskController.js';

// Comments and attachments of a task. Routes guard these with requirePermission,
// so req.workspace / req.permissions are always set.

type Lean = { _id: mongoose.Types.ObjectId };
type StoredAttachment = {
  _id: unknown;
  fileId: mongoose.Types.ObjectId;
  originalName: string;
  mimetype: string;
  size: number;
  uploadedBy: unknown;
};

export const validateComment = [
  body('text').isString().withMessage('Comment text is required')
    .bail()
    .trim()
    .notEmpty().withMessage('Comment text is required')
    .isLength({ max: MAX_COMMENT_LENGTH }).withMessage(`Comment is too long (max ${MAX_COMMENT_LENGTH} characters)`),
];

const hasPermission = (req: Request, permission: string): boolean =>
  Boolean(req.permissions?.includes(permission));

const sameId = (a: unknown, b: unknown): boolean => String(a) === String(b);

const isObjectId = (value: unknown): value is string =>
  typeof value === 'string' && mongoose.isValidObjectId(value);

/** Loads one workspace task with only the given fields (plain object). */
const loadTask = async <T extends Lean>(req: Request, fields: string): Promise<T | null> => {
  const id = req.params.id;
  if (!isObjectId(id)) return null;
  const task = await Task.findOne({ _id: id, workspace: workspaceOf(req)._id }).select(fields).lean();
  return task as unknown as T | null;
};

/** RFC 5987 encoding for the Content-Disposition filename* parameter. */
const encodeFilename = (name: string): string =>
  encodeURIComponent(name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// ================================================================
// @desc    Add a comment to a task
// @route   POST /api/workspaces/:slug/tasks/:id/comments   (tasks:write)
// ================================================================
export const addComment = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  try {
    const id = req.params.id;
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    if (!isObjectId(id)) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    const text = String(req.body.text);
    // "@Name" tags workspace members; the author is never notified about their own comment
    const mentions = text.includes('@')
      ? resolveMentions(text, await loadMentionCandidates(workspaceOf(req)))
        .filter(memberId => !sameId(memberId, user._id))
        .map(memberId => new mongoose.Types.ObjectId(memberId))
      : [];
    const comment = {
      _id: new mongoose.Types.ObjectId(),
      author: user._id,
      text,
      mentions,
      createdAt: new Date(),
    };
    const result = await Task.updateOne(
      { _id: id, workspace: workspaceOf(req)._id },
      { $push: { comments: comment } },
    );
    if (!result.matchedCount) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }
    const commented = await auditLookup(() => Task.findById(id).select('title owner assignees').lean());
    await recordActivity(req, { action: 'task.commented', summary: commented?.title ?? '', task: id });
    if (commented) {
      await notifyComment(req, commented as unknown as NotifiableTask, { text, mentions });
    }

    res.status(201).json({
      ...comment,
      author: { _id: user._id, name: user.name, avatarUrl: user.avatarUrl },
    });
  } catch (error) {
    handleError(res, error, 'addComment');
  }
};

// ================================================================
// @desc    Delete a comment (its author, or a role with settings:manage)
// @route   DELETE /api/workspaces/:slug/tasks/:id/comments/:commentId   (tasks:write)
// ================================================================
export const deleteComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const task = await loadTask<Lean & { comments: { _id: unknown; author: unknown }[] }>(req, 'comments');
    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    const comment = (task.comments ?? []).find(c => sameId(c._id, req.params.commentId));
    if (!comment) {
      res.status(404).json({ message: 'Comment not found' });
      return;
    }

    const isAuthor = sameId(comment.author, req.user?._id);
    if (!isAuthor && !hasPermission(req, 'settings:manage')) {
      res.status(403).json({ message: 'You can only delete your own comments' });
      return;
    }

    await Task.updateOne({ _id: task._id }, { $pull: { comments: { _id: comment._id } } });
    const deletedFrom = await auditLookup(() => Task.findById(task._id).select('title').lean());
    await recordActivity(req, { action: 'task.comment_deleted', summary: deletedFrom?.title ?? '', task: String(task._id) });
    res.status(200).json({ message: 'Comment deleted', id: String(comment._id) });
  } catch (error) {
    handleError(res, error, 'deleteComment');
  }
};

// ================================================================
// @desc    Upload one attachment (multipart field "file") into GridFS
// @route   POST /api/workspaces/:slug/tasks/:id/attachments   (tasks:write)
// ================================================================
export const uploadAttachment = async (req: Request, res: Response): Promise<void> => {
  let fileId: mongoose.Types.ObjectId | undefined;

  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'No file uploaded (send it in the "file" field)' });
      return;
    }
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.mimetype)) {
      res.status(400).json({ message: `File type not allowed: ${file.mimetype}` });
      return;
    }

    const task = await loadTask<Lean & { attachments: unknown[]; title?: string }>(req, 'attachments title');
    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }
    if ((task.attachments ?? []).length >= MAX_ATTACHMENTS) {
      res.status(400).json({ message: `A task can have at most ${MAX_ATTACHMENTS} attachments` });
      return;
    }

    const originalName = sanitizeFilename(file.originalname);
    fileId = await saveFile(file.buffer, originalName, file.mimetype);

    const attachment = {
      _id: new mongoose.Types.ObjectId(),
      fileId,
      originalName,
      mimetype: file.mimetype,
      size: file.size,
      uploadedBy: req.user?._id,
      uploadedAt: new Date(),
    };
    // The index condition keeps the limit exact when uploads race
    const result = await Task.updateOne(
      {
        _id: task._id,
        workspace: workspaceOf(req)._id,
        [`attachments.${MAX_ATTACHMENTS - 1}`]: { $exists: false },
      },
      { $push: { attachments: attachment } },
    );
    if (!result.matchedCount) {
      await deleteFiles([fileId]);
      res.status(400).json({ message: 'Attachment limit reached or task no longer exists' });
      return;
    }
    await recordActivity(req, {
      action: 'task.attachment_added', summary: String((task as { title?: string }).title ?? ''), task: String(task._id),
      changes: [{ field: 'file', to: originalName }],
    });

    res.status(201).json(attachment);
  } catch (error) {
    if (fileId) await deleteFiles([fileId]);
    handleError(res, error, 'uploadAttachment');
  }
};

// ================================================================
// @desc    Stream an attachment from GridFS (always as a download)
// @route   GET /api/workspaces/:slug/tasks/:id/attachments/:attachmentId   (tasks:read)
// ================================================================
export const downloadAttachment = async (req: Request, res: Response): Promise<void> => {
  try {
    const task = await loadTask<Lean & { attachments: StoredAttachment[] }>(req, 'attachments');
    const attachment = (task?.attachments ?? []).find(a => sameId(a._id, req.params.attachmentId));
    if (!attachment) {
      res.status(404).json({ message: 'Attachment not found' });
      return;
    }

    // Stored types were allow-listed at upload; anything else is served as opaque bytes
    const contentType = ALLOWED_ATTACHMENT_TYPES.includes(attachment.mimetype)
      ? attachment.mimetype
      : 'application/octet-stream';
    const headers: Record<string, string | number> = {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeFilename(attachment.originalName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=0, must-revalidate',
      'Content-Length': attachment.size,
    };
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);

    const stream = openFileStream(attachment.fileId);
    stream.once('error', error => {
      console.error('downloadAttachment stream error:', error instanceof Error ? error.message : error);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      for (const name of Object.keys(headers)) res.removeHeader(name);
      res.status(404).json({ message: 'Attachment file not found' });
    });
    stream.pipe(res);
  } catch (error) {
    handleError(res, error, 'downloadAttachment');
  }
};

// ================================================================
// @desc    Delete an attachment (uploader, or a role with tasks:delete)
// @route   DELETE /api/workspaces/:slug/tasks/:id/attachments/:attachmentId   (tasks:write)
// ================================================================
export const deleteAttachment = async (req: Request, res: Response): Promise<void> => {
  try {
    const task = await loadTask<Lean & { attachments: StoredAttachment[]; title?: string }>(req, 'attachments title');
    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    const attachment = (task.attachments ?? []).find(a => sameId(a._id, req.params.attachmentId));
    if (!attachment) {
      res.status(404).json({ message: 'Attachment not found' });
      return;
    }

    const isUploader = sameId(attachment.uploadedBy, req.user?._id);
    if (!isUploader && !hasPermission(req, 'tasks:delete')) {
      res.status(403).json({ message: 'You can only delete attachments you uploaded' });
      return;
    }

    await Task.updateOne({ _id: task._id }, { $pull: { attachments: { _id: attachment._id } } });
    await deleteFiles([attachment.fileId]);
    await recordActivity(req, {
      action: 'task.attachment_removed', summary: String((task as { title?: string }).title ?? ''), task: String(task._id),
      changes: [{ field: 'file', from: attachment.originalName }],
    });
    res.status(200).json({ message: 'Attachment deleted', id: String(attachment._id) });
  } catch (error) {
    handleError(res, error, 'deleteAttachment');
  }
};
