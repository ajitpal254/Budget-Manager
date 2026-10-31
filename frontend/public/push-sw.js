/* Push notification handler for the Aura PWA.
 *
 * This file is NOT a standalone service worker: it is pulled into the
 * workbox-generated service worker via `importScripts` (see vite.config.js).
 * It only handles push events and notification clicks; all precaching and
 * fetch routing stay with the generated worker.
 */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Payload wasn't JSON; fall back to plain text.
    data = { title: 'Aura Budget', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Aura Budget';
  const options = {
    body: data.body || '',
    icon: '/icons/pwa-192x192.png',
    badge: '/icons/pwa-192x192.png',
    data: { url: data.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
            if ('navigate' in client) {
              client.navigate(url).catch(() => {});
            }
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
