const CACHE_NAME = 'ds-stream-hgss-v1';
const ASSETS = [
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './assets/icon.png',
  './assets/bg_pattern.png',
  './assets/ds_frame_gold.png',
  './assets/ds_frame_silver.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => {
      return response || fetch(e.request);
    })
  );
});
