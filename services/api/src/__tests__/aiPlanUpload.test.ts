import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { consumeUpload, removeUpload, uploadDir } from '../utils/ai/plan/upload.js';

// Each run gets its own random directory inside the upload dir; a predictable name in the shared
// temp dir is what CodeQL calls an insecure temporary file.
const writeUpload = async (name: string, contents = 'brief'): Promise<string> => {
  const dir = await mkdtemp(join(await uploadDir(), 'test-'));
  const path = join(dir, name);
  await writeFile(path, contents);
  return path;
};

afterAll(async () => {
  await rm(await uploadDir(), { recursive: true, force: true }).catch(() => undefined);
});

describe('temporary plan uploads', () => {
  it('gives the caller the bytes and deletes the file afterwards', async () => {
    const path = await writeUpload('consume.upload');
    const seen = await consumeUpload(path, async buffer => buffer.toString('utf8'));
    expect(seen).toBe('brief');
    expect(existsSync(path)).toBe(false);
  });

  it('deletes the file even when extraction throws', async () => {
    const path = await writeUpload('failing.upload');
    await expect(consumeUpload(path, async () => {
      throw new Error('extraction failed');
    })).rejects.toThrow('extraction failed');
    expect(existsSync(path)).toBe(false);
  });

  it('removes a file that is already gone without throwing', async () => {
    const path = await writeUpload('absent.upload');
    await readFile(path);
    await removeUpload(path);
    await expect(removeUpload(path)).resolves.toBeUndefined();
  });

  it('refuses to read or delete a file outside the upload directory', async () => {
    const outside = join(await uploadDir(), '..', 'not-ours.txt');
    await expect(consumeUpload(outside, async () => 'unreachable')).rejects.toThrow('outside the plan upload directory');
    await expect(removeUpload(outside)).resolves.toBeUndefined();
  });
});
