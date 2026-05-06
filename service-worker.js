const CACHE_NAME = 'scifi-tracker-v5';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './data/catalogs.json',
  './data/films.json',
  './data/tv-limited.json',
  './data/tv-ongoing.json',
  './data/espionage.json',
  './data/crime.json',
  './data/horror.json',
  './data/fantasy.json',
  './data/heist.json',
  './data/comedy.json',
  './data/drama.json',
  './data/foreign.json',
  './data/auteur.json',
  './data/pre1960.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
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
      });
    })
  );
});
