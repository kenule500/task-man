import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { consumeUpload, removeUpload, uploadDir } from '../utils/ai/plan/upload.js';

const writeUpload = async (name: string, contents = 'brief'): Promise<string> => {
  const path = join(await uploadDir(), name);
  await writeFile(path, contents);
  return path;
};

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
});
