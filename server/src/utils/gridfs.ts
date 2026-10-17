import { Readable } from 'stream';
import mongoose from 'mongoose';

// Attachments live in MongoDB (GridFS), not on disk: the API runs on serverless
// platforms where the filesystem is ephemeral.
export const ATTACHMENT_BUCKET = 'attachments';

const getBucket = (): mongoose.mongo.GridFSBucket => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection is not ready');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: ATTACHMENT_BUCKET });
};

/** Stores a buffer in GridFS and resolves with the new file id. */
export const saveFile = (
  buffer: Buffer,
  filename: string,
  contentType: string,
  metadata: Record<string, unknown> = {},
): Promise<mongoose.Types.ObjectId> =>
  new Promise((resolve, reject) => {
    const upload = getBucket().openUploadStream(filename, { metadata: { contentType, ...metadata } });
    upload.once('error', reject);
    upload.once('finish', () => resolve(upload.id as mongoose.Types.ObjectId));
    Readable.from(buffer).pipe(upload);
  });

export interface StoredFileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  /** Which chat channel the file was uploaded to, used to stop a message borrowing another channel's file. */
  channel: string | null;
}

/** Reads a stored file's descriptive metadata without streaming its bytes. */
export const fileInfoOf = async (fileId: mongoose.Types.ObjectId | string): Promise<StoredFileInfo | null> => {
  const db = mongoose.connection.db;
  if (!db || !mongoose.isValidObjectId(String(fileId))) return null;
  try {
    const file = await db.collection(`${ATTACHMENT_BUCKET}.files`)
      .findOne({ _id: new mongoose.Types.ObjectId(String(fileId)) });
    if (!file) return null;
    const meta = (file.metadata ?? {}) as { contentType?: string; channel?: string };
    return {
      id: String(file._id),
      name: String(file.filename ?? 'file'),
      size: Number(file.length ?? 0),
      type: meta.contentType ?? 'application/octet-stream',
      channel: meta.channel ?? null,
    };
  } catch {
    return null;
  }
};

/** Opens a read stream for a stored file (emits an error when it does not exist). */
export const openFileStream = (fileId: mongoose.Types.ObjectId | string) =>
  getBucket().openDownloadStream(new mongoose.Types.ObjectId(String(fileId)));

/** Deletes stored files; missing files are ignored so cleanup never blocks the caller. */
export const deleteFiles = async (fileIds: (mongoose.Types.ObjectId | string)[]): Promise<void> => {
  if (fileIds.length === 0) return;
  const bucket = getBucket();
  await Promise.all(
    fileIds.map(id =>
      bucket.delete(new mongoose.Types.ObjectId(String(id))).catch(error => {
        console.error('GridFS delete failed:', error instanceof Error ? error.message : error);
      }),
    ),
  );
};
