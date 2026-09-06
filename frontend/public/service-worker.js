/* eslint-disable no-restricted-globals */

// Service Worker for FORGE PWA and Push Notifications
//
// Caching strategy, and why:
//
//   There used to be a precache list here naming /static/css/main.css and
//   /static/js/main.js. CRA never emits those paths — it emits main.<hash>.js —
//   and cache.addAll() is atomic, so install ALWAYS rejected and nothing was ever
//   cached. Offline support silently did not exist.
//
//   Simply correcting those paths would have been worse: the old cache-first
//   handler served whatever was cached for every request, so a cached index.html
//   would pin the app to a superseded bundle forever, undoing the nginx no-cache
//   fix on the SPA entry point.
//
//   So: navigations are network-first (a new deploy always wins; the cached shell
//   is only a fallback when the network is gone), and only content-addressed
//   /static/ assets are cache-first, which is safe precisely because their names
//   change when their contents do. Nothing is precached at install, because there
//   is no build-time manifest to precache from — that arrives with the Vite
//   migration and vite-plugin-pwa.

const CACHE = 'forge-v2';
const SHELL = '/index.html';

self.addEventListener('install', () => {
  // Nothing to precache. Take over as soon as possible.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      // NOTE: the previous version called clients.claim() outside waitUntil, so
      // activation could finish before the claim resolved.
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept the API (different origin in production) or anything
  // cross-origin — those must not be served from a stale cache.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network first, cached shell only as an offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put(SHELL, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(SHELL);
          if (cached) return cached;
          return new Response('<h1>Offline</h1><p>FORGE needs a connection to load.</p>', {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
      })()
    );
    return;
  }

  // Hashed build assets: cache first. Safe because the filename changes whenever
  // the contents do, so a cache hit can never be stale.
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, fresh.clone());
        }
        return fresh;
      })()
    );
  }

  // Everything else falls through to the network untouched.
});

// Push notification event
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { body: event.data.text() };
  }

  const title = data.title || 'FORGE';
  const options = {
    body: data.body || 'You have a new notification',
    // NOTE: this used to point at /logo192.png, which does not exist in public/ —
    // every notification requested a 404. favicon.svg is the only icon shipped
    // today; real PNG icons are still needed for iOS install and notifications.
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
    },
    actions: [
      { action: 'open', title: 'Open FORGE' },
      { action: 'close', title: 'Close' },
    ],
    tag: 'forge-notification',
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const urlToOpen = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Focus any open FORGE window rather than requiring an exact URL match —
        // the old exact-equality check almost never matched, so clicking a
        // notification opened a duplicate tab even with the app already open.
        if ('focus' in client) {
          if ('navigate' in client && client.url !== urlToOpen) {
            return client.navigate(urlToOpen).then((c) => c && c.focus());
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
      return undefined;
    })
  );
});
