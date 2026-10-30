// Build-level verification after the services/api move. No test suite is run.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const node = process.execPath;
const checks = [
  { id: 'root-tsc', args: ['services/api/node_modules/typescript/lib/tsc.js', '--noEmit', '-p', 'tsconfig.json'] },
  { id: 'server-build', args: ['services/api/node_modules/typescript/lib/tsc.js', '-p', 'services/api/tsconfig.json'] },
  {
    id: 'client-build',
    args: ['node_modules/vite/bin/vite.js', 'build'],
    cwd: path.join(root, 'client'),
    nodeOptions: '--max-old-space-size=3072',
  },
  { id: 'governance', args: ['.sdrive/scripts/validate-governance.js'] },
];

const results = [];
for (const check of checks) {
  const started = Date.now();
  const result = spawnSync(node, check.args, {
    cwd: check.cwd || root,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true', ...(check.nodeOptions ? { NODE_OPTIONS: check.nodeOptions } : {}) },
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
  feature: 'refactor-services-layout',
  generatedAt: new Date().toISOString(),
  ok: results.every(r => r.status === 'pass'),
  results,
};
fs.mkdirSync(path.join(root, '.sdrive', 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, '.sdrive', 'reports', 'build-verification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(results.map(r => ({ id: r.id, status: r.status, exitCode: r.exitCode, durationMs: r.durationMs })), null, 2));
