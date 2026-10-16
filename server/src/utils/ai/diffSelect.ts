import type { DiffSelection, PrFile, SelectedFile } from './types.js';

// Chooses which parts of a pull request go to the model. The budget is a number of characters of diff;
// whatever does not fit is reported (omittedFiles + truncated), never dropped silently.

/** Smallest slice of a long diff still worth sending. */
const MIN_PARTIAL_CHARS = 2000;
/** One file never takes more than this share of the budget, so a single huge diff cannot hide the rest. */
const MAX_FILE_SHARE = 0.4;
export const PARTIAL_SUFFIX = ' (partly shown)';

const LOCKFILES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb', 'composer.lock',
  'gemfile.lock', 'cargo.lock', 'poetry.lock', 'pipfile.lock', 'go.sum', 'packages.lock.json', 'pubspec.lock', 'podfile.lock',
]);
const GENERATED = /(^|\/)(dist|build|out|coverage|\.next|\.nuxt|__snapshots__|generated)\/|\.min\.(js|css)$|\.map$|\.snap$|\.pb\.go$|_pb2?\.py$|\.generated\./i;
const VENDORED = /(^|\/)(node_modules|vendor|third_party|third-party|bower_components|Pods)\//i;
const TESTS = /(^|\/)(__tests__|__integration__|tests?|spec|e2e|cypress)\/|\.(test|spec)\.[a-z0-9]+$/i;
const DOCS_AND_CONFIG = /\.(md|mdx|txt|rst|json|ya?ml|toml|ini|cfg|conf|env\.example|lock|svg|csv)$|(^|\/)(\.github|\.vscode|docs?)\/|(^|\/)(dockerfile|makefile|license|\.gitignore|\.eslintrc[^/]*|\.prettierrc[^/]*)$/i;

/** Lower comes first: source code, then tests, then docs and configuration, then lockfiles, generated and vendored files. */
export const fileRank = (filename: string): number => {
  const base = filename.split('/').pop()?.toLowerCase() ?? '';
  if (LOCKFILES.has(base) || GENERATED.test(filename) || VENDORED.test(filename)) return 3;
  if (TESTS.test(filename)) return 1;
  if (DOCS_AND_CONFIG.test(filename)) return 2;
  return 0;
};

/** Cuts a diff at a line boundary within `limit` characters. */
const cutAtLine = (patch: string, limit: number): string => {
  if (patch.length <= limit) return patch;
  const slice = patch.slice(0, limit);
  const lastBreak = slice.lastIndexOf('\n');
  return lastBreak > limit * 0.5 ? slice.slice(0, lastBreak) : slice;
};

const sizeOf = (file: PrFile): number => (file.patch ?? '').length;

export const selectDiff = (files: PrFile[], maxChars: number): DiffSelection => {
  const withoutDiff = files.filter(file => !file.patch).map(file => file.filename);

  // Source before tests before docs before lockfiles; within a group the smaller diffs first, so more files fit
  const ordered = files
    .map((file, index) => ({ file, index }))
    .filter(({ file }) => file.patch)
    .sort((a, b) => fileRank(a.file.filename) - fileRank(b.file.filename) || sizeOf(a.file) - sizeOf(b.file) || a.index - b.index);

  const perFileCap = Math.max(MIN_PARTIAL_CHARS, Math.floor(maxChars * MAX_FILE_SHARE));
  const included: SelectedFile[] = [];
  const omittedFiles: string[] = [];
  let used = 0;

  for (const { file } of ordered) {
    const patch = file.patch ?? '';
    const remaining = maxChars - used;
    const limit = Math.min(remaining, perFileCap);
    if (patch.length <= limit) {
      included.push({ filename: file.filename, status: file.status, additions: file.additions, deletions: file.deletions, patch, partial: false });
      used += patch.length;
    } else if (limit >= MIN_PARTIAL_CHARS) {
      const cut = cutAtLine(patch, limit);
      included.push({ filename: file.filename, status: file.status, additions: file.additions, deletions: file.deletions, patch: cut, partial: true });
      omittedFiles.push(`${file.filename}${PARTIAL_SUFFIX}`);
      used += cut.length;
    } else {
      omittedFiles.push(file.filename);
    }
  }

  return { included, withoutDiff, omittedFiles, truncated: omittedFiles.length > 0, totalChars: used };
};
