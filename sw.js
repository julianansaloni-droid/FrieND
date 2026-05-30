/* FrieND service worker — makes the app fully offline after first load.
   Cache-first for the app shell (it's a static single-file app, so the
   cache is the source of truth). Bump CACHE_VERSION when you ship a new
   index.html so returning users pick up the update.

   All app data lives in localStorage, which the service worker never
   touches — so updating the cache never affects a user's data. */

const CACHE_VERSION = 'friend-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

/* On install: pre-cache the app shell, then activate immediately. */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => { /* partial cache is fine; fetch handler will backfill */ })
  );
});

/* On activate: clean out old cache versions, take control of open pages. */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* On fetch: serve from cache first (instant + offline), fall back to network,
   and quietly backfill the cache with anything new the network returns.
   Only handle same-origin GET requests; everything else passes straight through. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Serve cached copy immediately; refresh the cache in the background.
        event.waitUntil(
          fetch(req).then((res) => {
            if (res && res.ok) {
              caches.open(CACHE_VERSION).then((c) => c.put(req, res.clone()));
            }
          }).catch(() => { /* offline — cached copy already served */ })
        );
        return cached;
      }
      // Not cached yet — go to network, cache the result for next time.
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => {
        // Offline and not cached — for navigations, fall back to the app shell.
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
