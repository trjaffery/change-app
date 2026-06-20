// Service worker — handles incoming Web Push and notification clicks.
//
// Kept intentionally tiny: no offline caching for now (that's a future
// concern). The only reason this exists is so the browser will accept push
// subscriptions and deliver them when the PWA isn't open.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Change', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Change';
  const options = {
    body: data.body || '',
    icon: data.icon || '/apple-icon',
    badge: data.badge || '/icon',
    tag: data.tag || undefined,        // collapse same-tag notifications
    data: { url: data.url || '/' },    // surfaced in notificationclick
    requireInteraction: data.requireInteraction === true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // If the PWA is already open in any tab/window, focus it and route there.
    for (const client of all) {
      if ('focus' in client) {
        try { await client.navigate(target); } catch { /* cross-origin or restricted */ }
        return client.focus();
      }
    }
    // Otherwise open a fresh window.
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
