/*
 * JayPOS Desktop service worker — Phase-1 app-shell caching.
 *
 * Strategy:
 *  - Navigations: network-first, falling back to the cached shell so the app
 *    still opens offline (verified in Phase 6, scenario 7).
 *  - Same-origin static assets (/_next/*, icons): stale-while-revalidate.
 *  - Cross-origin requests (the backend API) and non-GET: passed straight to the
 *    network. Offline DATA is handled by the Dexie store, not the SW cache.
 *
 * Bump CACHE when the shell strategy changes; activate() prunes old caches.
 */
const CACHE = 'jaypos-desktop-v1';
const SHELL = ['/', '/dashboard', '/login', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Cache each entry independently so one failure doesn't abort install.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Let the backend API and any other cross-origin request go to the network.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
