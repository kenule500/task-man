// Direct typecheck/lint harness: invokes the installed binaries, so pnpm does not try to
// reinstall node_modules. Writes a structured report under .sdrive/reports/.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const node = process.execPath;
const checks = [
  { id: 'server-tsc', args: ['server/node_modules/typescript/bin/tsc', '--noEmit', '-p', 'server/tsconfig.json'] },
  { id: 'server-tsc-test', args: ['server/node_modules/typescript/bin/tsc', '-p', 'server/tsconfig.test.json'] },
  { id: 'client-tsc', args: ['client/node_modules/typescript/bin/tsc', '-b', 'client/tsconfig.json'] },
  { id: 'client-tsc-test', args: ['client/node_modules/typescript/bin/tsc', '-p', 'client/tsconfig.test.json'] },
  { id: 'client-eslint', args: ['client/node_modules/eslint/bin/eslint.js', '.'], cwd: path.join(root, 'client') },
];

const results = [];
for (const check of checks) {
  const started = Date.now();
  const result = spawnSync(node, check.args, {
    cwd: check.cwd || root,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
  });
  results.push({
    id: check.id,
    status: result.status === 0 ? 'pass' : 'fail',
    exitCode: result.status,
    durationMs: Date.now() - started,
    stdout: (result.stdout || '').slice(-6000),
    stderr: (result.stderr || '').slice(-6000),
  });
}

const report = {
  feature: 'upload-document',
  version: 'v2',
  generatedAt: new Date().toISOString(),
  ok: results.every(r => r.status === 'pass'),
  results,
};
fs.mkdirSync(path.join(root, '.sdrive', 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, '.sdrive', 'reports', 'typecheck-verification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(results.map(r => ({ id: r.id, status: r.status, exitCode: r.exitCode, durationMs: r.durationMs })), null, 2));
