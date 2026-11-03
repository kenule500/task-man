// Temporary files for large plan uploads.
//
// Multer writes the request body straight to one of these instead of holding the whole file in
// memory while it arrives. The file is read once, as a Buffer, because every extractor (PDF.js,
// DOCX, plain text) needs random access to the bytes; what this saves is the window between the
// first byte and the last, where a large PDF used to sit in memory for the whole transfer.

import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const UPLOAD_DIR = join(tmpdir(), 'taskman-plan-uploads');

/** Directory for one upload, created on demand so a rebooted machine still works. */
export const uploadDir = async (): Promise<string> => {
  await mkdir(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
};

/** Reads the upload and removes it. The file is gone even when reading or extracting fails. */
export const consumeUpload = async <T>(path: string, use: (buffer: Buffer) => Promise<T>): Promise<T> => {
  try {
    return await use(await readFile(path));
  } finally {
    await removeUpload(path);
  }
};

/** Best effort: a file we cannot delete must not turn a successful request into a failure. */
export const removeUpload = async (path: string): Promise<void> => {
  await rm(path, { force: true }).catch(() => undefined);
};
