// Temporary files for large plan uploads.
//
// Multer writes the request body straight to one of these instead of holding the whole file in
// memory while it arrives. The file is read once, as a Buffer, because every extractor (PDF.js,
// DOCX, plain text) needs random access to the bytes; what this saves is the window between the
// first byte and the last, where a large PDF used to sit in memory for the whole transfer.

import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const UPLOAD_DIR = join(tmpdir(), 'taskman-plan-uploads');

/**
 * The resolved path of a file this module may touch, or null for one outside the upload directory.
 * A path outside it is a bug in the caller (or a crafted request), never a file to read or delete,
 * so it is refused instead of resolved.
 */
const insideUploadDir = (path: string): string | null => {
  const root = resolve(UPLOAD_DIR);
  const resolved = resolve(path);
  if (!resolved.startsWith(`${root}${sep}`)) return null;
  return resolved;
};

/** Directory for one upload, created on demand so a rebooted machine still works. */
export const uploadDir = async (): Promise<string> => {
  await mkdir(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
};

/** Reads the upload and removes it. The file is gone even when reading or extracting fails. */
export const consumeUpload = async <T>(path: string, use: (buffer: Buffer) => Promise<T>): Promise<T> => {
  const file = insideUploadDir(path);
  try {
    if (!file) throw new Error('Refusing to touch a file outside the plan upload directory.');
    return await use(await readFile(file));
  } finally {
    await removeUpload(path);
  }
};

/**
 * Best effort: a file we cannot delete must not turn a successful request into a failure, and a
 * path outside the upload directory is not ours to delete.
 */
export const removeUpload = async (path: string): Promise<void> => {
  const file = insideUploadDir(path);
  if (!file) return;
  await rm(file, { force: true }).catch(() => undefined);
};
