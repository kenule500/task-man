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
): Promise<mongoose.Types.ObjectId> =>
  new Promise((resolve, reject) => {
    const upload = getBucket().openUploadStream(filename, { metadata: { contentType } });
    upload.once('error', reject);
    upload.once('finish', () => resolve(upload.id as mongoose.Types.ObjectId));
    Readable.from(buffer).pipe(upload);
  });

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
