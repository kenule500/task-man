const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const service = path.join(root, 'services', 'document-analyzer');
const checks = [
  { id: 'python-compile', command: 'python', args: ['-m', 'compileall', '-q', 'app'] },
  { id: 'python-ruff', command: 'uvx', args: ['ruff', 'check', '.'] },
  {
    id: 'python-golden',
    command: 'uv',
    args: ['run', '--no-project', '--with', 'pydantic', 'python', '-c',
      'import json; from app.contracts import PlanContract; PlanContract.model_validate(json.load(open("../../packages/contracts/fixtures/plan.golden.json"))); print("golden plan valid")'],
  },
  {
    id: 'python-app-import',
    command: 'uv',
    args: ['run', '--no-project', '--with', 'fastapi', '--with', 'pydantic', '--with', 'uvicorn', 'python', '-c',
      'from app.main import create_app; create_app(); print("app imports")'],
  },
];

const results = [];
for (const check of checks) {
  const started = Date.now();
  const result = spawnSync(check.command, check.args, {
    cwd: service,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, CI: 'true' },
  });
  results.push({
    id: check.id,
    status: result.status === 0 ? 'pass' : 'fail',
    exitCode: result.status,
    durationMs: Date.now() - started,
    stdout: (result.stdout || '').slice(-4000),
    stderr: (result.stderr || '').slice(-4000),
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
fs.writeFileSync(path.join(root, '.sdrive', 'reports', 'python-verification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(results.map(r => ({ id: r.id, status: r.status, exitCode: r.exitCode, durationMs: r.durationMs })), null, 2));
