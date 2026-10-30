// Runs the allowed verification commands (typecheck, lint, build, Python syntax/import,
// contract fixture, governance) and writes a structured report under .sdrive/reports/.
// It never runs a test suite.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const checks = [
  { id: 'server-typecheck', command: 'pnpm', args: ['--filter', 'server', 'typecheck'], cwd: root },
  { id: 'client-typecheck', command: 'pnpm', args: ['--filter', 'client', 'typecheck'], cwd: root },
  { id: 'client-lint', command: 'pnpm', args: ['--filter', 'client', 'lint'], cwd: root },
  { id: 'client-build', command: 'pnpm', args: ['--filter', 'client', 'build'], cwd: root, nodeOptions: '--max-old-space-size=3072' },
  { id: 'python-compile', command: 'python', args: ['-m', 'compileall', '-q', 'app'], cwd: path.join(root, 'services', 'document-analyzer'), shell: false },
  {
    id: 'python-import-contracts',
    command: 'uv',
    args: ['run', '--no-project', '--with', 'pydantic', 'python', '-c',
      'import json; from app.contracts import PlanContract; PlanContract.model_validate(json.load(open("../../contracts/fixtures/plan.golden.json"))); print("golden plan valid")'],
    cwd: path.join(root, 'services', 'document-analyzer'),
    shell: false,
  },
  {
    id: 'python-import-app',
    command: 'uv',
    args: ['run', '--no-project', '--with', 'fastapi', '--with', 'pydantic', '--with', 'uvicorn', 'python', '-c',
      'from app.main import create_app; create_app(); print("app imports")'],
    cwd: path.join(root, 'services', 'document-analyzer'),
    shell: false,
  },
  {
    id: 'python-ruff',
    command: 'uvx',
    args: ['ruff', 'check', '.'],
    cwd: path.join(root, 'services', 'document-analyzer'),
    shell: false,
  },
  { id: 'governance', command: 'node', args: ['.sdrive/scripts/validate-governance.js'], cwd: root },
];

const results = [];
for (const check of checks) {
  const started = Date.now();
  const result = spawnSync(check.command, check.args, {
    cwd: check.cwd,
    shell: check.shell !== false,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true', ...(check.nodeOptions ? { NODE_OPTIONS: check.nodeOptions } : {}) },
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
const outDir = path.join(root, '.sdrive', 'reports');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'implementation-verification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, results: results.map(r => ({ id: r.id, status: r.status, exitCode: r.exitCode, durationMs: r.durationMs })) }, null, 2));
