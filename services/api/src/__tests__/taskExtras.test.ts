import { PassThrough } from 'stream';
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Task from '../models/taskModel.js';
import {
  addComment,
  deleteAttachment,
  deleteComment,
  downloadAttachment,
  uploadAttachment,
  validateComment,
} from '../controllers/taskExtrasController.js';
import {
  MAX_ATTACHMENT_BYTES,
  sanitizeFilename,
  uploadAttachmentFile,
} from '../middleware/uploadMiddleware.js';
import { deleteFiles, openFileStream, saveFile } from '../utils/gridfs.js';

jest.mock('../utils/activity.js', () => ({ ...jest.requireActual('../utils/activity.js'), recordActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../models/taskModel.js', () => ({
  __esModule: true,
  TASK_STATUSES: ['pending', 'in-progress', 'completed'],
  TASK_PRIORITIES: ['low', 'medium', 'high'],
  MAX_LABELS: 10,
  MAX_LABEL_LENGTH: 40,
  MAX_COMMENT_LENGTH: 2000,
  MAX_ATTACHMENTS: 20,
  default: { findOne: jest.fn(), updateOne: jest.fn(), populate: jest.fn() },
}));
jest.mock('../utils/notify.js', () => ({
  resolveMentions: jest.fn(() => []),
  loadMentionCandidates: jest.fn().mockResolvedValue([]),
  notifyComment: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/gridfs.js', () => ({
  saveFile: jest.fn(),
  openFileStream: jest.fn(),
  deleteFiles: jest.fn().mockResolvedValue(undefined),
}));

const TaskMock = Task as unknown as Record<string, jest.Mock>;
const saveFileMock = saveFile as jest.Mock;
const deleteFilesMock = deleteFiles as jest.Mock;
const openFileStreamMock = openFileStream as jest.Mock;

const workspaceId = new Types.ObjectId();
const taskId = new Types.ObjectId();
const authorId = new Types.ObjectId();
const otherId = new Types.ObjectId();

type TestResponse = Response & { statusCode?: number; body?: any; headers: Record<string, unknown> };

const createResponse = (): TestResponse => {
  const res = { headers: {}, headersSent: false } as unknown as TestResponse;
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; }) as never;
  res.json = jest.fn((body: unknown) => { res.body = body; return res; }) as never;
  res.setHeader = jest.fn((k: string, v: unknown) => { res.headers[k] = v; return res; }) as never;
  res.removeHeader = jest.fn((k: string) => { delete res.headers[k]; }) as never;
  return res;
};

/** A response that is also a writable stream, so a GridFS stream can be piped into it. */
const createStreamResponse = (): TestResponse => Object.assign(new PassThrough(), createResponse()) as unknown as TestResponse;

const createRequest = (opts: {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  userId?: Types.ObjectId;
  permissions?: string[];
  file?: Partial<Express.Multer.File>;
} = {}) =>
  ({
    body: opts.body ?? {},
    params: { id: taskId.toString(), ...opts.params },
    user: { _id: opts.userId ?? authorId, name: 'Ann', avatarUrl: '', email: 'ann@example.com' },
    workspace: { _id: workspaceId },
    permissions: opts.permissions ?? ['tasks:read', 'tasks:write'],
    file: opts.file,
  }) as unknown as Request;

/** findOne(...).select(...).lean() resolves with the given task. */
const mockTask = (task: unknown) =>
  TaskMock.findOne.mockReturnValue({ select: () => ({ lean: async () => task }) });

describe('addComment', () => {
  it('rejects empty and over-long text', async () => {
    for (const text of ['   ', 'x'.repeat(2001), 42]) {
      const req = createRequest({ body: { text } });
      const res = createResponse();
      for (const v of validateComment) await v.run(req);
      await addComment(req, res);
      expect(res.statusCode).toBe(400);
    }
    expect(TaskMock.updateOne).not.toHaveBeenCalled();
  });

  it('stores the comment and answers with public author fields only', async () => {
    TaskMock.updateOne.mockResolvedValue({ matchedCount: 1 });
    const req = createRequest({ body: { text: '  Looks good  ' } });
    const res = createResponse();
    for (const v of validateComment) await v.run(req);
    await addComment(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.text).toBe('Looks good');
    expect(res.body.author).toEqual({ _id: authorId, name: 'Ann', avatarUrl: '' });
    expect(TaskMock.updateOne).toHaveBeenCalledWith(
      { _id: taskId.toString(), workspace: workspaceId },
      { $push: { comments: expect.objectContaining({ author: authorId, text: 'Looks good' }) } },
    );
  });

  it('returns 404 when the task is not in the workspace', async () => {
    TaskMock.updateOne.mockResolvedValue({ matchedCount: 0 });
    const req = createRequest({ body: { text: 'hi' } });
    const res = createResponse();
    for (const v of validateComment) await v.run(req);
    await addComment(req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe('deleteComment', () => {
  const commentId = new Types.ObjectId();
  const task = { _id: taskId, comments: [{ _id: commentId, author: authorId }] };
  const params = { commentId: commentId.toString() };

  it('lets the author delete their comment', async () => {
    mockTask(task);
    TaskMock.updateOne.mockResolvedValue({});
    const res = createResponse();
    await deleteComment(createRequest({ params }), res);
    expect(res.statusCode).toBe(200);
    expect(TaskMock.updateOne).toHaveBeenCalledWith({ _id: taskId }, { $pull: { comments: { _id: commentId } } });
  });

  it('forbids other members without settings:manage', async () => {
    mockTask(task);
    const res = createResponse();
    await deleteComment(createRequest({ params, userId: otherId }), res);
    expect(res.statusCode).toBe(403);
    expect(TaskMock.updateOne).not.toHaveBeenCalled();
  });

  it('lets a role with settings:manage delete any comment', async () => {
    mockTask(task);
    TaskMock.updateOne.mockResolvedValue({});
    const res = createResponse();
    await deleteComment(createRequest({ params, userId: otherId, permissions: ['tasks:write', 'settings:manage'] }), res);
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 for an unknown comment', async () => {
    mockTask(task);
    const res = createResponse();
    await deleteComment(createRequest({ params: { commentId: otherId.toString() } }), res);
    expect(res.statusCode).toBe(404);
  });
});

describe('uploadAttachment', () => {
  const file = (over: Partial<Express.Multer.File> = {}) => ({
    originalname: '../../report.pdf',
    mimetype: 'application/pdf',
    size: 4,
    buffer: Buffer.from('%PDF'),
    ...over,
  });

  it('requires a file', async () => {
    const res = createResponse();
    await uploadAttachment(createRequest(), res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects types outside the allow-list (svg, html)', async () => {
    for (const mimetype of ['image/svg+xml', 'text/html']) {
      const res = createResponse();
      await uploadAttachment(createRequest({ file: file({ mimetype }) }), res);
      expect(res.statusCode).toBe(400);
    }
    expect(saveFileMock).not.toHaveBeenCalled();
  });

  it('rejects the 21st attachment before storing anything', async () => {
    mockTask({ _id: taskId, attachments: Array.from({ length: 20 }, () => ({})) });
    const res = createResponse();
    await uploadAttachment(createRequest({ file: file() }), res);
    expect(res.statusCode).toBe(400);
    expect(saveFileMock).not.toHaveBeenCalled();
  });

  it('stores the file in GridFS with a sanitized name', async () => {
    const fileId = new Types.ObjectId();
    mockTask({ _id: taskId, attachments: [] });
    saveFileMock.mockResolvedValue(fileId);
    TaskMock.updateOne.mockResolvedValue({ matchedCount: 1 });
    const res = createResponse();
    await uploadAttachment(createRequest({ file: file() }), res);

    expect(res.statusCode).toBe(201);
    expect(saveFileMock).toHaveBeenCalledWith(expect.any(Buffer), 'report.pdf', 'application/pdf');
    expect(res.body).toMatchObject({ fileId, originalName: 'report.pdf', mimetype: 'application/pdf', uploadedBy: authorId });
  });

  it('removes the stored file when the limit is hit by a racing upload', async () => {
    const fileId = new Types.ObjectId();
    mockTask({ _id: taskId, attachments: [] });
    saveFileMock.mockResolvedValue(fileId);
    TaskMock.updateOne.mockResolvedValue({ matchedCount: 0 });
    const res = createResponse();
    await uploadAttachment(createRequest({ file: file() }), res);
    expect(res.statusCode).toBe(400);
    expect(deleteFilesMock).toHaveBeenCalledWith([fileId]);
  });
});

describe('uploadAttachmentFile middleware', () => {
  const multipart = (filename: string, mimetype: string, content: Buffer) => {
    const boundary = 'testboundary';
    const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`;
    const body = Buffer.concat([Buffer.from(head), content, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const req = new PassThrough() as unknown as Request & PassThrough;
    (req as unknown as { headers: Record<string, string> }).headers = {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    };
    req.end(body);
    return req;
  };

  const run = (req: Request) =>
    new Promise<{ res: TestResponse; next: jest.Mock }>(resolve => {
      const res = createResponse();
      const next: jest.Mock = jest.fn(() => resolve({ res, next }));
      (res.json as jest.Mock).mockImplementation((body: unknown) => { res.body = body; resolve({ res, next }); return res; });
      uploadAttachmentFile(req, res, next);
    });

  it('accepts an allowed file into memory', async () => {
    const req = multipart('a.png', 'image/png', Buffer.from('png-bytes'));
    const { next } = await run(req);
    expect(next).toHaveBeenCalled();
    expect(req.file?.buffer.toString()).toBe('png-bytes');
  });

  it('answers 400 for a disallowed type', async () => {
    const { res } = await run(multipart('a.svg', 'image/svg+xml', Buffer.from('<svg/>')));
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/type/i);
  });

  it('answers 400 for a file over the size limit', async () => {
    const { res } = await run(multipart('big.zip', 'application/zip', Buffer.alloc(MAX_ATTACHMENT_BYTES + 1024)));
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/too large/i);
  });
});

describe('sanitizeFilename', () => {
  it('strips paths, control and reserved characters', () => {
    expect(sanitizeFilename('..\\..\\evil/<b>name?.pdf')).toBe('bname.pdf');
    expect(sanitizeFilename('..hidden')).toBe('hidden');
    expect(sanitizeFilename('   ')).toBe('file');
    expect(sanitizeFilename('rapport é.pdf')).toBe('rapport é.pdf');
  });

  it('caps the length but keeps the extension', () => {
    const name = sanitizeFilename(`${'a'.repeat(300)}.xlsx`);
    expect(name).toHaveLength(100);
    expect(name.endsWith('.xlsx')).toBe(true);
  });
});

describe('deleteAttachment', () => {
  const attachmentId = new Types.ObjectId();
  const fileId = new Types.ObjectId();
  const task = { _id: taskId, attachments: [{ _id: attachmentId, fileId, uploadedBy: authorId }] };
  const params = { attachmentId: attachmentId.toString() };

  it('lets the uploader delete and removes the GridFS file', async () => {
    mockTask(task);
    TaskMock.updateOne.mockResolvedValue({});
    const res = createResponse();
    await deleteAttachment(createRequest({ params }), res);
    expect(res.statusCode).toBe(200);
    expect(deleteFilesMock).toHaveBeenCalledWith([fileId]);
  });

  it('forbids others without tasks:delete', async () => {
    mockTask(task);
    const res = createResponse();
    await deleteAttachment(createRequest({ params, userId: otherId }), res);
    expect(res.statusCode).toBe(403);
    expect(deleteFilesMock).not.toHaveBeenCalled();
  });

  it('lets a role with tasks:delete remove any attachment', async () => {
    mockTask(task);
    TaskMock.updateOne.mockResolvedValue({});
    const res = createResponse();
    await deleteAttachment(createRequest({ params, userId: otherId, permissions: ['tasks:write', 'tasks:delete'] }), res);
    expect(res.statusCode).toBe(200);
  });
});

describe('downloadAttachment', () => {
  const attachmentId = new Types.ObjectId();
  const fileId = new Types.ObjectId();
  const stored = {
    _id: attachmentId, fileId, originalName: "ré'sumé (1).pdf", mimetype: 'application/pdf', size: 4, uploadedBy: authorId,
  };
  const params = { attachmentId: attachmentId.toString() };

  it('streams with download-only, nosniff headers and the stored mimetype', async () => {
    mockTask({ _id: taskId, attachments: [stored] });
    const stream = new PassThrough();
    openFileStreamMock.mockReturnValue(stream);
    const res = createStreamResponse();
    await downloadAttachment(createRequest({ params }), res);
    stream.end('%PDF');

    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['Content-Disposition']).toBe("attachment; filename*=UTF-8''r%C3%A9%27sum%C3%A9%20%281%29.pdf");
  });

  it('serves unknown stored types as opaque bytes', async () => {
    mockTask({ _id: taskId, attachments: [{ ...stored, mimetype: 'text/html' }] });
    openFileStreamMock.mockReturnValue(new PassThrough());
    const res = createStreamResponse();
    await downloadAttachment(createRequest({ params }), res);
    expect(res.headers['Content-Type']).toBe('application/octet-stream');
  });

  it('returns 404 for an unknown attachment', async () => {
    mockTask({ _id: taskId, attachments: [stored] });
    const res = createResponse();
    await downloadAttachment(createRequest({ params: { attachmentId: otherId.toString() } }), res);
    expect(res.statusCode).toBe(404);
  });
});
