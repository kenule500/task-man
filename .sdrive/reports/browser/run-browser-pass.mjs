import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('.sdrive/reports/browser');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9223;
const APP = 'http://localhost:5173';
const API = 'http://localhost:5000/api';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = {};
const errors = [];

const login = async () => {
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@taskman.test', password: 'demo1234' }),
  });
  if (!response.ok) throw new Error(`login failed: ${response.status}`);
  return response.json();
};

const session = await login();
const profile = `${OUT}\\cdp-profile-${Date.now()}`;

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=1024,800',
  'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  let target;
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((entry) => entry.type === 'page');
      if (target) break;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  if (!target) throw new Error('Chrome DevTools did not start');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let nextId = 0;
  const pending = new Map();
  const paused = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      errors.push(`exception: ${message.params.exceptionDetails.text}`);
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(`console: ${message.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    }
    if (message.method === 'Network.loadingFailed' && !message.params.canceled) {
      errors.push(`network: ${message.params.errorText} ${message.params.type}`);
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      errors.push(`log: ${message.params.entry.text}`);
    }
    if (message.method === 'Fetch.requestPaused') {
      paused.push(message.params.requestId);
    }
  };

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };

  const waitFor = async (expression, label, timeout = 20000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return;
      await sleep(200);
    }
    throw new Error(`timed out waiting for ${label}`);
  };

  const setViewport = (width, height = 800) => send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 768,
  });

  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Log.enable');

  // 1. Load the app origin, then write the real login session into localStorage.
  await send('Page.navigate', { url: `${APP}/login` });
  await waitFor("document.readyState === 'complete'", 'login load');
  await evaluate(`localStorage.setItem('token', ${JSON.stringify(session.token)});
    localStorage.setItem('user', ${JSON.stringify(JSON.stringify(session))}); true`);
  console.log('step: session injected');

  // 2. Open the chat screen.
  await send('Page.navigate', { url: `${APP}/demo-workspace/chat` });
  await waitFor("document.body.innerText.includes('Team Chat')", 'chat shell');
  console.log('step: chat shell rendered');
  await waitFor("document.body.innerText.includes('Hello team, the chat browser pass starts now.')", 'seeded message');

  checks.channelList = await evaluate(`({
    hasTeamChat: document.body.innerText.includes('Team Chat'),
    hasGeneral: document.body.innerText.includes('General'),
    teamRows: document.querySelectorAll('nav[aria-label="Team channels"] li').length,
    directRows: document.querySelectorAll('nav[aria-label="Direct messages"] li').length,
  })`);
  checks.conversation = await evaluate(`({
    hasSeededMessage: document.body.innerText.includes('Hello team, the chat browser pass starts now.'),
    hasMention: document.body.innerText.includes('Dana Dev'),
    transport: /Live|Connecting|Reconnecting/.exec(document.body.innerText)?.[0] ?? null,
    composerPresent: Boolean(document.querySelector('[data-chat-composer]')),
  })`);

  await setViewport(1024);
  checks.screenshot1024 = await shot('chat-1024');

  // 3. Empty state: General has no messages in the seed.
  await evaluate("[...document.querySelectorAll('a')].find((a) => a.getAttribute('href')?.includes('/chat/') && a.textContent.includes('General'))?.click(); true");
  await waitFor("document.body.innerText.includes('No messages yet. Start the conversation.')", 'empty channel');
  checks.emptyState = await evaluate("document.body.innerText.includes('No messages yet. Start the conversation.')");
  checks.screenshotEmpty = await shot('chat-empty-1024');
  await evaluate("[...document.querySelectorAll('a')].find((a) => a.getAttribute('href')?.includes('/chat/') && a.textContent.includes('Team Chat'))?.click(); true");
  await waitFor("document.body.innerText.includes('Hello team, the chat browser pass starts now.')", 'team chat back');

  // 4. Loading state: hold the channel request so the chat loader is visible, then release it.
  await send('Fetch.enable', { patterns: [{ urlPattern: '*channels*', requestStage: 'Request' }] });
  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 60 && paused.length === 0; i += 1) await sleep(100);
  await waitFor("document.body.innerText.includes('Loading channels')", 'chat loading state');
  checks.loadingState = true;
  checks.screenshotLoading = await shot('chat-loading-1024');
  for (const requestId of paused.splice(0)) {
    await send('Fetch.continueRequest', { requestId });
  }
  await send('Fetch.disable');
  await waitFor("document.body.innerText.includes('Hello team, the chat browser pass starts now.')", 'loaded after hold');

  // 5. Error state: block the channel request, reload, then unblock.
  await send('Network.setBlockedURLs', { urls: ['*channels*'] });
  await send('Page.reload', { ignoreCache: true });
  await waitFor("document.body.innerText.includes('Channels could not be loaded')", 'channel error', 15000);
  checks.errorState = await evaluate("document.body.innerText.includes('Channels could not be loaded')");
  checks.screenshotError = await shot('chat-error-1024');
  await send('Network.setBlockedURLs', { urls: [] });
  await send('Page.reload', { ignoreCache: true });
  await waitFor("document.body.innerText.includes('Hello team, the chat browser pass starts now.')", 'recovered after error');
  checks.recovered = true;

  // 6. Find widget: Ctrl+F opens it, text searches, Escape closes it.
  await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70 });
  await waitFor("Boolean(document.querySelector('section[aria-label=\"Search this channel\"]'))", 'find bar open');
  await send('Input.insertText', { text: 'browser' });
  await waitFor("document.body.innerText.includes('1 of 1') || Boolean(document.querySelector('#chat-search-results'))", 'search results');
  checks.findWidget = await evaluate(`({
    open: Boolean(document.querySelector('section[aria-label="Search this channel"]')),
    results: document.querySelectorAll('#chat-search-results [role="option"]').length,
    counter: document.body.innerText.match(/\\d+ of \\d+|0 of 0/)?.[0] ?? null,
  })`);
  checks.screenshotFind = await shot('chat-find-1024');

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await waitFor("!document.querySelector('section[aria-label=\"Search this channel\"]')", 'find bar closed');
  checks.findClosed = true;

  // Arrow keys keep focus in the input, Enter jumps to and highlights the selected match.
  await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70 });
  await waitFor("Boolean(document.querySelector('section[aria-label=\"Search this channel\"]'))", 'find bar reopened');
  await send('Input.insertText', { text: 'browser' });
  await waitFor("Boolean(document.querySelector('#chat-search-results [role=\"option\"]'))", 'search option');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
  checks.findKeyboard = await evaluate(`({
    focusStayedInInput: document.activeElement?.getAttribute('role') === 'combobox',
    activeDescendant: document.activeElement?.getAttribute('aria-activedescendant'),
  })`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await waitFor("!document.querySelector('section[aria-label=\"Search this channel\"]')", 'find bar closed after Enter');
  await waitFor("Boolean(document.querySelector('[data-message-id].bg-warning-bg\\\\/60'))", 'jumped message highlighted', 5000);
  checks.findJump = true;

  // 4. Thread: open the reply overlay, check it at desktop and below md, then close it.
  await evaluate("document.querySelector('[aria-label=\"Reply in thread\"]')?.click(); true");
  await waitFor("document.body.innerText.includes('This is a thread reply for the overlay check.')", 'thread contents');
  checks.thread = await evaluate(`({
    open: Boolean(document.querySelector('[aria-label="Thread"]')),
    hasReply: document.body.innerText.includes('This is a thread reply for the overlay check.'),
  })`);
  checks.screenshotThread1024 = await shot('chat-thread-1024');

  await setViewport(760, 800);
  await sleep(400);
  checks.screenshotThread760 = await shot('chat-thread-760');
  checks.thread760 = await evaluate(`({
    visible: Boolean(document.querySelector('[aria-label="Thread"]')),
    overlay: (() => { const el = document.querySelector('[aria-label="Thread"]'); return el ? getComputedStyle(el).position : null; })(),
  })`);

  await evaluate("document.querySelector('[aria-label=\"Close thread\"]')?.click(); true");
  await waitFor("!document.querySelector('[aria-label=\"Thread\"]')", 'thread closed');

  // 5. Phone width: one pane at a time, list reachable, no horizontal overflow.
  await setViewport(320, 700);
  await sleep(400);
  checks.phoneComposer = await evaluate(`(() => {
    const composer = document.querySelector('[data-chat-composer]');
    if (!composer) return { present: false };
    const box = composer.getBoundingClientRect();
    return { present: true, bottom: Math.round(box.bottom), viewport: window.innerHeight, aboveFold: box.bottom <= window.innerHeight + 1 };
  })()`);
  checks.screenshotPhoneConversation = await shot('chat-320-conversation');
  await evaluate("document.querySelector('[aria-label=\"Back to conversations\"]')?.click(); true");
  await waitFor("Boolean(document.querySelector('nav[aria-label=\"Team channels\"]'))", 'phone list');
  await sleep(400);
  checks.phoneList = await evaluate(`(() => {
    const lists = [...document.querySelectorAll('nav[aria-label] ul')];
    return {
      backControl: Boolean(document.querySelector('[aria-label="Back to conversations"]')),
      teamRows: document.querySelectorAll('nav[aria-label="Team channels"] li').length,
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
      listScroll: lists.map((ul) => ({ scrollWidth: ul.scrollWidth, clientWidth: ul.clientWidth })),
    };
  })()`);
  checks.screenshotPhoneList = await shot('chat-320-list');

  const summary = { generatedAt: new Date().toISOString(), checks, errors };
  fs.writeFileSync(path.join(OUT, 'browser-pass.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error('BROWSER PASS FAILED:', error.message);
  try {
    console.error('page:', await evaluate("location.href + '\\n' + document.body.innerText.slice(0, 600)"));
  } catch { /* page may be gone */ }
  console.error(JSON.stringify({ checks, errors }, null, 2));
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { chrome.kill(); } catch { /* ignore */ }
}
