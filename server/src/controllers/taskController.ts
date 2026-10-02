import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Task from '../models/taskModel.js';
import { UPLOAD_ROOT_DIR } from '../middleware/uploadMiddleware.js';

const ASSIGNEE_FIELDS = 'name email avatarUrl';
const DEPENDENCY_FIELDS = 'title status';

const populateTask = (query: ReturnType<typeof Task.findOne> | ReturnType<typeof Task.findById>) =>
  query
    .populate('assignees', ASSIGNEE_FIELDS)
    .populate('dependencies', DEPENDENCY_FIELDS)
    .populate('comments.author', ASSIGNEE_FIELDS);

const deleteUploadedFileSafe = (filePath: string) => {
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') console.error('Failed to delete file:', filePath, err);
  });
};

// ================================================================
// @desc    Get all tasks for a workspace
// @route   GET /api/workspaces/:workspaceSlug/tasks
// ================================================================
export const getTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const tasks = await populateTask(Task.find({ workspace: req.workspace!._id }) as any)
      .sort({ order: 1, createdAt: 1 });

    res.status(200).json(tasks);
  } catch (error) {
    console.error('getTasks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Create a task
// @route   POST /api/workspaces/:workspaceSlug/tasks
// ================================================================
export const createTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, status, priority, startDate, deadline, assignees, dependencies, labels } = req.body;

    if (!title || !title.trim()) {
      res.status(400).json({ message: 'Task title is required' });
      return;
    }

    const workspaceId = req.workspace!._id;
    const resolvedStatus = status || 'pending';

    const lastInColumn = await Task.findOne({ workspace: workspaceId, status: resolvedStatus })
      .sort({ order: -1 })
      .select('order');

    const task = await Task.create({
      workspace: workspaceId,
      title: title.trim(),
      description: description?.trim() || '',
      status: resolvedStatus,
      priority: priority || 'medium',
      labels: Array.isArray(labels) ? labels.filter(Boolean).slice(0, 10) : [],
      startDate: startDate || undefined,
      deadline: deadline || undefined,
      assignees: Array.isArray(assignees) ? assignees : [],
      dependencies: Array.isArray(dependencies) ? dependencies : [],
      order: (lastInColumn?.order ?? -1) + 1,
      createdBy: req.user!._id,
    });

    const populated = await populateTask(Task.findById(task._id) as any);
    res.status(201).json(populated);
  } catch (error) {
    console.error('createTask error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Update a task's fields (title, description, dates, priority, assignees, dependencies, status, labels)
// @route   PUT /api/workspaces/:workspaceSlug/tasks/:taskId
// ================================================================
export const updateTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const { title, description, status, priority, startDate, deadline, assignees, dependencies, labels } = req.body;

    const task = await Task.findOne({ _id: taskId, workspace: req.workspace!._id });
    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    if (title !== undefined) {
      if (!title.trim()) {
        res.status(400).json({ message: 'Task title is required' });
        return;
      }
      task.title = title.trim();
    }
    if (description !== undefined) task.description = description?.trim() || '';
    if (status !== undefined) task.status = status;
    if (priority !== undefined) task.priority = priority;
    if (startDate !== undefined) task.startDate = startDate || undefined;
    if (deadline !== undefined) task.deadline = deadline || undefined;
    if (assignees !== undefined) task.assignees = Array.isArray(assignees) ? assignees : [];
    if (labels !== undefined) task.labels = Array.isArray(labels) ? labels.filter(Boolean).slice(0, 10) : [];
    if (dependencies !== undefined) {
      task.dependencies = Array.isArray(dependencies)
        ? dependencies.filter((id: string) => id !== taskId)
        : [];
    }

    await task.save();

    const populated = await populateTask(Task.findById(task._id) as any);
    res.status(200).json(populated);
  } catch (error) {
    console.error('updateTask error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Move a task between columns / reorder it (Kanban drag-drop, list reorder)
// @route   PATCH /api/workspaces/:workspaceSlug/tasks/:taskId/move
// ================================================================
export const moveTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const { status, order } = req.body;

    if (!status || typeof order !== 'number') {
      res.status(400).json({ message: 'status and order are required' });
      return;
    }

    const task = await populateTask(Task.findOneAndUpdate(
      { _id: taskId, workspace: req.workspace!._id },
      { status, order },
      { new: true }
    ) as any);

    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    res.status(200).json(task);
  } catch (error) {
    console.error('moveTask error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Delete a task
// @route   DELETE /api/workspaces/:workspaceSlug/tasks/:taskId
// ================================================================
export const deleteTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const taskId = req.params.taskId as string;
    const workspaceId = req.workspace!._id;

    const task = await Task.findOneAndDelete({ _id: taskId, workspace: workspaceId });
    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    // Remove this task from any other task's dependency list
    await Task.updateMany(
      { workspace: workspaceId, dependencies: new mongoose.Types.ObjectId(taskId) },
      { $pull: { dependencies: taskId } }
    );

    // Clean up any uploaded files that belonged to this task
    const taskDir = path.join(UPLOAD_ROOT_DIR, workspaceId.toString(), taskId);
    fs.rm(taskDir, { recursive: true, force: true }, (err) => {
      if (err) console.error('Failed to clean up task upload directory:', taskDir, err);
    });

    res.status(200).json({ message: 'Task deleted', _id: taskId });
  } catch (error) {
    console.error('deleteTask error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Upload / replace a task's cover image
// @route   POST /api/workspaces/:workspaceSlug/tasks/:taskId/cover
// ================================================================
export const setCoverImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const taskId = req.params.taskId as string;
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'An image file is required' });
      return;
    }

    const task = await Task.findOne({ _id: taskId, workspace: req.workspace!._id });
    if (!task) {
      deleteUploadedFileSafe(file.path);
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    if (task.coverImage?.filename) {
      deleteUploadedFileSafe(path.join(UPLOAD_ROOT_DIR, req.workspace!._id.toString(), taskId, task.coverImage.filename));
    }

    task.coverImage = {
      url: `/uploads/${req.workspace!._id.toString()}/${taskId}/${file.filename}`,
      filename: file.filename,
    };
    await task.save();

    const populated = await populateTask(Task.findById(task._id) as any);
    res.status(200).json(populated);
  } catch (error) {
    console.error('setCoverImage error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Remove a task's cover image
// @route   DELETE /api/workspaces/:workspaceSlug/tasks/:taskId/cover
// ================================================================
export const removeCoverImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const taskId = req.params.taskId as string;
    const task = await Task.findOne({ _id: taskId, workspace: req.workspace!._id });
    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    if (task.coverImage?.filename) {
      deleteUploadedFileSafe(path.join(UPLOAD_ROOT_DIR, req.workspace!._id.toString(), taskId, task.coverImage.filename));
    }
    task.coverImage = undefined;
    await task.save();

    const populated = await populateTask(Task.findById(task._id) as any);
    res.status(200).json(populated);
  } catch (error) {
    console.error('removeCoverImage error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Add a file attachment to a task
// @route   POST /api/workspaces/:workspaceSlug/tasks/:taskId/attachments
// ================================================================
export const addAttachment = async (req: Request, res: Response): Promise<void> => {
  try {
    const taskId = req.params.taskId as string;
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'A file is required' });
      return;
    }

    const task = await Task.findOne({ _id: taskId, workspace: req.workspace!._id });
    if (!task) {
      deleteUploadedFileSafe(file.path);
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    task.attachments.push({
      filename: file.filename,
      originalName: file.originalname,
      url: `/uploads/${req.workspace!._id.toString()}/${taskId}/${file.filename}`,
      mimetype: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
    } as any);
    await task.save();

    const populated = await populateTask(Task.findById(task._id) as any);
    res.status(201).json(populated);
  } catch (error) {
    console.error('addAttachment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Remove a file attachment from a task
// @route   DELETE /api/workspaces/:workspaceSlug/tasks/:taskId/attachments/:attachmentId
// ================================================================
export const removeAttachment = async (req: Request, res: Response): Promise<void> => {
  try {
    const taskId = req.params.taskId as string;
    const attachmentId = req.params.attachmentId as string;
    const task = await Task.findOne({ _id: taskId, workspace: req.workspace!._id });
    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    const attachment = task.attachments.find(a => a._id.toString() === attachmentId);
    if (!attachment) {
      res.status(404).json({ message: 'Attachment not found' });
      return;
    }

    deleteUploadedFileSafe(path.join(UPLOAD_ROOT_DIR, req.workspace!._id.toString(), taskId, attachment.filename));
    task.attachments = task.attachments.filter(a => a._id.toString() !== attachmentId) as any;
    await task.save();

    const populated = await populateTask(Task.findById(task._id) as any);
    res.status(200).json(populated);
  } catch (error) {
    console.error('removeAttachment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Add a comment to a task
// @route   POST /api/workspaces/:workspaceSlug/tasks/:taskId/comments
// ================================================================
export const addComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const taskId = req.params.taskId as string;
    const { text } = req.body;
    if (!text || !text.trim()) {
      res.status(400).json({ message: 'Comment text is required' });
      return;
    }

    const task = await Task.findOne({ _id: taskId, workspace: req.workspace!._id });
    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    task.comments.push({
      author: req.user!._id,
      text: text.trim(),
      createdAt: new Date(),
    } as any);
    await task.save();

    const populated = await populateTask(Task.findById(task._id) as any);
    res.status(201).json(populated);
  } catch (error) {
    console.error('addComment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Remove a comment from a task (author only)
// @route   DELETE /api/workspaces/:workspaceSlug/tasks/:taskId/comments/:commentId
// ================================================================
export const removeComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const taskId = req.params.taskId as string;
    const commentId = req.params.commentId as string;

    const task = await Task.findOne({ _id: taskId, workspace: req.workspace!._id });
    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    const comment = task.comments.find(c => c._id.toString() === commentId);
    if (!comment) {
      res.status(404).json({ message: 'Comment not found' });
      return;
    }
    if (comment.author.toString() !== req.user!._id.toString()) {
      res.status(403).json({ message: 'You can only delete your own comments' });
      return;
    }

    task.comments = task.comments.filter(c => c._id.toString() !== commentId) as any;
    await task.save();

    const populated = await populateTask(Task.findById(task._id) as any);
    res.status(200).json(populated);
  } catch (error) {
    console.error('removeComment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
