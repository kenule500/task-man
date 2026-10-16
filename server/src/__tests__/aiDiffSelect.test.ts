import { fileRank, selectDiff } from '../utils/ai/diffSelect.js';
import type { PrFile } from '../utils/ai/types.js';

const file = (filename: string, patchLength: number | null, status = 'modified'): PrFile => ({
  filename,
  status,
  additions: 1,
  deletions: 0,
  patch: patchLength === null ? undefined : 'x'.repeat(patchLength),
});

describe('fileRank', () => {
  it('puts source before tests, docs/config and lockfiles or generated files', () => {
    expect(fileRank('src/app.ts')).toBe(0);
    expect(fileRank('src/app.test.ts')).toBe(1);
    expect(fileRank('server/src/__tests__/a.ts')).toBe(1);
    expect(fileRank('README.md')).toBe(2);
    expect(fileRank('package.json')).toBe(2);
    expect(fileRank('pnpm-lock.yaml')).toBe(3);
    expect(fileRank('web/package-lock.json')).toBe(3);
    expect(fileRank('dist/bundle.js')).toBe(3);
    expect(fileRank('public/app.min.js')).toBe(3);
    expect(fileRank('node_modules/x/index.js')).toBe(3);
    expect(fileRank('vendor/lib/a.go')).toBe(3);
  });
});

describe('selectDiff', () => {
  it('includes everything and does not flag truncation when it all fits', () => {
    const selection = selectDiff([file('a.ts', 100), file('b.ts', 200)], 10_000);
    expect(selection.included.map(item => item.filename)).toEqual(['a.ts', 'b.ts']);
    expect(selection.truncated).toBe(false);
    expect(selection.omittedFiles).toEqual([]);
    expect(selection.totalChars).toBe(300);
  });

  it('keeps source files and drops lockfiles first when the budget runs out', () => {
    const files = [file('pnpm-lock.yaml', 3000), file('src/a.ts', 3000), file('src/b.ts', 3000)];
    const selection = selectDiff(files, 7500);
    expect(selection.included.map(item => item.filename)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(selection.omittedFiles).toEqual(['pnpm-lock.yaml']);
    expect(selection.truncated).toBe(true);
  });

  it('cuts one very long diff at a line boundary and lists it as partly shown', () => {
    const patch = Array.from({ length: 400 }, (_, index) => `+line ${index}`).join('\n');
    const selection = selectDiff([{ ...file('big.ts', null), patch }], 4000);
    expect(selection.included).toHaveLength(1);
    expect(selection.included[0].partial).toBe(true);
    expect(selection.included[0].patch.length).toBeLessThanOrEqual(4000);
    expect(patch.startsWith(selection.included[0].patch)).toBe(true);
    expect(selection.omittedFiles).toEqual(['big.ts (partly shown)']);
    expect(selection.truncated).toBe(true);
  });

  it('never lets one file use the whole budget', () => {
    const selection = selectDiff([file('huge.ts', 100_000), file('small.ts', 500)], 10_000);
    expect(selection.included.map(item => item.filename)).toEqual(['small.ts', 'huge.ts']);
    expect(selection.included[1].patch.length).toBeLessThanOrEqual(4000);
  });

  it('names files without a textual diff instead of sending them', () => {
    const selection = selectDiff([file('logo.png', null, 'added'), file('a.ts', 10)], 1000);
    expect(selection.withoutDiff).toEqual(['logo.png']);
    expect(selection.included.map(item => item.filename)).toEqual(['a.ts']);
    expect(selection.truncated).toBe(false);
  });

  it('omits a file whole when too little budget is left for a useful slice', () => {
    const selection = selectDiff([file('a.ts', 3000), file('b.ts', 3000), file('c.ts', 3100)], 7900);
    expect(selection.included.map(item => item.filename)).toEqual(['a.ts', 'b.ts']);
    expect(selection.omittedFiles).toEqual(['c.ts']);
  });

  it('stays within the budget and accounts for every file', () => {
    const files = Array.from({ length: 30 }, (_, index) => file(`src/f${index}.ts`, 1500 + index * 37));
    const selection = selectDiff(files, 20_000);
    expect(selection.totalChars).toBeLessThanOrEqual(20_000);
    expect(selection.included.length + selection.omittedFiles.length).toBe(30);
  });
});
