const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const tsc = 'services/api/node_modules/typescript/lib/tsc.js';
const checks = [
  { id: 'api-tsc', args: [tsc, '--noEmit', '-p', 'services/api/tsconfig.json'] },
  { id: 'api-tsc-test', args: [tsc, '-p', 'services/api/tsconfig.test.json'] },
];
const results = checks.map(check => {
  const result = spawnSync(process.execPath, check.args, { cwd: root, encoding: 'utf8' });
  return { id: check.id, status: result.status === 0 ? 'pass' : 'fail', exitCode: result.status, stderr: (result.stderr || '').slice(-4000) };
});
const report = { generatedAt: new Date().toISOString(), ok: results.every(r => r.status === 'pass'), results };
fs.mkdirSync(path.join(root, '.sdrive', 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, '.sdrive', 'reports', 'api-tsc-verification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
