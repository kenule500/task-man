// Probe the analyzer directly with a workspace llm block, timing the call.
import fs from 'node:fs';

const [file, outPath] = process.argv.slice(2);
const text = fs.readFileSync(file, 'utf8');
const body = {
  contractVersion: 1,
  requestId: `probe-${Date.now()}`,
  document: { fileName: 't74-sample-requirements.md', mimeType: 'text/markdown', text },
  options: {
    projectName: 'Field Service Scheduling',
    projectKey: 'FSS',
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
const res = await fetch('http://127.0.0.1:8000/v1/plans:analyze', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${process.env.DOCUMENT_ANALYZER_TOKEN}`,
  },
  body: JSON.stringify(body),
});
const payload = await res.text();
const elapsedMs = Date.now() - started;
console.log(JSON.stringify({ status: res.status, elapsedMs, bytes: payload.length }));
if (outPath) fs.writeFileSync(outPath, payload);
console.log(payload.slice(0, 600));

