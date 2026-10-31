// Starts the API, the web app and the analyzer, probes their health endpoints, then stops them.
// Logs and the report are written under .sdrive/reports/. No test suite is run.
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const outDir = path.join(root, '.sdrive', 'reports');
fs.mkdirSync(outDir, { recursive: true });

const services = [
  {
    id: 'api',
    cwd: path.join(root, 'services', 'api'),
    command: process.execPath,
    args: ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'],
    url: 'http://127.0.0.1:5000/api/health',
    expect: body => body.includes('"status":"OK"') || body.includes('"status": "OK"'),
  },
  {
    id: 'client',
    cwd: path.join(root, 'client'),
    command: process.execPath,
    args: ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173'],
    url: 'http://127.0.0.1:5173/',
    expect: body => body.toLowerCase().includes('<div id="root"') || body.toLowerCase().includes('taskman'),
  },
  {
    id: 'analyzer',
    cwd: path.join(root, 'services', 'document-analyzer'),
    command: 'uv',
    args: ['run', '--no-project', '--with', 'fastapi', '--with', 'pydantic', '--with', 'uvicorn',
      'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'],
    url: 'http://127.0.0.1:8000/healthz',
    expect: body => body.includes('"status":"ok"'),
  },
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const probe = async url => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const body = await response.text();
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: null, body: '', error: error.name };
  }
};

const stop = child => {
  if (!child || child.killed) return;
  spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
};

const run = async () => {
  const started = [];
  const results = [];

  for (const service of services) {
    const existing = await probe(service.url);
    if (existing.ok) {
      results.push({ id: service.id, status: 'already-running', httpStatus: existing.status, url: service.url });
      continue;
    }

    const logPath = path.join(outDir, `run-${service.id}.log`);
    const log = fs.createWriteStream(logPath, { flags: 'w' });
    log.write(`$ ${service.command} ${service.args.join(' ')}\n`);
    const child = spawn(service.command, service.args, {
      cwd: service.cwd,
      env: { ...process.env, CI: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(log);
    child.stderr.pipe(log);
    started.push({ id: service.id, child, log, logPath });
  }

  const deadline = Date.now() + 120_000;
  const pending = new Map(services.map(service => [service.id, service]));
  const done = new Map(results.map(result => [result.id, result]));

  while (pending.size > 0 && Date.now() < deadline) {
    for (const [id, service] of [...pending]) {
      const result = await probe(service.url);
      if (result.ok && service.expect(result.body)) {
        done.set(id, { id, status: 'healthy', httpStatus: result.status, url: service.url });
        pending.delete(id);
      }
    }
    if (pending.size > 0) await sleep(2000);
  }

  for (const [id, service] of pending) {
    const result = await probe(service.url);
    done.set(id, {
      id,
      status: 'unhealthy',
      httpStatus: result.status,
      url: service.url,
      error: result.error || `unexpected body: ${result.body.slice(0, 200)}`,
    });
  }

  for (const { id, child, log, logPath } of started) {
    stop(child);
    log.end();
    const entry = done.get(id);
    if (entry) {
      entry.log = path.relative(root, logPath);
      try {
        entry.logTail = fs.readFileSync(logPath, 'utf8').slice(-2500);
      } catch {
        entry.logTail = '';
      }
    }
  }

  const report = {
    ranAt: new Date().toISOString(),
    ok: done.size === services.length && [...done.values()].every(r => r.status !== 'unhealthy'),
    results: [...done.values()],
  };
  fs.writeFileSync(path.join(outDir, 'run-apps.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
};

run().catch(error => {
  fs.writeFileSync(path.join(outDir, 'run-apps-error.txt'), String(error && error.stack || error));
  process.exitCode = 1;
});
