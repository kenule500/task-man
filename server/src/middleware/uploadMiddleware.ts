import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

const sanitizeFilename = (name: string): string => {
  const base = path.basename(name).replace(/[^a-zA-Z0-9.\-_]/g, '_');
  return base.slice(-100) || 'file';
};

const destinationFor = (req: Request): string => {
  const workspaceId = req.workspace!._id.toString();
  const taskId = req.params.taskId as string;
  const dir = path.join(UPLOAD_ROOT, workspaceId, taskId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const storage = multer.diskStorage({
  destination: (req, _file, cb) => cb(null, destinationFor(req as Request)),
  filename: (_req, file, cb) => {
    const unique = crypto.randomBytes(6).toString('hex');
    cb(null, `${Date.now()}-${unique}-${sanitizeFilename(file.originalname)}`);
  },
});

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const DOCUMENT_TYPES = [
  ...IMAGE_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
];

const makeFilter = (allowed: string[]) => (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error(`File type not allowed: ${file.mimetype}`));
};

export const uploadCoverImage = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: makeFilter(IMAGE_TYPES),
}).single('image');

export const uploadAttachmentFile = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: makeFilter(DOCUMENT_TYPES),
}).single('file');

export const UPLOAD_ROOT_DIR = UPLOAD_ROOT;
