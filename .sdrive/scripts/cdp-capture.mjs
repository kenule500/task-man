// Capture the app at several viewport widths over raw CDP (no puppeteer in this repo).
//
//   node .sdrive/scripts/cdp-capture.mjs --base http://localhost:5175 \
//     --path "/demo-workspace/projects/new/ai?plan=<id>" \
//     --token-file .sdrive/reports/tests/raw/t74-token.txt \
//     --user-file .sdrive/reports/tests/raw/t74-user.json \
//     --language en --widths 320,375,768,1024,1280 --out-dir .sdrive/reports/browser/t74
//
// Each width writes <lang>-<width>.png plus one row in the JSON report: horizontal overflow,
// the widest offender, text size and console errors. It signs in by seeding localStorage before
// the app boots, so no login round-trip is needed for every capture.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9444;

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const base = arg('base', 'http://localhost:5175');
const targetPath = arg('path', '/');
const widths = arg('widths', '320,375,768,1024,1280').split(',').map(Number);
const language = arg('language', 'en');
const outDir = arg('out-dir', '.sdrive/reports/browser/t74');
const settle = Number(arg('settle', '12000'));
const waitText = arg('wait-text', '');
const heights = { 320: 900, 375: 900, 768: 1100, 1024: 1000, 1280: 1000 };

const token = fs.readFileSync(arg('token-file'), 'utf8').trim();
const user = fs.readFileSync(arg('user-file'), 'utf8').trim();

fs.mkdirSync(outDir, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 't74-chrome-'));

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--disable-extensions',
  '--disable-background-networking',
  '--force-device-scale-factor=1',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let version;
for (let i = 0; i < 60; i += 1) {
  try {
    version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    break;
  } catch {
    await sleep(250);
  }
}
if (!version) throw new Error('Chrome did not expose a devtools endpoint');

const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const consoleErrors = [];
let sessionId = null;

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(`${message.error.message} (${JSON.stringify(message.error.data ?? '')})`));
    else resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(`exception: ${message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text}`);
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(`console: ${message.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 300));
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    consoleErrors.push(`log: ${message.params.entry.text}`.slice(0, 300));
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');

const loaded = async () => {
  for (let i = 0; i < 100; i += 1) {
    if ((await evaluate('document.readyState')) === 'complete') return;
    await sleep(150);
  }
};

// Seed the session on the app origin, then open the target route.
await send('Page.navigate', { url: `${base}/login` });
await sleep(1500);
await loaded();
await evaluate(`(() => {
  localStorage.setItem('token', ${JSON.stringify(token)});
  localStorage.setItem('user', ${JSON.stringify(user)});
  localStorage.setItem('taskman.language', ${JSON.stringify(language)});
  return true;
})()`);

const rows = [];
for (const width of widths) {
  const height = heights[width] ?? 900;
  consoleErrors.length = 0;
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
    screenWidth: width,
    screenHeight: height,
  });
  await send('Page.navigate', { url: `${base}${targetPath}` });
  await sleep(settle);
  await loaded();
  if (waitText) {
    for (let i = 0; i < 40; i += 1) {
      const found = await evaluate(`document.body.innerText.includes(${JSON.stringify(waitText)})`);
      if (found) break;
      await sleep(250);
    }
  }

  const report = await evaluate(`(() => {
    const doc = document.documentElement;
    const vw = window.innerWidth;
    const offenders = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 120),
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
        });
      }
    }
    const worst = offenders.sort((a, b) => b.right - a.right)[0] || null;
    const body = getComputedStyle(document.body);
    return {
      url: location.pathname + location.search,
      title: document.title,
      innerWidth: vw,
      scrollWidth: doc.scrollWidth,
      horizontalOverflow: doc.scrollWidth > vw + 1,
      offenderCount: offenders.length,
      worst,
      bodyFontSize: body.fontSize,
      lineHeight: body.lineHeight,
      text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 2000),
      headingCount: document.querySelectorAll('h1,h2,h3').length,
      buttonCount: document.querySelectorAll('button').length,
    };
  })()`);

  const metrics = await send('Page.getLayoutMetrics');
  const content = metrics.cssContentSize ?? metrics.contentSize;
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: Math.min(content.width, width), height: Math.min(content.height, 6000), scale: 1 },
  });
  const name = `${language}-${width}.png`;
  fs.writeFileSync(path.join(outDir, name), Buffer.from(shot.data, 'base64'));
  rows.push({ width, file: name, ...report, consoleErrors: [...new Set(consoleErrors)].slice(0, 8) });
  console.log(`${language} ${width}px -> ${name} overflow=${report.horizontalOverflow} offenders=${report.offenderCount}`);
}

ws.close();
chrome.kill();
await sleep(500);
fs.writeFileSync(path.join(outDir, `report-${language}.json`), JSON.stringify(rows, null, 2));
console.log(`wrote ${rows.length} captures to ${outDir}`);

