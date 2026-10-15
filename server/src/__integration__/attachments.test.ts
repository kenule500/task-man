import crypto from 'crypto';
import mongoose from 'mongoose';
import { MAX_ATTACHMENT_BYTES } from '../middleware/uploadMiddleware.js';
import {
  bearer, createTask, createTeam, http, startApp, stopApp, tasksUrl, unknownId, registerUser, type TestUser,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

let team: Awaited<ReturnType<typeof createTeam>>;
let slug: string;
let outsider: TestUser;
let taskId: string;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  outsider = await registerUser('Attachment Outsider');
  taskId = (await createTask(team.owner, slug, { title: 'With files' }))._id;
});

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (size = 2048) => Buffer.concat([PNG_HEADER, crypto.randomBytes(size)]);
const pdf = () => Buffer.concat([Buffer.from('%PDF-1.4\n'), crypto.randomBytes(512), Buffer.from('\n%%EOF')]);

const attachmentsUrl = (id = taskId) => `${tasksUrl(slug)}/${id}/attachments`;
const upload = (
  user: TestUser,
  file: Buffer | null,
  options: { filename?: string; contentType?: string; field?: string; taskId?: string } = {},
) => {
  const req = http().post(attachmentsUrl(options.taskId)).set(bearer(user.token));
  if (file) {
    req.attach(options.field ?? 'file', file, {
      filename: options.filename ?? 'picture.png',
      contentType: options.contentType ?? 'image/png',
    });
  }
  return req;
};
const download = (user: TestUser | null, attachmentId: string, id = taskId) => {
  const req = http()
    .get(`${attachmentsUrl(id)}/${attachmentId}`)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
  return user ? req.set(bearer(user.token)) : req;
};
const remove = (user: TestUser, attachmentId: string, id = taskId) =>
  http().delete(`${attachmentsUrl(id)}/${attachmentId}`).set(bearer(user.token));

const storedFiles = (ids: string[]) =>
  mongoose.connection.collection('attachments.files').countDocuments({ _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } });
const allStoredFiles = () => mongoose.connection.collection('attachments.files').countDocuments({});

describe('attachments: upload', () => {
  it('stores a png and a pdf and lists them on the task', async () => {
    const image = png();
    const imageRes = await upload(team.developer, image, { filename: 'screenshot.png' });
    expect(imageRes.status).toBe(201);
    expect(imageRes.body).toMatchObject({
      originalName: 'screenshot.png', mimetype: 'image/png', size: image.length, uploadedBy: team.developer.id,
    });
    expect(await storedFiles([imageRes.body.fileId])).toBe(1);

    const pdfRes = await upload(team.owner, pdf(), { filename: 'spec.pdf', contentType: 'application/pdf' });
    expect(pdfRes.status).toBe(201);

    const tasks = await http().get(tasksUrl(slug)).set(bearer(team.owner.token));
    const task = tasks.body.find((t: { _id: string }) => t._id === taskId);
    expect(task.attachments.map((a: { originalName: string }) => a.originalName)).toEqual(['screenshot.png', 'spec.pdf']);
  });

  it('rejects svg, html, executables and untyped uploads', async () => {
    const before = await allStoredFiles();
    const svg = await upload(team.developer, Buffer.from('<svg onload="alert(1)"/>'), { filename: 'x.svg', contentType: 'image/svg+xml' });
    const html = await upload(team.developer, Buffer.from('<script>alert(1)</script>'), { filename: 'x.html', contentType: 'text/html' });
    const exe = await upload(team.developer, Buffer.from('MZ'), { filename: 'x.exe', contentType: 'application/x-msdownload' });
    const octet = await upload(team.developer, Buffer.from('bytes'), { filename: 'x.bin', contentType: 'application/octet-stream' });
    for (const res of [svg, html, exe, octet]) {
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/type|unsupported/i);
    }
    expect(await allStoredFiles()).toBe(before);
  });

  it('rejects a missing file, a wrong field name and more than one file', async () => {
    expect((await upload(team.developer, null)).status).toBe(400);
    expect((await upload(team.developer, png(), { field: 'attachment' })).status).toBe(400);
    const two = await http()
      .post(attachmentsUrl())
      .set(bearer(team.developer.token))
      .attach('file', png(), { filename: 'a.png', contentType: 'image/png' })
      .attach('file', png(), { filename: 'b.png', contentType: 'image/png' });
    expect(two.status).toBe(400);
  });

  it('rejects files over the size limit and accepts exactly the limit', async () => {
    const before = await allStoredFiles();
    const tooBig = await upload(team.developer, Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 1));
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.message).toMatch(/too large/i);
    expect(await allStoredFiles()).toBe(before);

    const exact = await upload(team.developer, Buffer.alloc(MAX_ATTACHMENT_BYTES, 1));
    expect(exact.status).toBe(201);
    expect((await remove(team.developer, exact.body._id)).status).toBe(200);
  });

  it('sanitizes the stored file name', async () => {
    const traversal = await upload(team.developer, png(), { filename: '../../etc/<evil>"name".png' });
    expect(traversal.status).toBe(201);
    expect(traversal.body.originalName).not.toMatch(/[\/<>"]/);
    expect(traversal.body.originalName.endsWith('.png')).toBe(true);

    const long = await upload(team.developer, png(), { filename: `${'n'.repeat(300)}.png` });
    expect(long.body.originalName.length).toBeLessThanOrEqual(100);
    expect(long.body.originalName.endsWith('.png')).toBe(true);

    const hidden = await upload(team.developer, png(), { filename: '...dotfile.png' });
    expect(hidden.body.originalName.startsWith('.')).toBe(false);
  });

  it('requires tasks:write and membership', async () => {
    const before = await allStoredFiles();
    expect((await upload(team.viewer, png())).status).toBe(403);
    expect((await upload(outsider, png())).status).toBe(403);
    expect((await http().post(attachmentsUrl()).attach('file', png(), { filename: 'a.png', contentType: 'image/png' })).status).toBe(401);
    expect(await allStoredFiles()).toBe(before);
  });

  it('404s unknown and malformed tasks without leaving an orphaned file', async () => {
    const before = await allStoredFiles();
    expect((await upload(team.developer, png(), { taskId: unknownId() })).status).toBe(404);
    expect((await upload(team.developer, png(), { taskId: 'not-an-id' })).status).toBe(404);
    expect(await allStoredFiles()).toBe(before);
  });

  it('caps a task at 20 attachments and leaves no orphaned file for the rejected one', async () => {
    const task = await createTask(team.owner, slug, { title: 'Crowded' });
    for (let i = 0; i < 20; i++) {
      const res = await upload(team.developer, png(64), { taskId: task._id, filename: `f${i}.png` });
      expect(res.status).toBe(201);
    }
    const before = await allStoredFiles();
    const extra = await upload(team.developer, png(64), { taskId: task._id, filename: 'overflow.png' });
    expect(extra.status).toBe(400);
    expect(extra.body.message).toMatch(/at most 20/);
    expect(await allStoredFiles()).toBe(before);
  });
});

describe('attachments: download', () => {
  let attachment: { _id: string; fileId: string };
  let bytes: Buffer;

  beforeAll(async () => {
    bytes = png(4096);
    const res = await upload(team.developer, bytes, { filename: 'report (v1).png' });
    expect(res.status).toBe(201);
    attachment = res.body;
  });

  it('returns exactly the uploaded bytes as an attachment with nosniff', async () => {
    const res = await download(team.developer, attachment._id);
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body as Buffer, bytes)).toBe(0);
    expect(res.headers['content-type']).toMatch(/^image\/png/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename\*=UTF-8''/);
    expect(res.headers['content-disposition']).toContain('%28v1%29');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Number(res.headers['content-length'])).toBe(bytes.length);
    expect(res.headers['cache-control']).toMatch(/private/);
  });

  // multer/busboy decode the multipart filename as latin1 by default (no defParamCharset: 'utf8'),
  // so UTF-8 names sent by browsers are stored as mojibake ("rÃ©sumÃ©").
  it('keeps non-ASCII file names intact', async () => {
    const created = await upload(team.developer, png(), { filename: 'résumé 文档.png' });
    expect(created.status).toBe(201);
    expect(created.body.originalName).toBe('résumé 文档.png');
    const res = await download(team.developer, created.body._id);
    expect(res.headers['content-disposition']).toContain(encodeURIComponent('résumé 文档.png'));
  });

  it('serves a pdf with its own content type', async () => {
    const original = pdf();
    const created = await upload(team.owner, original, { filename: 'spec.pdf', contentType: 'application/pdf' });
    const res = await download(team.owner, created.body._id);
    expect(res.headers['content-type']).toMatch(/^application\/pdf/);
    expect(Buffer.compare(res.body as Buffer, original)).toBe(0);
  });

  it('lets a Viewer download but nobody outside the workspace', async () => {
    const viewer = await download(team.viewer, attachment._id);
    expect(viewer.status).toBe(200);
    expect(Buffer.compare(viewer.body as Buffer, bytes)).toBe(0);
    expect((await download(outsider, attachment._id)).status).toBe(403);
    expect((await download(null, attachment._id)).status).toBe(401);
  });

  it('404s unknown attachments, malformed ids and a mismatching task', async () => {
    expect((await download(team.owner, unknownId())).status).toBe(404);
    expect((await download(team.owner, 'not-an-id')).status).toBe(404);
    const other = await createTask(team.owner, slug, { title: 'Different task' });
    expect((await download(team.owner, attachment._id, other._id)).status).toBe(404);
  });

  it('answers 404 JSON when the stored file has gone missing', async () => {
    const created = await upload(team.developer, png(), { filename: 'ghost.png' });
    await mongoose.connection.collection('attachments.files').deleteOne({ _id: new mongoose.Types.ObjectId(created.body.fileId) });
    const res = await http().get(`${attachmentsUrl()}/${created.body._id}`).set(bearer(team.owner.token));
    expect(res.status).toBe(404);
  });
});

describe('attachments: delete', () => {
  it('lets the uploader delete theirs, removing the file from GridFS', async () => {
    const created = await upload(team.developer, png(), { filename: 'mine.png' });
    expect(await storedFiles([created.body.fileId])).toBe(1);
    const res = await remove(team.developer, created.body._id);
    expect(res.status).toBe(200);
    expect(await storedFiles([created.body.fileId])).toBe(0);
    expect((await download(team.owner, created.body._id)).status).toBe(404);
    expect((await remove(team.developer, created.body._id)).status).toBe(404);
  });

  it('blocks other members without tasks:delete and keeps the file', async () => {
    const created = await upload(team.owner, png(), { filename: 'owners.png' });
    const res = await remove(team.developer, created.body._id);
    expect(res.status).toBe(403);
    expect(await storedFiles([created.body.fileId])).toBe(1);
    expect((await remove(team.viewer, created.body._id)).status).toBe(403);
    expect((await remove(outsider, created.body._id)).status).toBe(403);
  });

  it('lets tasks:delete holders remove anyone\'s attachment', async () => {
    const created = await upload(team.developer, png(), { filename: 'cleanup.png' });
    expect((await remove(team.productOwner, created.body._id)).status).toBe(200);
    expect(await storedFiles([created.body.fileId])).toBe(0);
  });

  it('404s unknown attachments and tasks', async () => {
    expect((await remove(team.owner, unknownId())).status).toBe(404);
    expect((await remove(team.owner, unknownId(), unknownId())).status).toBe(404);
    expect((await remove(team.owner, unknownId(), 'not-an-id')).status).toBe(404);
  });

  it('removes every stored file when the task is deleted', async () => {
    const task = await createTask(team.owner, slug, { title: 'Short lived' });
    const first = await upload(team.developer, png(), { taskId: task._id, filename: 'one.png' });
    const second = await upload(team.owner, pdf(), { taskId: task._id, filename: 'two.pdf', contentType: 'application/pdf' });
    const fileIds = [first.body.fileId, second.body.fileId];
    expect(await storedFiles(fileIds)).toBe(2);

    const res = await http().delete(`${tasksUrl(slug)}/${task._id}`).set(bearer(team.productOwner.token));
    expect(res.status).toBe(200);
    expect(await storedFiles(fileIds)).toBe(0);
    expect((await download(team.owner, first.body._id, task._id)).status).toBe(404);
  });
});
