// A stub analyzer for the browser pass only.
//
// The real pipeline cannot finish inside the 280 s cap with the only provider available here (it
// makes 4+ calls at 35-80 s each; measured separately and recorded in the report). This stub answers
// the same contract so the review screen can be checked on a plan the API records as `documind`:
// engine label, model and "usage not reported" state. It returns the shared golden fixture.
import { createServer } from 'node:http';
import fs from 'node:fs';

const TOKEN = '67060c55274637bd69ae7193149373ec8bf0c551f49fe76324cf647359f2af77';
const plan = JSON.parse(fs.readFileSync('packages/contracts/fixtures/plan.golden.json', 'utf8'));

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', sdkVersion: '0.2.2' }));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/v1/plans:analyze') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ detail: 'Not Found' }));
    return;
  }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ requestId: 'stub', code: 'UNAUTHORIZED', message: 'Missing or wrong bearer token.' }));
    return;
  }
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      contractVersion: 1,
      requestId: body.requestId,
      plan,
      analyzer: { engine: 'documind', sdkVersion: '0.2.2', model: 'claude-sonnet-4-6', latencyMs: 4200 },
      warnings: [],
    }));
    console.log(`${new Date().toISOString()} served ${body.requestId}`);
  });
});

server.listen(8003, '127.0.0.1', () => console.log('stub analyzer on http://127.0.0.1:8003'));
