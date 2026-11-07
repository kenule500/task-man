// Keyboard-only walk of the review screen over CDP: Tab order, visible focus, Enter opens an editor
// and Escape closes it, and the Create button is reachable without a mouse.
//
//   node .sdrive/scripts/cdp-keyboard.mjs --path "/demo-workspace/projects/new/ai?plan=<id>" \
//     --token-file ... --user-file ... --language en --width 1280 \
//     --out .sdrive/reports/browser/t74/keyboard-en.json
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9440 + (process.pid % 50);

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const base = arg('base', 'http://localhost:5175');
const targetPath = arg('path', '/');
const language = arg('language', 'en');
const width = Number(arg('width', '1280'));
const height = Number(arg('height', '1000'));
const out = arg('out', '.sdrive/reports/browser/t74/keyboard.json');
const maxTabs = Number(arg('tabs', '80'));

const token = fs.readFileSync(arg('token-file'), 'utf8').trim();
const user = fs.readFileSync(arg('user-file'), 'utf8').trim();

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 't74-kbd-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--disable-extensions',
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
let sessionId = null;
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
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

const key = async (name, code, keyCode) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, ...(name === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height });

await send('Page.navigate', { url: `${base}/login` });
await sleep(1500);
await evaluate(`(() => {
  localStorage.setItem('token', ${JSON.stringify(token)});
  localStorage.setItem('user', ${JSON.stringify(user)});
  localStorage.setItem('taskman.language', ${JSON.stringify(language)});
  return true;
})()`);
await send('Page.navigate', { url: `${base}${targetPath}` });
await sleep(14000);

const describe = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: 'body' };
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return {
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role') || '',
    label: (el.getAttribute('aria-label') || el.getAttribute('title') || '').slice(0, 80),
    text: (el.innerText || el.value || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
    focusRing: style.outlineStyle !== 'none' || (style.boxShadow && style.boxShadow !== 'none'),
    outline: style.outlineStyle + ' ' + style.outlineWidth,
    boxShadow: String(style.boxShadow).slice(0, 60),
    focusVisible: el.matches(':focus-visible'),
    visible: rect.width > 0 && rect.height > 0,
    inViewport: rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
  };
})()`;

const walk = [];
for (let i = 0; i < maxTabs; i += 1) {
  await key('Tab', 'Tab', 9);
  await sleep(90);
  walk.push(await evaluate(describe));
}

// Enter on the first match opens its editor; Escape closes it.
const targetText = arg('focus-text', 'edit project name');
const index = walk.findIndex((item) => (item.label + ' ' + item.text).toLowerCase().includes(targetText.toLowerCase()));
let editor = { found: index !== -1, index, opened: false, closed: false, dialogText: '' };

if (index !== -1) {
  // Reload so focus starts at the top of the document, then tab back to the same stop.
  await send('Page.navigate', { url: `${base}${targetPath}` });
  await sleep(14000);
  for (let i = 0; i <= index; i += 1) {
    await key('Tab', 'Tab', 9);
    await sleep(70);
  }
  const current = await evaluate(describe);
  if (!(current.label + ' ' + current.text).toLowerCase().includes(targetText.toLowerCase())) {
    editor.mismatch = current;
  }
  await key('Enter', 'Enter', 13);
  await sleep(700);
  const opened = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const input = document.activeElement;
    return {
      dialogText: dialog ? dialog.innerText.replace(/\\s+/g, ' ').slice(0, 200) : '',
      activeTag: input ? input.tagName.toLowerCase() : '',
      activeValue: input && 'value' in input ? String(input.value).slice(0, 80) : '',
    };
  })()`);
  editor.opened = Boolean(opened.dialogText || opened.activeTag === 'input' || opened.activeTag === 'textarea');
  editor.dialogText = opened.dialogText || `focus:${opened.activeTag}:${opened.activeValue}`;
  await key('Escape', 'Escape', 27);
  await sleep(600);
  editor.closed = await evaluate(`(() => !document.querySelector('[role="dialog"]'))()`);
}

const createReachable = walk.some((item) => (item.text + ' ' + item.label).toLowerCase().includes('create project'));
const uniqueFocus = new Set(walk.map((item) => `${item.tag}|${item.label}|${item.text}`)).size;
const result = {
  language,
  width,
  steps: walk.length,
  uniqueFocus,
  everyStepVisible: walk.every((item) => item.tag === 'body' || item.visible),
  everyStepHasFocusRing: walk.filter((item) => item.tag !== 'body').every((item) => item.focusRing),
  dialogOpenAfterEnterAndCloseAfterEscape: editor,
  createProjectReachableByKeyboard: createReachable,
  stepsWithoutFocusRing: walk
    .filter((item) => item.tag !== 'body' && !item.focusRing)
    .map((item) => ({ tag: item.tag, label: item.label, text: item.text, outline: item.outline, boxShadow: item.boxShadow, focusVisible: item.focusVisible }))
    .slice(0, 8),
  tabOrder: walk.map((item, i) => `${i + 1}. ${item.tag}${item.focusRing ? '' : ' (no ring)'}${item.label ? ` [${item.label}]` : ''} ${item.text}`),
};

fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, tabOrder: `${walk.length} steps` }, null, 2));

ws.close();
chrome.kill();
await sleep(400);

