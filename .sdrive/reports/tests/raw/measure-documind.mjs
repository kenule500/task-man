// T7.5 measurement: send each document to the real analyzer and record latency and provider calls.
//
//   node .sdrive/reports/tests/raw/measure-documind.mjs \
//     --docs .sdrive/reports/tests/raw/t75-docs \
//     --log .sdrive/reports/tests/raw/analyzer-600.log \
//     --out .sdrive/reports/tests/raw/t75-measurements.json
//
// The analyzer logs one `analyze_ok` / `analyze_failed` line per request with providerCalls and
// latencyMs, so the figures come from the service itself rather than from the client clock.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const docsDir = arg('docs', '.sdrive/reports/tests/raw/t75-docs');
const logPath = arg('log', '.sdrive/reports/tests/raw/analyzer-600.log');
const outPath = arg('out', '.sdrive/reports/tests/raw/t75-measurements.json');
const url = arg('url', 'http://127.0.0.1:8001/v1/plans:analyze');
const only = arg('only', '');

const index = JSON.parse(fs.readFileSync(path.join(docsDir, 'index.json'), 'utf8'));
const selected = only ? index.filter((entry) => only.split(',').includes(path.basename(entry.file))) : index;

// The redirect wrapping the service output breaks long JSON lines, so flatten before searching.
const readEvent = (requestId) => {
  if (!fs.existsSync(logPath)) return null;
  const flat = fs.readFileSync(logPath, 'utf8').replace(/\r?\n/g, '');
  const match = flat.match(new RegExp(`\\{"event":"analyze_(?:ok|failed)","requestId":"${requestId}"[^}]*\\}`));
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
};

const results = [];
for (const entry of selected) {
  const text = fs.readFileSync(path.join(docsDir, path.basename(entry.file)), 'utf8');
  const requestId = `t75-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const body = {
    contractVersion: 1,
    requestId,
    document: { fileName: path.basename(entry.file), mimeType: 'text/markdown', text },
    options: {
      projectName: entry.project,
      projectKey: entry.key,
      sprintLengthWeeks: 2,
      startDate: '2026-11-09',
      language: 'en',
      existingProject: false,
    },
    llm: {
      model: process.env.DOCUMIND_LLM_MODEL || 'claude-sonnet-4-6',
      apiKey: process.env.DOCUMIND_LLM_API_KEY,
      baseUrl: process.env.DOCUMIND_LLM_BASE_URL || 'https://vyceai.com/v1',
    },
  };

  const started = Date.now();
  let status;
  let payload;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.DOCUMENT_ANALYZER_TOKEN}`,
      },
      body: JSON.stringify(body),
    });
    status = res.status;
    payload = await res.text();
  } catch (error) {
    status = 0;
    payload = String(error);
  }
  const elapsedMs = Date.now() - started;
  const event = readEvent(requestId);
  const parsed = (() => {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  })();

  const row = {
    file: path.basename(entry.file),
    chars: entry.chars,
    status,
    elapsedMs,
    providerCalls: event?.providerCalls ?? null,
    analyzerLatencyMs: event?.latencyMs ?? null,
    items: event?.items ?? parsed?.plan?.items?.length ?? null,
    code: event?.code ?? parsed?.code ?? '',
  };
  results.push(row);
  console.log(JSON.stringify(row));
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
}

const latencies = results.filter((row) => row.status === 200).map((row) => row.elapsedMs).sort((a, b) => a - b);
const p95 = latencies.length ? latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)] : null;
const calls = results.map((row) => row.providerCalls).filter((value) => typeof value === 'number');
const summary = {
  documents: results.length,
  ready: results.filter((row) => row.status === 200).length,
  failed: results.filter((row) => row.status !== 200).length,
  p95LatencyMs: p95,
  minLatencyMs: latencies[0] ?? null,
  maxLatencyMs: latencies[latencies.length - 1] ?? null,
  providerCalls: calls,
  providerCallsTotal: calls.reduce((sum, value) => sum + value, 0),
};
console.log(JSON.stringify({ summary }, null, 2));
fs.writeFileSync(outPath.replace(/\.json$/, '-summary.json'), JSON.stringify({ summary, results }, null, 2));
