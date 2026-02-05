const CACHE_NAME = 'brock-story-v1';
const ASSETS = [
  '/brock/',
  '/brock/images/01-prologue-portrait.webp',
  '/brock/images/02-city-sleepy.webp',
  '/brock/images/03-city-coding.webp',
  '/brock/images/04-city-couch.webp',
  '/brock/images/05-scare-beryl-holding.webp',
  '/brock/images/06-oregon-canoe.webp',
  '/brock/images/07-oregon-coast.webp',
  '/brock/images/08-oregon-hiking-family.webp',
  '/brock/images/09-oregon-beryl-carry.webp',
  '/brock/images/10-oregon-daisies.webp',
  '/brock/images/11-oregon-tent.webp',
  '/brock/images/12-move-airplane.webp',
  '/brock/images/13-move-roadtrip.webp',
  '/brock/images/14-move-boxes.webp',
  '/brock/images/15-home-notredame.webp',
  '/brock/images/16-home-fall.webp',
  '/brock/images/17-home-family-kitchen.webp',
  '/brock/images/18-home-cozy-toy.webp',
  '/brock/images/19-epilogue-embrace.webp',
  '/brock/images/20-epilogue-sleep.webp',
  '/brock/images/brock-hairdryer.mp4',
  '/brock/images/brock-hairdryer-poster.jpg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
