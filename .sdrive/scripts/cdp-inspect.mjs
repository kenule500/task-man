// Load the app signed in, then run one expression in the page and print the result.
//   node .sdrive/scripts/cdp-inspect.mjs --path "/demo-workspace/..." --expr "document.dir" ...
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9490 + (process.pid % 9);
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const base = arg('base', 'http://localhost:5175');
const targetPath = arg('path', '/');
const language = arg('language', 'en');
const width = Number(arg('width', '1280'));
const expression = arg('expr', 'document.title');
const wait = Number(arg('wait', '14000'));

const token = fs.readFileSync(arg('token-file'), 'utf8').trim();
const user = fs.readFileSync(arg('user-file'), 'utf8').trim();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 't74-inspect-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let version;
for (let i = 0; i < 60; i += 1) {
  try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(250); }
}
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let nextId = 1;
const pending = new Map();
let sessionId = null;
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
const evaluate = async (src) => {
  const r = await send('Runtime.evaluate', { expression: src, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''));
  return r.result.value;
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: 1000 });
await send('Page.navigate', { url: `${base}/login` });
await sleep(1500);
await evaluate(`localStorage.setItem('token', ${JSON.stringify(token)}); localStorage.setItem('user', ${JSON.stringify(user)}); localStorage.setItem('taskman.language', ${JSON.stringify(language)}); true`);
await send('Page.navigate', { url: `${base}${targetPath}` });
await sleep(wait);

const tabs = Number(arg('tab', '0'));
for (let i = 0; i < tabs; i += 1) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await sleep(80);
}
const shot = arg('shot', '');
if (shot) {
  const png = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(shot, Buffer.from(png.data, 'base64'));
  console.log(`screenshot ${shot}`);
}
console.log(JSON.stringify(await evaluate(expression), null, 2));
ws.close();
chrome.kill();
await sleep(300);
