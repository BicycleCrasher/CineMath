const CACHE_NAME = 'scifi-tracker-v40';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './data/catalogs.json',
  './data/scifi.json',
  './data/scifi-tv.json',
  './data/espionage.json',
  './data/spy-tv.json',
  './data/crime.json',
  './data/crime-tv.json',
  './data/cons-courtroom.json',
  './data/cons-courtroom-tv.json',
  './data/horror.json',
  './data/horror-tv.json',
  './data/fantasy.json',
  './data/fantasy-tv.json',
  './data/heist.json',
  './data/comedy.json',
  './data/comedy-tv.json',
  './data/british-comedy.json',
  './data/drama.json',
  './data/drama-tv.json',
  './data/foreign.json',
  './data/auteur.json',
  './data/pre1960.json',
  './data/musicals.json',
  './data/heroes-comics.json',
  './data/heroes-comics-tv.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/header-logo.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Only handle same-origin requests. Cross-origin (Plex seedbox, Cloudflare Worker,
  // TMDB) must be passed through to the network unintercepted — the SW is not a
  // proxy and trying to cache opaque cross-origin responses breaks them.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        if (event.request.url.includes('/data/')) {
          fetch(event.request).then((resp) => {
            if (resp && resp.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resp.clone()));
            }
          }).catch(() => {});
        }
        return cached;
      }
      return fetch(event.request).then((resp) => {
        if (resp && resp.ok && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return resp;
      }).catch(() => {
        // If the network fetch fails, return a synthetic error response rather
        // than letting the rejection propagate and break the page's fetch.
        return new Response('', { status: 504, statusText: 'Gateway Timeout' });
      });
    })
  );
});
