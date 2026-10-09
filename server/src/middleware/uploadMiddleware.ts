import { Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';

// Serverless hosts cap request bodies (Vercel: 4.5 MB), so the limit is configurable.
const maxMb = Number(process.env.ATTACHMENT_MAX_MB);
export const MAX_ATTACHMENT_BYTES = (Number.isFinite(maxMb) && maxMb > 0 ? maxMb : 4) * 1024 * 1024;

// No svg/html: served back from our origin they would allow stored XSS.
export const ALLOWED_ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
];

/** Keeps a safe display name: no paths, control or reserved characters, max 100 chars. */
export const sanitizeFilename = (name: string): string => {
  const base = (name.split(/[\/]/).pop() ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim();
  if (!base) return 'file';
  if (base.length <= 100) return base;

  const dot = base.lastIndexOf('.');
  const extension = dot > 0 && base.length - dot <= 10 ? base.slice(dot) : '';
  return base.slice(0, 100 - extension.length) + extension;
};

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (ALLOWED_ATTACHMENT_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
  fileFilter,
}).single('file');

/** Maps a multer failure to a clear client message. */
export const describeUploadError = (error: unknown): string => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return `File is too large (max ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB)`;
      case 'LIMIT_UNEXPECTED_FILE':
        return 'Unsupported file type or unexpected field (send one file in the "file" field)';
      case 'LIMIT_FILE_COUNT':
        return 'Only one file can be uploaded at a time';
      default:
        return `Upload failed: ${error.message}`;
    }
  }
  return 'Upload failed';
};

/** Parses one multipart "file" into req.file (memory); upload errors become 400 responses. */
export const uploadAttachmentFile = (req: Request, res: Response, next: NextFunction): void => {
  upload(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError) {
      res.status(400).json({ message: describeUploadError(error) });
      return;
    }
    console.error('upload error:', error);
    res.status(400).json({ message: describeUploadError(error) });
  });
};
