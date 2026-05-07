const CACHE_NAME = 'scifi-tracker-v9';
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
