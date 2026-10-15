/* Web Push handlers, loaded into the generated service worker with importScripts (see vite.config.ts).
   Plain JavaScript on purpose: it is served as-is from /push-sw.js, same origin (CSP script-src 'self'). */

const DEFAULT_URL = '/';

// Only paths inside this app: a push payload can never send people to another site
const safeUrl = (value) => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return DEFAULT_URL;
  return value;
};

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = typeof data.title === 'string' && data.title ? data.title : 'TaskMan';
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icons/icon-192.png',
    // The same notification pushed twice replaces the first instead of stacking
    tag: typeof data.tag === 'string' && data.tag ? data.tag : undefined,
    data: { url: safeUrl(data.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(safeUrl(event.notification.data && event.notification.data.url), self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (open) {
      try {
        const navigated = await open.navigate(target);
        await (navigated || open).focus();
        return;
      } catch {
        // Not controlled by this worker (or already closed): open a new window below
      }
    }
    await self.clients.openWindow(target);
  })());
});
